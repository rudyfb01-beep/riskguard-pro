// =============================================================================
// CUMPLIMIENTO NORMATIVO: MATRIZ DE REQUISITOS RAN 20-7, 20-8, 20-9 Y 20-10
// (aplicables a las cooperativas vía Capítulo CAC-3 de la NCG 567; el "Directorio"
// de la RAN corresponde al Consejo de Administración)
// =============================================================================

export type RanChapter = '20-7' | '20-8' | '20-9' | '20-10';

export const RAN_CHAPTERS: { id: RanChapter; title: string; source: string }[] = [
  { id: '20-7', title: 'Externalización de servicios', source: 'RAN 20-7 (Circular N° 3.629, 2017, y modificaciones de 2019)' },
  { id: '20-8', title: 'Información de incidentes operacionales', source: 'RAN 20-8 (Circular N° 3.640, 2018)' },
  { id: '20-9', title: 'Gestión de la continuidad del negocio', source: 'RAN 20-9 (Circulares N° 3.612, 2016, y N° 3.642, 2018)' },
  { id: '20-10', title: 'Gestión de la seguridad de la información y ciberseguridad', source: 'RAN 20-10 (vigente desde el 01-12-2020)' },
];

export type ComplianceStatus = 'Sin evaluar' | 'Cumple' | 'Cumple parcialmente' | 'No cumple' | 'No aplica';
export const COMPLIANCE_STATUSES: ComplianceStatus[] = ['Sin evaluar', 'Cumple', 'Cumple parcialmente', 'No cumple', 'No aplica'];

export type ComplianceFrequency = 'Permanente' | 'Anual' | 'Semestral' | 'Por evento';

/** Requisito normativo con su evaluación. `autoCheck` enlaza una verificación automática con datos del sistema. */
export interface ComplianceRequirement {
  id: string;
  chapter: RanChapter;
  numeral: string;          // referencia en la norma (p. ej. "I.7", "III.1.f", "1.1")
  title: string;
  requirement: string;
  module?: string;          // pestaña de la aplicación que lo soporta
  autoCheck?: string;       // clave de verificación automática
  frequency: ComplianceFrequency;
  status: ComplianceStatus;
  evidence: string;
  owner: string;
  actionPlan: string;
  dueDate?: string;         // YYYY-MM-DD (plan de acción)
  lastReviewDate?: string;  // YYYY-MM-DD (última verificación)
  reviewedBy?: string;
}

/** Resultado de una verificación automática con datos del sistema. */
export interface ComplianceAutoResult {
  text: string;
  suggested?: ComplianceStatus;
}

// ---------------------------------------------------------------------------
// Datos adicionales por capítulo que guardan los módulos
// ---------------------------------------------------------------------------

/** RAN 20-7: criterios de actividad significativa o estratégica (crítica). */
export const SIGNIFICANCE_CRITERIA = [
  { key: 'continuity', label: 'Impacta el cumplimiento normativo, la continuidad, la seguridad de la información o la reputación' },
  { key: 'secrecy', label: 'Trata datos sujetos a secreto o reserva' },
  { key: 'riskMgmt', label: 'Incide significativamente en la gestión de riesgos' },
  { key: 'systemic', label: 'Alta interacción sistémica o riesgo significativo' },
] as const;

/** RAN 20-7 V: debida diligencia reforzada para servicios críticos en la nube (letras a–g). */
export const CLOUD_DUE_DILIGENCE = [
  { key: 'prestige', label: 'a. Proveedor de reconocido prestigio y experiencia' },
  { key: 'certifications', label: 'b. Certificaciones independientes de seguridad, continuidad y calidad' },
  { key: 'directContract', label: 'c. Contrato directo con el proveedor, sin intermediarios' },
  { key: 'legalReport', label: 'd. Informe legal sobre privacidad y acceso en cada jurisdicción' },
  { key: 'auditReports', label: 'e. Informes de auditoría disponibles para la cooperativa y la CMF' },
  { key: 'isolation', label: 'f. Aislamiento físico y lógico de la infraestructura compartida' },
  { key: 'encryption', label: 'g. Cifrado robusto de datos sensibles (llaves en poder de la cooperativa)' },
] as const;

export interface Subcontractor {
  name: string;
  country: string;
  service: string;
  meetsConditions: boolean;   // cumple las condiciones del contrato original (III.1.k)
}

export interface ProviderRan207 {
  significance: string[];                 // claves de SIGNIFICANCE_CRITERIA que aplican
  primarySite: string;                    // "Ciudad, país" del centro de datos principal
  contingencySite: string;                // "Ciudad, país" del centro de contingencia
  contingencyInChile: boolean;
  boardWaiverDate?: string;               // dispensa del Consejo (sitio de contingencia fuera de Chile)
  independentReportDate?: string;         // informe anual de empresa independiente
  investmentGradeCountry: boolean;        // país con clasificación de riesgo en grado de inversión
  countryRiskAnalysis: string;            // análisis documentado si no lo es
  subcontractors: Subcontractor[];
  providerContinuityTestDate?: string;    // última prueba del plan de continuidad del proveedor
  providerSecurityTestDate?: string;      // última evaluación de vulnerabilidades / pentest del proveedor
  cloudDueDiligence: Record<string, boolean>;
  lastAuditDate?: string;                 // última auditoría o revisión independiente del servicio
}

export const EMPTY_RAN207: ProviderRan207 = {
  significance: [], primarySite: '', contingencySite: '', contingencyInChile: false, investmentGradeCountry: true,
  countryRiskAnalysis: '', subcontractors: [], cloudDueDiligence: {},
};

/** RAN 20-9 I.8: escenarios mínimos de contingencia. */
export const MIN_SCENARIOS = [
  'Falla total o parcial de sistemas tecnológicos',
  'Ataque malicioso a la ciberseguridad',
  'Ausencia de personal crítico',
  'Imposibilidad de acceder a instalaciones físicas',
  'Falla de servicios críticos de proveedores',
] as const;

export interface BiaRan209 {
  rtoApprovedDate?: string;   // RTO aprobado por el Consejo (I.7)
  rtoApprovalRef: string;     // acta o sesión
  riaDate?: string;           // análisis de riesgos (RIA) del proceso crítico (I.7)
  riaSummary: string;
}

export interface PlanRan209 {
  scenarios: string[];        // escenarios que cubre el plan (I.8)
  returnToNormal: boolean;    // procedimiento de retorno a la operación normal (I.9)
}

export interface TestRan209 {
  scenario?: string;                      // escenario probado (I.10)
  siteUnavailability: boolean;            // simulación de indisponibilidad del sitio de procesamiento (I.11)
  processingMode?: 'Online' | 'Batch' | 'Online y batch';
  priorRiskAnalysis: boolean;             // análisis de riesgos previo a la prueba (I.11)
}

/** RAN 20-10 4.2 / 20-8 1.3: datos de ciberseguridad de un incidente. */
export interface CyberIncidentInfo {
  isCyber: boolean;
  threatType: string;
  malware: string;                 // software malicioso / indicadores de compromiso identificados
  protection: string;              // mecanismo de protección identificado
  industryAlertAt?: string;        // 20-8 §1.3: alerta enviada a la industria (ISO)
  industryAlertChannel: string;
  forensicRequired: boolean;       // 20-10: análisis forense independiente de incidentes relevantes
  forensicDate?: string;
  forensicBy: string;
  forensicSummary: string;
  lessonsLearned: string;          // base de lecciones aprendidas
}

export const EMPTY_CYBER: CyberIncidentInfo = {
  isCyber: false, threatType: '', malware: '', protection: '', industryAlertChannel: '', forensicRequired: false,
  forensicBy: '', forensicSummary: '', lessonsLearned: '',
};

/** RAN 20-10: pruebas de seguridad y de respuesta, con su informe al Consejo. */
export type SecurityTestType =
  | 'Prueba de penetración'
  | 'Hacking ético'
  | 'Escaneo de vulnerabilidades'
  | 'Prueba de restauración de respaldos'
  | 'Prueba del plan de respuesta a incidentes'
  | 'Ejercicio de gestión de crisis';

export const SECURITY_TEST_TYPES: SecurityTestType[] = [
  'Prueba de penetración', 'Hacking ético', 'Escaneo de vulnerabilidades', 'Prueba de restauración de respaldos',
  'Prueba del plan de respuesta a incidentes', 'Ejercicio de gestión de crisis',
];

export interface SecurityTest {
  id: string;
  date: string;               // YYYY-MM-DD
  type: SecurityTestType;
  scope: string;
  executedBy: string;         // equipo interno o empresa externa
  result: 'Satisfactoria' | 'Con observaciones' | 'Insatisfactoria';
  findings: string;
  reportedToBoardDate?: string;  // informe al Consejo (al menos semestral)
}
