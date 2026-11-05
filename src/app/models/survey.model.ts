// =============================================================================
// AUTOEVALUACIONES (ENCUESTAS A DUEÑOS DE PROCESOS)
// Campañas que envían un cuestionario a cada responsable: autoevaluación de riesgos y
// controles (RCSA), actualización del análisis de impacto (BIA), cumplimiento de una norma o
// un cuestionario propio. Las respuestas se revisan, se aplican a la matriz, al BIA o a la
// evaluación de cumplimiento y las brechas se convierten en planes de acción.
// =============================================================================

export type SurveyKind = 'RCSA' | 'BIA' | 'Cumplimiento' | 'Personalizada';
export const SURVEY_KINDS: { id: SurveyKind; label: string; hint: string }[] = [
  { id: 'RCSA', label: 'Riesgos y controles (RCSA)', hint: 'Cada dueño de proceso evalúa la probabilidad e impacto de sus riesgos y si sus controles se ejecutaron.' },
  { id: 'BIA', label: 'Análisis de impacto (BIA)', hint: 'Cada dueño confirma o propone MTPD, RTO, RPO, dependencias y personal mínimo de su proceso.' },
  { id: 'Cumplimiento', label: 'Cumplimiento de una norma', hint: 'Un responsable declara el estado y la evidencia de los requisitos de una norma.' },
  { id: 'Personalizada', label: 'Cuestionario propio', hint: 'Preguntas libres para las personas que elija (cultura de riesgo, capacitación, etc.).' },
];

export type SurveyItemType = 'probabilidad' | 'impacto' | 'si-no' | 'si-parcial-no' | 'horas' | 'numero' | 'texto' | 'opcion' | 'escala-5';
export const CUSTOM_ITEM_TYPES: { id: SurveyItemType; label: string }[] = [
  { id: 'texto', label: 'Texto' }, { id: 'si-no', label: 'Sí / No' }, { id: 'si-parcial-no', label: 'Sí / Parcial / No' },
  { id: 'escala-5', label: 'Escala 1 a 5' }, { id: 'numero', label: 'Número' },
];

/** Registro al que se refiere la pregunta (para aplicar la respuesta o crear un plan). */
export interface SurveyItemRef {
  kind: 'risk' | 'control' | 'bia' | 'requirement';
  id: string;
  field?: string;   // likelihood, impact, executed, rtoHours, status…
}

export interface SurveyItem {
  id: string;
  section: string;          // agrupa las preguntas (un riesgo, un control, "General")
  label: string;
  help?: string;
  type: SurveyItemType;
  options?: string[];       // para 'opcion'
  required: boolean;
  ref?: SurveyItemRef;
  /** Valor vigente en el sistema al lanzar la campaña (para comparar). */
  current?: string | number;
}

export type SurveyCampaignStatus = 'Borrador' | 'En curso' | 'Cerrada';

export interface SurveyCampaign {
  id: string;
  code: string;             // AE-2026-01
  title: string;
  kind: SurveyKind;
  description: string;
  /** RCSA: nombres de procesos; BIA: ids de procesos BIA; Cumplimiento: ids de requisitos; Personalizada: personas. */
  scope: string[];
  normId?: string;          // Cumplimiento
  respondent?: string;      // Cumplimiento: responsable que responde
  customItems?: SurveyItem[];
  dueDate: string;          // YYYY-MM-DD
  status: SurveyCampaignStatus;
  launchedAt?: string;      // ISO
  closedAt?: string;        // ISO
  createdBy: string;
  createdAt: string;        // ISO
}

export type SurveyResponseStatus = 'Pendiente' | 'En progreso' | 'Enviada' | 'Devuelta' | 'Revisada';
export const SURVEY_RESPONSE_STATUSES: SurveyResponseStatus[] = ['Pendiente', 'En progreso', 'Enviada', 'Devuelta', 'Revisada'];

export type SurveyAnswer = string | number | null;

/** Cuestionario de una persona dentro de una campaña. */
export interface SurveyResponse {
  id: string;
  campaignId: string;
  subject: string;          // proceso, proceso BIA, norma o persona
  respondent: string;       // nombre del usuario que responde
  items: SurveyItem[];      // copia de las preguntas al lanzar
  answers: Record<string, SurveyAnswer>;
  status: SurveyResponseStatus;
  dueDate: string;
  startedAt?: string;
  submittedAt?: string;
  returnedNote?: string;    // motivo de la devolución
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
  /** Preguntas cuya respuesta ya se aplicó al registro de origen. */
  applied: string[];
}
