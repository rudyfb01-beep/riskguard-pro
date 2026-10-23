import { CacBusinessLine } from './risk.model';

// =============================================================================
// MANTENEDORES: ÁREAS, PROCESOS Y PARÁMETROS GENERALES
// =============================================================================

/** Área o gerencia de la cooperativa. Los puestos y procesos se asocian a ella. */
export interface OrgArea {
  id: string;
  name: string;
  manager: string;       // responsable del área
  description: string;
  active: boolean;
}

export type ProcessCriticality = 'Crítico' | 'Alto' | 'Medio' | 'Bajo';
export const PROCESS_CRITICALITIES: ProcessCriticality[] = ['Crítico', 'Alto', 'Medio', 'Bajo'];

/**
 * Proceso del mapa de procesos. Riesgos, controles, incidentes, KRIs, alertas y
 * hallazgos lo referencian por nombre; al renombrarlo se actualizan todas las referencias.
 */
export interface BusinessProcess {
  id: string;
  code: string;
  name: string;
  areaId?: string;
  owner: string;                    // dueño del proceso
  businessLine?: CacBusinessLine;   // línea de negocio normativa (CAC)
  criticality: ProcessCriticality;
  description: string;
  active: boolean;
}

export type ReportingCurrency = 'CLP' | 'USD';

/** Parámetros generales que antes estaban fijos en el código. */
export interface GeneralParameters {
  /** Moneda en que se registran montos (pérdidas, exposición, costos). Solo cambia etiquetas y formato. */
  currency: ReportingCurrency;
  /** Días antes del vencimiento de un contrato con proveedor para generar alerta. */
  contractExpiryWarningDays: number;
  /** Frecuencia de evaluación de proveedores, en meses, según criticidad. */
  providerAssessmentMonths: Record<ProcessCriticality, number>;
  /** Plazo para corregir vulnerabilidades, en días, según severidad. */
  vulnSlaDays: { 'Crítica': number; 'Alta': number; 'Media': number; 'Baja': number };
}

export const DEFAULT_GENERAL_PARAMETERS: GeneralParameters = {
  currency: 'USD',
  contractExpiryWarningDays: 90,
  providerAssessmentMonths: { 'Crítico': 12, 'Alto': 12, 'Medio': 24, 'Bajo': 36 },
  vulnSlaDays: { 'Crítica': 15, 'Alta': 30, 'Media': 90, 'Baja': 180 },
};

const posInt = (v: unknown, fallback: number, max = 3650): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : fallback;
};

/** Completa y valida parámetros guardados (versiones anteriores o valores fuera de rango). */
export function normalizeGeneralParameters(raw: unknown): GeneralParameters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GeneralParameters>;
  const d = DEFAULT_GENERAL_PARAMETERS;
  const pam = (r.providerAssessmentMonths ?? {}) as Partial<Record<ProcessCriticality, number>>;
  const sla = (r.vulnSlaDays ?? {}) as Partial<GeneralParameters['vulnSlaDays']>;
  return {
    currency: r.currency === 'CLP' ? 'CLP' : 'USD',
    contractExpiryWarningDays: posInt(r.contractExpiryWarningDays, d.contractExpiryWarningDays, 365),
    providerAssessmentMonths: {
      'Crítico': posInt(pam['Crítico'], d.providerAssessmentMonths['Crítico'], 60),
      'Alto': posInt(pam['Alto'], d.providerAssessmentMonths['Alto'], 60),
      'Medio': posInt(pam['Medio'], d.providerAssessmentMonths['Medio'], 60),
      'Bajo': posInt(pam['Bajo'], d.providerAssessmentMonths['Bajo'], 60),
    },
    vulnSlaDays: {
      'Crítica': posInt(sla['Crítica'], d.vulnSlaDays['Crítica'], 365),
      'Alta': posInt(sla['Alta'], d.vulnSlaDays['Alta'], 365),
      'Media': posInt(sla['Media'], d.vulnSlaDays['Media'], 730),
      'Baja': posInt(sla['Baja'], d.vulnSlaDays['Baja'], 730),
    },
  };
}
