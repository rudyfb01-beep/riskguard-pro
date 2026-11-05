import { sameJson } from './json';
import {
  APPROVAL_KINDS, ApprovalKind, ApprovalMatrix, ApprovalRequest, ApprovalStep, DEFAULT_APPROVAL_MATRIX,
} from '../models/approval.model';
import { UserPermissions } from '../models/risk.model';
import { personKey } from './action-plans';

interface Actor { name: string; roleId?: string; permissions: Partial<UserPermissions> }
interface RoleRef { id: string; title: string }
interface UserRef { name: string; email?: string; roleId?: string; active?: boolean }

/** Siguiente código SA-<año>-<nnn>. */
export function nextApprovalCode(list: Pick<ApprovalRequest, 'code'>[], year = new Date().getFullYear()): string {
  const prefix = `SA-${year}-`;
  const max = list.filter(r => r.code.startsWith(prefix)).reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** Completa una matriz guardada (o vacía) con los valores por defecto. */
export function normalizeMatrix(raw: unknown): ApprovalMatrix {
  const m = (raw && typeof raw === 'object' ? raw : {}) as Partial<ApprovalMatrix>;
  const steps = { ...DEFAULT_APPROVAL_MATRIX.steps };
  for (const k of Object.keys(steps) as ApprovalKind[]) {
    const v = m.steps?.[k];
    if (Array.isArray(v)) steps[k] = v.filter(x => typeof x === 'string' && x).slice(0, 5);
  }
  return {
    steps,
    outOfToleranceRoleId: typeof m.outOfToleranceRoleId === 'string' ? m.outOfToleranceRoleId : DEFAULT_APPROVAL_MATRIX.outOfToleranceRoleId,
  };
}

/** Cargos que deben aprobar, en orden (la aceptación fuera de tolerancia suma un nivel). */
export function approvalRoleIds(kind: ApprovalKind, matrix: ApprovalMatrix, appetite?: string): string[] {
  const ids = [...(matrix.steps[kind] ?? [])];
  if (kind === 'aceptacion-riesgo' && appetite === 'Fuera de tolerancia' && matrix.outOfToleranceRoleId && !ids.includes(matrix.outOfToleranceRoleId)) {
    ids.push(matrix.outOfToleranceRoleId);
  }
  return ids;
}

export function buildSteps(roleIds: string[], roles: RoleRef[]): ApprovalStep[] {
  return roleIds.map(id => ({ roleId: id, roleTitle: roles.find(r => r.id === id)?.title ?? id }));
}

export const isRequester = (u: Pick<Actor, 'name'>, r: Pick<ApprovalRequest, 'requestedBy'>) =>
  !!u.name?.trim() && personKey(u.name) === personKey(r.requestedBy);

/** Permisos con los que se puede solicitar cada tipo (la reprogramación también la pide el responsable del plan). */
export const REQUEST_PERMISSIONS: Record<ApprovalKind, (keyof UserPermissions)[]> = {
  'aceptacion-riesgo': ['canEditRisks'],
  'aceptacion-vulnerabilidad': ['canManageInfoSecurity'],
  'plan-continuidad': ['canManageContinuity'],
  'informe-auditoria': ['canExecuteAudits'],
  'reprogramacion-plan': ['canManageActionPlans'],
};

export function canRequest(u: Actor, kind: ApprovalKind, targetOwner?: string): boolean {
  if (REQUEST_PERMISSIONS[kind].some(p => !!u.permissions?.[p])) return true;
  return kind === 'reprogramacion-plan' && !!targetOwner && personKey(targetOwner) === personKey(u.name);
}

/** La persona puede resolver el nivel vigente: tiene ese cargo y no es quien solicitó. */
export function canDecide(u: Actor, r: ApprovalRequest): boolean {
  if (r.status !== 'Pendiente') return false;
  const step = r.steps[r.currentStep];
  return !!step && !!u.roleId && u.roleId === step.roleId && !isRequester(u, r);
}

/** Personas que pueden resolver el nivel vigente (para avisos y para advertir si no hay nadie). */
export function eligibleApprovers<T extends UserRef>(r: Pick<ApprovalRequest, 'steps' | 'currentStep' | 'requestedBy'>, users: T[], step = r.currentStep): T[] {
  const roleId = r.steps[step]?.roleId;
  if (!roleId) return [];
  return users.filter(u => u.active !== false && u.roleId === roleId && personKey(u.name) !== personKey(r.requestedBy));
}

/** Registra la decisión del nivel vigente y avanza (o cierra) la solicitud. */
export function decide(r: ApprovalRequest, u: Actor, decision: 'Aprobada' | 'Rechazada', comment: string, at: string): ApprovalRequest {
  const steps = r.steps.map((s, i) => (i === r.currentStep ? { ...s, decision, decidedBy: u.name, decidedAt: at, comment: comment.trim() || undefined } : s));
  if (decision === 'Rechazada') return { ...r, steps, status: 'Rechazada', closedAt: at };
  const last = r.currentStep >= r.steps.length - 1;
  return last ? { ...r, steps, status: 'Aprobada', closedAt: at } : { ...r, steps, currentStep: r.currentStep + 1 };
}

const FIXED: (keyof ApprovalRequest)[] = ['code', 'kind', 'targetEntity', 'targetId', 'targetLabel', 'justification', 'payload', 'requestedBy', 'requestedAt'];
const same = sameJson;

export interface ApprovalContext {
  matrix: ApprovalMatrix;
  /** Responsable del registro de origen (para que el dueño de un plan pida reprogramarlo). */
  targetOwner?: string;
  /** Puede anular solicitudes de otros (administrador). */
  isAdmin?: boolean;
}

/**
 * Reglas de una solicitud (las aplica también el servidor):
 * - Crear: quien solicita es el usuario, con permiso para ese tipo; niveles según la matriz vigente.
 * - Decidir: solo el nivel vigente, por alguien con ese cargo que no sea quien solicitó.
 * - Anular: quien solicitó (o un administrador) mientras está pendiente.
 */
export function checkApprovalChange(prev: ApprovalRequest | null, next: ApprovalRequest, u: Actor, ctx: ApprovalContext): string | null {
  if (!APPROVAL_KINDS[next.kind]) return 'Tipo de solicitud desconocido.';
  if (next.targetEntity !== APPROVAL_KINDS[next.kind].entity) return 'La solicitud no corresponde al tipo de registro.';
  if (!prev) {
    if (!canRequest(u, next.kind, ctx.targetOwner)) return 'Tu cargo no puede solicitar este tipo de aprobación.';
    if (!isRequester(u, next)) return 'La solicitud debe quedar a tu nombre.';
    if (!next.justification?.trim()) return 'Indique la justificación.';
    if (next.status !== 'Pendiente' || next.currentStep !== 0) return 'Una solicitud nueva parte pendiente en el primer nivel.';
    const expected = approvalRoleIds(next.kind, ctx.matrix, next.payload?.appetite);
    if (!expected.length) return 'No hay cargos aprobadores configurados para este tipo de solicitud.';
    if (!same(next.steps.map(s => s.roleId), expected)) return 'Los niveles de aprobación no coinciden con la matriz vigente.';
    if (next.steps.some(s => s.decision || s.decidedBy)) return 'Una solicitud nueva no puede traer decisiones.';
    return null;
  }
  for (const k of FIXED) if (!same(prev[k], next[k])) return 'Los datos de la solicitud no se pueden cambiar; anúlela y cree otra.';
  if (!same(prev.steps.map(s => s.roleId), next.steps.map(s => s.roleId))) return 'Los niveles de aprobación no se pueden cambiar.';
  if (prev.status !== 'Pendiente') return 'La solicitud ya está cerrada.';

  if (next.status === 'Anulada') {
    if (!isRequester(u, prev) && !ctx.isAdmin) return 'Solo quien solicitó puede anular la solicitud.';
    if (!same(prev.steps, next.steps) || next.currentStep !== prev.currentStep) return 'Al anular no se registran decisiones.';
    return null;
  }

  // Decisión del nivel vigente.
  if (!canDecide(u, prev)) {
    return isRequester(u, prev) ? 'No puedes aprobar tu propia solicitud.' : `Esta solicitud la resuelve el cargo ${prev.steps[prev.currentStep]?.roleTitle ?? ''}.`;
  }
  const step = next.steps[prev.currentStep];
  if (!step?.decision || personKey(step.decidedBy ?? '') !== personKey(u.name)) return 'La decisión debe quedar a tu nombre.';
  if (step.decision === 'Rechazada' && !step.comment?.trim()) return 'Indique el motivo del rechazo.';
  const changedOther = next.steps.some((s, i) => i !== prev.currentStep && !same(s, prev.steps[i]));
  if (changedOther) return 'Solo se puede resolver el nivel vigente.';
  const expected = decide(prev, u, step.decision, step.comment ?? '', step.decidedAt ?? '');
  if (next.status !== expected.status || next.currentStep !== expected.currentStep) return 'El estado de la solicitud no es consistente con la decisión.';
  return null;
}

/** Fecha YYYY-MM-DD de un ISO. */
const day = (iso: string) => iso.slice(0, 10);

/**
 * Cambio que produce una solicitud aprobada sobre su registro de origen (función pura,
 * la usan el cliente y el servidor). Devuelve null si el registro no admite el cambio.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyApprovalEffect(r: ApprovalRequest, target: any): any {
  if (r.status !== 'Aprobada' || !target) return null;
  const approvers = r.steps.map(s => s.decidedBy).filter(Boolean).join(' / ');
  const at = day(r.closedAt ?? new Date().toISOString());
  switch (r.kind) {
    case 'aceptacion-riesgo':
      return {
        ...target,
        acceptance: {
          justification: r.justification, approvedBy: approvers, approvedDate: at, reviewDate: r.payload.reviewDate ?? '',
          appetite: r.payload.appetite, requestCode: r.code,
        },
      };
    case 'aceptacion-vulnerabilidad':
      return {
        ...target, status: 'Riesgo aceptado',
        acceptance: { justification: r.justification, approvedBy: approvers, approvedDate: at, reviewDate: r.payload.reviewDate ?? '' },
      };
    case 'plan-continuidad':
      return {
        ...target, status: 'Vigente', approvedBy: approvers, approvalDate: at,
        version: r.payload.version || target.version, nextReviewDate: r.payload.nextReviewDate || target.nextReviewDate,
      };
    case 'informe-auditoria':
      return { ...target, status: 'Aprobada' };
    case 'reprogramacion-plan': {
      const to = r.payload.newDueDate;
      if (!to || to === target.dueDate) return null;
      return {
        ...target, dueDate: to,
        reschedules: [...(target.reschedules ?? []), {
          at: r.closedAt ?? new Date().toISOString(), by: r.requestedBy, from: target.dueDate, to,
          reason: `${r.justification} (aprobada en ${r.code} por ${approvers})`,
        }],
      };
    }
  }
}

/** Resumen de una línea del cambio solicitado. */
export function approvalSummary(req: ApprovalRequest): string {
  const r = { ...req, targetLabel: req.targetLabel.replace(/[.\s]+$/, '') };
  switch (r.kind) {
    case 'aceptacion-riesgo': return `Aceptar ${r.targetLabel} (${r.payload.appetite ?? 'sobre el apetito'}${r.payload.residualScore ? `, residual ${r.payload.residualScore}` : ''}) hasta ${r.payload.reviewDate ?? '—'}`;
    case 'aceptacion-vulnerabilidad': return `Aceptar ${r.targetLabel} hasta ${r.payload.reviewDate ?? '—'}`;
    case 'plan-continuidad': return `Aprobar ${r.targetLabel}${r.payload.version ? ` versión ${r.payload.version}` : ''}${r.payload.nextReviewDate ? `, próxima revisión ${r.payload.nextReviewDate}` : ''}`;
    case 'informe-auditoria': return `Aprobar el informe de ${r.targetLabel}`;
    case 'reprogramacion-plan': return `Reprogramar ${r.targetLabel}: ${r.payload.currentDueDate ?? '—'} → ${r.payload.newDueDate ?? '—'}`;
  }
}

/** Fecha de la última acción (para recordatorios). */
export function lastActivity(r: ApprovalRequest): string {
  return r.steps.reduce((m, s) => (s.decidedAt && s.decidedAt > m ? s.decidedAt : m), r.requestedAt);
}

/**
 * El registro admite la solicitud (estado de origen). `appetite` es el estado actual del
 * riesgo frente al apetito (solo para aceptaciones de riesgo).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function targetPrecondition(kind: ApprovalKind, target: any, payload: { newDueDate?: string; reviewDate?: string }, appetite?: string): string | null {
  if (!target) return 'El registro de origen no existe.';
  switch (kind) {
    case 'aceptacion-riesgo':
      if (appetite === 'Dentro del apetito') return 'El riesgo residual está dentro del apetito: no requiere aceptación.';
      if (!payload.reviewDate) return 'Indique hasta cuándo rige la aceptación.';
      return null;
    case 'aceptacion-vulnerabilidad':
      if (target.status === 'Cerrada' || target.status === 'Mitigada') return 'La vulnerabilidad ya está cerrada o mitigada.';
      if (!payload.reviewDate) return 'Indique hasta cuándo rige la aceptación.';
      return null;
    case 'plan-continuidad':
      return null;
    case 'informe-auditoria':
      return target.status === 'Finalizada' ? null : 'Solo se envía a aprobación una auditoría Finalizada.';
    case 'reprogramacion-plan':
      if (!['Pendiente', 'En curso'].includes(target.status)) return 'Solo se reprograma un plan abierto.';
      if (!payload.newDueDate || payload.newDueDate === target.dueDate) return 'Indique un plazo distinto al actual.';
      return null;
  }
}
