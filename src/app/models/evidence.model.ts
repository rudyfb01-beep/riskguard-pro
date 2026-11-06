// =============================================================================
// EVIDENCIAS
// Archivos reales (actas, informes, capturas, planillas) adjuntos a un registro.
// El servidor guarda el contenido, calcula el SHA-256 y registra la carga en la
// bitácora en la misma transacción. Las bajas no borran el archivo: lo ocultan con
// motivo (la evidencia de auditoría se conserva).
// =============================================================================

/** Registros que admiten evidencia (nombre de la entidad en la API). */
export type EvidenceEntity =
  | 'controls'
  | 'risks'
  | 'action-plans'
  | 'compliance'
  | 'audits'
  | 'flaws'
  | 'continuity-tests'
  | 'plans'
  | 'security-tests'
  | 'vulnerabilities'
  | 'survey-responses'
  | 'approvals'
  | 'providers'
  | 'documents';

export const EVIDENCE_ENTITY_LABELS: Record<EvidenceEntity, string> = {
  controls: 'Control',
  risks: 'Riesgo',
  'action-plans': 'Plan de acción',
  compliance: 'Requisito normativo',
  audits: 'Auditoría',
  flaws: 'Incidente',
  'continuity-tests': 'Prueba de continuidad',
  plans: 'Plan de continuidad',
  'security-tests': 'Prueba de seguridad',
  vulnerabilities: 'Vulnerabilidad',
  'survey-responses': 'Autoevaluación',
  approvals: 'Solicitud de aprobación',
  providers: 'Proveedor',
  documents: 'Documento',
};

export interface EvidenceFile {
  id: string;
  entityType: EvidenceEntity;
  entityId: string;
  /** Parte del registro: prueba de control, hallazgo, pregunta, "cierre"… (opcional). */
  context?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;          // hexadecimal, calculado por el servidor
  description?: string;
  uploadedBy: string;
  uploadedByEmail?: string;
  uploadedAt: string;      // ISO
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

/** Tamaño máximo por archivo (MB) si el servidor no indica otro (EVIDENCE_MAX_MB). */
export const DEFAULT_EVIDENCE_MAX_MB = 15;
