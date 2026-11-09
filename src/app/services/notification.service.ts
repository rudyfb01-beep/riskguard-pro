import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { PersistenceService, apiFetch } from './persistence.service';
import { CatalogService } from './catalog.service';
import {
  AppNotification, DEFAULT_NOTIFICATION_PREFERENCE, NotificationPreference,
} from '../models/notification.model';
import { normalizeNotificationSettings } from '../utils/notifications';

export interface NavigateRequest { tab?: string; entityType?: string; entityId?: string; at: number }

const POLL_MS = 60_000;

/**
 * Bandeja de avisos: los genera el servidor (y envía los correos); aquí se consultan cada minuto.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly persistence = inject(PersistenceService);

  /** Parámetros generales (Mantenedores → Avisos); se guardan como ajuste del sistema. */
  readonly settingsRaw = inject(CatalogService).notificationSettingsRaw;
  readonly settings = computed(() => normalizeNotificationSettings(this.settingsRaw()));

  private readonly serverItems = signal<AppNotification[]>([]);
  readonly preference = signal<NotificationPreference>(DEFAULT_NOTIFICATION_PREFERENCE);
  readonly mailConfigured = signal<boolean | null>(null);
  /** Último aviso nuevo recibido (para mostrar un mensaje). */
  readonly incoming = signal<AppNotification | null>(null);
  readonly navigateRequest = signal<NavigateRequest | null>(null);

  /** Sin sesión con datos cargados no se consulta el servidor. */
  private readonly offline = computed(() => this.persistence.mode() !== 'database');

  readonly items = computed(() => this.serverItems());
  readonly unread = computed(() => this.items().filter(n => !n.readAt).length);
  readonly urgentUnread = computed(() => this.items().filter(n => !n.readAt && n.severity === 'urgente').length);

  private timer: ReturnType<typeof setInterval> | null = null;
  private known = new Set<string>();

  constructor() {
    // Con base de datos: consulta periódica y al volver a la pestaña.
    effect(() => {
      const mode = this.persistence.mode();
      untracked(() => {
        if (mode === 'database') this.startPolling();
        else this.stopPolling();
      });
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
    if (this.offline()) return;
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
    this.serverItems.update(l => l.map(n => (!n.readAt && match(n) ? { ...n, readAt: at } : n)));
    await apiFetch('/api/notifications/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ids === 'all' ? { all: true } : { ids }),
    }).catch(() => undefined);
  }

  async loadPreference() {
    if (this.offline()) return;
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
    const resp = await apiFetch('/api/notifications/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
    });
    if (!resp.ok) throw new Error((await resp.json().catch(() => ({})))?.error || `Error ${resp.status}`);
  }

  async sendTest(): Promise<string> {
    const resp = await apiFetch('/api/notifications/test', { method: 'POST' });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    return data.message;
  }

  async outbox(): Promise<{ items: AppNotification[]; mailConfigured: boolean }> {
    const resp = await apiFetch('/api/notifications/outbox');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
    return data;
  }

  /** Ejecuta ahora la revisión de plazos (y, si se pide, el resumen diario). */
  async runNow(digest = false): Promise<number> {
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
    await this.persistence.reload().catch(() => undefined);
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
}
