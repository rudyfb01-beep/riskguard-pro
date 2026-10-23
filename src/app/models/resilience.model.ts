import { CacBusinessLine } from './risk.model';

// =============================================================================
// PROVEEDORES Y EXTERNALIZACIÓN DE SERVICIOS
// =============================================================================

export const PROVIDER_SERVICE_CATEGORIES = [
  'Core financiero / Procesamiento de datos',
  'Servicios en la nube',
  'Canales digitales (web / app)',
  'Medios de pago y recaudación',
  'Cobranza externa',
  'Centro de datos / Hosting',
  'Ciberseguridad (SOC / monitoreo)',
  'Atención telefónica / Contact center',
  'Transporte de valores',
  'Otros servicios',
] as const;
export type ProviderServiceCategory = typeof PROVIDER_SERVICE_CATEGORIES[number];

export type ProviderCriticality = 'Crítico' | 'Alto' | 'Medio' | 'Bajo';

/** Cláusulas mínimas que se revisan en contratos de externalización. */
export const CONTRACT_CLAUSES = [
  { key: 'regulatorAccess', label: 'Acceso del regulador (CMF) a información e instalaciones' },
  { key: 'auditRights', label: 'Derecho de auditoría de la cooperativa' },
  { key: 'confidentiality', label: 'Confidencialidad y protección de datos de socios' },
  { key: 'incidentNotification', label: 'Notificación oportuna de incidentes' },
  { key: 'continuity', label: 'Plan de continuidad del proveedor y pruebas' },
  { key: 'serviceLevels', label: 'Niveles de servicio (SLA) y penalidades' },
  { key: 'subcontracting', label: 'Condiciones para subcontratación' },
  { key: 'dataLocation', label: 'Ubicación, respaldo y devolución de datos' },
  { key: 'termination', label: 'Término anticipado y transición (salida)' },
] as const;
export type ContractClauseKey = typeof CONTRACT_CLAUSES[number]['key'];

export interface ServiceProvider {
  id: string;
  code: string;
  name: string;
  taxId: string;                 // RUT
  serviceDescription: string;
  category: ProviderServiceCategory | string;   // catálogo editable en Mantenedores
  criticality: ProviderCriticality;
  internalOwner: string;
  supportedProcesses: string[];  // procesos de la cooperativa que dependen del servicio
  status: 'Activo' | 'En evaluación' | 'En término';

  // Nube y datos
  isCloud: boolean;
  cloudModel?: 'IaaS' | 'PaaS' | 'SaaS';
  dataLocation: 'Chile' | 'Extranjero';
  dataCountry?: string;
  handlesMemberData: boolean;
  usesSubcontractors: boolean;

  // Contrato
  contractStart: string;   // YYYY-MM-DD
  contractEnd: string;     // YYYY-MM-DD
  annualCostUSD: number;
  clauses: Record<string, boolean>;              // clave de cláusula (catálogo editable) → presente

  // Evaluación y salida
  lastAssessmentDate?: string;  // YYYY-MM-DD
  assessmentScore?: number;     // 0-100
  hasExitPlan: boolean;
  exitPlanNotes?: string;
  committedRtoHours?: number;   // RTO comprometido contractualmente
}

export type ProviderAlertType =
  | 'Contrato por vencer'
  | 'Contrato vencido'
  | 'Evaluación vencida'
  | 'Sin evaluación'
  | 'Sin plan de salida'
  | 'Cláusulas faltantes'
  | 'Datos en el extranjero'
  | 'RTO insuficiente';

export interface ProviderAlert {
  providerId: string;
  type: ProviderAlertType;
  severity: 'Alta' | 'Media' | 'Baja';
  detail: string;
}

// =============================================================================
// CONTINUIDAD DEL NEGOCIO
// =============================================================================

/** Escala de impacto 1 (bajo) a 4 (severo) para el análisis de impacto (BIA). */
export interface BiaImpact {
  financial: number;
  members: number;      // socios
  regulatory: number;
  reputational: number;
}

export interface BiaProcess {
  id: string;
  name: string;
  owner: string;
  businessLine: CacBusinessLine;
  description: string;
  impact: BiaImpact;
  mtpdHours: number;  // Máximo período tolerable de interrupción
  rtoHours: number;   // Tiempo objetivo de recuperación
  rpoHours: number;   // Punto objetivo de recuperación (pérdida de datos tolerable)
  systems: string[];
  providerIds: string[];
  minimumStaff: number;
  alternateSite: string;
  lastReviewDate: string;  // YYYY-MM-DD
}

export type ContinuityPlanType = 'Plan de Continuidad (BCP)' | 'Recuperación ante Desastres (DRP)' | 'Gestión de Crisis' | 'Comunicaciones de Crisis';

export interface ContinuityPlan {
  id: string;
  code: string;
  name: string;
  type: ContinuityPlanType;
  processIds: string[];
  owner: string;
  version: string;
  approvedBy: string;
  approvalDate: string;    // YYYY-MM-DD
  nextReviewDate: string;  // YYYY-MM-DD
  status: 'Vigente' | 'En actualización' | 'Borrador';
}

export type ContinuityTestType = 'Ejercicio de escritorio' | 'Simulacro' | 'Prueba técnica DRP' | 'Prueba integral con proveedores';

export interface ContinuityTest {
  id: string;
  planId: string;
  date: string;  // YYYY-MM-DD
  type: ContinuityTestType;
  scenario: string;
  processId?: string;
  achievedRtoHours?: number;
  result: 'Exitosa' | 'Con observaciones' | 'Fallida';
  findings: string;
  actions: string;
}

export type ContinuityAlertType =
  | 'RTO mayor que MTPD'
  | 'Proceso sin plan'
  | 'Plan con revisión vencida'
  | 'Plan sin prueba en 12 meses'
  | 'RTO no logrado en prueba'
  | 'Proveedor no cubre RTO'
  | 'BIA desactualizado';

export interface ContinuityAlert {
  refId: string;
  type: ContinuityAlertType;
  severity: 'Alta' | 'Media' | 'Baja';
  detail: string;
}
