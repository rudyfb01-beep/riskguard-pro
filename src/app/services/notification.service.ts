import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { ActionPlanService } from './action-plan.service';
import { SurveyService } from './survey.service';
import { ApprovalService } from './approval.service';
import { ResilienceService } from './resilience.service';
import { SecurityService } from './security.service';
import { PersistenceService, apiFetch } from './persistence.service';
import { CatalogService } from './catalog.service';
import {
  AppNotification, DEFAULT_NOTIFICATION_PREFERENCE, NotificationDraft, NotificationPreference,
} from '../models/notification.model';
import { changeNotifications, normalizeNotificationSettings, scheduledNotifications } from '../utils/notifications';
import { todayIso } from '../utils/action-plans';

interface Identified { id: string }

export interface NavigateRequest { tab?: string; entityType?: string; entityId?: string; at: number }

const POLL_MS = 60_000;

/**
 * Bandeja de avisos. Con base de datos los genera el servidor (y envía los correos); aquí se
 * consultan cada minuto. En modo demostración se generan en el navegador con las mismas reglas.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly rs = inject(RiskDataService);
  private readonly plans = inject(ActionPlanService);
  private readonly surveys = inject(SurveyService);
  private readonly approvals = inject(ApprovalService);
  private readonly res = inject(ResilienceService);
  private readonly sec = inject(SecurityService);
  private readonly persistence = inject(PersistenceService);

  /** Parámetros generales (Mantenedores → Avisos); se guardan como ajuste del sistema. */
  readonly settingsRaw = inject(CatalogService).notificationSettingsRaw;
  readonly settings = computed(() => normalizeNotificationSettings(this.settingsRaw()));

  private readonly serverItems = signal<AppNotification[]>([]);
  private readonly demoItems = signal<AppNotification[]>([]);
  readonly preference = signal<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  readonly mailConfigured = signal<boolean | null>(null);
  /** Último aviso nuevo recibido (para mostrar un mensaje). */
  readonly incoming = signal<AppNotification | null>(null);
  readonly navigateRequest = signal<NavigateRequest | null>(null);

  readonly isDemo = computed(() => this.persistence.mode() !== 'database');

  readonly items = computed(() => {
    if (!this.isDemo()) return this.serverItems();
    const me = this.rs.currentProfile().email?.toLowerCase();
    return this.demoItems().filter(n => n.recipient === me).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  readonly unread = computed(() => this.items().filter(n => !n.readAt).length);
  readonly urgentUnread = computed(() => this.items().filter(n => !n.readAt && n.severity === 'urgente').length);

  private timer: ReturnType<typeof setInterval> | null = null;
  private known = new Set<string>();
  private demoSnapshots = new Map<string, Map<string, Identified>>();
  private demoStarted = false;
  private seeding = false;

  constructor() {
    // Con base de datos: consulta periódica y al volver a la pestaña.
    effect(() => {
      const mode = this.persistence.mode();
      untracked(() => {
        if (mode === 'database') this.startPolling();
        else this.stopPolling();
        if (mode === 'demo' || mode === 'error') this.startDemo();
      });
    });

    // Demostración: los cambios locales generan los mismos avisos que generaría el servidor.
    effect(() => {
      const sources = {
        'action-plans': this.plans.plans(),
        'survey-responses': this.surveys.responses(),
        approvals: this.approvals.approvals(),
        flaws: this.rs.flaws(),
        alerts: this.rs.alerts(),
      } as Record<string, Identified[]>;
      if (!this.demoStarted) return;
      untracked(() => this.diffDemo(sources));
    });
  }

  // ---------------------------------------------------------------------------
  // Base de datos
  // ---------------------------------------------------------------------------

  private startPolling() {
    if (this.timer) return;
    void this.refresh(true);
    this.timer = setInterval(() => { if (document.visibilityState === 'visible') void this.refresh(); }, POLL_MS);
    window.addEventListener('focus', this.onFocus);
    void this.loadPreference();
  }

  private stopPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    window.removeEventListener('focus', this.onFocus);
  }

  private readonly onFocus = () => void this.refresh();

  async refresh(initial = false): Promise<void> {
    if (this.isDemo()) return;
    try {
      const resp = await apiFetch('/api/notifications?limit=100');
      if (!resp.ok) return;
      const data = await resp.json() as { items: AppNotification[] };
      const fresh = data.items.filter(n => !this.known.has(n.id) && !n.readAt);
      data.items.forEach(n => this.known.add(n.id));
      this.serverItems.set(data.items);
      if (!initial && fresh.length) this.incoming.set(fresh[0]);
    } catch {
      // Sin conexión: se reintenta en el próximo ciclo.
    }
  }

  async markRead(ids: string[] | 'all') {
    const at = new Date().toISOString();
    const match = (n: AppNotification) => ids === 'all' || ids.includes(n.id);
    if (this.isDemo()) {
      const me = this.rs.currentProfile().email?.toLowerCase();
      this.demoItems.update(l => l.map(n => (n.recipient === me && !n.readAt && match(n) ? { ...n, readAt: at } : n)));
      return;
    }
    this.serverItems.update(l => l.map(n => (!n.readAt && match(n) ? { ...n, readAt: at } : n)));
    await apiFetch('/api/notifications/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids === 'all' ? { all: true } : { ids }),
    }).catch(() => undefined);
  }

  async loadPreference() {
    if (this.isDemo()) return;
    try {
      const resp = await apiFetch('/api/notifications/preferences');
      if (!resp.ok) return;
      const data = await resp.json();
      this.preference.set(data.preference ?? DEFAULT_NOTIFICATION_PREFERENCE);
      this.mailConfigured.set(!!data.mailConfigured);
    } catch {
      // se mantiene la preferencia por defecto
    }
  }

  async savePreference(p: NotificationPreference): Promise<void> {
    this.preference.set(p);
    if (this.isDemo()) return;
    const resp = await apiFetch('/api/notifications/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
    });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({})))?.error || `Error ${resp.status}`);
  }

  async sendTest(): Promise<string> {
    if (this.isDemo()) throw new Error('En modo demostración no se envían correos.');
    const resp = await apiFetch('/api/notifications/test', { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    return data.message;
  }

  async outbox(): Promise<{ items: AppNotification[]; mailConfigured: boolean }> {
    if (this.isDemo()) {
      return { items: [...this.demoItems()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200), mailConfigured: false };
    }
    const resp = await apiFetch('/api/notifications/outbox');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    return data;
  }

  /** Ejecuta ahora la revisión de plazos (y, si se pide, el resumen diario). */
  async runNow(digest = false): Promise<number> {
    if (this.isDemo()) return this.runDemoSchedule();
    const resp = await apiFetch('/api/notifications/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ digest }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    await this.refresh();
    return data.created ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------------------------

  /** Abre el registro del aviso (recarga antes si hay datos nuevos en el servidor). */
  async openNotification(n: AppNotification) {
    if (!n.readAt) void this.markRead([n.id]);
    if (!this.isDemo()) await this.persistence.reload().catch(() => undefined);
    this.navigateRequest.set({ tab: n.tab, entityType: n.entityType, entityId: n.entityId, at: Date.now() });
  }

  /** Enlace de un correo: ?tab=...&ref=entidad:id. Se consume una vez y se limpia la dirección. */
  consumeDeepLink() {
    const q = new URLSearchParams(location.search);
    const tab = q.get('tab');
    if (!tab) return;
    const [entityType, ...rest] = (q.get('ref') ?? '').split(':');
    const entityId = rest.join(':');
    history.replaceState(null, '', location.pathname);
    this.navigateRequest.set({ tab, entityType: entityType || undefined, entityId: entityId || undefined, at: Date.now() });
  }

  // ---------------------------------------------------------------------------
  // Demostración
  // ---------------------------------------------------------------------------

  private startDemo() {
    if (this.demoStarted) return;
    this.demoStarted = true;
    this.seeding = true;
    this.diffDemo({
      'action-plans': this.plans.plans(), 'survey-responses': this.surveys.responses(), approvals: this.approvals.approvals(),
      flaws: this.rs.flaws(), alerts: this.rs.alerts(),
    }, true);
    this.runDemoSchedule();
    // Avisos de las solicitudes de ejemplo ya pendientes.
    for (const r of this.approvals.approvals().filter(x => x.status === 'Pendiente')) {
      this.addDemo(changeNotifications('approvals', null, r, this.ctx('')));
    }
    for (const r of this.surveys.responses()) {
      this.addDemo(changeNotifications('survey-responses', null, r, { ...this.ctx(''), campaign: this.surveys.campaigns().find(c => c.id === r.campaignId) }));
    }
    this.seeding = false;
  }

  private ctx(actorName: string) {
    return {
      actorName, users: this.rs.userProfiles(), kriPreferences: this.rs.globalNotificationSettings(), now: new Date().toISOString(),
    };
  }

  private runDemoSchedule(): number {
    const before = this.demoItems().length;
    this.addDemo(scheduledNotifications({
      users: this.rs.userProfiles(), actionPlans: this.plans.plans(), surveyCampaigns: this.surveys.campaigns(), surveyResponses: this.surveys.responses(),
      approvals: this.approvals.approvals(), continuityPlans: this.res.plans(), vulnerabilities: this.sec.vulnerabilities(), risks: this.rs.risks(),
      providers: this.res.providers(),
    }, this.settings(), todayIso()));
    return this.demoItems().length - before;
  }

  private diffDemo(sources: Record<string, Identified[]>, baselineOnly = false) {
    const actor = this.rs.currentProfile().name;
    for (const [entity, list] of Object.entries(sources)) {
      const snap = this.demoSnapshots.get(entity) ?? new Map<string, Identified>();
      const next = new Map(list.map(o => [o.id, o]));
      if (!baselineOnly) {
        for (const o of list) {
          const prev = snap.get(o.id) ?? null;
          if (prev === o) continue;
          const campaign = entity === 'survey-responses'
            ? this.surveys.campaigns().find(c => c.id === (o as unknown as { campaignId: string }).campaignId) : undefined;
          this.addDemo(changeNotifications(entity, prev, o, { ...this.ctx(actor), campaign }));
        }
      }
      this.demoSnapshots.set(entity, next);
    }
  }

  private addDemo(drafts: NotificationDraft[]) {
    if (!drafts.length) return;
    const existing = new Set(this.demoItems().map(n => n.dedupeKey));
    const now = new Date().toISOString();
    const fresh = drafts.filter(d => !existing.has(d.dedupeKey)).map((d, i): AppNotification => ({
      ...d, id: `ntf-demo-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`, createdAt: now, emailStatus: 'omitido',
      emailError: 'Modo demostración',
    }));
    if (!fresh.length) return;
    this.demoItems.update(l => [...l, ...fresh]);
    const me = this.rs.currentProfile().email?.toLowerCase();
    const mine = fresh.find(n => n.recipient === me);
    if (mine && !this.seeding) this.incoming.set(mine);
  }
}
