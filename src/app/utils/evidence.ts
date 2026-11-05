import { EvidenceEntity, EvidenceFile } from '../models/evidence.model';
import { UserPermissions } from '../models/risk.model';
import { canManagePlans, isPlanOwner, personKey } from './action-plans';
import { canDecide, isRequester } from './approvals';
import { canManageSurveys, isRespondent } from './surveys';
import type { ActionPlan } from '../models/action-plan.model';
import type { SurveyResponse } from '../models/survey.model';
import type { ApprovalRequest } from '../models/approval.model';

interface Actor { name: string; roleId?: string; permissions: Partial<UserPermissions> }

// -----------------------------------------------------------------------------
// Tipos de archivo permitidos (extensión + firma del contenido)
// -----------------------------------------------------------------------------

type Signature = 'pdf' | 'png' | 'jpg' | 'gif' | 'zip' | 'ole' | 'text';

interface FileKind { mime: string; signature: Signature; label: string }

/**
 * Solo formatos de documentos, planillas, imágenes y texto. Se excluyen ejecutables,
 * HTML y SVG (podrían ejecutar código al abrirse desde el navegador).
 */
export const EVIDENCE_TYPES: Record<string, FileKind> = {
  pdf: { mime: 'application/pdf', signature: 'pdf', label: 'PDF' },
  png: { mime: 'image/png', signature: 'png', label: 'Imagen' },
  jpg: { mime: 'image/jpeg', signature: 'jpg', label: 'Imagen' },
  jpeg: { mime: 'image/jpeg', signature: 'jpg', label: 'Imagen' },
  gif: { mime: 'image/gif', signature: 'gif', label: 'Imagen' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', signature: 'zip', label: 'Word' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', signature: 'zip', label: 'Excel' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', signature: 'zip', label: 'PowerPoint' },
  doc: { mime: 'application/msword', signature: 'ole', label: 'Word' },
  xls: { mime: 'application/vnd.ms-excel', signature: 'ole', label: 'Excel' },
  msg: { mime: 'application/vnd.ms-outlook', signature: 'ole', label: 'Correo' },
  eml: { mime: 'message/rfc822', signature: 'text', label: 'Correo' },
  csv: { mime: 'text/csv', signature: 'text', label: 'CSV' },
  txt: { mime: 'text/plain', signature: 'text', label: 'Texto' },
  log: { mime: 'text/plain', signature: 'text', label: 'Log' },
  zip: { mime: 'application/zip', signature: 'zip', label: 'ZIP' },
};

export const EVIDENCE_ACCEPT = Object.keys(EVIDENCE_TYPES).map(e => `.${e}`).join(',');

export const extensionOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

const starts = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

function matchesSignature(bytes: Uint8Array, s: Signature): boolean {
  switch (s) {
    case 'pdf': return starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);                 // %PDF-
    case 'png': return starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'jpg': return starts(bytes, [0xff, 0xd8, 0xff]);
    case 'gif': return starts(bytes, [0x47, 0x49, 0x46, 0x38]);                       // GIF8
    case 'zip': return starts(bytes, [0x50, 0x4b, 0x03, 0x04]) || starts(bytes, [0x50, 0x4b, 0x05, 0x06]);
    case 'ole': return starts(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case 'text': {
      // Texto: sin bytes nulos y sin marcado HTML al inicio.
      const head = bytes.subarray(0, 4096);
      if (head.includes(0)) return false;
      const start = new TextDecoder().decode(head.subarray(0, 256)).trimStart().toLowerCase();
      return !start.startsWith('<!doctype html') && !start.startsWith('<html') && !start.startsWith('<script') && !start.startsWith('<svg');
    }
  }
}

/** Nombre seguro: sin rutas ni caracteres de control, con largo acotado. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'archivo';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '_').replace(/^\.+/, '').trim();
  if (!clean) return 'archivo';
  if (clean.length <= 180) return clean;
  const ext = extensionOf(clean);
  return `${clean.slice(0, 170)}${ext ? `.${ext}` : ''}`;
}

/**
 * Valida un archivo antes de guardarlo: extensión permitida, contenido que corresponde a
 * esa extensión y tamaño. Devuelve el tipo MIME a registrar o el motivo del rechazo.
 */
export function checkEvidenceFile(name: string, bytes: Uint8Array, maxBytes: number): { mime: string } | { error: string } {
  if (!bytes.length) return { error: 'El archivo está vacío.' };
  if (bytes.length > maxBytes) return { error: `El archivo supera el máximo de ${formatBytes(maxBytes)}.` };
  const ext = extensionOf(name);
  const kind = EVIDENCE_TYPES[ext];
  if (!kind) return { error: `Tipo de archivo no permitido (.${ext || 'sin extensión'}). Use PDF, Word, Excel, PowerPoint, imágenes, CSV, texto, correo o ZIP.` };
  if (!matchesSignature(bytes, kind.signature)) return { error: `El contenido no corresponde a un archivo .${ext} válido.` };
  return { mime: kind.mime };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
}

export function fileIcon(name: string): string {
  const ext = extensionOf(name);
  if (ext === 'pdf') return 'picture_as_pdf';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'table_view';
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'image';
  if (['msg', 'eml'].includes(ext)) return 'mail';
  if (ext === 'zip') return 'folder_zip';
  if (ext === 'pptx') return 'slideshow';
  return 'description';
}

/** Se puede ver en el navegador (PDF e imágenes); el resto se descarga. */
export const isPreviewable = (mime: string) => mime === 'application/pdf' || /^image\/(png|jpeg|gif)$/.test(mime);

// -----------------------------------------------------------------------------
// Permisos
// -----------------------------------------------------------------------------

const has = (u: Actor, ...perms: (keyof UserPermissions)[]) => perms.some(p => !!u.permissions?.[p]);

/**
 * Quién puede adjuntar (o dar de baja) evidencia en cada registro. `parent` es el registro
 * de origen: se usa para que el responsable de un plan, quien responde una autoevaluación o
 * quien solicita una aprobación puedan adjuntar sus respaldos.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function canAttachEvidence(entity: EvidenceEntity, u: Actor, parent: any): boolean {
  switch (entity) {
    case 'controls': return has(u, 'canEvaluateControls');
    case 'risks': return has(u, 'canEditRisks');
    case 'action-plans': {
      const p = parent as ActionPlan | null;
      if (canManagePlans(u)) return true;
      return !!p && isPlanOwner(u, p) && ['Pendiente', 'En curso'].includes(p.status);
    }
    case 'compliance': return has(u, 'canManageCompliance');
    case 'audits': return has(u, 'canExecuteAudits');
    case 'flaws': return has(u, 'canReportFlaws', 'canConvertFlaws');
    case 'continuity-tests':
    case 'plans': return has(u, 'canManageContinuity');
    case 'security-tests':
    case 'vulnerabilities': return has(u, 'canManageInfoSecurity');
    case 'survey-responses': {
      const r = parent as SurveyResponse | null;
      if (canManageSurveys(u)) return true;
      return !!r && isRespondent(u, r) && ['Pendiente', 'En progreso', 'Devuelta'].includes(r.status);
    }
    case 'approvals': {
      const a = parent as ApprovalRequest | null;
      return !!a && a.status === 'Pendiente' && (isRequester(u, a) || canDecide(u, a));
    }
    case 'providers': return has(u, 'canManageProviders');
  }
}

/** Dar de baja: quien la cargó (si aún puede adjuntar en el registro) o quien administra ese módulo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function canRemoveEvidence(f: EvidenceFile, u: Actor, parent: any): boolean {
  if (f.deletedAt) return false;
  const uploader = personKey(f.uploadedBy) === personKey(u.name);
  if (uploader) return canAttachEvidence(f.entityType, u, parent);
  switch (f.entityType) {
    case 'action-plans': return canManagePlans(u);
    case 'survey-responses': return canManageSurveys(u);
    case 'approvals': return false;
    default: return canAttachEvidence(f.entityType, u, parent);
  }
}

/** Evidencias vigentes de un registro (y opcionalmente de una parte de él). */
export function evidenceFor(list: EvidenceFile[], entity: EvidenceEntity, id: string | undefined, context?: string): EvidenceFile[] {
  if (!id) return [];
  return list
    .filter(f => !f.deletedAt && f.entityType === entity && f.entityId === id && (context === undefined || (f.context ?? '') === context))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
