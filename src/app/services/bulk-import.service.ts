import { Injectable, WritableSignal, inject } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { ResilienceService } from './resilience.service';
import { SecurityService } from './security.service';
import { CatalogService } from './catalog.service';
import { PersistenceService } from './persistence.service';
import { apiFetch } from './api-fetch';
import { BulkContext, BulkEntity, BulkRow, BulkSpec, bulkLedgerDetails, providerOptions } from '../utils/bulk-import';

/**
 * Carga masiva: arma el contexto (listas de la organización y registros actuales) y guarda.
 * Con base de datos, el servidor guarda todo en una transacción y luego se recargan los datos;
 * en modo demostración se aplica a los datos en memoria.
 */
@Injectable({ providedIn: 'root' })
export class BulkImportService {
  private readonly rs = inject(RiskDataService);
  private readonly res = inject(ResilienceService);
  private readonly sec = inject(SecurityService);
  private readonly cat = inject(CatalogService);
  private readonly persistence = inject(PersistenceService);

  private seq = 0;

  private signalFor(entity: BulkEntity): WritableSignal<{ id: string }[]> {
    const map: Record<BulkEntity, WritableSignal<unknown[]>> = {
      areas: this.cat.areas as WritableSignal<unknown[]>,
      processes: this.cat.processes as WritableSignal<unknown[]>,
      users: this.rs.userProfiles as WritableSignal<unknown[]>,
      controls: this.rs.controls as WritableSignal<unknown[]>,
      providers: this.res.providers as WritableSignal<unknown[]>,
      'info-assets': this.sec.assets as WritableSignal<unknown[]>,
      flaws: this.rs.flaws as WritableSignal<unknown[]>,
    };
    return map[entity] as WritableSignal<{ id: string }[]>;
  }

  context(spec: BulkSpec, updateExisting: boolean): BulkContext {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const me = this.rs.currentProfile();
    const stamp = Date.now().toString(36);
    return {
      today,
      nowStamp: `${today} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      actorName: me.name,
      actorRole: me.role,
      lists: {
        processes: this.cat.processNames(),
        areas: this.cat.activeAreas().map(a => a.name),
        roles: this.rs.organizationalRoles().map(r => r.title),
        providers: providerOptions(this.res.providers()),
        providerCategories: this.cat.providerCatalogs().categories,
        biaProcesses: this.res.biaProcesses().map(b => b.name),
      },
      areas: this.cat.areas(),
      roles: this.rs.organizationalRoles().map(r => ({ id: r.id, title: r.title, department: r.department, badge: r.badge, permissions: r.permissions })),
      providers: this.res.providers(),
      bia: this.res.biaProcesses(),
      existing: this.signalFor(spec.entity)(),
      allProcesses: this.cat.processes(),
      updateExisting,
      newId: prefix => `${prefix}-${stamp}-${(++this.seq).toString(36)}`,
      ufTable: this.cat.currency() === 'CLP' ? this.cat.ufTable() : undefined,
    };
  }

  /** Guarda las filas válidas. Devuelve cuántos se crearon y actualizaron. */
  async apply(spec: BulkSpec, rows: BulkRow[], fileName: string): Promise<{ created: number; updated: number }> {
    const records = rows.filter(r => r.record && (r.action === 'crear' || r.action === 'actualizar')).map(r => r.record!);
    if (!records.length) return { created: 0, updated: 0 };
    if (this.persistence.mode() === 'database') {
      const resp = await apiFetch(`/api/import/${spec.entity}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records, fileName }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 401) this.persistence.sessionExpired.set(true);
        throw new Error(data?.error || `Error ${resp.status} en la carga`);
      }
      await this.persistence.reload();
      return { created: data.created, updated: data.updated };
    }
    // Modo demostración: en memoria.
    const sig = this.signalFor(spec.entity);
    const byId = new Map(records.map(r => [r.id, r]));
    const current = sig();
    const updated = current.filter(x => byId.has(x.id)).length;
    const created = records.length - updated;
    const fresh = records.filter(r => !current.some(x => x.id === r.id));
    sig.set([...(spec.entity === 'flaws' || spec.entity === 'controls' ? fresh : []), ...current.map(x => byId.get(x.id) ?? x),
      ...(spec.entity === 'flaws' || spec.entity === 'controls' ? [] : fresh)]);
    const me = this.rs.currentProfile();
    const self = records.find(r => r.id === me.id);
    if (spec.entity === 'users' && self) this.rs.currentProfile.set(self as typeof me);
    await this.rs.appendAuditLog('CARGA_MASIVA', 'Carga masiva', spec.label, bulkLedgerDetails(spec, created, updated, fileName));
    return { created, updated };
  }
}
