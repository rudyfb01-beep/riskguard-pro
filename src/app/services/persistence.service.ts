import { Injectable, WritableSignal, effect, inject, signal, untracked } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { ResilienceService } from './resilience.service';
import { SecurityService } from './security.service';
import { AprService } from './apr.service';
import { CatalogService } from './catalog.service';
import { ComplianceService } from './compliance.service';
import { ActionPlanService } from './action-plan.service';
import { SurveyService } from './survey.service';
import { AuditLogEntry, UserProfile } from '../models/risk.model';

export type DataMode = 'loading' | 'login' | 'database' | 'demo' | 'error';

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

/** Cabecera anti-CSRF exigida por el servidor en toda escritura. */
export const API_HEADERS = { 'X-Requested-With': 'RiskGuard' } as const;

/** fetch hacia la API propia: misma cookie de sesión y cabecera de seguridad. */
export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(API_HEADERS)) headers.set(k, v);
  return fetch(url, { ...init, headers, credentials: 'same-origin' });
}

/**
 * Sincroniza el estado de la aplicación con la base de datos del servidor (PostgreSQL o SQLite).
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
  private readonly sec = inject(SecurityService);
  private readonly apr = inject(AprService);
  private readonly cat = inject(CatalogService);
  private readonly comp = inject(ComplianceService);
  private readonly plans = inject(ActionPlanService);
  private readonly surveys = inject(SurveyService);

  readonly mode = signal<DataMode>('loading');
  readonly loadError = signal<string | null>(null);
  readonly pending = signal(0);
  readonly saveError = signal<string | null>(null);
  readonly lastSavedAt = signal<Date | null>(null);
  /** La sesión venció mientras se trabajaba: se pide iniciar sesión sin perder cambios. */
  readonly sessionExpired = signal(false);
  readonly sessionUser = signal<UserProfile | null>(null);

  private enabled = false;
  private queue: Promise<void> = Promise.resolve();
  private failed = new Map<string, Set<string>>(); // entity → ids con error
  private ledgerKnown = new Set<string>();

  // Orden de dependencias: debe coincidir con ENTITY_ORDER del servidor.
  private readonly collections: Collection[] = [
    this.col('areas', 'areas', this.cat.areas),
    this.col('processes', 'processes', this.cat.processes),
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
    this.col('info-assets', 'infoAssets', this.sec.assets),
    this.col('vulnerabilities', 'vulnerabilities', this.sec.vulnerabilities),
    this.col('security-assessment', 'securityAssessment', this.sec.assessment),
    this.col('norms', 'norms', this.comp.norms),
    this.col('compliance', 'compliance', this.comp.requirements),
    this.col('security-tests', 'securityTests', this.sec.securityTests),
    this.col('action-plans', 'actionPlans', this.plans.plans),
    this.col('survey-campaigns', 'surveyCampaigns', this.surveys.campaigns),
    this.col('survey-responses', 'surveyResponses', this.surveys.responses),
  ];

  private readonly settings: Setting[] = [
    { key: 'current_industry', sig: this.rs.currentIndustry as WritableSignal<unknown>, last: '' },
    { key: 'global_notification_preferences', sig: this.rs.globalNotificationSettings as WritableSignal<unknown>, last: '' },
    { key: 'loss_registration_threshold_usd', sig: this.rs.lossRegistrationThresholdUSD as WritableSignal<unknown>, last: '' },
    { key: 'apr_operational_inputs', sig: this.apr.inputs as WritableSignal<unknown>, last: '' },
    { key: 'general_parameters', sig: this.cat.generalParameters, last: '' },
    { key: 'risk_scale', sig: this.cat.riskScaleRaw, last: '' },
    { key: 'risk_appetite', sig: this.cat.riskAppetiteRaw, last: '' },
    { key: 'accounting_accounts', sig: this.cat.accountingAccountsRaw, last: '' },
    { key: 'provider_catalogs', sig: this.cat.providerCatalogsRaw, last: '' },
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
  }

  private col<T extends Identified>(entity: string, key: string, sig: WritableSignal<T[]>): Collection {
    return { entity, key, sig: sig as unknown as WritableSignal<Identified[]>, snapshot: new Map() };
  }

  /** Verifica la sesión y carga los datos (o pide iniciar sesión). */
  async init(): Promise<void> {
    this.mode.set('loading');
    this.loadError.set(null);
    try {
      const me = await apiFetch('/api/auth/me');
      const meData = await me.json().catch(() => ({}));
      if (me.status === 401) {
        this.mode.set('login');
        return;
      }
      if (!me.ok) throw new Error(meData?.error || `HTTP ${me.status}`);
      if (meData.mode === 'demo') {
        this.mode.set('demo');
        return;
      }
      this.sessionUser.set(meData.user);
      await this.loadData();
    } catch (err) {
      this.loadError.set((err as Error).message);
      this.mode.set('error');
    }
  }

  private async loadData(): Promise<void> {
    const resp = await apiFetch('/api/data');
    const data = await resp.json();
    if (resp.status === 401) {
      this.mode.set('login');
      return;
    }
    if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
    this.hydrate(data);
    this.rs.sessionLocked.set(true);
    this.mode.set('database');
  }

  /** Llamado por la pantalla de acceso tras verificar el código. */
  async onLoggedIn(user: UserProfile): Promise<void> {
    this.sessionUser.set(user);
    if (this.mode() === 'database') {
      // Sesión renovada a mitad de trabajo: reintentar lo que no se pudo guardar.
      this.sessionExpired.set(false);
      this.rs.currentProfile.set(this.rs.userProfiles().find(u => u.id === user.id) ?? user);
      this.retryFailed();
      return;
    }
    this.mode.set('loading');
    try {
      await this.loadData();
    } catch (err) {
      this.loadError.set((err as Error).message);
      this.mode.set('error');
    }
  }

  /**
   * Relee el usuario de la sesión para aplicar cambios de cargo o permisos hechos por un
   * administrador. Solo actualiza el perfil activo (no la lista de usuarios), así no genera escrituras.
   */
  async refreshSessionProfile(): Promise<void> {
    if (this.mode() !== 'database' || !this.sessionUser()) return;
    try {
      const resp = await apiFetch('/api/auth/me');
      if (resp.status === 401) { this.sessionExpired.set(true); return; }
      if (!resp.ok) return;
      const user = (await resp.json())?.user as UserProfile | undefined;
      if (!user) return;
      const cur = this.rs.currentProfile();
      if (JSON.stringify(cur.permissions) !== JSON.stringify(user.permissions) || cur.role !== user.role) {
        this.sessionUser.set(user);
        this.rs.currentProfile.set({ ...cur, role: user.role, roleId: user.roleId, department: user.department, permissions: user.permissions });
      }
    } catch {
      // Sin conexión: se reintenta en el próximo ciclo.
    }
  }

  async logout(): Promise<void> {
    await this.flush();
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    location.reload();
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

    // Perfil activo: el usuario de la sesión.
    const me = this.sessionUser();
    const profile: UserProfile | undefined = me ? (this.rs.userProfiles().find(u => u.id === me.id) ?? me) : this.rs.userProfiles()[0];
    if (profile) this.rs.currentProfile.set(profile);

    this.enabled = true;
  }

  private diffAndQueue(values: Identified[][], settingValues: unknown[], ledger: AuditLogEntry[]) {
    const upserts: { entity: string; obj: Identified }[] = [];
    const deletes: { entity: string; id: string }[] = [];
    let renamedCatalog = false;

    this.collections.forEach((c, i) => {
      const current = values[i];
      const next = new Map<string, Identified>();
      for (const obj of current) {
        next.set(obj.id, obj);
        const prev = c.snapshot.get(obj.id);
        if (prev !== obj) {
          upserts.push({ entity: c.entity, obj });
          // Renombrar un área o proceso: el servidor actualiza las referencias y luego se recargan.
          if ((c.entity === 'areas' || c.entity === 'processes') && prev
            && (prev as unknown as { name: string }).name !== (obj as unknown as { name: string }).name) renamedCatalog = true;
        }
      }
      for (const id of c.snapshot.keys()) {
        if (!next.has(id)) deletes.push({ entity: c.entity, id });
      }
      c.snapshot = next;
    });

    for (const u of upserts) this.enqueue(() => this.send('PUT', `/api/data/${u.entity}/${encodeURIComponent(u.obj.id)}`, u.obj), u.entity, u.obj.id);
    for (const d of deletes.reverse()) this.enqueue(() => this.send('DELETE', `/api/data/${d.entity}/${encodeURIComponent(d.id)}`), d.entity, d.id);
    if (renamedCatalog) this.enqueue(() => this.reloadAll(), 'reload', 'catalog-rename');

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

  /** Espera lo pendiente y recarga todo desde el servidor (tras operaciones hechas en el servidor). */
  async reload(): Promise<void> {
    await this.flush();
    await this.reloadAll();
  }

  /** Recarga todos los datos desde el servidor (tras cambios que el servidor propaga). */
  private async reloadAll(): Promise<void> {
    const resp = await apiFetch('/api/data');
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status} al recargar`);
    this.hydrate(data);
  }

  private async send(method: 'PUT' | 'DELETE', url: string, body?: unknown): Promise<void> {
    const resp = await apiFetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 401) this.sessionExpired.set(true);
      throw new Error(data?.error || `Error ${resp.status} al guardar`);
    }
  }

  /** El servidor asigna bloque, hora y hash; se reemplaza la entrada local. */
  private async appendLedger(e: AuditLogEntry): Promise<void> {
    const resp = await apiFetch('/api/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: e.id, userName: e.userName, userRole: e.userRole, action: e.action,
        entityType: e.entityType, entityCode: e.entityCode, details: e.details,
      }),
    });
    const saved = await resp.json();
    if (!resp.ok) {
      if (resp.status === 401) this.sessionExpired.set(true);
      throw new Error(saved?.error || 'Error al registrar en la bitácora');
    }

    const list = this.rs.auditTrail();
    const idx = list.findIndex(x => x.id === e.id);
    const predecessor = list.find(x => x.blockNumber === saved.blockNumber - 1);
    if (idx >= 0 && predecessor && predecessor.hash === saved.previousHash) {
      this.rs.auditTrail.update(l => l.map(x => (x.id === e.id ? saved : x)));
    } else {
      // Otro usuario agregó bloques: se recarga la cadena completa del servidor.
      const full = await apiFetch('/api/ledger').then(r => r.json());
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
