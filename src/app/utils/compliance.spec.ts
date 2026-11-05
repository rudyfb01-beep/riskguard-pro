import { describe, expect, it } from 'vitest';
import { BASE_NORMS, BASE_REQUIREMENTS, RAN_REQUIREMENTS } from '../data/compliance-seed';
import { ComplianceNorm, ComplianceRequirement } from '../models/compliance.model';
import { Control } from '../models/risk.model';
import {
  complianceScore, controlCoverage, needsVersionReview, normId, parseRequirementRows, requirementId, slugify,
} from './compliance';

const ctl = (id: string, status: Control['status'], eff: number): Control => ({
  id, code: id.toUpperCase(), name: id, description: '', process: 'P', type: 'Preventivo', automation: 'Manual', frequency: 'Mensual',
  designEffectiveness: eff, operatingEffectiveness: eff, totalEffectiveness: eff, status, owner: '', lastTested: '', evidence: '',
} as Control);

const req = (over: Partial<ComplianceRequirement> = {}): ComplianceRequirement => ({
  id: 'r1', chapter: 'n1', numeral: '1', title: 'T', requirement: 'R', frequency: 'Anual', status: 'Sin evaluar',
  evidence: '', owner: '', actionPlan: '', ...over,
});

const norm = (over: Partial<ComplianceNorm> = {}): ComplianceNorm => ({
  id: 'n1', code: 'Ley 1', title: 'Ley', kind: 'Ley', issuer: '', source: '', version: 'v1', status: 'Vigente',
  applicability: 'Aplica', applicabilityNote: '', owner: '', notes: '', order: 1,
  versions: [{ version: 'v1', date: '2024-01-01', summary: '', registeredBy: 'x', registeredAt: '2024-01-01T00:00:00Z' }], ...over,
});

describe('semilla de cumplimiento', () => {
  it('conserva los ids de los requisitos RAN existentes', () => {
    expect(RAN_REQUIREMENTS.find(r => r.chapter === '20-7' && r.numeral === 'III.1.f')?.id).toBe('ran-207-catastro-de-servicios-externalizados');
  });

  it('no repite ids y todo requisito pertenece a una norma de la biblioteca', () => {
    const ids = BASE_REQUIREMENTS.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const norms = new Set(BASE_NORMS.map(n => n.id));
    expect(BASE_REQUIREMENTS.every(r => norms.has(r.chapter))).toBe(true);
    expect(new Set(BASE_NORMS.map(n => n.code.toLowerCase())).size).toBe(BASE_NORMS.length);
  });

  it('la versión vigente de cada norma está en su historial', () => {
    for (const n of BASE_NORMS) expect(n.versions.at(-1)?.version).toBe(n.version);
  });
});

describe('identificadores', () => {
  it('genera ids sin acentos ni repetidos', () => {
    expect(slugify('Políticas de seguridad')).toBe('politicas-de-seguridad');
    expect(normId('Ley 21.719', new Set())).toBe('ley-21719');
    expect(normId('Ley 21.719', new Set(['ley-21719']))).toBe('ley-21719-2');
    expect(requirementId('ley-1', 'Canal de denuncia', new Set(['ley-1-canal-de-denuncia']))).toBe('ley-1-canal-de-denuncia-2');
  });
});

describe('puntaje y cobertura', () => {
  it('cuenta parcial como medio punto y excluye "No aplica" y "Sin evaluar"', () => {
    const r = complianceScore([req({ status: 'Cumple' }), req({ status: 'Cumple parcialmente' }), req({ status: 'No aplica' }), req()]);
    expect(r).toEqual({ pct: 75, rated: 2 });
  });

  it('sugiere el estado según los controles vinculados', () => {
    const controls = [ctl('a', 'Efectivo', 90), ctl('b', 'Parcialmente Efectivo', 60), ctl('c', 'Deficiente', 20)];
    expect(controlCoverage([], controls)).toBeNull();
    expect(controlCoverage(['a'], controls)?.suggested).toBe('Cumple');
    expect(controlCoverage(['a', 'b'], controls)?.suggested).toBe('Cumple parcialmente');
    expect(controlCoverage(['c'], controls)?.suggested).toBe('No cumple');
    const gone = controlCoverage(['a', 'zz'], controls)!;
    expect(gone.missing).toBe(1);
    expect(gone.avgEffectiveness).toBe(90);
  });
});

describe('cambio de versión', () => {
  it('marca por revisar lo evaluado con una versión anterior', () => {
    const n = norm({ version: 'v2', versions: [...norm().versions, { version: 'v2', date: '2025-01-01', summary: '', registeredBy: 'x', registeredAt: '' }] });
    expect(needsVersionReview(req({ status: 'Cumple', lastReviewDate: '2024-06-01', normVersion: 'v1' }), n)).toBe(true);
    // Evaluaciones previas al historial: se asume la primera versión.
    expect(needsVersionReview(req({ status: 'Cumple', lastReviewDate: '2024-06-01' }), n)).toBe(true);
    expect(needsVersionReview(req({ status: 'Cumple', lastReviewDate: '2025-02-01', normVersion: 'v2' }), n)).toBe(false);
    expect(needsVersionReview(req(), n)).toBe(false);
    expect(needsVersionReview(req({ status: 'Cumple', lastReviewDate: '2024-06-01' }), norm())).toBe(false);
  });
});

describe('importación de requisitos', () => {
  it('lee filas pegadas desde Excel con encabezado', () => {
    const r = parseRequirementRows('Numeral\tTítulo\tDetalle\tFrecuencia\nart. 4\tCanal de denuncia\tCanal seguro\tPermanente\n\tSanciones\t\t');
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ numeral: 'art. 4', title: 'Canal de denuncia', requirement: 'Canal seguro', frequency: 'Permanente' });
    expect(r.rows[1]).toMatchObject({ title: 'Sanciones', requirement: 'Sanciones', frequency: 'Anual' });
  });

  it('lee CSV con punto y coma, comillas y columnas en otro orden', () => {
    const r = parseRequirementRows('Requisito;Numeral;Periodicidad\n"Capacitación; anual";1.2;semestral\n;1.3;Anual');
    expect(r.rows).toEqual([expect.objectContaining({ title: 'Capacitación; anual', numeral: '1.2', frequency: 'Semestral' })]);
    expect(r.errors).toEqual(['Fila 3: falta el título del requisito.']);
  });

  it('sin encabezado usa el orden Numeral, Título, Detalle, Frecuencia', () => {
    const r = parseRequirementRows('I.1,Política,Aprobada por el Consejo,Mensual');
    expect(r.rows).toEqual([]);
    expect(r.errors[0]).toContain('frecuencia "Mensual" no válida');
  });
});
