import {
  ControlledDocument, DOCUMENT_TYPES, DocumentDisplayStatus, DocumentType, DocumentVersion,
} from '../models/document.model';
import { UserPermissions } from '../models/risk.model';
import { personKey } from './action-plans';
import { sameJson } from './json';

interface Actor { name: string; roleId?: string; permissions: Partial<UserPermissions> }
interface UserRef { name: string; email?: string; roleId?: string; active?: boolean }

export const canManageDocuments = (u: Actor) => !!u.permissions?.canManageDocuments;

export const currentVersion = (d: ControlledDocument): DocumentVersion | undefined =>
  d.versions.find(v => v.id === d.currentVersionId && v.status === 'Vigente');

export const draftVersion = (d: ControlledDocument): DocumentVersion | undefined => d.versions.find(v => v.status === 'Borrador');

export const isBoardDocument = (t: DocumentType) => !!DOCUMENT_TYPES.find(x => x.id === t)?.board;

/** Siguiente código por tipo: POL-001, PRO-004… */
export function nextDocumentCode(list: Pick<ControlledDocument, 'code'>[], type: DocumentType): string {
  const prefix = `${DOCUMENT_TYPES.find(t => t.id === type)?.prefix ?? 'DOC'}-`;
  const max = list.filter(d => d.code.startsWith(prefix)).reduce((m, d) => Math.max(m, Number(d.code.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

/** Versión sugerida: 1.0 la primera; si no, siguiente mayor (cambio de fondo) o menor. */
export function suggestVersion(d: ControlledDocument, major = true): string {
  const nums = d.versions.map(v => v.version.split('.').map(n => Number(n) || 0));
  if (!nums.length) return '1.0';
  const [ma, mi] = nums.sort((a, b) => b[0] - a[0] || (b[1] ?? 0) - (a[1] ?? 0))[0];
  return major ? `${ma + 1}.0` : `${ma}.${(mi ?? 0) + 1}`;
}

export function addMonths(day: string, months: number): string {
  const d = new Date(`${day.slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Estado para mostrar. `pendingApproval`: hay una solicitud de aprobación en curso. */
export function displayStatus(d: ControlledDocument, today: string, pendingApproval = false): DocumentDisplayStatus {
  if (d.status === 'Obsoleto') return 'Obsoleto';
  if (pendingApproval) return 'En aprobación';
  if (!currentVersion(d)) return 'Borrador';
  if (d.nextReviewDate && d.nextReviewDate < today) return 'Revisión vencida';
  return 'Vigente';
}

/** Personas que deben confirmar la lectura (activas, del público objetivo). */
export function audienceOf<T extends UserRef>(d: ControlledDocument, users: T[]): T[] {
  const roles = new Set(d.audienceRoleIds ?? []);
  return users.filter(u => u.active !== false && (!roles.size || (!!u.roleId && roles.has(u.roleId))));
}

export function hasAcknowledged(d: ControlledDocument, name: string): boolean {
  const v = d.currentVersionId;
  return !!v && d.acknowledgments.some(a => a.versionId === v && personKey(a.userName) === personKey(name));
}

export function ackStats<T extends UserRef>(d: ControlledDocument, users: T[]) {
  const audience = audienceOf(d, users);
  if (!currentVersion(d)) return { total: audience.length, done: 0, pct: 0, pending: audience };
  const pending = audience.filter(u => !hasAcknowledged(d, u.name));
  const done = audience.length - pending.length;
  return { total: audience.length, done, pct: audience.length ? Math.round((done / audience.length) * 100) : 100, pending };
}

/**
 * Cambios permitidos al guardar un documento (también los aplica el servidor):
 * - Quien administra documentos edita los datos, agrega o modifica borradores, asocia el archivo
 *   y lo marca obsoleto; pero no aprueba versiones: "Vigente", quién aprobó y la fecha solo los
 *   pone el flujo de aprobación.
 * - Cualquier persona puede agregar su propia confirmación de lectura de la versión vigente.
 */
export function checkDocumentChange(prev: ControlledDocument | null, next: ControlledDocument, u: Actor): string | null {
  if (!next.title?.trim()) return 'El documento necesita un título.';
  if (!canManageDocuments(u)) {
    if (!prev) return 'Tu cargo no puede crear documentos.';
    const { acknowledgments: a1, ...rest1 } = prev;
    const { acknowledgments: a2, ...rest2 } = next;
    if (!sameJson(rest1, rest2)) return 'Solo puedes confirmar la lectura del documento.';
    const added = a2.filter(x => !a1.some(y => y.versionId === x.versionId && personKey(y.userName) === personKey(x.userName)));
    if (a2.length !== a1.length + added.length || !sameJson(a1, a2.slice(0, a1.length))) return 'No se pueden modificar las lecturas registradas.';
    if (added.length !== 1 || personKey(added[0].userName) !== personKey(u.name)) return 'Solo puedes registrar tu propia lectura.';
    if (added[0].versionId !== next.currentVersionId) return 'La lectura debe ser de la versión vigente.';
    return null;
  }
  // Administra documentos: lo aprobado no se toca fuera del flujo.
  const prevApproved = (prev?.versions ?? []).filter(v => v.status !== 'Borrador');
  const nextApproved = next.versions.filter(v => v.status !== 'Borrador');
  if (!sameJson(prevApproved, nextApproved)) return 'Las versiones aprobadas solo cambian por el flujo de aprobación.';
  if ((prev?.currentVersionId ?? null) !== (next.currentVersionId ?? null)) return 'La versión vigente solo cambia al aprobarse una nueva.';
  if ((prev?.nextReviewDate ?? null) !== (next.nextReviewDate ?? null) && prev) return 'La próxima revisión la fija la aprobación de la versión.';
  if (next.versions.filter(v => v.status === 'Borrador').length > 1) return 'Solo puede haber un borrador a la vez.';
  if (prev) {
    const removedAcks = prev.acknowledgments.filter(a => !next.acknowledgments.some(b => b.versionId === a.versionId && personKey(b.userName) === personKey(a.userName)));
    if (removedAcks.length) return 'No se pueden borrar las lecturas registradas.';
  }
  return null;
}

/** Efecto de la aprobación de una versión: pasa a vigente y reemplaza a la anterior. */
export function approveVersion(d: ControlledDocument, versionId: string, approvedBy: string, day: string, code: string, effectiveDate?: string): ControlledDocument | null {
  const v = d.versions.find(x => x.id === versionId);
  if (!v || v.status !== 'Borrador' || !v.fileId) return null;
  const eff = effectiveDate && effectiveDate >= day ? effectiveDate : day;
  return {
    ...d,
    status: 'Activo',
    currentVersionId: v.id,
    nextReviewDate: addMonths(eff, d.reviewMonths || 12),
    versions: d.versions.map(x => x.id === v.id
      ? { ...x, status: 'Vigente', approvedBy, approvedAt: day, approvalCode: code, effectiveDate: eff }
      : x.status === 'Vigente' ? { ...x, status: 'Reemplazada', replacedAt: eff } : x),
  };
}
