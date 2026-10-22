// =============================================================================
// SEGURIDAD DE LA INFORMACIÓN Y CIBERSEGURIDAD
// =============================================================================

export const ASSET_TYPES = [
  'Datos / Base de datos',
  'Aplicación',
  'Infraestructura / Servidor',
  'Servicio en la nube',
  'Red / Comunicaciones',
  'Dispositivo de usuario',
  'Documento físico',
] as const;
export type AssetType = typeof ASSET_TYPES[number];

export type InfoClassification = 'Pública' | 'Interna' | 'Confidencial' | 'Restringida';
export type AssetLocation = 'Instalaciones propias' | 'Nube' | 'Proveedor externo';

/** Valoración 1 (baja) a 4 (crítica) de confidencialidad, integridad y disponibilidad. */
export interface CiaRating {
  confidentiality: number;
  integrity: number;
  availability: number;
}

export interface InformationAsset {
  id: string;
  code: string;
  name: string;
  description: string;
  type: AssetType;
  owner: string;       // dueño de la información (negocio)
  custodian: string;   // custodio técnico
  classification: InfoClassification;
  cia: CiaRating;
  handlesPersonalData: boolean;   // datos personales de socios o colaboradores
  location: AssetLocation;
  providerId?: string;            // si lo opera un proveedor externo
  biaProcessIds: string[];        // procesos críticos que soporta
  lastReviewDate: string;         // YYYY-MM-DD
}

export type VulnSeverity = 'Crítica' | 'Alta' | 'Media' | 'Baja';
export type VulnStatus = 'Abierta' | 'En remediación' | 'Mitigada' | 'Riesgo aceptado' | 'Cerrada';
export type VulnSource = 'Escaneo automatizado' | 'Prueba de intrusión' | 'Auditoría' | 'Aviso de proveedor' | 'Reporte interno';

/** Días para remediar según severidad (referencial; ajustable en la política interna). */
export const VULN_SLA_DAYS: Record<VulnSeverity, number> = {
  'Crítica': 15,
  'Alta': 30,
  'Media': 90,
  'Baja': 180,
};

export interface Vulnerability {
  id: string;
  code: string;
  title: string;
  description: string;
  assetId: string;
  source: VulnSource;
  severity: VulnSeverity;
  cvssScore?: number;
  detectedDate: string;   // YYYY-MM-DD
  dueDate: string;        // YYYY-MM-DD (detección + plazo según severidad)
  status: VulnStatus;
  owner: string;
  remediation: string;
  closedDate?: string;
  acceptance?: { justification: string; approvedBy: string; approvedDate: string; reviewDate: string };
}

export type AssessmentStatus = 'Sin evaluar' | 'Cumple' | 'Cumple parcialmente' | 'No cumple' | 'No aplica';

export const ASSESSMENT_DOMAINS = [
  'Gobierno',
  'Gestión de riesgos',
  'Controles de seguridad',
  'Ciberseguridad',
  'Terceros',
  'Continuidad',
] as const;
export type AssessmentDomain = typeof ASSESSMENT_DOMAINS[number];

/** Requisito de la autoevaluación de seguridad de la información. */
export interface SecurityAssessmentItem {
  id: string;
  code: string;
  domain: AssessmentDomain;
  requirement: string;
  guidance: string;
  status: AssessmentStatus;
  evidence: string;
  owner: string;
  actionPlan: string;
  dueDate?: string;
  assessedBy?: string;
  assessedDate?: string;
}

export interface SecurityAlert {
  refId: string;
  type:
    | 'Vulnerabilidad vencida'
    | 'Vulnerabilidad crítica abierta'
    | 'Riesgo aceptado por revisar'
    | 'Activo sin revisión'
    | 'Datos personales en el extranjero'
    | 'Activo crítico sin custodio'
    | 'Brecha sin plan de acción';
  severity: 'Alta' | 'Media' | 'Baja';
  detail: string;
}
