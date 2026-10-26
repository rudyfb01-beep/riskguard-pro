import {
  ImportContext, buildRows, detectScale, findHeaderRow, guessColumns, parseAmount, parseCategory, parseCsv, parseLevel, templateCsv,
} from './risk-import';

const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
  scale: 4,
  processes: ['Captaciones y ahorro', 'Otorgamiento de créditos', 'Tecnología y sistemas'],
  likelihoodNames: ['Improbable', 'Posible', 'Probable', 'Frecuente'],
  impactNames: ['Menor', 'Moderado', 'Mayor', 'Catastrófico'],
  controls: [{ id: 'ctl-1', code: 'CTR-101', name: 'Doble validación de transferencias' }],
  createMissingProcesses: false,
  defaultProcess: 'Captaciones y ahorro',
  ...over,
});

describe('risk-import', () => {
  it('encuentra el encabezado bajo filas de título y asocia columnas típicas', () => {
    const rows = [
      ['MATRIZ DE RIESGO OPERACIONAL 2026'],
      ['Cooperativa', null],
      ['N°', 'Proceso', 'Riesgo', 'Causa', 'Categoría', 'Probabilidad', 'Impacto', 'Nivel inherente', 'Controles', 'Probabilidad residual'],
    ];
    expect(findHeaderRow(rows)).toBe(2);
    const map = guessColumns(rows[2]);
    expect(map).toMatchObject({ code: 0, process: 1, title: 2, description: 3, category: 4, likelihood: 5, impact: 6, controls: 8 });
  });

  it('reconoce los encabezados de la propia exportación de la aplicación', () => {
    const map = guessColumns(['Código', 'Título', 'Proceso', 'Categoría Basilea', 'Riesgo Inherente Prob', 'Riesgo Inherente Imp', 'Score Inherente',
      'Nivel Inherente', 'Exposición CLP', 'Controles Aplicados', 'Score Residual', 'Nivel Residual', 'Exposición Residual CLP', 'Estado', 'Plan de Mitigación']);
    expect(map).toMatchObject({ code: 0, title: 1, process: 2, category: 3, likelihood: 4, impact: 5, exposure: 8, controls: 9, status: 13, mitigation: 14 });
  });

  it('convierte escalas 1–5 y textos a la escala 1–4', () => {
    expect(parseLevel(5, 'likelihood', 5)).toBe(4);
    expect(parseLevel(1, 'impact', 5)).toBe(1);
    expect(parseLevel(3, 'impact', 5)).toBe(3);
    expect(parseLevel('Casi seguro', 'likelihood', 4)).toBe(4);
    expect(parseLevel('Rara vez', 'likelihood', 4)).toBe(1);
    expect(parseLevel('Catastrófico', 'impact', 4, ['Menor', 'Moderado', 'Mayor', 'Catastrófico'])).toBe(4);
    expect(parseLevel('3 - Mayor', 'impact', 4)).toBe(3);
    expect(parseLevel('xyz', 'impact', 4)).toBeNull();
    expect(detectScale([[1, 5], [2, 3]], [0, 1])).toBe(5);
    expect(detectScale([[1, 4]], [0, 1])).toBe(4);
    expect(detectScale([[2, 3], ['Posible', 'Moderado']], [0, 1])).toBe(4);
    expect(parseLevel(3, 'impact', 3)).toBe(4);
  });

  it('interpreta montos en formato chileno y anglosajón', () => {
    expect(parseAmount('$45.000.000')).toBe(45000000);
    expect(parseAmount('US$ 12.000')).toBe(12000);
    expect(parseAmount('1,234,567.50')).toBe(1234567.5);
    expect(parseAmount('1.234,5')).toBe(1234.5);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount(98000)).toBe(98000);
    expect(parseAmount('n/a')).toBeNull();
  });

  it('asocia categorías a Basilea', () => {
    expect(parseCategory('Fraude externo')).toBe('Fraude Externo');
    expect(parseCategory('Riesgo tecnológico')).toBe('Fallas Tecnológicas');
    expect(parseCategory('Clientes, productos y prácticas empresariales')).toBe('Cumplimiento Normativo');
    expect(parseCategory('Ejecución, entrega y gestión de procesos')).toBe('Ejecución y Procesos');
    expect(parseCategory('otra cosa')).toBeNull();
  });

  it('construye filas: celdas combinadas, procesos, controles, errores y códigos repetidos', () => {
    const rows = [
      ['Código', 'Proceso', 'Riesgo', 'Probabilidad', 'Impacto', 'Exposición', 'Controles'],
      ['R-1', 'Otorgamiento de creditos', 'Evaluación crediticia incorrecta', 3, 4, '$10.000.000', 'CTR-101, CTR-999'],
      ['R-2', null, 'Sobreendeudamiento no detectado', 'Probable', 'Mayor', '', ''],
      ['R-1', 'Cobranza judicial', 'Prescripción de deudas', 2, 2, '', ''],
      ['R-4', 'Captaciones', '', 'zzz', 2, '', ''],
      [null, null, null, null, null, null, null],
    ];
    const out = buildRows(rows, 0, guessColumns(rows[0]), ctx());
    expect(out.length).toBe(4);
    expect(out[0]).toMatchObject({ process: 'Otorgamiento de créditos', likelihood: 3, impact: 4, exposure: 10000000, controlIds: ['ctl-1'] });
    expect(out[0].warnings.join(' ')).toContain('CTR-999');
    expect(out[1].process).toBe('Otorgamiento de créditos'); // repetido de la fila anterior
    expect(out[1]).toMatchObject({ likelihood: 3, impact: 3 });
    expect(out[2].warnings.join(' ')).toContain('no existe');
    expect(out[2].errors.join(' ')).toContain('repetido');
    expect(out[3].errors.length).toBe(2);

    const created = buildRows(rows, 0, guessColumns(rows[0]), ctx({ createMissingProcesses: true }));
    expect(created[2]).toMatchObject({ process: 'Cobranza judicial', newProcess: true });
  });

  it('lee CSV con punto y coma y comillas, incluida la plantilla', () => {
    const rows = parseCsv(templateCsv('CLP'));
    expect(rows[0][0]).toBe('Código');
    expect(rows[1][8]).toBe('45.000.000');
    expect(parseCsv('a;"b;c";"d ""x"""\n1;2;3')).toEqual([['a', 'b;c', 'd "x"'], ['1', '2', '3']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});
