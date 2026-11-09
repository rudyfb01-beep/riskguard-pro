// =============================================================================
// GESTIÓN DE CRISIS (RAN 20-9 I.3 · RAN 20-10 §2 · ISO 22301 / 22361)
// Escenarios de desastre y crisis con su respuesta, Comité de Crisis, crisis
// declaradas (reales o simulacros) con su bitácora de decisiones, tareas y
// comunicaciones, y el programa de simulacros.
// =============================================================================

/** Categorías de escenario: las 5 mínimas de la RAN 20-9 y otras habituales. */
export const SCENARIO_CATEGORIES = [
  'Falla total o parcial de sistemas tecnológicos',
  'Ataque malicioso a la ciberseguridad',
  'Ausencia de personal crítico',
  'Imposibilidad de acceder a instalaciones físicas',
  'Falla de servicios críticos de proveedores',
  'Desastre natural',
  'Crisis reputacional o de liquidez',
  'Otro',
] as const;
export type ScenarioCategory = typeof SCENARIO_CATEGORIES[number];

/** Escenario de desastre o crisis: amenaza probable y su respuesta prevista. */
export interface CrisisScenario {
  id: string;
  code: string;                 // ESC-01
  name: string;
  category: ScenarioCategory;
  description: string;
  likelihood: number;           // 1 a 4
  impact: number;               // 1 a 4
  /** Cuándo se activa: umbrales o señales concretas. */
  activationCriteria: string;
  /** Primeras acciones (se copian como tareas al declarar la crisis). */
  initialActions: string[];
  /** Mensajes clave y públicos a informar. */
  communications: string;
  affectedProcessIds: string[]; // procesos del BIA
  planIds: string[];            // planes de continuidad / DRP / crisis que se activan
  owner: string;
  lastReviewDate: string;       // YYYY-MM-DD
  active: boolean;
}

export type CrisisMode = 'Real' | 'Simulacro';
export type CrisisLevel = 1 | 2 | 3;
export const CRISIS_LEVELS: { level: CrisisLevel; name: string; hint: string }[] = [
  { level: 1, name: 'Alerta', hint: 'Evento contenido: el comité se informa y monitorea.' },
  { level: 2, name: 'Crisis', hint: 'Afecta procesos críticos: se activan los planes y se convoca al comité.' },
  { level: 3, name: 'Crisis mayor', hint: 'Amenaza la continuidad o la reputación: dirige el comité en sesión permanente.' },
];

/** Programada (simulacro) → Activa → Estabilizada → Cerrada. Un simulacro programado puede cancelarse. */
export type CrisisStatus = 'Programada' | 'Activa' | 'Estabilizada' | 'Cerrada' | 'Cancelada';

export type CrisisLogKind = 'Situación' | 'Decisión' | 'Acción' | 'Comunicación' | 'Estado';
export const CRISIS_LOG_KINDS: CrisisLogKind[] = ['Situación', 'Decisión', 'Acción'];

/** Entrada de la bitácora de la crisis (solo se agregan; no se editan ni borran). */
export interface CrisisLogEntry {
  id: string;
  at: string;       // ISO
  by: string;
  kind: CrisisLogKind;
  text: string;
}

export interface CrisisTask {
  id: string;
  text: string;
  owner: string;
  done: boolean;
  doneAt?: string;
  doneBy?: string;
}

export const CRISIS_AUDIENCES = [
  'Comité / Gerencia', 'Consejo de Administración', 'Colaboradores', 'Socios', 'Regulador (CMF)', 'ANCI / CSIRT', 'Proveedores', 'Medios de comunicación',
] as const;
export type CrisisAudience = typeof CRISIS_AUDIENCES[number];

/** Comunicación emitida durante la crisis (registro, solo se agregan). */
export interface CrisisCommunication {
  id: string;
  at: string;       // ISO
  by: string;
  audience: CrisisAudience;
  channel: string;  // correo, llamada, comunicado, redes, portal CMF…
  summary: string;
}

export interface CrisisEvent {
  id: string;
  code: string;                 // CR-2026-001
  title: string;
  mode: CrisisMode;
  level: CrisisLevel;
  status: CrisisStatus;
  scenarioId?: string;
  flawId?: string;              // incidente vinculado (reporte CMF/ANCI)
  /** Simulacro programado: fecha prevista. */
  plannedDate?: string;         // YYYY-MM-DD
  declaredAt?: string;          // ISO (activación)
  declaredBy?: string;
  stabilizedAt?: string;
  closedAt?: string;
  closedBy?: string;
  affectedProcessIds: string[];
  activatedPlanIds: string[];
  log: CrisisLogEntry[];
  tasks: CrisisTask[];
  communications: CrisisCommunication[];
  /** Resumen del cierre y lecciones aprendidas (revisión posterior). */
  closingSummary?: string;
  lessons?: string;
  /** Simulacro: se registró como prueba de continuidad. */
  testId?: string;
  createdBy: string;
  createdAt: string;
}

export const COMMITTEE_ROLES = [
  'Presidente del comité', 'Coordinador de crisis', 'Vocero / comunicaciones', 'Tecnología y seguridad', 'Operaciones', 'Riesgo operacional',
  'Legal y cumplimiento', 'Personas', 'Miembro',
] as const;
export type CommitteeRole = typeof COMMITTEE_ROLES[number];

export interface CommitteeMember {
  name: string;
  role: CommitteeRole | string;
  phone: string;
  email: string;
  /** Suplente si no responde. */
  alternate: string;
}

/** Comité de Crisis: integrantes, salas y protocolo de convocatoria. */
export interface CrisisCommittee {
  members: CommitteeMember[];
  primaryRoom: string;
  alternateRoom: string;
  virtualRoom: string;
  convocation: string;
  approvedBy: string;
  approvalDate?: string;
}

export const EMPTY_COMMITTEE: CrisisCommittee = {
  members: [], primaryRoom: '', alternateRoom: '', virtualRoom: '',
  convocation: 'Quien detecta el evento avisa al Coordinador de crisis; este evalúa el nivel y, desde nivel 2, convoca al comité por teléfono y correo. Si no contesta, se llama al suplente.',
  approvedBy: '',
};
