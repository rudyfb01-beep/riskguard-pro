import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { DocumentService } from './document.service';
import { apiFetch } from './api-fetch';
import { DEFAULT_EVIDENCE_MAX_MB, EVIDENCE_ENTITY_LABELS, EvidenceEntity, EvidenceFile } from '../models/evidence.model';
import { AuditLogEntry } from '../models/risk.model';
import {
  canAttachEvidence, canRemoveEvidence, checkEvidenceFile, evidenceFor, formatBytes, isPreviewable, safeFileName,
} from '../utils/evidence';

export interface EvidenceTarget {
  entity: EvidenceEntity;
  id: string;
  context?: string;
  /** Código o nombre del registro (para la bitácora). */
  label: string;
}

/** PDF mínimo de una página con algunas líneas de texto (solo para la demostración). */
function demoPdf(lines: string[]): Uint8Array {
  const ascii = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?').replace(/([()\\])/g, '\\$1');
  const wrapped = lines.filter(Boolean).flatMap(l => ascii(l).match(/.{1,80}(\s|$)/g) ?? []);
  const text = wrapped.map((l, i) => `BT /F1 ${i ? 10 : 14} Tf 50 ${780 - i * 18} Td (${l.trim()}) Tj ET`).join('\n');
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${text.length}>>\nstream\n${text}\nendstream`, '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj${o}endobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Evidencias (archivos reales). Con base de datos el servidor guarda el contenido, calcula el
 * SHA-256 y registra la carga en la bitácora; aquí se mantienen los metadatos. En modo
 * demostración los archivos quedan en la memoria del navegador.
 */
@Injectable({ providedIn: 'root' })
export class EvidenceService {
  private readonly rs = inject(RiskDataService);
  private readonly docs = inject(DocumentService);

  readonly files = signal<EvidenceFile[]>([]);
  readonly maxBytes = signal(DEFAULT_EVIDENCE_MAX_MB * 1024 * 1024);
  /** true cuando los datos vienen del servidor (lo fija PersistenceService). */
  readonly serverMode = signal(false);
  /** Lo registra PersistenceService: incorpora el bloque de bitácora que escribió el servidor. */
  ledgerHook: (e: AuditLogEntry) => void = () => undefined;

  private readonly blobs = new Map<string, Blob>();

  readonly active = computed(() => this.files().filter(f => !f.deletedAt));

  constructor() {
    void this.seedDemo();
  }

  /** Lo llama PersistenceService al cargar los datos del servidor. */
  hydrate(list: EvidenceFile[]) {
    this.serverMode.set(true);
    this.files.set(list);
    this.blobs.clear();
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

    if (this.serverMode()) {
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

    const me = this.rs.currentProfile();
    const sha256 = await sha256Hex(bytes);
    const f: EvidenceFile = {
      id: `evd-demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, entityType: target.entity, entityId: target.id,
      context: target.context, fileName: name, mimeType: check.mime, sizeBytes: bytes.length, sha256, description: description?.trim() || undefined,
      uploadedBy: me.name, uploadedByEmail: me.email, uploadedAt: new Date().toISOString(),
    };
    this.blobs.set(f.id, new Blob([bytes], { type: check.mime }));
    this.files.update(l => [...l, f]);
    await this.rs.appendAuditLog('CARGA_EVIDENCIA', 'Evidencia', target.label,
      `${EVIDENCE_ENTITY_LABELS[target.entity]} ${target.label}${target.context ? ` (${target.context})` : ''}: "${name}" (${formatBytes(bytes.length)}), SHA-256 ${sha256}.`);
    return f;
  }

  /** Descarga o, para PDF e imágenes con `preview`, abre en otra pestaña. */
  open(f: EvidenceFile, preview = false) {
    const inline = preview && isPreviewable(f.mimeType);
    if (this.serverMode()) {
      const url = `/api/evidence/${encodeURIComponent(f.id)}${inline ? '?inline=1' : ''}`;
      if (inline) window.open(url, '_blank', 'noopener');
      else this.clickLink(url, f.fileName);
      return;
    }
    const blob = this.blobs.get(f.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    if (inline) window.open(url, '_blank', 'noopener');
    else this.clickLink(url, f.fileName);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
    if (this.serverMode()) {
      const resp = await apiFetch(`/api/evidence/${encodeURIComponent(f.id)}/verify`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      return !!data.ok;
    }
    const blob = this.blobs.get(f.id);
    if (!blob) throw new Error('El archivo no está disponible.');
    return (await sha256Hex(new Uint8Array(await blob.arrayBuffer()))) === f.sha256;
  }

  async remove(f: EvidenceFile, reason: string, label: string): Promise<void> {
    if (!reason.trim()) throw new Error('Indique el motivo de la baja.');
    if (this.serverMode()) {
      const resp = await apiFetch(`/api/evidence/${encodeURIComponent(f.id)}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      this.files.update(l => l.map(x => (x.id === f.id ? data.file : x)));
      if (data.ledger) this.ledgerHook(data.ledger);
      return;
    }
    const me = this.rs.currentProfile();
    this.files.update(l => l.map(x => (x.id === f.id ? { ...x, deletedAt: new Date().toISOString(), deletedBy: me.name, deleteReason: reason.trim() } : x)));
    await this.rs.appendAuditLog('BAJA_EVIDENCIA', 'Evidencia', label,
      `Baja de "${f.fileName}" (SHA-256 ${f.sha256}) de ${EVIDENCE_ENTITY_LABELS[f.entityType]} ${label}. Motivo: ${reason.trim()}. El archivo se conserva.`);
  }

  // ---------------------------------------------------------------------------

  /** Archivos de ejemplo (modo demostración): planillas y actas de texto con contenido real. */
  private async seedDemo() {
    const at = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
    const docs: { entity: EvidenceEntity; id: string; context?: string; name: string; by: string; days: number; desc: string; body: string }[] = [
      {
        entity: 'controls', id: 'ctr-2', name: 'Muestra_transferencias_octubre.csv', by: 'Ing. Carlos Mendoza', days: 12,
        desc: 'Muestra de 25 transferencias con doble firma verificada.',
        body: 'fecha,operacion,monto,firma_1,firma_2,conforme\n2026-10-03,TRF-88412,12500000,MROJAS,CMENDOZA,SI\n2026-10-07,TRF-88590,8400000,MROJAS,PVALDES,SI\n2026-10-15,TRF-89011,31000000,CMENDOZA,PVALDES,SI\n',
      },
      {
        entity: 'controls', id: 'ctr-1', name: 'Acta_revision_accesos_Q3.txt', by: 'Ing. Alejandro Vega', days: 30,
        desc: 'Revisión trimestral de cuentas privilegiadas.',
        body: 'ACTA DE REVISIÓN DE ACCESOS PRIVILEGIADOS - TERCER TRIMESTRE\n\nCuentas revisadas: 48\nCuentas dadas de baja: 3 (ex colaboradores)\nExcepciones: ninguna pendiente.\n\nRevisó: Ing. Alejandro Vega (CISO)\n',
      },
    ];
    const list: EvidenceFile[] = [];
    for (const d of docs) {
      const bytes = new TextEncoder().encode(d.body);
      const mime = d.name.endsWith('.csv') ? 'text/csv' : 'text/plain';
      const f: EvidenceFile = {
        id: `evd-demo-${list.length + 1}`, entityType: d.entity, entityId: d.id, context: d.context, fileName: d.name, mimeType: mime,
        sizeBytes: bytes.length, sha256: await sha256Hex(bytes), description: d.desc, uploadedBy: d.by, uploadedAt: at(d.days),
      };
      this.blobs.set(f.id, new Blob([bytes], { type: mime }));
      list.push(f);
    }
    // Archivos de las versiones de los documentos de ejemplo (PDF de una página).
    for (const d of this.docs.documents()) {
      for (const v of d.versions) {
        if (!v.fileId) continue;
        const bytes = demoPdf([`${d.code} ${d.title}`, `Version ${v.version} - ${v.status}`, v.changeSummary, d.description]);
        const f: EvidenceFile = {
          id: v.fileId, entityType: 'documents', entityId: d.id, context: v.id, fileName: v.fileName ?? `${d.code}_v${v.version}.pdf`, mimeType: 'application/pdf',
          sizeBytes: bytes.length, sha256: await sha256Hex(bytes), uploadedBy: v.createdBy, uploadedAt: v.createdAt,
        };
        this.blobs.set(f.id, new Blob([bytes as BlobPart], { type: 'application/pdf' }));
        list.push(f);
      }
    }
    if (!this.serverMode()) this.files.set(list);
  }
}
