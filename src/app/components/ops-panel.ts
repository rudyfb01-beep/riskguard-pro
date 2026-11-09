import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PersistenceService, apiFetch } from '../services/persistence.service';
import { RiskDataService } from '../services/risk-data.service';

interface BackupItem { file: string; size: number; createdAt: string; sha256?: string; trigger?: string; engine?: string; counts?: Record<string, number> }
interface OpsInfo {
  app: { version: string; node: string; env: string; startedAt: string; uptimeSeconds: number; memoryMb: number; tz: string };
  database: { engine: string; sizeBytes: number | null; users: number; activeSessions: number; evidenceFiles: number };
  ledger: { ok: boolean; blocks: number; brokenAt?: number; reason?: string };
  backups: { dir: string; intervalHours: number; keep: number; last: { ok: boolean; at: string; file?: string; error?: string } | null; list: BackupItem[]; canRun: boolean };
  notifier: { intervalMinutes: number; lastRun: string | null };
  mail: { configured: boolean; last24h: Partial<Record<string, number>> };
  uf: { lastSync: string | null; lastValueDate: string | null; values: number };
  config: { level: 'alta' | 'media' | 'baja'; text: string }[];
}

const LEVEL_CLS = { alta: 'bg-rose-100 text-rose-800', media: 'bg-amber-100 text-amber-800', baja: 'bg-slate-100 text-slate-700' };

/** Operación: estado del servicio, respaldos, bitácora y revisión de la configuración. */
@Component({
  selector: 'app-ops-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-4">
      <div class="flex flex-col md:flex-row md:items-center gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-slate-100 text-slate-700 rounded-lg"><mat-icon class="text-lg">monitor_heart</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Operación y respaldos</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">Estado del servicio, respaldos de la base de datos, integridad de la bitácora y revisión de la configuración del servidor.</p>
        </div>
        @if (info()) {
          <button type="button" (click)="load()" [disabled]="loading()" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-1 cursor-pointer disabled:opacity-50"><mat-icon class="text-sm">refresh</mat-icon>Actualizar</button>
        }
      </div>

      @if (persistence.mode() !== 'database') {
        <p class="text-xs text-slate-600 bg-white border border-slate-200 rounded-xl p-4">Disponible cuando la aplicación funciona con base de datos (no en el modo demostración).</p>
      } @else {
        @if (error()) { <p class="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{{ error() }}</p> }
        @if (message()) { <p class="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" role="status">{{ message() }}</p> }
        @if (info(); as i) {
          <!-- Indicadores -->
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="ops-kpis">
            <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] text-slate-500 block">Servicio</span>
              <span class="text-sm font-bold text-emerald-700">En línea · {{ uptime() }}</span><span class="block text-[10px] text-slate-500">v{{ i.app.version }} · Node {{ i.app.node }} · {{ i.app.memoryMb }} MB</span></div>
            <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] text-slate-500 block">Base de datos</span>
              <span class="text-sm font-bold text-slate-900">{{ i.database.engine }} · {{ mb(i.database.sizeBytes) }}</span><span class="block text-[10px] text-slate-500">{{ i.database.users }} usuarios · {{ i.database.activeSessions }} sesiones activas</span></div>
            <div class="bg-white p-3.5 rounded-xl border" [class]="lastBackupOk() ? 'border-emerald-200' : 'border-rose-300 bg-rose-50/40'"><span class="text-[11px] text-slate-500 block">Último respaldo</span>
              <span class="text-sm font-bold" [class]="lastBackupOk() ? 'text-emerald-700' : 'text-rose-700'">{{ i.backups.last ? (i.backups.last.at | date:'dd-MM HH:mm') : 'Nunca' }}</span>
              <span class="block text-[10px] text-slate-500">{{ i.backups.last?.ok === false ? 'Falló: ' + i.backups.last?.error : 'cada ' + i.backups.intervalHours + ' h · se guardan ' + i.backups.keep }}</span></div>
            <div class="bg-white p-3.5 rounded-xl border" [class]="i.ledger.ok ? 'border-emerald-200' : 'border-rose-300 bg-rose-50/40'"><span class="text-[11px] text-slate-500 block">Bitácora</span>
              <span class="text-sm font-bold" [class]="i.ledger.ok ? 'text-emerald-700' : 'text-rose-700'">{{ i.ledger.ok ? 'Íntegra' : 'Alterada en bloque ' + i.ledger.brokenAt }}</span>
              <span class="block text-[10px] text-slate-500">{{ i.ledger.ok ? i.ledger.blocks + ' bloques verificados (SHA-256)' : i.ledger.reason }}</span></div>
            <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] text-slate-500 block">Correo (24 h)</span>
              <span class="text-sm font-bold" [class]="i.mail.configured ? 'text-slate-900' : 'text-rose-700'">{{ i.mail.configured ? (i.mail.last24h['enviado'] ?? 0) + ' enviados' : 'SMTP sin configurar' }}</span>
              <span class="block text-[10px] text-slate-500">{{ i.mail.last24h['error'] ?? 0 }} con error · {{ i.mail.last24h['pendiente'] ?? 0 }} pendientes</span></div>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <!-- Respaldos -->
            <section class="xl:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-sm font-bold text-slate-900 flex-1 flex items-center gap-1.5"><mat-icon class="text-base text-slate-500">backup</mat-icon>Respaldos</h2>
                @if (i.backups.canRun) {
                  <button type="button" (click)="backupNow()" [disabled]="busy()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white flex items-center gap-1 cursor-pointer disabled:opacity-50">
                    <mat-icon class="text-sm">{{ busy() ? 'progress_activity' : 'save' }}</mat-icon>Respaldar ahora</button>
                }
              </div>
              <p class="text-[11px] text-slate-500">Carpeta: <span class="font-mono">{{ i.backups.dir }}</span>. Cópielos además fuera del servidor (otro equipo o almacenamiento). Para restaurar: <span class="font-mono">node scripts/restaurar.mjs &lt;archivo&gt;</span> con la aplicación detenida.</p>
              <div class="overflow-x-auto">
                <table class="w-full text-xs min-w-[560px]">
                  <thead class="text-[10px] uppercase text-slate-500 bg-slate-50"><tr><th class="text-left px-2 py-1.5">Archivo</th><th class="text-left px-2">Fecha</th><th class="text-right px-2">Tamaño</th><th class="text-left px-2">Origen</th><th></th></tr></thead>
                  <tbody>
                    @for (b of i.backups.list; track b.file) {
                      <tr class="border-t border-slate-100">
                        <td class="px-2 py-1.5 font-mono">{{ b.file }}</td>
                        <td class="px-2">{{ b.createdAt | date:'dd-MM-yyyy HH:mm' }}</td>
                        <td class="px-2 text-right font-mono">{{ mb(b.size) }}</td>
                        <td class="px-2">{{ b.trigger ?? '—' }}</td>
                        <td class="px-2 text-right whitespace-nowrap">
                          @if (verified()[b.file]; as v) { <span class="text-[11px] mr-2" [class]="v.ok ? 'text-emerald-700' : 'text-rose-700'" [title]="v.detail">{{ v.ok ? '✓ íntegro' : '✗ ' + v.detail }}</span> }
                          @if (i.backups.canRun) {
                            <button type="button" (click)="verify(b.file)" class="px-2 py-0.5 rounded hover:bg-slate-100 cursor-pointer">Verificar</button>
                            <a [href]="'/api/admin/backups/' + b.file" class="px-2 py-0.5 rounded hover:bg-slate-100 text-indigo-700">Descargar</a>
                          }
                        </td>
                      </tr>
                    } @empty { <tr><td colspan="5" class="px-2 py-4 text-center text-slate-500">Aún no hay respaldos.</td></tr> }
                  </tbody>
                </table>
              </div>
            </section>

            <!-- Configuración -->
            <section class="bg-white rounded-2xl border border-slate-200 p-4 space-y-2" data-testid="ops-config">
              <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-slate-500">rule</mat-icon>Revisión de la configuración</h2>
              @for (f of i.config; track $index) {
                <div class="flex gap-2 text-xs"><span class="px-1.5 py-0.5 rounded text-[10px] font-bold h-fit uppercase shrink-0" [class]="levelCls(f.level)">{{ f.level }}</span><span class="text-slate-700">{{ f.text }}</span></div>
              } @empty { <p class="text-xs text-emerald-700 flex items-center gap-1"><mat-icon class="text-sm">verified</mat-icon>Sin observaciones.</p> }
              <div class="pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-0.5">
                <div>Revisión de plazos y avisos: cada {{ i.notifier.intervalMinutes }} min · última {{ i.notifier.lastRun ? (i.notifier.lastRun | date:'dd-MM HH:mm') : '—' }}</div>
                <div>UF: {{ i.uf.values }} valores · último {{ i.uf.lastValueDate ?? '—' }}</div>
                <div>Inicio del servicio: {{ i.app.startedAt | date:'dd-MM-yyyy HH:mm' }} · zona {{ i.app.tz }} · {{ i.app.env }}</div>
                <div>Evidencias almacenadas: {{ i.database.evidenceFiles }}</div>
              </div>
            </section>
          </div>
        } @else if (loading()) {
          <p class="text-xs text-slate-500">Cargando…</p>
        }
      }
    </div>
  `,
})
export class OpsPanel {
  readonly persistence = inject(PersistenceService);
  readonly rs = inject(RiskDataService);
  readonly notify = output<string>();

  readonly info = signal<OpsInfo | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly verified = signal<Record<string, { ok: boolean; detail: string }>>({});

  readonly lastBackupOk = computed(() => {
    const b = this.info()?.backups;
    if (!b?.last?.ok) return false;
    return Date.now() - new Date(b.last.at).getTime() < Math.max(b.intervalHours, 24) * 2 * 3_600_000;
  });

  constructor() {
    if (this.persistence.mode() === 'database') void this.load();
  }

  levelCls(l: 'alta' | 'media' | 'baja') { return LEVEL_CLS[l]; }
  mb(n: number | null | undefined) { return n === null || n === undefined ? '—' : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`; }
  uptime() {
    const s = this.info()?.app.uptimeSeconds ?? 0;
    return s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} d`;
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const r = await apiFetch('/api/admin/ops');
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
      this.info.set(d);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async backupNow() {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const r = await apiFetch('/api/admin/backups', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
      this.message.set(`Respaldo creado: ${d.file} (${this.mb(d.size)}).`);
      this.notify.emit('Respaldo de la base creado.');
      await this.load();
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async verify(file: string) {
    const r = await apiFetch(`/api/admin/backups/${encodeURIComponent(file)}/verify`, { method: 'POST' });
    const d = await r.json().catch(() => ({ ok: false, detail: `Error ${r.status}` }));
    this.verified.update(v => ({ ...v, [file]: d }));
  }
}
