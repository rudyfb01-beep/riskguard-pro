import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { DocumentService } from './document.service';
import { apiFetch } from './api-fetch';
import { DEFAULT_EVIDENCE_MAX_MB, EvidenceEntity, EvidenceFile } from '../models/evidence.model';
import { AuditLogEntry } from '../models/risk.model';
import {
  canAttachEvidence, canRemoveEvidence, checkEvidenceFile, evidenceFor, isPreviewable, safeFileName,
} from '../utils/evidence';

export interface EvidenceTarget {
  entity: EvidenceEntity;
  id: string;
  context?: string;
  /** Código o nombre del registro (para la bitácora). */
  label: string;
}


/**
 * Evidencias (archivos reales). El servidor guarda el contenido, calcula el SHA-256 y registra
 * la carga en la bitácora; aquí se mantienen los metadatos.
 */
@Injectable({ providedIn: 'root' })
export class EvidenceService {
  private readonly rs = inject(RiskDataService);
  private readonly docs = inject(DocumentService);

  readonly files = signal<EvidenceFile[]>([]);
  readonly maxBytes = signal(DEFAULT_EVIDENCE_MAX_MB * 1024 * 1024);
  /** Lo registra PersistenceService: incorpora el bloque de bitácora que escribió el servidor. */
  ledgerHook: (e: AuditLogEntry) => void = () => undefined;

  readonly active = computed(() => this.files().filter(f => !f.deletedAt));

  /** Lo llama PersistenceService al cargar los datos del servidor. */
  hydrate(list: EvidenceFile[]) {
    this.files.set(list);
    void apiFetch('/api/evidence/config').then(r => (r.ok ? r.json() : null)).then(c => { if (c?.maxBytes) this.maxBytes.set(c.maxBytes); }).catch(() => undefined);
  }

  forEntity(entity: EvidenceEntity, id: string | undefined, context?: string): EvidenceFile[] {
    return evidenceFor(this.files(), entity, id, context);
  }

  count(entity: EvidenceEntity, id: string | undefined): number {
    return this.forEntity(entity, id).length;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canAttach(entity: EvidenceEntity, parent: any): boolean {
    return canAttachEvidence(entity, this.rs.currentProfile(), parent);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  canRemove(f: EvidenceFile, parent: any): boolean {
    return canRemoveEvidence(f, this.rs.currentProfile(), parent);
  }

  async upload(file: File, target: EvidenceTarget, description?: string): Promise<EvidenceFile> {
    const name = safeFileName(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkEvidenceFile(name, bytes, this.maxBytes());
    if ('error' in check) throw new Error(`${name}: ${check.error}`);

    const q = new URLSearchParams({ entityType: target.entity, entityId: target.id });
    if (target.context) q.set('context', target.context);
    if (description?.trim()) q.set('description', description.trim());
    const resp = await apiFetch(`/api/evidence?${q}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name) }, body: bytes,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(`${name}: ${data?.error || `error ${resp.status}`}`);
    this.files.update(l => [...l, data.file as EvidenceFile]);
    if (data.ledger) this.ledgerHook(data.ledger);
    return data.file;
  }

  /** Descarga o, para PDF e imágenes con `preview`, abre en otra pestaña. */
  open(f: EvidenceFile, preview = false) {
    const inline = preview && isPreviewable(f.mimeType);
    const url = `/api/evidence/${encodeURIComponent(f.id)}${inline ? '?inline=1' : ''}`;
    if (inline) window.open(url, '_blank', 'noopener');
    else this.clickLink(url, f.fileName);
  }

  private clickLink(href: string, name: string) {
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** Recalcula el SHA-256 del contenido guardado y lo compara con el registrado al cargar. */
  async verify(f: EvidenceFile): Promise<boolean> {
    const resp = await apiFetch(`/api/evidence/${encodeURIComponent(f.id)}/verify`);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    return !!data.ok;
  }

  async remove(f: EvidenceFile, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('Indique el motivo de la baja.');
    const resp = await apiFetch(`/api/evidence/${encodeURIComponent(f.id)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    this.files.update(l => l.map(x => (x.id === f.id ? data.file : x)));
    if (data.ledger) this.ledgerHook(data.ledger);
  }

}
