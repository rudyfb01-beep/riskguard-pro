import { describe, expect, it } from 'vitest';
import readXlsx from 'read-excel-file/universal';
import {
  BulkContext, buildBulkRows, bulkSpec, bulkSummary, findBulkHeader, guessBulkColumns, matchOption, parseDay, resultSheets,
  templateSheets, validateBulkRecord, validRut,
} from './bulk-import';
import { buildXlsx, colName, crc32 } from './xlsx-writer';
import { SheetRows } from './risk-import';

const perms = { canEditRisks: false, canEvaluateControls: false, canExecuteAudits: false, canReportFlaws: true, canConvertFlaws: false, canAcknowledgeAlerts: false, canConfigureKRIs: false, canManageRoles: false, canExportReports: true };

let n = 0;
const ctx = (existing: unknown[] = [], over: Partial<BulkContext> = {}): BulkContext => ({
  today: '2026-11-06', nowStamp: '2026-11-06 10:00', actorName: 'Ana Admin', actorRole: 'Gestor',
  lists: {
    processes: ['Otorgamiento de Créditos', 'Tesorería'], areas: ['Operaciones', 'Riesgos'], roles: ['Analista de Riesgo', 'Gerente General'],
    providers: ['PRV-001 Nube SpA', 'PRV-001', 'Nube SpA'], providerCategories: ['Servicios en la nube', 'Otros servicios'], biaProcesses: ['Pagos'],
  },
  areas: [{ id: 'a1', name: 'Operaciones' }, { id: 'a2', name: 'Riesgos' }],
  roles: [
    { id: 'r1', title: 'Analista de Riesgo', department: 'Riesgos', badge: 'Riesgo', permissions: { ...perms, canEditRisks: true } },
    { id: 'r2', title: 'Gerente General', department: 'Gerencia', badge: 'GG', permissions: { ...perms, canManageRoles: true } },
  ],
  providers: [{ id: 'p1', code: 'PRV-001', name: 'Nube SpA', taxId: '76.000.000-0' }],
  bia: [{ id: 'b1', name: 'Pagos' }],
  existing, updateExisting: true, newId: p => `${p}-${++n}`, ...over,
});

const run = (entity: string, rows: SheetRows, c = ctx()) => {
  const spec = bulkSpec(entity)!;
  const h = findBulkHeader(spec, rows);
  return buildBulkRows(spec, rows, h, guessBulkColumns(spec, rows[h]), c);
};

describe('conversión de valores', () => {
  it('fechas, RUT y listas', () => {
    expect(parseDay('15-10-2026')).toBe('2026-10-15');
    expect(parseDay('2026/1/5')).toBe('2026-01-05');
    expect(parseDay(46310)).toBe('2026-10-15');
    expect(parseDay(new Date(Date.UTC(2026, 0, 31)))).toBe('2026-01-31');
    expect(parseDay('31-02-2026')).toBeNull();
    expect(validRut('76.086.428-5')).toBe(true);
    expect(validRut('11.111.111-2')).toBe(false);
    expect(matchOption('prev', ['Preventivo', 'Detectivo'])).toEqual({ value: 'Preventivo', exact: true });
    expect(matchOption('automatico', ['Automático', 'Semiautomático', 'Manual'])?.value).toBe('Automático');
  });
});

describe('carga masiva de controles', () => {
  const existing = [{
    id: 'c1', code: 'CTR-205', name: 'Conciliación', description: 'x', process: 'Tesorería', type: 'Detectivo', automation: 'Manual', frequency: 'Diario',
    designEffectiveness: 90, operatingEffectiveness: 90, totalEffectiveness: 90, status: 'Efectivo', owner: 'Jefe', lastTested: '2026-01-01',
    sampleDetails: '', evidence: 'ok', attachments: [], testHistory: [{ id: 't0' }],
  }];

  it('encabezado en otra fila, códigos automáticos, actualización y errores', () => {
    const rows: SheetRows = [
      ['Inventario de controles 2026'],
      [],
      ['Código', 'Nombre *', 'Proceso', 'Tipo', 'Efectividad de diseño', 'Efectividad operativa', 'Frecuencia'],
      ['', 'Doble firma', 'Otorgamiento de creditos', 'Preventivo', 90, 80, 'por evento'],
      ['CTR-205', '', '', '', 50, '', ''],
      ['', 'Sin proceso', '', 'Raro', 101, 50, ''],
      ['', 'Doble firma 2', 'Tesorería', '', 70, 70, ''],
      [null, null, null],
    ];
    const out = run('controls', rows, ctx(existing));
    expect(out.map(r => r.action)).toEqual(['crear', 'actualizar', 'error', 'crear']);
    expect(out[0].line).toBe(4);
    expect(out[0].record).toMatchObject({ code: 'CTR-206', process: 'Otorgamiento de Créditos', frequency: 'Por Evento', totalEffectiveness: 84, status: 'Parcialmente Efectivo', automation: 'Manual' });
    expect((out[3].record as unknown as { code: string }).code).toBe('CTR-207');
    // Celdas vacías conservan; nueva evaluación agrega una prueba
    expect(out[1].record).toMatchObject({ id: 'c1', name: 'Conciliación', process: 'Tesorería', designEffectiveness: 50, operatingEffectiveness: 90, status: 'Parcialmente Efectivo' });
    expect((out[1].record as unknown as { testHistory: unknown[] }).testHistory).toHaveLength(2);
    expect(out[2].errors.join(' ')).toMatch(/Tipo: "Raro"/);
    expect(out[2].errors.join(' ')).toMatch(/fuera del rango/);
    expect(out[2].errors.join(' ')).toMatch(/Falta Proceso/);
    for (const r of out.filter(x => x.record)) expect(validateBulkRecord('controls', r.record)).toBeNull();
    expect(bulkSummary(out)).toMatchObject({ crear: 2, actualizar: 1, error: 1 });
  });

  it('sin actualizar: los existentes se omiten; repetidos en el archivo dan error', () => {
    const rows: SheetRows = [['Código', 'Nombre', 'Proceso', 'Efectividad de diseño', 'Efectividad operativa'], ['CTR-205', 'X', 'Tesorería', 1, 1], ['CTR-300', 'Y', 'Tesorería', 1, 1], ['ctr-300', 'Z', 'Tesorería', 1, 1]];
    const out = run('controls', rows, ctx(existing, { updateExisting: false }));
    expect(out.map(r => r.action)).toEqual(['omitir', 'crear', 'error']);
    expect(out[2].errors[0]).toContain('repetido');
  });
});

describe('usuarios, procesos, proveedores e incidentes', () => {
  it('usuarios: permisos del puesto, correo como clave y cambio de puesto', () => {
    const existing = [{ id: 'u1', name: 'Pedro', email: 'pedro@coop.cl', role: 'Analista de Riesgo', roleId: 'r1', department: 'Riesgos', badge: 'Riesgo', permissions: { ...perms, canEditRisks: true, canExportReports: false } }];
    const rows: SheetRows = [['Nombre', 'Email', 'Cargo', 'Área'], ['Ana', 'ANA@coop.cl', 'gerente general', ''], ['', 'pedro@coop.cl', '', 'Operaciones'], ['Mal', 'no-es-correo', 'Analista de Riesgo', '']];
    const out = run('users', rows, ctx(existing));
    expect(out[0].record).toMatchObject({ email: 'ana@coop.cl', roleId: 'r2', department: 'Gerencia', permissions: { canManageRoles: true } });
    expect(out[1]).toMatchObject({ action: 'actualizar', record: { name: 'Pedro', department: 'Operaciones', permissions: { canExportReports: false } } });
    expect(out[2].errors[0]).toContain('correo');
  });

  it('procesos: no se renombran por carga y el nombre debe ser único', () => {
    const existing = [{ id: 'p1', code: 'PRC-01', name: 'Tesorería', criticality: 'Alto', owner: '', description: '', active: true }];
    const rows: SheetRows = [['Código', 'Nombre', 'Área', 'Criticidad'], ['PRC-01', 'Tesorería e Inversiones', '', ''], ['', 'tesoreria', '', ''], ['', 'Cobranza', 'operaciones', 'crit']];
    const out = run('processes', rows, ctx(existing));
    expect(out[0].errors[0]).toContain('renombrar');
    expect(out[1]).toMatchObject({ action: 'actualizar' }); // reconocido por nombre
    expect(out[2].record).toMatchObject({ code: 'PRC-02', areaId: 'a1', criticality: 'Crítico' });
  });

  it('proveedores: RUT, fechas y reconocimiento por RUT', () => {
    const existing = [{ id: 'p1', code: 'PRV-001', name: 'Nube SpA', taxId: '76.086.428-5', contractStart: '2025-01-01', contractEnd: '2026-12-31', criticality: 'Alto', status: 'Activo', dataLocation: 'Chile', supportedProcesses: [], clauses: { a: true }, annualCostUSD: 1, isCloud: true }];
    const rows: SheetRows = [
      ['Proveedor', 'RUT', 'Criticidad', 'Inicio de contrato', 'Término de contrato', 'Procesos que soporta', 'Costo anual', 'Servicio en la nube'],
      ['Cobranzas Ltda', '11.111.111-2', 'Medio', '01-03-2025', '28-02-2027', 'Tesorería, Otorgamiento', '1.200.000', 'no'],
      ['', '76086428-5', '', '', '2027-12-31', '', '', ''],
      ['Fechas al revés', '', 'Bajo', '2027-01-01', '2026-01-01', '', '', ''],
    ];
    const out = run('providers', rows, ctx(existing));
    expect(out[0].record).toMatchObject({ code: 'PRV-002', annualCostUSD: 1200000, supportedProcesses: ['Tesorería', 'Otorgamiento de Créditos'], contractStart: '2025-03-01' });
    expect(out[0].warnings.join(' ')).toContain('dígito verificador');
    expect(out[1]).toMatchObject({ action: 'actualizar', record: { id: 'p1', contractEnd: '2027-12-31', clauses: { a: true } } });
    expect(out[2].action).toBe('error');
    expect(validateBulkRecord('providers', out[0].record)).toBeNull();
  });

  it('incidentes: categoría Basilea, montos y duplicados', () => {
    const existing = [{ id: 'i1', title: 'Fraude con tarjeta', occurrenceDate: '2025-05-01', realLossAmountUSD: 1000 }];
    const rows: SheetRows = [
      ['Título', 'Proceso', 'Fecha de ocurrencia', 'Pérdida bruta', 'Monto recuperado', 'Categoría Basilea', 'Proveedor'],
      ['Fraude con tarjeta', 'Tesorería', '2025-05-01', 1000, 0, 'fraude externo', 'PRV-001'],
      ['Error de digitación', 'Tesorería', '2025-06-01', '$ 2.500.000', '3.000.000', 'proceso', ''],
      ['Malo', 'Tesorería', '', 0, 0, 'Astrología', ''],
    ];
    const out = run('flaws', rows, ctx(existing));
    expect(out[0].record).toMatchObject({ baselCategory: 'Fraude Externo', providerId: 'p1', status: 'Pendiente de Evaluación', reportedBy: 'Ana Admin' });
    expect(out[0].warnings.join(' ')).toContain('duplicado');
    expect(out[1].record).toMatchObject({ realLossAmountUSD: 2500000, baselCategory: 'Ejecución y Procesos' });
    expect(out[1].warnings.join(' ')).toContain('recuperado supera');
    expect(out[2].action).toBe('error');
    expect(validateBulkRecord('flaws', out[1].record)).toBeNull();
    expect(validateBulkRecord('flaws', { ...out[1].record, severity: 'Gigante' })).toContain('severidad');
  });
});

describe('planillas .xlsx', () => {
  it('CRC32 y nombres de columna', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926);
    expect([colName(0), colName(25), colName(26), colName(701)]).toEqual(['A', 'Z', 'AA', 'ZZ']);
  });

  it('la plantilla se lee de vuelta y se reconoce el encabezado', async () => {
    const spec = bulkSpec('controls')!;
    const sheets = templateSheets(spec, ctx().lists);
    const bytes = buildXlsx(sheets);
    const book = await readXlsx(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(book.map(s => s.sheet)).toEqual(['Datos', 'Instrucciones', 'Listas']);
    const data = book[0].data as SheetRows;
    expect(findBulkHeader(spec, data)).toBe(0);
    expect(Object.keys(guessBulkColumns(spec, data[0]))).toHaveLength(spec.fields.length);
    // La fila de ejemplo es válida
    const out = buildBulkRows(spec, data.map(r => r.map(c => (c === 'Otorgamiento de Créditos' ? c : c))), 0, guessBulkColumns(spec, data[0]), ctx());
    expect(out[0].action).toBe('crear');
    expect(book[2].data[0]).toContain('Proceso');
  });

  it('el informe de resultados lista cada fila', async () => {
    const out = run('areas', [['Nombre', 'Activa'], ['Riesgos', 'si'], ['', 'quizás']], ctx([{ id: 'a2', name: 'Riesgos', manager: '', description: '', active: true }]));
    const book = await readXlsx(buildXlsx(resultSheets(['Nombre', 'Activa'], out)).buffer as ArrayBuffer);
    expect(book[0].data[0]).toEqual(['Fila', 'Resultado', 'Observaciones', 'Nombre', 'Activa']);
    expect(book[0].data[1].slice(0, 2)).toEqual([2, 'Se actualiza']);
    expect(String(book[0].data[2][2])).toContain('Sí o No');
  });
});
