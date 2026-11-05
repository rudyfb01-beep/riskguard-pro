import { describe, expect, it } from 'vitest';
import { SurveyResponse } from '../models/survey.model';
import { Control, Risk } from '../models/risk.model';
import { BiaProcess } from '../models/resilience.model';
import { DEFAULT_RISK_SCALE } from '../models/catalog.model';
import {
  biaItems, checkResponseChange, complianceItems, nextCampaignCode, parseCustomItems, rcsaItems, responseProgress, surveyFindings, validateAnswers,
} from './surveys';

const risk = { id: 'r1', code: 'R-1', title: 'Fraude', process: 'Pagos', status: 'Activo', inherentLikelihood: 2, inherentImpact: 3 } as Risk;
const control = { id: 'c1', code: 'C-1', name: 'Doble firma', process: 'Pagos', frequency: 'Diario', status: 'Efectivo' } as Control;
const bia = { id: 'b1', name: 'Pagos', owner: 'Ana', mtpdHours: 24, rtoHours: 8, rpoHours: 4, minimumStaff: 3, systems: ['Core'] } as BiaProcess;

const response = (over: Partial<SurveyResponse> = {}): SurveyResponse => ({
  id: 's1', campaignId: 'c1', subject: 'Pagos', respondent: 'Ing. Carlos Mendoza', items: rcsaItems('Pagos', [risk], [control], DEFAULT_RISK_SCALE),
  answers: {}, status: 'Pendiente', dueDate: '2026-12-01', applied: [], ...over,
});

describe('cuestionarios', () => {
  it('RCSA: probabilidad, impacto y comentario por riesgo; ejecución por control; preguntas generales', () => {
    const items = rcsaItems('Pagos', [risk, { ...risk, id: 'r2', process: 'Otro' }], [control], DEFAULT_RISK_SCALE);
    expect(items.map(i => i.id)).toEqual(['risk:r1:likelihood', 'risk:r1:impact', 'risk:r1:comment', 'control:c1:executed', 'control:c1:evidence',
      'general:new-risks', 'general:incidents', 'general:incidents-detail']);
    expect(items[0].current).toBe(2);
  });

  it('BIA y cumplimiento llevan el valor vigente', () => {
    expect(biaItems(bia).find(i => i.ref?.field === 'rtoHours')?.current).toBe(8);
    const c = complianceItems([{ id: 'q1', chapter: 'n', numeral: '1', title: 'T', requirement: 'R', frequency: 'Anual', status: 'Sin evaluar', evidence: '', owner: '', actionPlan: '' }], 'Ley 1');
    expect(c[0]).toMatchObject({ type: 'opcion', current: 'Sin evaluar', section: 'Ley 1 1 · T' });
  });

  it('preguntas propias con tipo y obligatoriedad', () => {
    const r = parseCustomItems('*¿Conoce el procedimiento? | si-no\nComentarios\nMala | fecha');
    expect(r.items.map(i => [i.label, i.type, i.required])).toEqual([['¿Conoce el procedimiento?', 'si-no', true], ['Comentarios', 'texto', false]]);
    expect(r.errors[0]).toContain('Línea 3');
  });

  it('código correlativo', () => {
    expect(nextCampaignCode([{ code: 'AE-2026-03' }], 2026)).toBe('AE-2026-04');
  });
});

describe('respuestas', () => {
  it('valida obligatorias, rangos y RTO ≤ MTPD', () => {
    expect(validateAnswers(response()).length).toBe(4);
    const items = biaItems(bia);
    const errors = validateAnswers({ items, answers: { 'bia:b1:mtpdHours': 4, 'bia:b1:rtoHours': 8, 'bia:b1:rpoHours': 1, 'bia:b1:minimumStaff': 2 } });
    expect(errors).toEqual(['Proceso: Pagos: el RTO no puede superar el MTPD.']);
  });

  it('detecta cambios, brechas y alertas', () => {
    const f = surveyFindings(response({ answers: {
      'risk:r1:likelihood': 3, 'risk:r1:impact': 3, 'control:c1:executed': 'Parcial', 'control:c1:evidence': 'Falta en septiembre', 'general:incidents': 'Sí',
    } }));
    expect(f.map(x => [x.kind, x.itemId])).toEqual([['cambio', 'risk:r1:likelihood'], ['brecha', 'control:c1:executed'], ['alerta', 'general:incidents']]);
    expect(responseProgress(response({ answers: { 'risk:r1:likelihood': 3 } }))).toMatchObject({ answered: 1, total: 8, requiredMissing: 3 });
  });
});

describe('reglas de edición', () => {
  const owner = { name: 'Carlos Mendoza', permissions: {} };
  const manager = { name: 'Elena', permissions: { canManageSurveys: true } };
  const full = { 'risk:r1:likelihood': 2, 'risk:r1:impact': 3, 'control:c1:executed': 'Sí', 'general:incidents': 'No' };

  it('quien responde guarda y envía sus respuestas mientras la campaña está en curso', () => {
    const prev = response();
    expect(checkResponseChange(prev, { ...prev, answers: { 'risk:r1:likelihood': 2 }, status: 'En progreso' }, owner, { status: 'En curso' })).toBeNull();
    expect(checkResponseChange(prev, { ...prev, answers: full, status: 'Enviada' }, owner, { status: 'En curso' })).toBeNull();
    expect(checkResponseChange(prev, { ...prev, answers: {}, status: 'Enviada' }, owner, { status: 'En curso' })).toMatch(/Falta responder/);
    expect(checkResponseChange(prev, { ...prev, status: 'Enviada', answers: full }, owner, { status: 'Cerrada' })).toMatch(/no está en curso/);
  });

  it('no puede cambiar preguntas, responsable ni revisar', () => {
    const prev = response();
    expect(checkResponseChange(prev, { ...prev, respondent: 'Otro', status: 'En progreso' }, owner, { status: 'En curso' })).toMatch(/Solo puede cambiar/);
    expect(checkResponseChange(prev, { ...prev, status: 'Revisada' }, owner, { status: 'En curso' })).toMatch(/Solo puede guardar/);
    expect(checkResponseChange({ ...prev, status: 'Enviada' }, { ...prev, status: 'En progreso' }, owner, { status: 'En curso' })).toMatch(/ya fue enviada/);
    expect(checkResponseChange(prev, { ...prev, status: 'En progreso' }, { name: 'Otra Persona', permissions: {} }, { status: 'En curso' })).toMatch(/persona asignada/);
    expect(checkResponseChange(null, prev, owner)).toMatch(/administra/);
    expect(checkResponseChange(prev, { ...prev, status: 'Revisada' }, manager)).toBeNull();
  });
});
