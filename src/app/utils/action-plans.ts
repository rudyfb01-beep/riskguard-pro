import {
  ActionPlan, ActionPlanPriority, ActionPlanSource, ActionPlanStatus, ActionPlanTask,
} from '../models/action-plan.model';
import { AuditFinding, MitigationPlan, PeriodicAudit, Risk, UserPermissions } from '../models/risk.model';
import { ComplianceRequirement } from '../models/compliance.model';
import { SecurityAssessmentItem } from '../models/security.model';
import { ContinuityTest } from '../models/resilience.model';

export const OPEN_STATUSES: ActionPlanStatus[] = ['Pendiente', 'En curso', 'Por verificar'];
export const isOpenPlan = (p: ActionPlan) => OPEN_STATUSES.includes(p.status);

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Vencido: abierto (sin contar "Por verificar", que ya entregó) y con plazo anterior a hoy. */
export function isOverduePlan(p: ActionPlan, today = todayIso()): boolean {
  return (p.status === 'Pendiente' || p.status === 'En curso') && !!p.dueDate && p.dueDate < today;
}

/** Días hasta el plazo (negativo si venció). */
export function daysToDue(p: ActionPlan, today = todayIso()): number {
  return Math.round((Date.parse(p.dueDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000);
}

/** Siguiente código PA-<año>-<nnn>, correlativo por año. */
export function nextPlanCode(existing: { code: string }[], year = new Date().getFullYear()): string {
  const prefix = `PA-${year}-`;
  const max = existing.reduce((m, p) => {
    if (!p.code?.startsWith(prefix)) return m;
    const n = Number(p.code.slice(prefix.length));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** Avance según tareas (si hay); si no, el informado. */
export function progressFromTasks(tasks: ActionPlanTask[], fallback: number): number {
  if (!tasks.length) return fallback;
  return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
}

// -----------------------------------------------------------------------------
// Reglas de edición (las mismas en el navegador y en el servidor)
// -----------------------------------------------------------------------------

/** Permisos del módulo de origen que permiten crear un plan desde él. */
export const SOURCE_PERMISSIONS: Record<ActionPlanSource, (keyof UserPermissions)[]> = {
  'Riesgo': ['canEditRisks'],
  'Control': ['canEvaluateControls'],
  'Auditoría': ['canExecuteAudits'],
  'Cumplimiento': ['canManageCompliance', 'canManageRegulatoryReports'],
  'Autoevaluación de seguridad': ['canManageInfoSecurity'],
  'Continuidad': ['canManageContinuity'],
  'Proveedor': ['canManageProviders'],
  'Incidente': ['canReportFlaws', 'canConvertFlaws'],
  'Otro': [],
};

interface Actor { name: string; permissions: Partial<UserPermissions> }

const has = (u: Actor, perms: (keyof UserPermissions)[]) => perms.some(p => !!u.permissions?.[p]);
export const canManagePlans = (u: Actor) => !!u.permissions?.canManageActionPlans;
/** Nombre comparable: sin tratamiento (Sr., Dra., Ing., Lic.), acentos ni mayúsculas. */
export function personKey(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/^(\s*(sr|sra|srta|dr|dra|ing|lic|prof|don|dona)\.?\s+)+/, '').replace(/\s+/g, ' ').trim();
}

export const isPlanOwner = (u: Actor, p: Pick<ActionPlan, 'owner'>) => !!u.name?.trim() && !!p.owner?.trim() && personKey(p.owner) === personKey(u.name);

/** Campos que solo cambia quien administra planes (el responsable no puede tocarlos). */
const MANAGER_FIELDS: (keyof ActionPlan)[] = [
  'code', 'title', 'sourceType', 'sourceId', 'sourceLabel', 'process', 'owner', 'priority', 'startDate', 'dueDate',
  'originalDueDate', 'reschedules', 'cancelReason', 'createdBy', 'createdAt', 'closedAt', 'rejections',
];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * null si el cambio está permitido; si no, el motivo. `prev` es null al crear.
 * - Crear: quien administra planes o quien tiene el permiso del módulo de origen.
 * - El responsable registra avances, tareas y lo envía a verificación, pero no cambia plazo,
 *   responsable ni origen, ni cierra, cancela o verifica.
 * - Verificar el cierre (Por verificar → Cerrado) lo hace quien administra planes y no es el responsable.
 */
export function checkPlanChange(prev: ActionPlan | null, next: ActionPlan, u: Actor): string | null {
  const manager = canManagePlans(u);
  if (!next.title?.trim()) return 'El plan necesita un título.';
  if (!next.owner?.trim()) return 'El plan necesita un responsable.';
  if (!next.dueDate) return 'El plan necesita un plazo.';
  if (next.progressPct < 0 || next.progressPct > 100) return 'El avance debe estar entre 0 y 100.';

  if (!prev) {
    if (!manager && !has(u, SOURCE_PERMISSIONS[next.sourceType] ?? [])) return 'Tu cargo no tiene permiso para crear planes de acción desde este módulo.';
    if (!['Pendiente', 'En curso'].includes(next.status)) return 'Un plan nuevo parte como Pendiente o En curso.';
    return null;
  }

  if (next.status === 'Cerrado' && prev.status !== 'Cerrado') {
    if (!manager) return 'El cierre lo verifica quien administra planes de acción.';
    if (prev.status !== 'Por verificar') return 'Para cerrar, el plan debe estar "Por verificar" con su evidencia.';
    if (isPlanOwner(u, prev)) return 'El cierre lo verifica una persona distinta del responsable.';
    if (!next.closure?.evidence?.trim()) return 'Falta la evidencia de cierre.';
  }
  if (next.status === 'Por verificar' && prev.status !== 'Por verificar' && !next.closure?.evidence?.trim()) {
    return 'Para enviar a verificación indique la evidencia de cierre.';
  }
  if (next.status === 'Cancelado' && prev.status !== 'Cancelado' && !next.cancelReason?.trim()) return 'Indique el motivo de la cancelación.';
  if (manager) return null;

  if (!isPlanOwner(u, prev)) return 'Solo el responsable del plan o quien administra planes puede modificarlo.';
  if (['Cerrado', 'Cancelado'].includes(prev.status)) return 'El plan ya está cerrado.';
  if (!['Pendiente', 'En curso', 'Por verificar'].includes(next.status)) return 'El responsable no puede cerrar ni cancelar el plan.';
  for (const f of MANAGER_FIELDS) if (!same(prev[f], next[f])) return 'El responsable no puede cambiar plazo, responsable u origen del plan.';
  if (!same(prev.closure?.verifiedAt, next.closure?.verifiedAt) || !same(prev.closure?.verifiedBy, next.closure?.verifiedBy)) return 'El responsable no puede verificar su propio plan.';
  return null;
}

// -----------------------------------------------------------------------------
// Resumen del tratamiento de un riesgo a partir de sus planes
// -----------------------------------------------------------------------------

/** Plan de mitigación del riesgo calculado de sus planes (o el registrado, si no tiene planes). */
export function riskTreatment(risk: Risk, plans: ActionPlan[]): MitigationPlan {
  const linked = plans.filter(p => p.sourceType === 'Riesgo' && p.sourceId === risk.id && p.status !== 'Cancelado');
  if (!linked.length) return risk.mitigationPlan;
  const open = linked.filter(isOpenPlan);
  const main = open.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? linked[linked.length - 1];
  const progress = Math.round(linked.reduce((s, p) => s + (p.status === 'Cerrado' ? 100 : p.progressPct), 0) / linked.length);
  return {
    ...risk.mitigationPlan,
    title: main.title,
    owner: main.owner,
    dueDate: open.length ? open.reduce((m, p) => (p.dueDate > m ? p.dueDate : m), open[0].dueDate) : main.dueDate,
    progressPct: progress,
    status: !open.length ? 'Completado' : progress > 0 || open.some(p => p.status !== 'Pendiente') ? 'En Progreso' : 'No Iniciado',
    actions: linked.map(p => `${p.code} ${p.title}`),
  };
}

// -----------------------------------------------------------------------------
// Planes a partir de lo ya registrado (migración y datos de ejemplo)
// -----------------------------------------------------------------------------

export interface ExistingPlanData {
  risks: Risk[];
  audits: PeriodicAudit[];
  compliance: ComplianceRequirement[];
  normLabel: (normId: string) => string;
  assessment: SecurityAssessmentItem[];
  continuityTests: ContinuityTest[];
  /** Fecha y autor del registro de migración. */
  at: string;
  by: string;
}

const plusDays = (iso: string, days: number) => new Date(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Convierte en planes de acción los planes que hoy viven dentro de cada módulo: el plan de
 * mitigación de los riesgos, las acciones correctivas de los hallazgos de auditoría, los planes de
 * acción de cumplimiento y de la autoevaluación de seguridad, y las acciones de las pruebas de
 * continuidad con observaciones. Devuelve también qué requisitos e ítems quedaron migrados.
 */
export function plansFromExisting(d: ExistingPlanData): { plans: ActionPlan[]; migratedCompliance: string[]; migratedAssessment: string[] } {
  const plans: ActionPlan[] = [];
  const year = Number(d.at.slice(0, 4));
  const base = (p: Omit<ActionPlan, 'id' | 'code' | 'updates' | 'reschedules' | 'createdBy' | 'createdAt' | 'originalDueDate' | 'description'> & { description?: string }): ActionPlan => {
    const code = nextPlanCode(plans, year);
    return {
      description: '', ...p, id: `pa-${code.toLowerCase()}`, code, originalDueDate: p.dueDate,
      updates: [{ at: d.at, by: d.by, text: 'Plan incorporado desde el registro del módulo de origen.', progressPct: p.progressPct }],
      reschedules: [], createdBy: d.by, createdAt: d.at,
    };
  };
  const task = (text: string, done: boolean, i: number): ActionPlanTask => ({ id: `t${i + 1}`, text, done, ...(done ? { doneAt: d.at, doneBy: d.by } : {}) });
  const priorityOfLevel = (lvl: string): ActionPlanPriority => (lvl === 'Crítico' || lvl === 'Alto' ? 'Alta' : lvl === 'Medio' ? 'Media' : 'Baja');

  for (const r of d.risks) {
    const m = r.mitigationPlan;
    if (!m?.title?.trim()) continue;
    const status: ActionPlanStatus = m.status === 'Completado' ? 'Por verificar' : m.status === 'En Progreso' ? 'En curso' : 'Pendiente';
    plans.push(base({
      title: m.title.trim(), sourceType: 'Riesgo', sourceId: r.id, sourceLabel: `${r.code} ${r.title}`, process: r.process,
      owner: (m.owner || r.responsible || '').trim() || 'Sin asignar', priority: priorityOfLevel(r.residualLevel ?? r.inherentLevel),
      dueDate: m.dueDate || plusDays(d.at, 90), status, progressPct: Math.max(0, Math.min(100, Math.round(m.progressPct ?? 0))),
      tasks: (m.actions ?? []).filter(a => a?.trim()).map((a, i) => task(a.trim(), m.status === 'Completado', i)),
      ...(status === 'Por verificar' ? { closure: { submittedAt: d.at, submittedBy: d.by, evidence: 'Plan marcado como completado en la matriz de riesgos; falta verificar la evidencia.' } } : {}),
    }));
  }

  for (const a of d.audits) {
    for (const f of a.findings ?? []) {
      if (f.type === 'Conforme' || !f.correctiveAction?.trim()) continue;
      plans.push(findingPlan(a, f, base));
    }
  }

  const migratedCompliance: string[] = [];
  for (const r of d.compliance) {
    if (!r.actionPlan?.trim()) continue;
    migratedCompliance.push(r.id);
    plans.push(base({
      title: r.actionPlan.trim().slice(0, 250), sourceType: 'Cumplimiento', sourceId: r.id,
      sourceLabel: `${d.normLabel(r.chapter)} ${r.numeral} ${r.title}`.trim(), owner: r.owner?.trim() || 'Sin asignar',
      priority: r.status === 'No cumple' ? 'Alta' : 'Media', dueDate: r.dueDate || plusDays(d.at, 90), status: 'Pendiente', progressPct: 0, tasks: [],
    }));
  }

  const migratedAssessment: string[] = [];
  for (const i of d.assessment) {
    if (!i.actionPlan?.trim()) continue;
    migratedAssessment.push(i.id);
    plans.push(base({
      title: i.actionPlan.trim().slice(0, 250), sourceType: 'Autoevaluación de seguridad', sourceId: i.id,
      sourceLabel: `${i.code} ${i.requirement}`.slice(0, 250), owner: i.owner?.trim() || 'Sin asignar',
      priority: i.status === 'No cumple' ? 'Alta' : 'Media', dueDate: i.dueDate || plusDays(d.at, 90), status: 'Pendiente', progressPct: 0, tasks: [],
    }));
  }

  for (const t of d.continuityTests) {
    if (t.result === 'Exitosa' || !t.actions?.trim()) continue;
    plans.push(base({
      title: t.actions.trim().slice(0, 250), description: t.findings ?? '', sourceType: 'Continuidad', sourceId: t.id,
      sourceLabel: `Prueba ${t.type} del ${t.date}: ${t.scenario}`.slice(0, 250), owner: 'Sin asignar',
      priority: t.result === 'Fallida' ? 'Alta' : 'Media', dueDate: plusDays(t.date, 90), status: 'Pendiente', progressPct: 0, tasks: [],
    }));
  }

  return { plans, migratedCompliance, migratedAssessment };
}

function findingPlan(a: PeriodicAudit, f: AuditFinding, base: (p: Omit<ActionPlan, 'id' | 'code' | 'updates' | 'reschedules' | 'createdBy' | 'createdAt' | 'originalDueDate' | 'description'> & { description?: string }) => ActionPlan): ActionPlan {
  const status: ActionPlanStatus = f.status === 'Cerrado' ? 'Cerrado' : f.status === 'En Subsanación' ? 'En curso' : 'Pendiente';
  return base({
    title: f.correctiveAction.trim().slice(0, 250), description: f.description, sourceType: 'Auditoría', sourceId: `${a.id}::${f.id}`,
    sourceLabel: `${a.code} · ${f.type}: ${f.description}`.slice(0, 250), process: f.process, owner: f.responsible?.trim() || 'Sin asignar',
    priority: f.type === 'No Conformidad Mayor' ? 'Alta' : f.type === 'No Conformidad Menor' ? 'Media' : 'Baja',
    dueDate: f.deadline, status, progressPct: status === 'Cerrado' ? 100 : 0, tasks: [],
    ...(status === 'Cerrado' ? { closedAt: f.deadline, closure: { submittedAt: f.deadline, submittedBy: f.responsible, evidence: 'Hallazgo cerrado en la auditoría.', verifiedAt: f.deadline, verifiedBy: 'Auditoría' } } : {}),
  });
}

/** Clases del chip de estado (un plan vencido se marca como tal). */
export function planStatusClass(p: ActionPlan, overdue: boolean): string {
  if (overdue) return 'bg-rose-100 text-rose-800';
  switch (p.status) {
    case 'Pendiente': return 'bg-slate-100 text-slate-700';
    case 'En curso': return 'bg-sky-100 text-sky-800';
    case 'Por verificar': return 'bg-amber-100 text-amber-800';
    case 'Cerrado': return 'bg-emerald-100 text-emerald-800';
    default: return 'bg-slate-100 text-slate-400 line-through';
  }
}
