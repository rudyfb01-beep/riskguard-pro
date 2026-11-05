// =============================================================================
// GESTIÓN DOCUMENTAL
// Políticas, manuales y procedimientos con versiones. Cada versión lleva su archivo
// (evidencia con context = id de la versión), se aprueba por el flujo de aprobaciones
// y, al aprobarse, pasa a ser la vigente; la anterior queda reemplazada. Las personas
// del público objetivo confirman la lectura de la versión vigente (difusión).
// =============================================================================

export type DocumentType = 'Política' | 'Manual' | 'Reglamento' | 'Procedimiento' | 'Instructivo' | 'Plan' | 'Formulario' | 'Otro';

export const DOCUMENT_TYPES: { id: DocumentType; prefix: string; board: boolean }[] = [
  { id: 'Política', prefix: 'POL', board: true },
  { id: 'Manual', prefix: 'MAN', board: true },
  { id: 'Reglamento', prefix: 'REG', board: true },
  { id: 'Procedimiento', prefix: 'PRO', board: false },
  { id: 'Instructivo', prefix: 'INS', board: false },
  { id: 'Plan', prefix: 'PLA', board: false },
  { id: 'Formulario', prefix: 'FOR', board: false },
  { id: 'Otro', prefix: 'DOC', board: false },
];

export type DocumentClassification = 'Pública' | 'Interna' | 'Confidencial';
export const DOCUMENT_CLASSIFICATIONS: DocumentClassification[] = ['Pública', 'Interna', 'Confidencial'];

export type VersionStatus = 'Borrador' | 'Vigente' | 'Reemplazada';

export interface DocumentVersion {
  id: string;
  version: string;          // "3.0"
  changeSummary: string;
  /** Archivo de la versión (id de evidencia). */
  fileId?: string;
  fileName?: string;
  sha256?: string;
  status: VersionStatus;
  createdBy: string;
  createdAt: string;        // ISO
  approvedBy?: string;
  approvedAt?: string;      // YYYY-MM-DD
  approvalCode?: string;    // SA-2026-004
  effectiveDate?: string;   // YYYY-MM-DD
  replacedAt?: string;      // YYYY-MM-DD
}

export interface DocumentAck {
  userName: string;
  versionId: string;
  at: string;               // ISO
}

export interface ControlledDocument {
  id: string;
  code: string;             // POL-001
  title: string;
  type: DocumentType;
  description: string;
  owner: string;            // área o persona responsable
  classification: DocumentClassification;
  reviewMonths: number;     // frecuencia de revisión
  /** Cargos que deben conocerlo (vacío: todas las personas). */
  audienceRoleIds: string[];
  /** Requisitos normativos que respalda. */
  requirementIds: string[];
  processes: string[];
  versions: DocumentVersion[];
  currentVersionId?: string;
  nextReviewDate?: string;  // YYYY-MM-DD (de la versión vigente)
  acknowledgments: DocumentAck[];
  status: 'Activo' | 'Obsoleto';
  obsoleteReason?: string;
  createdBy: string;
  createdAt: string;
}

/** Estado para mostrar (derivado). */
export type DocumentDisplayStatus = 'Borrador' | 'En aprobación' | 'Vigente' | 'Revisión vencida' | 'Obsoleto';
