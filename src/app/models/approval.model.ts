// =============================================================================
// FLUJOS DE APROBACIÓN
// Solicitudes que un área envía y que uno o más cargos aprueban en orden (matriz de
// aprobación configurable). Al aprobarse el último nivel, el cambio se aplica al
// registro de origen: aceptación de un riesgo sobre el apetito, aceptación de una
// vulnerabilidad, aprobación de un plan de continuidad o de un informe de auditoría,
// y la reprogramación de un plan de acción pedida por su responsable.
// =============================================================================

export type ApprovalKind =
  | 'aceptacion-riesgo'
  | 'aceptacion-vulnerabilidad'
  | 'plan-continuidad'
  | 'informe-auditoria'
  | 'reprogramacion-plan';

/** Entidad (nombre de la API) sobre la que actúa cada tipo de solicitud. */
export type ApprovalTargetEntity = 'risks' | 'vulnerabilities' | 'plans' | 'audits' | 'action-plans';

export interface ApprovalKindInfo {
  label: string;
  short: string;
  entity: ApprovalTargetEntity;
  tab: string;          // pestaña de la aplicación del registro de origen
  icon: string;
  /** Qué ocurre al aprobarse (texto para la interfaz y los correos). */
  effect: string;
}

export const APPROVAL_KINDS: Record<ApprovalKind, ApprovalKindInfo> = {
  'aceptacion-riesgo': {
    label: 'Aceptación de riesgo sobre el apetito', short: 'Aceptación de riesgo', entity: 'risks', tab: 'matriz-riesgos', icon: 'gpp_maybe',
    effect: 'El riesgo queda aceptado formalmente hasta la fecha de revisión.',
  },
  'aceptacion-vulnerabilidad': {
    label: 'Aceptación de vulnerabilidad', short: 'Aceptación de vulnerabilidad', entity: 'vulnerabilities', tab: 'seguridad-informacion', icon: 'shield',
    effect: 'La vulnerabilidad pasa a "Riesgo aceptado" con quien aprobó y la fecha de revisión.',
  },
  'plan-continuidad': {
    label: 'Aprobación de plan de continuidad', short: 'Plan de continuidad', entity: 'plans', tab: 'continuidad', icon: 'restore',
    effect: 'El plan queda Vigente con la versión, quien aprobó, la fecha y la próxima revisión.',
  },
  'informe-auditoria': {
    label: 'Aprobación de informe de auditoría', short: 'Informe de auditoría', entity: 'audits', tab: 'auditorias', icon: 'fact_check',
    effect: 'La auditoría pasa a estado Aprobada.',
  },
  'reprogramacion-plan': {
    label: 'Reprogramación de plan de acción', short: 'Reprogramación de plan', entity: 'action-plans', tab: 'planes-accion', icon: 'event_repeat',
    effect: 'El plan cambia al nuevo plazo y la reprogramación queda registrada.',
  },
};

export const APPROVAL_KIND_LIST = Object.keys(APPROVAL_KINDS) as ApprovalKind[];

export type ApprovalStatus = 'Pendiente' | 'Aprobada' | 'Rechazada' | 'Anulada';

/** Un nivel de aprobación: lo resuelve cualquier persona con ese cargo (que no sea quien solicita). */
export interface ApprovalStep {
  roleId: string;
  roleTitle: string;
  decision?: 'Aprobada' | 'Rechazada';
  decidedBy?: string;
  decidedAt?: string;  // ISO
  comment?: string;
}

/** Datos propios de cada tipo de solicitud. */
export interface ApprovalPayload {
  reviewDate?: string;       // aceptaciones: hasta cuándo rige (YYYY-MM-DD)
  appetite?: string;         // aceptación de riesgo: estado frente al apetito al solicitar
  residualScore?: number;
  version?: string;          // plan de continuidad
  nextReviewDate?: string;   // plan de continuidad
  newDueDate?: string;       // reprogramación
  currentDueDate?: string;   // reprogramación
}

export interface ApprovalRequest {
  id: string;
  code: string;               // SA-2026-001
  kind: ApprovalKind;
  targetEntity: ApprovalTargetEntity;
  targetId: string;
  targetLabel: string;        // "R-004 Fraude en canales digitales"
  justification: string;
  payload: ApprovalPayload;
  requestedBy: string;
  requestedAt: string;        // ISO
  steps: ApprovalStep[];
  currentStep: number;
  status: ApprovalStatus;
  closedAt?: string;          // ISO
  cancelReason?: string;
}

/** Cargos que aprueban cada tipo, en orden. */
export interface ApprovalMatrix {
  steps: Record<ApprovalKind, string[]>;
  /** Nivel adicional cuando el riesgo queda fuera de la tolerancia (vacío: ninguno). */
  outOfToleranceRoleId: string;
}

export const DEFAULT_APPROVAL_MATRIX: ApprovalMatrix = {
  steps: {
    'aceptacion-riesgo': ['role-gerencia-general'],
    'aceptacion-vulnerabilidad': ['role-riesgo-op', 'role-gerencia-general'],
    'plan-continuidad': ['role-gerencia-general'],
    'informe-auditoria': ['role-junta-vigilancia'],
    'reprogramacion-plan': ['role-riesgo-op'],
  },
  outOfToleranceRoleId: 'role-comite-riesgos',
};

/** Aceptación formal de un riesgo residual sobre el apetito. */
export interface RiskAcceptance {
  justification: string;
  approvedBy: string;
  approvedDate: string;   // YYYY-MM-DD
  reviewDate: string;     // YYYY-MM-DD
  appetite?: string;
  requestCode?: string;
}
