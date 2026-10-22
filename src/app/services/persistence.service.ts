import { Injectable, WritableSignal, effect, inject, signal, untracked } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { ResilienceService } from './resilience.service';
import { AuditLogEntry, UserProfile } from '../models/risk.model';

export type DataMode = 'loading' | 'database' | 'demo' | 'error';

interface Identified { id: string }

interface Collection {
  entity: string;      // nombre en la API (/api/data/:entity/:id)
  key: string;         // propiedad en la respuesta de /api/data
  sig: WritableSignal<Identified[]>;
  snapshot: Map<string, Identified>;
}

interface Setting {
  key: string;
  sig: WritableSignal<unknown>;
  last: string;
}

const PROFILE_STORAGE_KEY = 'riskguard.profileId';

/**
 * Sincroniza el estado de la aplicación con PostgreSQL.
 *
 * Al iniciar carga todo desde /api/data. Luego observa cada colección: como
 * los servicios actualizan los datos de forma inmutable, un objeto con una
 * referencia nueva es un objeto modificado. Los cambios se envían en orden de
 * dependencias (p. ej. controles antes que riesgos) por una cola serial.
 * Sin base de datos configurada la app queda en modo demostración.
 */
@Injectable({ providedIn: 'root' })
export class PersistenceService {
  private readonly rs = inject(RiskDataService);
  private readonly res = inject(ResilienceService);

  readonly mode = signal<DataMode>('loading');
  readonly loadError = signal<string | null>(null);
  readonly pending = signal(0);
  readonly saveError = signal<string | null>(null);
  readonly lastSavedAt = signal<Date | null>(null);

  private enabled = false;
  private queue: Promise<void> = Promise.resolve();
  private failed = new Map<string, Set<string>>(); // entity → ids con error
  private ledgerKnown = new Set<string>();

  // Orden de dependencias: debe coincidir con ENTITY_ORDER del servidor.
  private readonly collections: Collection[] = [
    this.col('roles', 'roles', this.rs.organizationalRoles),
    this.col('users', 'users', this.rs.userProfiles),
    this.col('controls', 'controls', this.rs.controls),
    this.col('risks', 'risks', this.rs.risks),
    this.col('providers', 'providers', this.res.providers),
    this.col('regulatory-milestones', 'regulatoryMilestones', this.rs.regulatoryMilestones),
    this.col('flaws', 'flaws', this.rs.flaws),
    this.col('alerts', 'alerts', this.rs.alerts),
    this.col('audits', 'audits', this.rs.audits),
    this.col('kris', 'kris', this.rs.kriDefinitions),
    this.col('bia', 'bia', this.res.biaProcesses),
    this.col('plans', 'plans', this.res.plans),
    this.col('continuity-tests', 'continuityTests', this.res.tests),
  ];

  private readonly settings: Setting[] = [
    { key: 'current_industry', sig: this.rs.currentIndustry as WritableSignal<unknown>, last: '' },
    { key: 'global_notification_preferences', sig: this.rs.globalNotificationSettings as WritableSignal<unknown>, last: '' },
    { key: 'loss_registration_threshold_usd', sig: this.rs.lossRegistrationThresholdUSD as WritableSignal<unknown>, last: '' },
  ];

  constructor() {
    // Observa todas las colecciones; solo actúa una vez cargados los datos.
    effect(() => {
      const values = this.collections.map(c => c.sig());
      const settingValues = this.settings.map(s => s.sig());
      const ledger = this.rs.auditTrail();
      if (!this.enabled) return;
      untracked(() => this.diffAndQueue(values, settingValues, ledger));
    });

    // Recordar el perfil elegido en este navegador.
    effect(() => {
      const id = this.rs.currentProfile().id;
      if (this.mode() === 'database') {
        try { localStorage.setItem(PROFILE_STORAGE_KEY, id); } catch { /* almacenamiento no disponible */ }
      }
    });
  }

  private col<T extends Identified>(entity: string, key: string, sig: WritableSignal<T[]>): Collection {
    return { entity, key, sig: sig as unknown as WritableSignal<Identified[]>, snapshot: new Map() };
  }

  /** Carga inicial desde la API. */
  async init(): Promise<void> {
    this.mode.set('loading');
    this.loadError.set(null);
    try {
      const resp = await fetch('/api/data');
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      if (data.mode === 'demo') {
        this.mode.set('demo');
        return;
      }
      this.hydrate(data);
      this.mode.set('database');
    } catch (err) {
      this.loadError.set((err as Error).message);
      this.mode.set('error');
    }
  }

  private hydrate(data: Record<string, unknown>) {
    this.enabled = false;
    for (const c of this.collections) {
      const list = (data[c.key] as Identified[]) ?? [];
      c.sig.set(list);
      c.snapshot = new Map(list.map(o => [o.id, o]));
    }
    const ledger = (data['ledger'] as AuditLogEntry[]) ?? [];
    this.rs.auditTrail.set(ledger);
    this.ledgerKnown = new Set(ledger.map(e => e.id));

    const settings = (data['settings'] as Record<string, unknown>) ?? {};
    for (const s of this.settings) {
      if (settings[s.key] !== undefined && settings[s.key] !== null) s.sig.set(settings[s.key]);
      s.last = JSON.stringify(s.sig());
    }

    // Perfil activo: el recordado en este navegador o el primero disponible.
    const users = this.rs.userProfiles();
    let saved: string | null = null;
    try { saved = localStorage.getItem(PROFILE_STORAGE_KEY); } catch { /* sin almacenamiento */ }
    const profile: UserProfile | undefined =
      users.find(u => u.id === saved) ?? users.find(u => u.permissions?.canManageRoles) ?? users[0];
    if (profile) this.rs.currentProfile.set(profile);

    this.enabled = true;
  }

  private diffAndQueue(values: Identified[][], settingValues: unknown[], ledger: AuditLogEntry[]) {
    const upserts: { entity: string; obj: Identified }[] = [];
    const deletes: { entity: string; id: string }[] = [];

    this.collections.forEach((c, i) => {
      const current = values[i];
      const next = new Map<string, Identified>();
      for (const obj of current) {
        next.set(obj.id, obj);
        if (c.snapshot.get(obj.id) !== obj) upserts.push({ entity: c.entity, obj });
      }
      for (const id of c.snapshot.keys()) {
        if (!next.has(id)) deletes.push({ entity: c.entity, id });
      }
      c.snapshot = next;
    });

    for (const u of upserts) this.enqueue(() => this.send('PUT', `/api/data/${u.entity}/${encodeURIComponent(u.obj.id)}`, u.obj), u.entity, u.obj.id);
    for (const d of deletes.reverse()) this.enqueue(() => this.send('DELETE', `/api/data/${d.entity}/${encodeURIComponent(d.id)}`), d.entity, d.id);

    this.settings.forEach((s, i) => {
      const v = JSON.stringify(settingValues[i]);
      if (v !== s.last) {
        s.last = v;
        this.enqueue(() => this.send('PUT', `/api/settings/${s.key}`, { value: settingValues[i] }), 'settings', s.key);
      }
    });

    const fresh = ledger.filter(e => !this.ledgerKnown.has(e.id)).sort((a, b) => a.blockNumber - b.blockNumber);
    for (const e of fresh) {
      this.ledgerKnown.add(e.id);
      this.enqueue(() => this.appendLedger(e), 'ledger', e.id);
    }
  }

  private enqueue(task: () => Promise<void>, entity: string, id: string) {
    this.pending.update(n => n + 1);
    this.queue = this.queue.then(async () => {
      try {
        await task();
        this.failed.get(entity)?.delete(id);
        this.lastSavedAt.set(new Date());
        if (![...this.failed.values()].some(s => s.size > 0)) this.saveError.set(null);
      } catch (err) {
        if (!this.failed.has(entity)) this.failed.set(entity, new Set());
        this.failed.get(entity)!.add(id);
        this.saveError.set((err as Error).message);
      } finally {
        this.pending.update(n => n - 1);
      }
    });
  }

  private async send(method: 'PUT' | 'DELETE', url: string, body?: unknown): Promise<void> {
    const resp = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data?.error || `Error ${resp.status} al guardar`);
    }
  }

  /** El servidor asigna bloque, hora y hash; se reemplaza la entrada local. */
  private async appendLedger(e: AuditLogEntry): Promise<void> {
    const resp = await fetch('/api/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: e.id, userName: e.userName, userRole: e.userRole, action: e.action,
        entityType: e.entityType, entityCode: e.entityCode, details: e.details,
      }),
    });
    const saved = await resp.json();
    if (!resp.ok) throw new Error(saved?.error || 'Error al registrar en la bitácora');

    const list = this.rs.auditTrail();
    const idx = list.findIndex(x => x.id === e.id);
    const predecessor = list.find(x => x.blockNumber === saved.blockNumber - 1);
    if (idx >= 0 && predecessor && predecessor.hash === saved.previousHash) {
      this.rs.auditTrail.update(l => l.map(x => (x.id === e.id ? saved : x)));
    } else {
      // Otro usuario agregó bloques: se recarga la cadena completa del servidor.
      const full = await fetch('/api/ledger').then(r => r.json());
      if (Array.isArray(full)) {
        for (const x of full) this.ledgerKnown.add(x.id);
        this.rs.auditTrail.set(full);
      }
    }
  }

  /** Reintenta los objetos cuyo guardado falló. */
  retryFailed() {
    for (const [entity, ids] of this.failed) {
      if (entity === 'settings') {
        for (const key of ids) {
          const s = this.settings.find(x => x.key === key);
          if (s) this.enqueue(() => this.send('PUT', `/api/settings/${key}`, { value: s.sig() }), 'settings', key);
        }
        continue;
      }
      if (entity === 'ledger') {
        for (const id of ids) {
          const e = this.rs.auditTrail().find(x => x.id === id);
          if (e) this.enqueue(() => this.appendLedger(e), 'ledger', id);
        }
        continue;
      }
      const c = this.collections.find(x => x.entity === entity);
      if (!c) continue;
      for (const id of ids) {
        const obj = c.sig().find(o => o.id === id);
        this.enqueue(
          () => (obj ? this.send('PUT', `/api/data/${entity}/${encodeURIComponent(id)}`, obj) : this.send('DELETE', `/api/data/${entity}/${encodeURIComponent(id)}`)),
          entity, id
        );
      }
    }
  }

  /** Espera a que se vacíe la cola (útil en pruebas). */
  flush(): Promise<void> {
    return this.queue;
  }
}
