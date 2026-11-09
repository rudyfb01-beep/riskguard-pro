import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import {
  ControlledDocument, DocumentClassification, DocumentType, DocumentVersion,
} from '../models/document.model';
import {
  ackStats, canManageDocuments, checkDocumentChange, currentVersion, displayStatus, draftVersion, hasAcknowledged, nextDocumentCode, suggestVersion,
} from '../utils/documents';
import { todayIso } from '../utils/action-plans';
import { EvidenceFile } from '../models/evidence.model';

export interface DocumentDraft {
  title: string;
  type: DocumentType;
  description: string;
  owner: string;
  classification: DocumentClassification;
  reviewMonths: number;
  audienceRoleIds: string[];
  requirementIds: string[];
  processes: string[];
}


/**
 * Gestión documental: registro maestro de políticas, manuales y procedimientos, con versiones
 * (archivo + aprobación) y confirmación de lectura de la versión vigente.
 */
@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly rs = inject(RiskDataService);

  readonly documents = signal<ControlledDocument[]>([]);

  /** Pedido de abrir un documento (avisos, cumplimiento, aprobaciones). */
  readonly openRequest = signal<{ id: string; at: number } | null>(null);
  open(id: string) {
    this.openRequest.set({ id, at: Date.now() });
  }

  /** Lo registra ApprovalService: indica si hay una aprobación en curso para un documento. */
  pendingApproval: (docId: string) => boolean = () => false;

  readonly sorted = computed(() => [...this.documents()].sort((a, b) => a.code.localeCompare(b.code)));

  private me() {
    return this.rs.currentProfile();
  }

  canManage() {
    return canManageDocuments(this.me());
  }

  get(id: string | undefined) {
    return id ? this.documents().find(d => d.id === id) : undefined;
  }

  status(d: ControlledDocument) {
    return displayStatus(d, todayIso(), this.pendingApproval(d.id));
  }

  current(d: ControlledDocument) {
    return currentVersion(d);
  }

  draft(d: ControlledDocument) {
    return draftVersion(d);
  }

  acks(d: ControlledDocument) {
    return ackStats(d, this.rs.userProfiles());
  }

  /** La persona debe confirmar la lectura de la versión vigente. */
  mustAcknowledge(d: ControlledDocument): boolean {
    const me = this.me();
    if (d.status === 'Obsoleto' || !currentVersion(d) || hasAcknowledged(d, me.name)) return false;
    const roles = d.audienceRoleIds ?? [];
    return !roles.length || roles.includes(me.roleId ?? '');
  }

  readonly myPending = computed(() => this.sorted().filter(d => this.mustAcknowledge(d)));

  /** Documentos que respaldan un requisito normativo. */
  forRequirement(reqId: string) {
    return this.sorted().filter(d => d.status === 'Activo' && d.requirementIds.includes(reqId));
  }

  readonly kpis = computed(() => {
    const today = todayIso();
    const active = this.documents().filter(d => d.status === 'Activo');
    const st = active.map(d => this.status(d));
    const withVersion = active.filter(d => currentVersion(d));
    const ack = withVersion.map(d => this.acks(d));
    const total = ack.reduce((s, a) => s + a.total, 0);
    const done = ack.reduce((s, a) => s + a.done, 0);
    return {
      vigentes: st.filter(s => s === 'Vigente').length,
      vencidos: st.filter(s => s === 'Revisión vencida').length,
      enAprobacion: st.filter(s => s === 'En aprobación').length,
      borradores: st.filter(s => s === 'Borrador').length,
      porVencer: withVersion.filter(d => d.nextReviewDate && d.nextReviewDate >= today && d.nextReviewDate <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)).length,
      lectura: total ? Math.round((done / total) * 100) : null,
      obsoletos: this.documents().length - active.length,
    };
  });

  // ---------------------------------------------------------------------------

  private fail(message: string): never {
    this.rs.permissionNotice.set({ message, at: Date.now() });
    throw new Error(message);
  }

  private commit(prev: ControlledDocument | null, next: ControlledDocument) {
    const err = checkDocumentChange(prev, next, this.me());
    if (err) this.fail(err);
    this.documents.update(l => (prev ? l.map(d => (d.id === next.id ? next : d)) : [...l, next]));
    return next;
  }

  private log(action: 'GESTIÓN_DOCUMENTO' | 'LECTURA_DOCUMENTO', d: ControlledDocument, details: string) {
    return this.rs.appendAuditLog(action, 'Documento', d.code, details);
  }

  async create(draft: DocumentDraft): Promise<ControlledDocument> {
    if (!draft.title.trim()) this.fail('Indique el título del documento.');
    const code = nextDocumentCode(this.documents(), draft.type);
    const d: ControlledDocument = {
      ...draft, id: `doc-${code.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`, code, title: draft.title.trim(),
      versions: [], acknowledgments: [], status: 'Activo', createdBy: this.me().name, createdAt: new Date().toISOString(),
    };
    this.commit(null, d);
    await this.log('GESTIÓN_DOCUMENTO', d, `Documento creado: ${d.code} ${d.title} (${d.type}, revisión cada ${d.reviewMonths} meses).`);
    return d;
  }

  async edit(id: string, draft: DocumentDraft) {
    const prev = this.get(id) ?? this.fail('Documento no encontrado.');
    const next = { ...prev, ...draft, title: draft.title.trim() };
    this.commit(prev, next);
    await this.log('GESTIÓN_DOCUMENTO', next, `Datos actualizados de ${next.code} ${next.title}.`);
  }

  async newVersion(id: string, version: string, changeSummary: string): Promise<DocumentVersion> {
    const prev = this.get(id) ?? this.fail('Documento no encontrado.');
    if (draftVersion(prev)) this.fail('Ya hay un borrador: complételo o elimínelo.');
    if (!version.trim()) this.fail('Indique el número de versión.');
    if (prev.versions.some(v => v.version === version.trim())) this.fail(`La versión ${version.trim()} ya existe.`);
    const v: DocumentVersion = {
      id: `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, version: version.trim(), changeSummary: changeSummary.trim(),
      status: 'Borrador', createdBy: this.me().name, createdAt: new Date().toISOString(),
    };
    this.commit(prev, { ...prev, versions: [...prev.versions, v] });
    await this.log('GESTIÓN_DOCUMENTO', prev, `Borrador v${v.version} de ${prev.code}. ${v.changeSummary}`);
    return v;
  }

  /** Asocia el archivo cargado al borrador (lo llama el componente al terminar la carga). */
  setVersionFile(id: string, versionId: string, f: EvidenceFile) {
    const prev = this.get(id);
    if (!prev) return;
    this.commit(prev, {
      ...prev, versions: prev.versions.map(v => (v.id === versionId && v.status === 'Borrador' ? { ...v, fileId: f.id, fileName: f.fileName, sha256: f.sha256 } : v)),
    });
  }

  async updateDraft(id: string, versionId: string, version: string, changeSummary: string) {
    const prev = this.get(id) ?? this.fail('Documento no encontrado.');
    this.commit(prev, { ...prev, versions: prev.versions.map(v => (v.id === versionId && v.status === 'Borrador' ? { ...v, version: version.trim(), changeSummary: changeSummary.trim() } : v)) });
  }

  async removeDraft(id: string, versionId: string) {
    const prev = this.get(id) ?? this.fail('Documento no encontrado.');
    const v = prev.versions.find(x => x.id === versionId && x.status === 'Borrador') ?? this.fail('Solo se elimina un borrador.');
    if (this.pendingApproval(id)) this.fail('El borrador está en aprobación: anule la solicitud primero.');
    this.commit(prev, { ...prev, versions: prev.versions.filter(x => x.id !== versionId) });
    await this.log('GESTIÓN_DOCUMENTO', prev, `Borrador v${v.version} de ${prev.code} eliminado.`);
  }

  async markObsolete(id: string, reason: string) {
    const prev = this.get(id) ?? this.fail('Documento no encontrado.');
    if (!reason.trim()) this.fail('Indique el motivo.');
    if (this.pendingApproval(id)) this.fail('Hay una aprobación en curso: anúlela primero.');
    const next: ControlledDocument = { ...prev, status: 'Obsoleto', obsoleteReason: reason.trim() };
    this.commit(prev, next);
    await this.log('GESTIÓN_DOCUMENTO', next, `${next.code} ${next.title} marcado obsoleto: ${reason.trim()}`);
  }

  async acknowledge(id: string) {
    const prev = this.get(id) ?? this.fail('Documento no encontrado.');
    const v = currentVersion(prev) ?? this.fail('El documento no tiene versión vigente.');
    if (hasAcknowledged(prev, this.me().name)) return;
    const next = { ...prev, acknowledgments: [...prev.acknowledgments, { userName: this.me().name, versionId: v.id, at: new Date().toISOString() }] };
    this.commit(prev, next);
    await this.log('LECTURA_DOCUMENTO', next, `${this.me().name} confirmó la lectura de ${next.code} ${next.title} v${v.version}.`);
  }

  suggestVersion(d: ControlledDocument, major = true) {
    return suggestVersion(d, major);
  }

  // ---------------------------------------------------------------------------

}
