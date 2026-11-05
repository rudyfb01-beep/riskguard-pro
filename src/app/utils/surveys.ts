import {
  CUSTOM_ITEM_TYPES, SurveyAnswer, SurveyCampaign, SurveyItem, SurveyItemType, SurveyResponse,
} from '../models/survey.model';
import { Control, Risk, UserPermissions } from '../models/risk.model';
import { BiaProcess } from '../models/resilience.model';
import { ComplianceRequirement } from '../models/compliance.model';
import { ScaleLevel } from '../models/catalog.model';
import { personKey } from './action-plans';

export const COMPLIANCE_ANSWERS = ['Cumple', 'Cumple parcialmente', 'No cumple', 'No aplica'] as const;

/** Siguiente código AE-<año>-<nn>. */
export function nextCampaignCode(existing: { code: string }[], year = new Date().getFullYear()): string {
  const prefix = `AE-${year}-`;
  const max = existing.reduce((m, c) => (c.code?.startsWith(prefix) ? Math.max(m, Number(c.code.slice(prefix.length)) || 0) : m), 0);
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

const scaleHelp = (levels: ScaleLevel[]) => levels.map(l => `${l.level} ${l.name}: ${l.criteria}`).join(' · ');

// -----------------------------------------------------------------------------
// Cuestionarios
// -----------------------------------------------------------------------------

/** RCSA de un proceso: por riesgo, probabilidad e impacto; por control, si se ejecutó; y preguntas generales. */
export function rcsaItems(process: string, risks: Risk[], controls: Control[], scale: { likelihood: ScaleLevel[]; impact: ScaleLevel[] }): SurveyItem[] {
  const items: SurveyItem[] = [];
  for (const r of risks.filter(x => x.process === process && x.status !== 'Cerrado')) {
    const section = `Riesgo ${r.code}: ${r.title}`;
    items.push(
      { id: `risk:${r.id}:likelihood`, section, label: '¿Qué tan probable es hoy que ocurra?', help: scaleHelp(scale.likelihood), type: 'probabilidad', required: true, ref: { kind: 'risk', id: r.id, field: 'likelihood' }, current: r.inherentLikelihood },
      { id: `risk:${r.id}:impact`, section, label: '¿Qué impacto tendría si ocurre?', help: scaleHelp(scale.impact), type: 'impacto', required: true, ref: { kind: 'risk', id: r.id, field: 'impact' }, current: r.inherentImpact },
      { id: `risk:${r.id}:comment`, section, label: '¿Qué cambió desde la última evaluación? (causas, volumen, sistemas, personas)', type: 'texto', required: false, ref: { kind: 'risk', id: r.id } },
    );
  }
  for (const c of controls.filter(x => x.process === process)) {
    const section = `Control ${c.code}: ${c.name}`;
    items.push(
      { id: `control:${c.id}:executed`, section, label: `¿El control se ejecutó con la frecuencia definida (${c.frequency.toLowerCase()}) durante el período?`, type: 'si-parcial-no', required: true, ref: { kind: 'control', id: c.id, field: 'executed' }, current: c.status },
      { id: `control:${c.id}:evidence`, section, label: 'Evidencia de la ejecución o motivo del incumplimiento', type: 'texto', required: false, ref: { kind: 'control', id: c.id } },
    );
  }
  items.push(
    { id: 'general:new-risks', section: 'General', label: '¿Identifica riesgos nuevos en el proceso que no estén en la matriz? Descríbalos.', type: 'texto', required: false },
    { id: 'general:incidents', section: 'General', label: '¿Hubo incidentes o pérdidas en el período que no se hayan reportado?', type: 'si-no', required: true },
    { id: 'general:incidents-detail', section: 'General', label: 'Si respondió sí, describa el incidente (fecha, monto aproximado, causa).', type: 'texto', required: false },
  );
  return items;
}

/** Actualización del BIA de un proceso. */
export function biaItems(b: BiaProcess): SurveyItem[] {
  const section = `Proceso: ${b.name}`;
  return [
    { id: `bia:${b.id}:mtpdHours`, section, label: 'Máximo período tolerable de interrupción (MTPD), en horas', type: 'horas', required: true, ref: { kind: 'bia', id: b.id, field: 'mtpdHours' }, current: b.mtpdHours },
    { id: `bia:${b.id}:rtoHours`, section, label: 'Tiempo objetivo de recuperación (RTO), en horas', help: 'Debe ser menor o igual al MTPD.', type: 'horas', required: true, ref: { kind: 'bia', id: b.id, field: 'rtoHours' }, current: b.rtoHours },
    { id: `bia:${b.id}:rpoHours`, section, label: 'Pérdida de datos tolerable (RPO), en horas', type: 'horas', required: true, ref: { kind: 'bia', id: b.id, field: 'rpoHours' }, current: b.rpoHours },
    { id: `bia:${b.id}:minimumStaff`, section, label: 'Personal mínimo para operar en contingencia', type: 'numero', required: true, ref: { kind: 'bia', id: b.id, field: 'minimumStaff' }, current: b.minimumStaff },
    { id: `bia:${b.id}:systems`, section, label: 'Sistemas y aplicaciones de los que depende (confirme o corrija)', type: 'texto', required: false, ref: { kind: 'bia', id: b.id, field: 'systems' }, current: b.systems.join(', ') },
    { id: `bia:${b.id}:changes`, section, label: '¿Cambió el proceso (volumen, canales, proveedores, sitio alternativo)? Describa.', type: 'texto', required: false, ref: { kind: 'bia', id: b.id } },
  ];
}

/** Estado declarado y evidencia de cada requisito de una norma. */
export function complianceItems(reqs: ComplianceRequirement[], normLabel: string): SurveyItem[] {
  return reqs.flatMap(r => {
    const section = `${normLabel} ${r.numeral} · ${r.title}`.trim();
    return [
      { id: `req:${r.id}:status`, section, label: r.requirement, type: 'opcion' as SurveyItemType, options: [...COMPLIANCE_ANSWERS], required: true, ref: { kind: 'requirement' as const, id: r.id, field: 'status' }, current: r.status },
      { id: `req:${r.id}:evidence`, section, label: 'Evidencia (documento, acta, enlace) o brecha detectada', type: 'texto' as SurveyItemType, required: false, ref: { kind: 'requirement' as const, id: r.id, field: 'evidence' }, current: r.evidence },
    ];
  });
}

/**
 * Preguntas propias, una por línea. Tipo opcional al final después de "|":
 * texto, si-no, si-parcial-no, escala-5 o numero (por defecto texto). Un "*" al inicio la hace obligatoria.
 */
export function parseCustomItems(text: string): { items: SurveyItem[]; errors: string[] } {
  const items: SurveyItem[] = [];
  const errors: string[] = [];
  const types = new Set(CUSTOM_ITEM_TYPES.map(t => t.id));
  text.split('\n').map(l => l.trim()).filter(Boolean).forEach((line, i) => {
    const parts = line.split('|').map(s => s.trim());
    let label = parts[0];
    const type = parts[1];
    const required = label.startsWith('*');
    if (required) label = label.slice(1).trim();
    const t = (type || 'texto').toLowerCase() as SurveyItemType;
    if (!label) { errors.push(`Línea ${i + 1}: falta la pregunta.`); return; }
    if (!types.has(t)) { errors.push(`Línea ${i + 1}: tipo "${type}" no válido (use texto, si-no, si-parcial-no, escala-5 o numero).`); return; }
    items.push({ id: `q${i + 1}`, section: 'Cuestionario', label, type: t, required });
  });
  return { items, errors };
}

// -----------------------------------------------------------------------------
// Respuestas
// -----------------------------------------------------------------------------

export const isAnswered = (v: SurveyAnswer | undefined) => v !== null && v !== undefined && String(v).trim() !== '';

export function responseProgress(r: Pick<SurveyResponse, 'items' | 'answers'>): { answered: number; total: number; requiredMissing: number; pct: number } {
  const answered = r.items.filter(i => isAnswered(r.answers[i.id])).length;
  const requiredMissing = r.items.filter(i => i.required && !isAnswered(r.answers[i.id])).length;
  return { answered, total: r.items.length, requiredMissing, pct: r.items.length ? Math.round((answered / r.items.length) * 100) : 0 };
}

/** Errores de validación antes de enviar (obligatorias, rangos y RTO ≤ MTPD). */
export function validateAnswers(r: Pick<SurveyResponse, 'items' | 'answers'>): string[] {
  const errors: string[] = [];
  for (const i of r.items) {
    const v = r.answers[i.id];
    if (i.required && !isAnswered(v)) { errors.push(`Falta responder: ${i.section} · ${i.label}`); continue; }
    if (!isAnswered(v)) continue;
    if (['horas', 'numero'].includes(i.type) && (!Number.isFinite(Number(v)) || Number(v) < 0)) errors.push(`Valor no válido en: ${i.label}`);
    if (['probabilidad', 'impacto'].includes(i.type) && ![1, 2, 3, 4].includes(Number(v))) errors.push(`Use un valor de 1 a 4 en: ${i.label}`);
  }
  const byBia = new Map<string, { mtpd?: number; rto?: number; name: string }>();
  for (const i of r.items) {
    if (i.ref?.kind !== 'bia' || !isAnswered(r.answers[i.id])) continue;
    const e = byBia.get(i.ref.id) ?? { name: i.section };
    if (i.ref.field === 'mtpdHours') e.mtpd = Number(r.answers[i.id]);
    if (i.ref.field === 'rtoHours') e.rto = Number(r.answers[i.id]);
    byBia.set(i.ref.id, e);
  }
  for (const e of byBia.values()) if (e.mtpd !== undefined && e.rto !== undefined && e.rto > e.mtpd) errors.push(`${e.name}: el RTO no puede superar el MTPD.`);
  return errors;
}

export type FindingKind = 'cambio' | 'brecha' | 'alerta';

/** Lo que la revisión debe atender en una respuesta. */
export interface SurveyFinding {
  itemId: string;
  kind: FindingKind;
  section: string;
  text: string;
  ref?: SurveyItem['ref'];
  /** Para cambios: valor propuesto y vigente. */
  proposed?: SurveyAnswer;
  current?: string | number;
}

export function surveyFindings(r: Pick<SurveyResponse, 'items' | 'answers'>): SurveyFinding[] {
  const out: SurveyFinding[] = [];
  const ans = (id: string) => r.answers[id];
  for (const i of r.items) {
    const v = ans(i.id);
    if (!isAnswered(v)) continue;
    const ref = i.ref;
    if (ref?.kind === 'risk' && (ref.field === 'likelihood' || ref.field === 'impact') && Number(v) !== Number(i.current)) {
      out.push({ itemId: i.id, kind: 'cambio', section: i.section, ref, proposed: Number(v), current: i.current,
        text: `${ref.field === 'likelihood' ? 'Probabilidad' : 'Impacto'} propuesta ${v} (vigente ${i.current}).` });
    }
    if (ref?.kind === 'control' && ref.field === 'executed' && v !== 'Sí') {
      const ev = ans(`control:${ref.id}:evidence`);
      out.push({ itemId: i.id, kind: 'brecha', section: i.section, ref, proposed: v, text: `El control se ejecutó: ${String(v).toLowerCase()}.${isAnswered(ev) ? ` ${ev}` : ''}` });
    }
    if (ref?.kind === 'bia' && ['mtpdHours', 'rtoHours', 'rpoHours', 'minimumStaff'].includes(ref.field ?? '') && Number(v) !== Number(i.current)) {
      out.push({ itemId: i.id, kind: 'cambio', section: i.section, ref, proposed: Number(v), current: i.current, text: `${i.label}: propuesto ${v} (vigente ${i.current}).` });
    }
    if (ref?.kind === 'bia' && ref.field === 'systems' && String(v).trim() !== String(i.current ?? '').trim()) {
      out.push({ itemId: i.id, kind: 'cambio', section: i.section, ref, proposed: v, current: i.current, text: `Dependencias: ${v}` });
    }
    if (ref?.kind === 'requirement' && ref.field === 'status') {
      const ev = ans(`req:${ref.id}:evidence`);
      if (v !== i.current) out.push({ itemId: i.id, kind: 'cambio', section: i.section, ref, proposed: v, current: i.current, text: `Estado declarado: ${v} (vigente ${i.current}).${isAnswered(ev) ? ` Evidencia: ${ev}` : ''}` });
      if (v === 'No cumple' || v === 'Cumple parcialmente') out.push({ itemId: `${i.id}#gap`, kind: 'brecha', section: i.section, ref, proposed: v, text: `Brecha declarada: ${v}.${isAnswered(ev) ? ` ${ev}` : ''}` });
    }
    if (i.id === 'general:incidents' && v === 'Sí') {
      out.push({ itemId: i.id, kind: 'alerta', section: i.section, text: `Incidentes no reportados: ${ans('general:incidents-detail') ?? 'sin detalle'}. Regístrelos en Incidentes y Pérdidas.` });
    }
    if (i.id === 'general:new-risks' && String(v).trim()) {
      out.push({ itemId: i.id, kind: 'alerta', section: i.section, text: `Riesgos nuevos informados: ${v}` });
    }
    if (!ref && ['si-no', 'si-parcial-no'].includes(i.type) && v !== 'Sí' && !i.id.startsWith('general:')) {
      out.push({ itemId: i.id, kind: 'brecha', section: i.section, text: `${i.label}: ${v}` });
    }
  }
  return out;
}

// -----------------------------------------------------------------------------
// Reglas de edición (navegador y servidor)
// -----------------------------------------------------------------------------

interface Actor { name: string; permissions: Partial<UserPermissions> }

export const canManageSurveys = (u: Actor) => !!u.permissions?.canManageSurveys;
export const isRespondent = (u: Actor, r: Pick<SurveyResponse, 'respondent'>) => !!u.name?.trim() && !!r.respondent?.trim() && personKey(u.name) === personKey(r.respondent);

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const RESPONDENT_FIELDS: (keyof SurveyResponse)[] = ['answers', 'status', 'startedAt', 'submittedAt'];

/**
 * null si el cambio está permitido. Quien administra encuestas crea, reasigna, devuelve y revisa.
 * La persona que responde solo cambia sus respuestas y las envía mientras la encuesta está abierta.
 */
export function checkResponseChange(prev: SurveyResponse | null, next: SurveyResponse, u: Actor, campaign?: Pick<SurveyCampaign, 'status'> | null): string | null {
  if (canManageSurveys(u)) return null;
  if (!prev) return 'Solo quien administra autoevaluaciones puede crear encuestas.';
  if (!isRespondent(u, prev)) return 'Solo la persona asignada puede responder esta encuesta.';
  if (campaign && campaign.status !== 'En curso') return 'La campaña no está en curso.';
  if (!['Pendiente', 'En progreso', 'Devuelta'].includes(prev.status)) return 'La encuesta ya fue enviada.';
  if (!['En progreso', 'Enviada'].includes(next.status)) return 'Solo puede guardar el avance o enviar la encuesta.';
  for (const k of Object.keys({ ...prev, ...next }) as (keyof SurveyResponse)[]) {
    if (!RESPONDENT_FIELDS.includes(k) && !same(prev[k], next[k])) return 'Solo puede cambiar sus respuestas.';
  }
  if (next.status === 'Enviada') {
    const errors = validateAnswers(next);
    if (errors.length) return errors[0];
  }
  return null;
}

/** Sección y elemento de origen de un hallazgo, para crear un plan de acción. */
export function planSourceOf(f: SurveyFinding): { sourceType: 'Riesgo' | 'Control' | 'Cumplimiento' | 'Continuidad' | 'Otro'; sourceId?: string } {
  switch (f.ref?.kind) {
    case 'risk': return { sourceType: 'Riesgo', sourceId: f.ref.id };
    case 'control': return { sourceType: 'Control', sourceId: f.ref.id };
    case 'requirement': return { sourceType: 'Cumplimiento', sourceId: f.ref.id };
    case 'bia': return { sourceType: 'Continuidad', sourceId: f.ref.id };
    default: return { sourceType: 'Otro' };
  }
}
