import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { PersistenceService, apiFetch } from '../services/persistence.service';
import { normalizeUfTable, parseUfText, ufDays } from '../utils/uf';

/**
 * Valores de la UF para expresar la base de pérdidas en UF: descarga desde la fuente oficial
 * (mindicador.cl, con base de datos), carga pegando desde una planilla y asignación a eventos.
 */
@Component({
  selector: 'app-uf-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <section class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" data-testid="uf-settings">
      <div class="flex flex-wrap items-start gap-3">
        <div class="flex-1 min-w-[16rem]">
          <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-emerald-600">currency_exchange</mat-icon> Unidad de Fomento (UF)</h2>
          <p class="text-[11px] text-slate-600 mt-1">
            La base de pérdidas se registra en pesos. Cada evento guarda el valor de la UF de su fecha contable (o de descubrimiento u
            ocurrencia) y se muestra también en UF, para comparar pérdidas de distintos años.
            @if (persistence.mode() === 'database') { El servidor actualiza los valores una vez al día desde mindicador.cl (Banco Central). }
          </p>
          @if (rs.currencyCode() !== 'CLP') {
            <p class="text-[11px] text-amber-800 mt-1">La moneda de registro es {{ rs.currencyCode() }}: la referencia en UF se usa con montos en pesos (CLP).</p>
          }
        </div>
        <div class="grid grid-cols-3 gap-2 text-center text-[11px]">
          <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-base font-bold text-slate-900 font-mono">{{ days().length }}</div>valores</div>
          <div class="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200"><div class="text-xs font-bold text-slate-900 font-mono">{{ last()?.value ?? '—' }}</div>{{ last()?.date ?? 'sin datos' }}</div>
          <div class="px-3 py-2 rounded-xl border" [class]="missing() ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'">
            <div class="text-base font-bold font-mono" [class]="missing() ? 'text-amber-800' : 'text-slate-900'">{{ missing() }}</div>eventos sin UF</div>
        </div>
      </div>

      @if (canManage()) {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="space-y-2">
            @if (persistence.mode() === 'database') {
              <div class="flex flex-wrap items-end gap-2">
                <label class="text-[11px] text-slate-600">Año
                  <input type="number" min="1990" max="2100" class="block w-24 text-xs rounded-lg border border-slate-300 px-2 py-1 font-mono" [value]="year()" (input)="year.set(+$any($event.target).value)" />
                </label>
                <button type="button" (click)="sync()" [disabled]="busy()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer flex items-center gap-1">
                  <mat-icon class="text-sm">{{ busy() ? 'progress_activity' : 'cloud_download' }}</mat-icon> Descargar desde mindicador.cl
                </button>
              </div>
            }
            @if (missing() > 0 && rs.canAny('canManageRegulatoryReports')) {
              <button type="button" (click)="fill()" class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1">
                <mat-icon class="text-sm text-indigo-600">event_available</mat-icon> Asignar la UF a {{ missing() }} evento(s) sin valor
              </button>
            }
            @if (recent().length) {
              <table class="w-full text-[11px]">
                <thead><tr class="text-slate-500"><th class="text-left font-medium">Fecha</th><th class="text-right font-medium">Valor UF ($)</th></tr></thead>
                <tbody>
                  @for (r of recent(); track r.date) {
                    <tr class="border-t border-slate-100"><td class="py-0.5 font-mono">{{ r.date }}</td><td class="py-0.5 text-right font-mono">{{ r.value | number:'1.2-2' }}</td></tr>
                  }
                </tbody>
              </table>
            }
          </div>
          <div class="space-y-2">
            <label class="block text-[11px] font-medium text-slate-600">Pegar valores (una fecha y un valor por línea, p. ej. <span class="font-mono">01-11-2026;39.612,45</span>)
              <textarea rows="5" class="mt-1 w-full text-xs rounded-lg border border-slate-300 px-2 py-1.5 font-mono" [value]="text()" (input)="text.set($any($event.target).value)" aria-label="Valores de la UF"></textarea>
            </label>
            <button type="button" (click)="addPasted()" [disabled]="!text().trim()" class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 cursor-pointer">Agregar valores</button>
          </div>
        </div>
      }
      @if (message()) { <p class="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2" role="status">{{ message() }}</p> }
      @if (error()) { <p class="text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{{ error() }}</p> }
    </section>
  `,
})
export class UfSettings {
  readonly rs = inject(RiskDataService);
  readonly persistence = inject(PersistenceService);
  readonly notify = output<string>();

  readonly year = signal(new Date().getFullYear());
  readonly busy = signal(false);
  readonly text = signal('');
  readonly message = signal('');
  readonly error = signal('');

  readonly canManage = computed(() => this.rs.canAny('canManageCatalogs', 'canManageRegulatoryReports'));
  readonly table = computed(() => this.rs.catalog.ufTable());
  readonly days = computed(() => ufDays(this.table()));
  readonly last = computed(() => {
    const d = this.days()[this.days().length - 1];
    return d ? { date: d, value: this.table()[d].toLocaleString('es-CL', { minimumFractionDigits: 2 }) } : null;
  });
  readonly recent = computed(() => this.days().slice(-6).reverse().map(d => ({ date: d, value: this.table()[d] })));
  readonly missing = computed(() => this.rs.currencyCode() !== 'CLP' ? 0
    : this.rs.flaws().filter(f => (f.realLossAmountUSD || 0) > 0 && !f.ufValueClp && this.rs.lossUf(f)).length);

  private reset() { this.message.set(''); this.error.set(''); }

  async sync() {
    this.reset();
    this.busy.set(true);
    try {
      const resp = await apiFetch('/api/admin/uf-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ years: [this.year()] }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      this.rs.catalog.ufValuesRaw.set(normalizeUfTable(data.values));
      this.message.set(data.added ? `${data.added} valor(es) nuevo(s). Último: ${data.latest?.date} = $${data.latest?.value}.` : 'No había valores nuevos.');
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  addPasted() {
    this.reset();
    const { values, errors } = parseUfText(this.text());
    const n = Object.keys(values).length;
    if (!n) { this.error.set(errors[0] ?? 'No se encontraron valores.'); return; }
    this.rs.catalog.ufValuesRaw.set({ ...this.table(), ...values });
    void this.rs.appendAuditLog('CONFIGURACIÓN_PARÁMETROS', 'Mantenedor', 'UF', `Valores de la UF cargados manualmente: ${n} fecha(s).`);
    this.text.set('');
    this.message.set(`${n} valor(es) agregados.${errors.length ? ` ${errors.length} línea(s) no se leyeron: ${errors.slice(0, 2).join(' ')}` : ''}`);
  }

  fill() {
    this.reset();
    try {
      const n = this.rs.fillMissingUf();
      this.message.set(`Se asignó el valor UF a ${n} evento(s).`);
      this.notify.emit(`Valor UF asignado a ${n} evento(s) de la base de pérdidas.`);
    } catch (err) {
      this.error.set((err as Error).message);
    }
  }
}
