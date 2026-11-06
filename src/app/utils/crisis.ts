import {
  CRISIS_LEVELS, CrisisCommittee, CrisisEvent, CrisisScenario, CrisisStatus, EMPTY_COMMITTEE, COMMITTEE_ROLES,
} from '../models/crisis.model';
import { UserPermissions } from '../models/risk.model';
import { personKey } from './action-plans';
import { sameJson } from './json';

interface Actor { name: string; permissions: Partial<UserPermissions> }

export const canManageCrisis = (u: Actor) => !!u.permissions?.canManageContinuity;

/** Completa y valida el comité guardado. */
export function normalizeCommittee(raw: unknown): CrisisCommittee {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<CrisisCommittee>;
  const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');
  const members = Array.isArray(r.members) ? r.members : [];
  return {
    members: members
      .filter(m => m && typeof m.name === 'string' && m.name.trim())
      .slice(0, 40)
      .map(m => ({ name: str(m.name, 200).trim(), role: str(m.role, 80) || 'Miembro', phone: str(m.phone, 60), email: str(m.email, 200), alternate: str(m.alternate, 200) })),
    primaryRoom: str(r.primaryRoom), alternateRoom: str(r.alternateRoom), virtualRoom: str(r.virtualRoom),
    convocation: typeof r.convocation === 'string' ? r.convocation.slice(0, 4000) : EMPTY_COMMITTEE.convocation,
    approvedBy: str(r.approvedBy, 200), approvalDate: typeof r.approvalDate === 'string' && r.approvalDate ? r.approvalDate.slice(0, 10) : undefined,
  };
}

export const isCommitteeMember = (c: CrisisCommittee, name: string) =>
  !!name?.trim() && c.members.some(m => personKey(m.name) === personKey(name) || (!!m.alternate && personKey(m.alternate) === personKey(name)));

/** Puede declarar una crisis y registrar en ella: quien administra continuidad o integra el comité. */
export const canActOnCrisis = (u: Actor, c: CrisisCommittee) => canManageCrisis(u) || isCommitteeMember(c, u.name);

/** Problemas del comité para el control normativo (vacío = completo). */
export function committeeGaps(c: CrisisCommittee): string[] {
  const gaps: string[] = [];
  if (c.members.length < 3) gaps.push('menos de 3 integrantes');
  if (!c.members.some(m => m.role === COMMITTEE_ROLES[0])) gaps.push('sin presidente');
  if (!c.members.some(m => m.role === COMMITTEE_ROLES[2])) gaps.push('sin vocero');
  if (c.members.some(m => !m.phone.trim())) gaps.push('integrantes sin teléfono');
  if (!c.alternateRoom.trim() && !c.virtualRoom.trim()) gaps.push('sin sala alternativa ni virtual');
  return gaps;
}

export const levelName = (l: number) => CRISIS_LEVELS.find(x => x.level === l)?.name ?? `Nivel ${l}`;
export const scenarioScore = (s: Pick<CrisisScenario, 'likelihood' | 'impact'>) => s.likelihood * s.impact;
export const scenarioLevel = (score: number) => (score >= 12 ? 'Crítico' : score >= 8 ? 'Alto' : score >= 4 ? 'Medio' : 'Bajo');

/** Siguiente código de crisis del año: CR-2026-001. */
export function nextCrisisCode(list: Pick<CrisisEvent, 'code'>[], year: number): string {
  const prefix = `CR-${year}-`;
  const max = list.filter(e => e.code.startsWith(prefix)).reduce((m, e) => Math.max(m, Number(e.code.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

export function nextScenarioCode(list: Pick<CrisisScenario, 'code'>[]): string {
  const max = list.reduce((m, s) => Math.max(m, Number(s.code.replace(/\D/g, '')) || 0), 0);
  return `ESC-${String(max + 1).padStart(2, '0')}`;
}

export const isOpen = (e: Pick<CrisisEvent, 'status'>) => e.status === 'Activa' || e.status === 'Estabilizada';

/** Horas transcurridas desde la declaración (hasta el cierre o ahora). */
export function elapsedHours(e: CrisisEvent, now = new Date()): number {
  if (!e.declaredAt) return 0;
  const end = e.closedAt ? new Date(e.closedAt) : now;
  return Math.max(0, (end.getTime() - new Date(e.declaredAt).getTime()) / 3_600_000);
}

const ALLOWED: Record<CrisisStatus, CrisisStatus[]> = {
  Programada: ['Programada', 'Activa', 'Cancelada'],
  Activa: ['Activa', 'Estabilizada', 'Cerrada'],
  Estabilizada: ['Estabilizada', 'Activa', 'Cerrada'],
  Cerrada: ['Cerrada'],
  Cancelada: ['Cancelada'],
};

/** Lista que solo crece: lo anterior intacto y lo nuevo firmado por quien guarda. */
function appendOnly<T extends { by: string }>(prev: T[], next: T[], user: string, what: string): string | null {
  if (next.length < prev.length || !sameJson(prev, next.slice(0, prev.length))) return `No se pueden modificar ni borrar ${what} ya registradas.`;
  if (next.slice(prev.length).some(x => personKey(x.by) !== personKey(user))) return `Las ${what} nuevas deben quedar a tu nombre.`;
  return null;
}

/**
 * Cambios permitidos al guardar una crisis (también los aplica el servidor):
 * - Declarar, programar y registrar: quien administra continuidad o integra el Comité de Crisis.
 * - Bitácora y comunicaciones: solo se agregan, a nombre de quien guarda.
 * - Estados: Programada → Activa/Cancelada; Activa ⇄ Estabilizada → Cerrada (con resumen). Lo cerrado
 *   solo admite completar las lecciones aprendidas y el vínculo con la prueba de continuidad (administración).
 */
export function checkCrisisChange(prev: CrisisEvent | null, next: CrisisEvent, u: Actor, committee: CrisisCommittee): string | null {
  if (!next.title?.trim()) return 'La crisis necesita un título.';
  if (!canActOnCrisis(u, committee)) return 'Solo el Comité de Crisis o quien administra continuidad puede registrar crisis.';
  if (![1, 2, 3].includes(next.level)) return 'Nivel de crisis no válido.';
  if (!prev) {
    if (!['Programada', 'Activa'].includes(next.status)) return 'Una crisis nueva se declara activa o se programa como simulacro.';
    if (next.status === 'Programada' && (next.mode !== 'Simulacro' || !next.plannedDate)) return 'Solo los simulacros se programan, con fecha.';
    if (next.status === 'Activa' && !next.declaredAt) return 'Falta la hora de declaración.';
    return appendOnly([], next.log ?? [], u.name, 'entradas de la bitácora') ?? appendOnly([], next.communications ?? [], u.name, 'comunicaciones');
  }
  if (prev.mode !== next.mode && prev.status !== 'Programada') return 'No se puede cambiar entre crisis real y simulacro.';
  if (!ALLOWED[prev.status].includes(next.status)) return `No se puede pasar de "${prev.status}" a "${next.status}".`;
  if (prev.status === 'Cerrada' || prev.status === 'Cancelada') {
    const { lessons: l1, testId: t1, ...a } = prev;
    const { lessons: l2, testId: t2, ...b } = next;
    if (!sameJson(a, b)) return 'Una crisis cerrada no se modifica (solo sus lecciones aprendidas).';
    if ((l1 ?? '') !== (l2 ?? '') || (t1 ?? '') !== (t2 ?? '')) return canManageCrisis(u) ? null : 'Las lecciones de una crisis cerrada las registra quien administra continuidad.';
    return null;
  }
  if (next.status === 'Cerrada' && (!next.closingSummary?.trim() || !next.closedAt)) return 'Para cerrar indica el resumen del cierre.';
  if (prev.status !== 'Programada' && prev.declaredAt !== next.declaredAt) return 'La hora de declaración no se modifica.';
  return appendOnly(prev.log ?? [], next.log ?? [], u.name, 'entradas de la bitácora')
    ?? appendOnly(prev.communications ?? [], next.communications ?? [], u.name, 'comunicaciones');
}

/** Último ejercicio (real o simulacro) de cada escenario y si está dentro de los últimos 12 meses. */
export function scenarioCoverage(scenarios: CrisisScenario[], events: CrisisEvent[], today: string) {
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4, 10)}`;
  return scenarios.filter(s => s.active).map(s => {
    const done = events.filter(e => e.scenarioId === s.id && e.declaredAt && e.status !== 'Cancelada')
      .map(e => e.declaredAt!.slice(0, 10)).sort();
    const last = done[done.length - 1];
    const planned = events.filter(e => e.scenarioId === s.id && e.status === 'Programada' && e.plannedDate && e.plannedDate >= today)
      .map(e => e.plannedDate!).sort()[0];
    return { scenario: s, last, planned, current: !!last && last >= yearAgo };
  });
}

/** Tareas iniciales tomadas del escenario. */
export function tasksFromScenario(s: CrisisScenario | undefined, newId: () => string) {
  return (s?.initialActions ?? []).filter(a => a.trim()).map(text => ({ id: newId(), text: text.trim(), owner: '', done: false }));
}
