// =============================================================================
// PLANES DE ACCIÓN
// Registro único de los planes que nacen de cualquier brecha del sistema (riesgos,
// controles deficientes, hallazgos de auditoría, requisitos normativos, autoevaluación
// de seguridad, pruebas de continuidad, proveedores e incidentes), con responsable,
// plazo, tareas, avances, reprogramaciones y cierre verificado por un tercero.
// =============================================================================

export type ActionPlanSource =
  | 'Riesgo'
  | 'Control'
  | 'Auditoría'
  | 'Cumplimiento'
  | 'Autoevaluación de seguridad'
  | 'Continuidad'
  | 'Proveedor'
  | 'Incidente'
  | 'Otro';

export const ACTION_PLAN_SOURCES: ActionPlanSource[] = [
  'Riesgo', 'Control', 'Auditoría', 'Cumplimiento', 'Autoevaluación de seguridad', 'Continuidad', 'Proveedor', 'Incidente', 'Otro',
];

/**
 * Pendiente → En curso → Por verificar → Cerrado (lo cierra quien verifica, no el responsable).
 * "Cancelado" deja el registro con su motivo.
 */
export type ActionPlanStatus = 'Pendiente' | 'En curso' | 'Por verificar' | 'Cerrado' | 'Cancelado';
export const ACTION_PLAN_STATUSES: ActionPlanStatus[] = ['Pendiente', 'En curso', 'Por verificar', 'Cerrado', 'Cancelado'];

export type ActionPlanPriority = 'Alta' | 'Media' | 'Baja';
export const ACTION_PLAN_PRIORITIES: ActionPlanPriority[] = ['Alta', 'Media', 'Baja'];

export interface ActionPlanTask {
  id: string;
  text: string;
  done: boolean;
  doneAt?: string;     // ISO
  doneBy?: string;
}

/** Registro de avance (seguimiento). */
export interface ActionPlanUpdate {
  at: string;          // ISO
  by: string;
  text: string;
  progressPct: number;
}

/** Cambio de plazo con su justificación. */
export interface ActionPlanReschedule {
  at: string;          // ISO
  by: string;
  from: string;        // YYYY-MM-DD
  to: string;          // YYYY-MM-DD
  reason: string;
}

/** Envío a verificación y su resultado. */
export interface ActionPlanClosure {
  submittedAt: string; // ISO
  submittedBy: string;
  evidence: string;
  verifiedAt?: string; // ISO
  verifiedBy?: string;
  note?: string;       // observación de quien verifica (también al rechazar)
}

export interface ActionPlan {
  id: string;
  code: string;                 // PA-2026-001
  title: string;
  description: string;
  sourceType: ActionPlanSource;
  /** Id del registro de origen (para auditorías: "<id auditoría>::<id hallazgo>"). */
  sourceId?: string;
  sourceLabel: string;          // texto legible del origen ("RAN 20-7 III.1.f", "R-004 …")
  process?: string;
  owner: string;                // nombre del responsable (usuario)
  priority: ActionPlanPriority;
  startDate?: string;           // YYYY-MM-DD
  dueDate: string;              // YYYY-MM-DD (plazo vigente)
  originalDueDate: string;      // YYYY-MM-DD (plazo comprometido al crear)
  status: ActionPlanStatus;
  progressPct: number;          // 0–100
  tasks: ActionPlanTask[];
  updates: ActionPlanUpdate[];
  reschedules: ActionPlanReschedule[];
  closure?: ActionPlanClosure;
  /** Rechazos de verificación anteriores (el plan vuelve a "En curso"). */
  rejections?: ActionPlanClosure[];
  cancelReason?: string;
  createdBy: string;
  createdAt: string;            // ISO
  closedAt?: string;            // YYYY-MM-DD
}

/** Datos para crear un plan desde un módulo de origen. */
export interface ActionPlanDraft {
  title: string;
  description?: string;
  sourceType: ActionPlanSource;
  sourceId?: string;
  sourceLabel: string;
  process?: string;
  owner: string;
  priority?: ActionPlanPriority;
  dueDate: string;
  tasks?: string[];
}
