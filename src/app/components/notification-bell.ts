import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../services/notification.service';
import {
  AppNotification, EmailMode, NOTIFICATION_CATEGORIES, NotificationCategory, NotificationPreference,
} from '../models/notification.model';

const CATEGORY_ICON: Record<NotificationCategory, string> = {
  'Aprobaciones': 'approval', 'Planes de acción': 'assignment_turned_in', 'Autoevaluaciones': 'fact_check', 'Incidentes': 'report_problem',
  'Alertas KRI': 'notifications_active', 'Continuidad': 'restore', 'Seguridad': 'shield', 'Riesgos': 'gpp_maybe', 'Proveedores': 'handshake', 'Documentos': 'description',
};

/** Campana de avisos: bandeja de la persona y sus preferencias de correo. */
@Component({
  selector: 'app-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="relative">
      <button type="button" (click)="toggle()" [attr.aria-expanded]="open()" aria-haspopup="dialog"
        [attr.aria-label]="'Avisos' + (svc.unread() ? ': ' + svc.unread() + ' sin leer' : '')"
        class="relative p-2 rounded-lg transition-colors cursor-pointer"
        [class]="dark() ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'">
        <mat-icon>{{ svc.unread() ? 'notifications_active' : 'notifications' }}</mat-icon>
        @if (svc.unread()) {
          <span class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            [class]="svc.urgentUnread() ? 'bg-rose-600 text-white' : 'bg-amber-400 text-slate-950'">{{ svc.unread() > 99 ? '99+' : svc.unread() }}</span>
        }
      </button>

      @if (open()) {
        <div role="dialog" aria-label="Avisos" class="absolute right-0 mt-2 w-[min(92vw,400px)] bg-white rounded-xl border border-slate-200 shadow-xl z-50 text-slate-900">
          <div class="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <span class="font-bold text-sm">{{ tab() === 'avisos' ? 'Avisos' : 'Preferencias de correo' }}</span>
            <span class="flex-1"></span>
            @if (tab() === 'avisos') {
              @if (svc.unread()) {
                <button type="button" (click)="svc.markRead('all')" class="text-[11px] text-emerald-700 hover:underline cursor-pointer">Marcar todo como leído</button>
              }
              <button type="button" (click)="openPrefs()" class="p-1 rounded hover:bg-slate-100 cursor-pointer" title="Preferencias de correo" aria-label="Preferencias de correo"><mat-icon class="text-base text-slate-500">settings</mat-icon></button>
            } @else {
              <button type="button" (click)="tab.set('avisos')" class="text-[11px] text-emerald-700 hover:underline cursor-pointer">Volver</button>
            }
          </div>

          @if (tab() === 'avisos') {
            <div class="flex gap-1 px-3 pt-2">
              <button type="button" (click)="onlyUnread.set(false)" class="px-2 py-1 text-[11px] rounded-md cursor-pointer" [class]="!onlyUnread() ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'">Todos</button>
              <button type="button" (click)="onlyUnread.set(true)" class="px-2 py-1 text-[11px] rounded-md cursor-pointer" [class]="onlyUnread() ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'">Sin leer ({{ svc.unread() }})</button>
            </div>
            <ul class="max-h-[60vh] overflow-y-auto py-1">
              @for (n of shown(); track n.id) {
                <li>
                  <button type="button" (click)="go(n)" class="w-full text-left px-4 py-2.5 hover:bg-slate-50 cursor-pointer flex gap-3" [class.bg-amber-50]="!n.readAt">
                    <mat-icon class="text-lg shrink-0 mt-0.5" [class]="sevColor(n)">{{ icon(n) }}</mat-icon>
                    <span class="flex-1 min-w-0">
                      <span class="block text-[10px] uppercase tracking-wide text-slate-500">{{ n.category }} · {{ ago(n.createdAt) }}</span>
                      <span class="block text-xs font-semibold" [class.text-slate-900]="!n.readAt" [class.text-slate-600]="!!n.readAt">{{ n.title }}</span>
                      <span class="block text-[11px] text-slate-600 line-clamp-2">{{ n.body }}</span>
                    </span>
                    @if (!n.readAt) { <span class="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" aria-label="sin leer"></span> }
                  </button>
                </li>
              } @empty {
                <li class="px-4 py-8 text-center text-xs text-slate-500">{{ onlyUnread() ? 'No tiene avisos sin leer.' : 'Aún no tiene avisos.' }}</li>
              }
            </ul>
          } @else {
            <div class="p-4 space-y-3 text-xs">
              @if (svc.isDemo()) {
                <p class="p-2 rounded-lg bg-amber-50 text-amber-900">En modo demostración los avisos solo aparecen aquí; no se envían correos.</p>
              } @else if (svc.mailConfigured() === false) {
                <p class="p-2 rounded-lg bg-amber-50 text-amber-900">El servidor aún no tiene correo configurado: por ahora los avisos solo aparecen aquí.</p>
              }
              <fieldset class="space-y-1.5">
                <legend class="font-semibold text-slate-700 mb-1">Recibir por correo</legend>
                @for (m of modes; track m.id) {
                  <label class="flex items-start gap-2 cursor-pointer">
                    <input type="radio" name="email-mode" [checked]="draft().emailMode === m.id" (change)="setMode(m.id)" class="mt-0.5 accent-emerald-600" />
                    <span><strong>{{ m.label }}</strong> <span class="text-slate-500">{{ m.hint }}</span></span>
                  </label>
                }
              </fieldset>
              <fieldset [disabled]="draft().emailMode === 'ninguno'" class="disabled:opacity-50">
                <legend class="font-semibold text-slate-700 mb-1">Categorías por correo</legend>
                <div class="grid grid-cols-2 gap-1">
                  @for (c of categories; track c) {
                    <label class="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" [checked]="!draft().muted.includes(c)" (change)="toggleCategory(c)" class="accent-emerald-600" />{{ c }}
                    </label>
                  }
                </div>
                <p class="text-slate-500 mt-1">Las categorías desmarcadas siguen apareciendo en esta bandeja.</p>
              </fieldset>
              @if (prefMsg()) { <p class="text-emerald-700" role="status">{{ prefMsg() }}</p> }
              <div class="flex justify-end">
                <button type="button" (click)="savePrefs()" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer">Guardar</button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class NotificationBell {
  readonly svc = inject(NotificationService);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly dark = input(false);

  readonly open = signal(false);
  readonly tab = signal<'avisos' | 'prefs'>('avisos');
  readonly onlyUnread = signal(false);
  readonly draft = signal<NotificationPreference>({ emailMode: 'inmediato', muted: [] });
  readonly prefMsg = signal('');

  readonly categories = NOTIFICATION_CATEGORIES;
  readonly modes: { id: EmailMode; label: string; hint: string }[] = [
    { id: 'inmediato', label: 'Al momento', hint: 'un correo por aviso' },
    { id: 'resumen', label: 'Resumen diario', hint: 'un solo correo cada mañana' },
    { id: 'ninguno', label: 'No enviar correos', hint: 'solo en esta bandeja' },
  ];

  readonly shown = computed(() => (this.onlyUnread() ? this.svc.items().filter(n => !n.readAt) : this.svc.items()).slice(0, 60));

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.open.set(false);
  }

  toggle() {
    this.open.update(o => !o);
    this.tab.set('avisos');
    if (this.open()) void this.svc.refresh();
  }

  openPrefs() {
    this.draft.set({ ...this.svc.preference(), muted: [...this.svc.preference().muted] });
    this.prefMsg.set('');
    this.tab.set('prefs');
  }

  setMode(m: EmailMode) {
    this.draft.update(d => ({ ...d, emailMode: m }));
  }

  toggleCategory(c: NotificationCategory) {
    this.draft.update(d => ({ ...d, muted: d.muted.includes(c) ? d.muted.filter(x => x !== c) : [...d.muted, c] }));
  }

  async savePrefs() {
    try {
      await this.svc.savePreference(this.draft());
      this.prefMsg.set('Preferencias guardadas.');
    } catch (e) {
      this.prefMsg.set((e as Error).message);
    }
  }

  go(n: AppNotification) {
    this.open.set(false);
    void this.svc.openNotification(n);
  }

  icon(n: AppNotification) {
    return CATEGORY_ICON[n.category] ?? 'notifications';
  }

  sevColor(n: AppNotification) {
    return n.severity === 'urgente' ? 'text-rose-600' : n.severity === 'aviso' ? 'text-amber-600' : 'text-emerald-600';
  }

  ago(iso: string) {
    const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? 'ayer' : `hace ${d} días`;
  }
}
