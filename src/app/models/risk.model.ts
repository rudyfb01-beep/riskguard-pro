import type { CyberIncidentInfo } from './compliance.model';
import type { RiskAcceptance } from './approval.model';
export type BaselCategory =
  | 'Fraude Interno'
  | 'Fraude Externo'
  | 'Fallas Tecnológicas'
  | 'Ejecución y Procesos'
  | 'Prácticas Laborales'
  | 'Daño a Activos Físicos'
  | 'Cumplimiento Normativo';

export type RiskLevel = 'Bajo' | 'Medio' | 'Alto' | 'Crítico';

export type ControlType = 'Preventivo' | 'Detectivo' | 'Correctivo';
export type ControlAutomation = 'Automático' | 'Semiautomático' | 'Manual';
export type ControlFrequency = 'Continuo' | 'Diario' | 'Semanal' | 'Mensual' | 'Por Evento';

export interface MitigationPlan {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  budgetUSD: number;
  progressPct: number;
  status: 'No Iniciado' | 'En Progreso' | 'Completado';
  actions: string[];
}

export interface ControlEvidenceAttachment {
  id: string;
  fileName: string;
  fileSize: string;
  fileType: string;
  uploadedAt: string;
  uploadedBy: string;
  description?: string;
  fileDataUrl?: string;
  fileHashSha256?: string;
}

export interface ControlTestExecution {
  id: string;
  testDate: string;
  testedBy: string;
  testerRole?: string;
  testMethod: 'Inspección de Muestra' | 'Re-ejecución Automática' | 'Recorrido (Walkthrough)' | 'Entrevista y Observación' | 'Auditoría Forense';
  sampleSize?: string;
  deviationsIdentified?: number;
  designScore: number;
  operatingScore: number;
  totalScore: number;
  conclusion: 'Efectivo / Conforme' | 'Con Desviaciones Menores' | 'Deficiente / No Conforme';
  evidenceNotes: string;
  attachments: ControlEvidenceAttachment[];
  ledgerHash?: string;
}

export interface Control {
  id: string;
  code: string;
  name: string;
  description: string;
  process: string;
  type: ControlType;
  automation: ControlAutomation;
  frequency: ControlFrequency;
  designEffectiveness: number; // 0-100
  operatingEffectiveness: number; // 0-100
  totalEffectiveness: number; // computed
  status: 'Efectivo' | 'Parcialmente Efectivo' | 'Deficiente';
  owner: string;
  lastTested: string;
  evidence: string;
  attachments?: ControlEvidenceAttachment[];
  testHistory?: ControlTestExecution[];
  sampleDetails?: string;
  lastTestedBy?: string;
}

export interface Risk {
  id: string;
  code: string;
  title: string;
  description: string;
  process: string;
  category: BaselCategory;
  responsible: string;
  status: 'Activo' | 'Bajo Monitoreo' | 'Mitigado' | 'Cerrado';
  
  // Inherent Risk (Riesgo Inherente) en Matriz 4×4
  inherentLikelihood: number; // 1 to 4 (1: Improbable, 2: Posible, 3: Probable, 4: Frecuente)
  inherentImpact: number;     // 1 to 4 (1: Menor, 2: Moderado, 3: Mayor, 4: Catastrófico)
  inherentScore: number;      // 1 to 16 (Likelihood x Impact)
  inherentLevel: RiskLevel;
  financialExposureUSD: number;

  // Attached Controls
  controlIds: string[];

  // Residual Risk (Riesgo Residual) en Matriz 4×4
  residualLikelihood: number; // 1 to 4
  residualImpact: number;     // 1 to 4
  residualScore: number;      // 1 to 16
  residualLevel: RiskLevel;
  residualExposureUSD: number;

  mitigationPlan: MitigationPlan;
  createdAt: string;
  lastReviewDate: string;
  /** Aceptación formal (flujo de aprobación) cuando el residual queda sobre el apetito. */
  acceptance?: RiskAcceptance;
}

export type IncidentType =
  | 'Falla de Control'
  | 'Evento de Pérdida Real'
  | 'Casi Pérdida (Near Miss)'
  | 'Vulnerabilidad Operativa';

/**
 * Líneas de negocio de una Cooperativa de Ahorro y Crédito (CAC) para
 * clasificar eventos en la base de pérdidas operacionales.
 */
export const CAC_BUSINESS_LINES = [
  'Créditos de Consumo',
  'Créditos Comerciales',
  'Créditos Hipotecarios',
  'Captaciones y Ahorro',
  'Cuotas de Participación',
  'Medios y Canales de Pago',
  'Tesorería e Inversiones',
  'Soporte Corporativo',
] as const;
export type CacBusinessLine = typeof CAC_BUSINESS_LINES[number];

/**
 * Subcategorías (nivel 2) de eventos de pérdida según Basilea, agrupadas por
 * la categoría de nivel 1 que usa la aplicación.
 */
export const BASEL_SUBCATEGORIES: Record<BaselCategory, string[]> = {
  'Fraude Interno': ['Actividades no autorizadas', 'Hurto y fraude interno'],
  'Fraude Externo': ['Hurto y fraude externo', 'Seguridad de los sistemas'],
  'Prácticas Laborales': ['Relaciones laborales', 'Higiene y seguridad en el trabajo', 'Diversidad y discriminación'],
  'Cumplimiento Normativo': [
    'Adecuación, divulgación de información y deber fiduciario',
    'Prácticas empresariales o de mercado improcedentes',
    'Productos defectuosos',
    'Selección, patrocinio y riesgos',
    'Actividades de asesoramiento',
  ],
  'Daño a Activos Físicos': ['Desastres y otros acontecimientos'],
  'Fallas Tecnológicas': ['Interrupción del negocio y fallas de sistemas'],
  'Ejecución y Procesos': [
    'Recepción, ejecución y mantenimiento de operaciones',
    'Seguimiento y presentación de informes',
    'Aceptación de socios y documentación',
    'Gestión de cuentas de socios',
    'Contrapartes comerciales',
    'Proveedores y servicios externalizados',
  ],
};

export type RegulatoryAuthority = 'CMF' | 'ANCI';

/**
 * Hito de reporte configurable. El plazo se cuenta desde la ocurrencia del
 * incidente (RAN 20-8 §1.1: "30 minutos luego de su ocurrencia") o desde la
 * toma de conocimiento, según `basis`. Los hitos `dueOnClose` se envían al cerrar.
 */
export interface RegulatoryMilestoneTemplate {
  id: string;
  authority: RegulatoryAuthority;
  name: string;
  deadlineMinutes: number;
  enabled: boolean;
  basis?: 'ocurrencia' | 'conocimiento';
  dueOnClose?: boolean;
}

export const RAN208_CHANNELS = ['Sucursales', 'Página web', 'Aplicación móvil', 'Atención telefónica', 'Cajeros / POS', 'Correo electrónico', 'Otros'] as const;

/** Contenido del reporte de incidente operacional (RAN 20-8 §1.1, aplicable vía CAC-3 §5.2). */
export interface Ran208Details {
  cmfIncidentId?: string;            // identificador asignado por la CMF
  possibleCauses?: string;           // reporte inicial
  identifiedCauses?: string;         // reporte de cierre
  affectedProducts?: string;
  affectedChannels?: string[];
  affectedPremises?: string;         // dependencias afectadas
  customerType?: 'Personas' | 'Empresas' | 'Ambos' | 'N/A';
  estimatedAffectedMembers?: number;
  affectedTransactions?: number;
  measures?: string;                 // medidas adoptadas y en curso
  otherInfo?: string;
  informant?: string;                // nombre y cargo de quien informa
  endedAt?: string;                  // ISO: término del incidente
  memberNotice?: string;             // §1.2: comunicación a socios/usuarios
  memberNoticeAt?: string;           // ISO: primera comunicación a socios/usuarios
  memberNoticeChannel?: string;      // canal (web, app, correo, sucursales, prensa)
}

export interface RegulatorySubmission {
  milestoneId: string;
  submittedAt: string; // ISO
  submittedBy: string;
  folio?: string;
}

export interface RegulatoryReportUpdate {
  at: string; // ISO
  by: string;
  note: string;
}

/** Seguimiento del reporte de un incidente a la CMF y/o a la ANCI. */
export interface RegulatoryReport {
  awarenessAt: string; // ISO: momento en que la administración toma conocimiento
  occurredAt?: string; // ISO: inicio u ocurrencia del incidente (base del plazo CMF)
  details?: Ran208Details;
  reportableToCMF: boolean;
  reportableToANCI: boolean;
  submissions: RegulatorySubmission[];
  updates: RegulatoryReportUpdate[];
  status: 'Abierto' | 'Cerrado';
  closedAt?: string;
}

export type MilestoneStatus = 'Pendiente' | 'Vencido' | 'Enviado a tiempo' | 'Enviado fuera de plazo';

export interface OperationalFlaw {
  id: string;
  title: string;
  description: string;
  reportedBy: string;
  process: string;
  severity: 'Crítica' | 'Alta' | 'Media' | 'Baja';
  reportedAt: string;
  status: 'Pendiente de Evaluación' | 'Convertida a Riesgo' | 'Descartada';
  incidentType?: IncidentType;
  /** Pérdida bruta (antes de recuperaciones). */
  realLossAmountUSD?: number;
  recoveredAmountUSD?: number;
  impactedSystemOrAccount?: string;
  convertedRiskId?: string;
  aiSuggestedCategory?: BaselCategory;
  aiSuggestedControls?: string[];
  aiAnalysis?: Record<string, unknown> | null;

  // ---- Base de pérdidas operacionales (RAN CACs / Basilea) ----
  businessLine?: CacBusinessLine;
  baselCategory?: BaselCategory;
  baselSubcategory?: string;
  occurrenceDate?: string;   // YYYY-MM-DD
  discoveryDate?: string;    // YYYY-MM-DD
  accountingDate?: string;   // YYYY-MM-DD
  accountingAccount?: string;
  /** Pérdida operacional en frontera con riesgo de crédito. */
  creditRiskBoundary?: boolean;

  // ---- Reporte regulatorio CMF / ANCI ----
  regulatoryReport?: RegulatoryReport;

  /** Proveedor externo involucrado en el incidente (si aplica). */
  providerId?: string;

  /** Activos de información afectados (ciberincidentes). */
  affectedAssetIds?: string[];
  cyber?: CyberIncidentInfo;   // ciberseguridad: alerta a la industria, forense y lecciones aprendidas
}

export type OperationalIncident = OperationalFlaw;

export interface AnomalyAlert {
  id: string;
  code: string;
  title: string;
  description: string;
  kriMetric: string;
  threshold: string;
  currentValue: string;
  severity: 'Crítico' | 'Alto' | 'Medio' | 'Informativo';
  process: string;
  triggeredAt: string;
  status: 'Activa' | 'En Investigación' | 'Mitigada' | 'Silenciada';
  escalatedTo: string;
}

export interface AuditFinding {
  id: string;
  type: 'Conforme' | 'Observación' | 'No Conformidad Menor' | 'No Conformidad Mayor';
  description: string;
  process: string;
  associatedRiskCode?: string;
  correctiveAction: string;
  deadline: string;
  responsible: string;
  status: 'Abierto' | 'En Subsanación' | 'Cerrado';
}

export interface PeriodicAudit {
  id: string;
  code: string;
  title: string;
  type: 'Auditoría Interna' | 'Auditoría Regulatoria' | 'Auditoría ISO 31000' | 'Prueba BCP';
  period: string;
  leadAuditor: string;
  scope: string[];
  executionDate: string;
  status: 'Planificada' | 'En Curso' | 'Finalizada' | 'Aprobada';
  complianceScore: number; // 0-100
  findings: AuditFinding[];
}

export interface AuditLogEntry {
  id: string;
  blockNumber: number;
  timestamp: string;
  userName: string;
  userRole: string;
  action:
    | 'CREACIÓN_RIESGO'
    | 'MODIFICACIÓN_RIESGO'
    | 'EVALUACIÓN_CONTROL'
    | 'APLICACIÓN_CONTROL'
    | 'REPORTE_INCIDENCIA'
    | 'REPORTE_FALENCIA'
    | 'ACTUALIZACION_INCIDENCIA'
    | 'CONVERSIÓN_A_RIESGO'
    | 'ALERTA_DISPARADA'
    | 'RESOLUCIÓN_ALERTA'
    | 'AUDITORÍA_REGISTRADA'
    | 'EXPORTACIÓN_REPORTE'
    | 'CONFIGURACIÓN_UMBRAL_KRI'
    | 'CONFIGURACIÓN_NOTIFICACIONES'
    | 'CAMBIO_INDUSTRIA'
    | 'CREACIÓN_PUESTO'
    | 'MODIFICACIÓN_PERMISOS'
    | 'ALTA_USUARIO'
    | 'BAJA_USUARIO'
    | 'CAMBIO_SESIÓN'
    | 'INICIO_REPORTE_REGULATORIO'
    | 'ENVÍO_REPORTE_REGULATORIO'
    | 'ACTUALIZACIÓN_REPORTE_REGULATORIO'
    | 'CIERRE_REPORTE_REGULATORIO'
    | 'CONFIGURACIÓN_PLAZOS_REGULATORIOS'
    | 'ALTA_PROVEEDOR'
    | 'MODIFICACIÓN_PROVEEDOR'
    | 'EVALUACIÓN_PROVEEDOR'
    | 'ACTUALIZACIÓN_BIA'
    | 'ALTA_PLAN_CONTINUIDAD'
    | 'MODIFICACIÓN_PLAN_CONTINUIDAD'
    | 'PRUEBA_CONTINUIDAD'
    | 'INICIO_SESIÓN'
    | 'CIERRE_SESIÓN'
    | 'ALTA_ACTIVO_INFORMACION'
    | 'MODIFICACIÓN_ACTIVO_INFORMACION'
    | 'REGISTRO_VULNERABILIDAD'
    | 'ACTUALIZACIÓN_VULNERABILIDAD'
    | 'AUTOEVALUACIÓN_SEGURIDAD'
    | 'CONFIGURACIÓN_APR'
    | 'MANTENEDOR_AREA'
    | 'MANTENEDOR_PROCESO'
    | 'IMPORTACIÓN_RIESGOS'
    | 'CONFIGURACIÓN_PARÁMETROS'
    | 'MODIFICACIÓN_AUDITORÍA'
    | 'EVALUACIÓN_CUMPLIMIENTO'
    | 'ANTECEDENTES_RAN'
    | 'MANTENEDOR_NORMA'
    | 'VERSIÓN_NORMA'
    | 'MANTENEDOR_REQUISITO'
    | 'IMPORTACIÓN_REQUISITOS'
    | 'ALTA_PLAN_ACCION'
    | 'AVANCE_PLAN_ACCION'
    | 'REPROGRAMACIÓN_PLAN_ACCION'
    | 'ENVÍO_VERIFICACIÓN_PLAN_ACCION'
    | 'CIERRE_PLAN_ACCION'
    | 'RECHAZO_PLAN_ACCION'
    | 'CANCELACIÓN_PLAN_ACCION'
    | 'MODIFICACIÓN_PLAN_ACCION'
    | 'CAMPAÑA_AUTOEVALUACION'
    | 'RESPUESTA_AUTOEVALUACION'
    | 'REVISIÓN_AUTOEVALUACION'
    | 'SOLICITUD_APROBACION'
    | 'DECISIÓN_APROBACION'
    | 'ANULACIÓN_APROBACION'
    | 'CONFIGURACIÓN_APROBACIONES';
  entityType: 'Riesgo' | 'Control' | 'Incidencia' | 'Falencia' | 'Alerta' | 'Auditoría' | 'Reporte' | 'Sesión' | 'KRI' | 'Puesto' | 'Usuario' | 'Reporte Regulatorio' | 'Proveedor' | 'Continuidad' | 'Seguridad' | 'Mantenedor' | 'Cumplimiento' | 'Plan de Acción' | 'Autoevaluación' | 'Aprobación' | 'Notificación';
  entityCode: string;
  details: string;
  ipAddress: string;
  previousHash: string;
  hash: string;
}

export type IndustryType =
  | 'Fintech & Pagos Digitales'
  | 'Banca & Servicios Financieros'
  | 'Salud & Farmacéutica'
  | 'Manufactura & Cadena de Suministro'
  | 'Retail & Comercio Electrónico'
  | 'Personalizada';

export interface KriNotificationPreferences {
  emailEnabled: boolean;
  emailRecipients: string[];
  emailTemplate: 'completa' | 'ejecutiva';
  smsEnabled: boolean;
  smsRecipients: string[];
  webhookEnabled: boolean;
  webhookUrl?: string;
  notifyOnWarning: boolean;
  notifyOnCritical: boolean;
  cooldownMinutes: number; // 0, 15, 30, 60, 240, 1440
  escalateToRiskOfficer: boolean;
}

export interface KriDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  process: string;
  category: BaselCategory;
  industry: IndustryType;
  unit: string; // '%', 'ms', 'USD', 'eventos/hora', 'minutos', 'casos', 'PPM'
  direction: 'superior' | 'inferior'; // 'superior': breach when value >= threshold; 'inferior': breach when value <= threshold
  warningThreshold: number; // Umbral Preventivo (Amarillo)
  criticalThreshold: number; // Umbral Crítico (Rojo)
  currentValue: number;
  frequency: 'Continuo (Tiempo Real)' | 'Por Minuto' | 'Horario' | 'Diario' | 'Semanal' | 'Mensual' | 'Por Evento';
  status: 'Normal' | 'Advertencia' | 'Crítico';
  autoTriggerAlert: boolean;
  responsible: string;
  lastUpdated: string;
  notificationPreferences?: KriNotificationPreferences;
}

export interface UserPermissions {
  canEditRisks: boolean;
  canEvaluateControls: boolean;
  canExecuteAudits: boolean;
  canReportFlaws: boolean;
  canConvertFlaws: boolean;
  canAcknowledgeAlerts: boolean;
  canConfigureKRIs: boolean;
  canManageRoles: boolean;
  canExportReports: boolean;
  /** Registrar envíos a CMF/ANCI y configurar plazos regulatorios. */
  canManageRegulatoryReports?: boolean;
  /** Registrar y evaluar proveedores y servicios externalizados. */
  canManageProviders?: boolean;
  /** Mantener BIA, planes de continuidad y registrar pruebas. */
  canManageContinuity?: boolean;
  /** Mantener activos de información, vulnerabilidades y la autoevaluación de seguridad. */
  canManageInfoSecurity?: boolean;
  /** Mantener áreas, procesos y parámetros generales. */
  canManageCatalogs?: boolean;
  /** Mantener la biblioteca normativa y evaluar el cumplimiento de sus requisitos. */
  canManageCompliance?: boolean;
  /** Administrar planes de acción: asignar, reprogramar, cancelar y verificar su cierre. */
  canManageActionPlans?: boolean;
  /** Crear campañas de autoevaluación, asignarlas, revisarlas y aplicar sus respuestas. */
  canManageSurveys?: boolean;
}

export interface OrganizationalRole {
  id: string;
  title: string;
  department: string;
  description: string;
  badge: string;
  isSystemRole?: boolean;
  permissions: UserPermissions;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId?: string;
  department: string;
  badge: string;
  isSystemUser?: boolean;
  permissions: UserPermissions;
  /** Usuario habilitado para iniciar sesión (por defecto true). */
  active?: boolean;
}

export interface ProcessHeatmapCell {
  likelihood: number;
  impact: number;
  score: number;
  level: RiskLevel;
  inherentCount: number;
  residualCount: number;
  inherentRisks: Risk[];
  residualRisks: Risk[];
}

export interface ProcessHeatmapSummary {
  process: string;
  icon: string;
  owner: string;
  department: string;
  risksCount: number;
  inherentExposureUSD: number;
  residualExposureUSD: number;
  mitigatedUSD: number;
  mitigationPct: number;
  maxInherentLevel: RiskLevel;
  maxResidualLevel: RiskLevel;
  avgInherentScore: number;
  avgResidualScore: number;
  criticalRisksCount: number;
  highRisksCount: number;
  mediumRisksCount: number;
  lowRisksCount: number;
  controlsCount: number;
  avgControlEffectiveness: number;
  activeAlertsCount: number;
  activeIncidentsCount: number;
  risks: Risk[];
  grid: ProcessHeatmapCell[][];
}
