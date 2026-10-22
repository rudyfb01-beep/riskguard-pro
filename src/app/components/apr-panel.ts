import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { AprInputs, AprService, AprYear, computeApr } from '../services/apr.service';
import { normalizeAprInputs } from '../models/apr.model';
import { downloadCsv } from '../utils/csv';

type YearField = Exclude<keyof AprYear, 'year'>;

/** Preparación para el APR por riesgo operacional (CAC-20 en consulta). */
@Component({
  selector: 'app-apr-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-4">
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div class="flex items-center gap-2">
          <span class="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg"><mat-icon class="text-lg">account_balance</mat-icon></span>
          <h1 class="text-xl font-bold tracking-tight text-slate-900">APR por Riesgo Operacional</h1>
        </div>
        <p class="text-xs text-slate-600 mt-1 max-w-4xl">
          Preparación de datos y simulación del requerimiento de capital por riesgo operacional. La Ley 21.641 exige un patrimonio
          efectivo de al menos el 10,5 % de los activos ponderados por riesgo (APR) y la CMF puso en consulta el Capítulo CAC-20
          con las metodologías para calcularlos.
        </p>
      </div>

      <div class="p-3 rounded-xl border border-amber-300 bg-amber-50 text-[11px] text-amber-900 flex items-start gap-2">
        <mat-icon class="text-sm text-amber-600 shrink-0">warning</mat-icon>
        <span>
          <strong>Simulación de referencia, no cálculo normativo.</strong> El CAC-20 está en consulta (octubre de 2026) y su metodología
          puede diferir. Se aplica el método estándar que la CMF usa para la banca (Basilea III): indicador de negocio, coeficientes por
          tramos en UF (12 % hasta 25 millones de UF, 15 % sobre ese monto) e ILM opcional con al menos 5 años de pérdidas. Todos los
          parámetros son editables; reemplácelos cuando se publique la norma definitiva.
        </span>
      </div>

      <!-- Resultado -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Indicador de negocio (BI)</span><span class="text-xl font-bold font-mono text-slate-900">{{ r().bi | number:'1.0-0' }}</span><span class="text-[10px] text-slate-500"> MM$</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">BIC ({{ r().bicEffectivePct * 100 | number:'1.1-2' }} % efectivo)</span><span class="text-xl font-bold font-mono text-slate-900">{{ r().bic | number:'1.0-0' }}</span><span class="text-[10px] text-slate-500"> MM$</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">ILM</span><span class="text-xl font-bold font-mono text-slate-900">{{ r().ilm | number:'1.2-2' }}</span><span class="text-[10px] text-slate-500"> {{ inp().useIlm ? 'con pérdidas' : '(= 1)' }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-emerald-300 bg-emerald-50/40"><span class="text-[11px] font-semibold text-emerald-800 block">APR operacional estimado</span><span class="text-xl font-bold font-mono text-emerald-800">{{ r().apr | number:'1.0-0' }}</span><span class="text-[10px] text-emerald-700"> MM$</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-300"><span class="text-[11px] font-semibold text-slate-600 block">Patrimonio efectivo asociado ({{ inp().capitalRatio * 100 | number:'1.0-1' }} %)</span><span class="text-xl font-bold font-mono text-slate-900">{{ r().capitalForApr | number:'1.0-0' }}</span><span class="text-[10px] text-slate-500"> MM$</span></div>
      </div>
      <p class="text-[11px] text-slate-600">
        BI equivalente: <strong class="font-mono">{{ r().biUF | number:'1.0-0' }} UF</strong>
        (UF a $ {{ inp().ufValueClp | number:'1.0-2' }}) ·
        @if (r().exceedsFirstBucket) { <span class="text-rose-700 font-semibold">supera el primer tramo: el excedente usa el coeficiente marginal siguiente.</span> }
        @else { <span>dentro del primer tramo.</span> }
      </p>
      @if (r().ilmRequestedButBlocked) {
        <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          Se pidió usar el ILM, pero la base de pérdidas tiene {{ r().lossYears }} año(s) con datos y se requieren al menos {{ inp().minLossYears }}. Se usa ILM = 1.
        </p>
      }

      <!-- Suficiencia patrimonial -->
      <div class="bg-white rounded-2xl border border-slate-200 p-4">
        <h2 class="text-sm font-bold text-slate-900 mb-2">Suficiencia patrimonial (Ley 21.641, referencial)</h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Patrimonio efectivo (MM$)</span><input type="number" [value]="draft().effectiveEquityMM ?? ''" [disabled]="!canManage()" (input)="setOpt('effectiveEquityMM', $any($event.target).value)" class="w-full text-xs font-mono rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></label>
          <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">APR crédito + mercado (MM$)</span><input type="number" [value]="draft().otherRwaMM ?? ''" [disabled]="!canManage()" (input)="setOpt('otherRwaMM', $any($event.target).value)" class="w-full text-xs font-mono rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></label>
          <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Activos totales (MM$)</span><input type="number" [value]="draft().totalAssetsMM ?? ''" [disabled]="!canManage()" (input)="setOpt('totalAssetsMM', $any($event.target).value)" class="w-full text-xs font-mono rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></label>
          <div class="text-[11px] text-slate-500 self-end">Mínimos: {{ inp().capitalRatio * 100 | number:'1.0-1' }} % de APR y {{ inp().leverageRatio * 100 | number:'1.0-1' }} % de activos.</div>
        </div>
        @if (r().solvency; as sv) {
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <div class="p-3 rounded-xl border" [class]="sv.peToRwa >= inp().capitalRatio ? 'border-emerald-300 bg-emerald-50/40' : 'border-rose-300 bg-rose-50/40'">
              <span class="text-[11px] font-semibold text-slate-600 block">Patrimonio efectivo / APR</span>
              <span class="text-xl font-bold font-mono" [class]="sv.peToRwa >= inp().capitalRatio ? 'text-emerald-700' : 'text-rose-700'">{{ sv.peToRwa * 100 | number:'1.2-2' }} %</span>
              <span class="text-[10px] text-slate-500 block">mínimo {{ sv.requiredByRwa | number:'1.0-0' }} MM$</span>
            </div>
            @if (sv.peToAssets !== undefined) {
              <div class="p-3 rounded-xl border" [class]="sv.peToAssets >= inp().leverageRatio ? 'border-emerald-300 bg-emerald-50/40' : 'border-rose-300 bg-rose-50/40'">
                <span class="text-[11px] font-semibold text-slate-600 block">Patrimonio efectivo / activos</span>
                <span class="text-xl font-bold font-mono" [class]="sv.peToAssets >= inp().leverageRatio ? 'text-emerald-700' : 'text-rose-700'">{{ sv.peToAssets * 100 | number:'1.2-2' }} %</span>
                <span class="text-[10px] text-slate-500 block">mínimo {{ sv.requiredByAssets | number:'1.0-0' }} MM$</span>
              </div>
            }
            <div class="p-3 rounded-xl border border-slate-200">
              <span class="text-[11px] font-semibold text-slate-600 block">APR totales</span>
              <span class="text-xl font-bold font-mono text-slate-900">{{ sv.totalRwa | number:'1.0-0' }}</span><span class="text-[10px] text-slate-500"> MM$</span>
            </div>
            <div class="p-3 rounded-xl border border-slate-200">
              <span class="text-[11px] font-semibold text-slate-600 block">Peso del riesgo operacional</span>
              <span class="text-xl font-bold font-mono text-slate-900">{{ sv.aprOpShareOfRwa * 100 | number:'1.1-1' }} %</span><span class="text-[10px] text-slate-500"> de los APR</span>
            </div>
          </div>
        } @else {
          <p class="text-[11px] text-slate-400 mt-2">Ingrese patrimonio efectivo y APR de crédito y mercado para ver los indicadores.</p>
        }
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <!-- Insumos -->
        <div class="xl:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
            <h2 class="text-sm font-bold text-slate-900">Insumos del indicador de negocio (MM$, últimos 3 años)</h2>
            @if (!canManage()) { <span class="text-[11px] text-slate-500">Solo lectura</span> }
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs min-w-[640px]">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="text-left py-2 px-3">Concepto</th>
                  @for (y of draft().years; track y.year; let i = $index) {
                    <th class="text-right py-2 px-3">
                      <input type="number" [value]="y.year" [disabled]="!canManage()" (change)="setYear(i, +$any($event.target).value)"
                        class="w-16 text-right text-xs font-mono rounded border border-slate-200 px-1 py-0.5 disabled:bg-transparent disabled:border-transparent" />
                    </th>
                  }
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (f of fields; track f.key) {
                  <tr>
                    <td class="py-1.5 px-3 text-slate-700">
                      {{ f.label }} <span class="text-[10px] text-slate-400">· {{ f.component }}</span>
                    </td>
                    @for (y of draft().years; track y.year; let i = $index) {
                      <td class="py-1.5 px-3 text-right">
                        <input type="number" [value]="y[f.key]" [disabled]="!canManage()" (input)="setField(i, f.key, +$any($event.target).value)"
                          class="w-28 text-right text-xs font-mono rounded border border-slate-300 px-2 py-1 disabled:bg-slate-50" />
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="px-4 py-3 border-t border-slate-200 grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Valor UF ($)</span><input type="number" step="0.01" [value]="draft().ufValueClp" [disabled]="!canManage()" (input)="setParam('ufValueClp', +$any($event.target).value)" class="w-full text-xs font-mono rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></label>
            <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Años mínimos para ILM</span><input type="number" min="1" [value]="draft().minLossYears" [disabled]="!canManage()" (input)="setParam('minLossYears', +$any($event.target).value)" class="w-full text-xs font-mono rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></label>
            <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Tipo de cambio CLP/USD</span><input type="number" [value]="draft().usdToClp" [disabled]="!canManage()" (input)="setParam('usdToClp', +$any($event.target).value)" class="w-full text-xs font-mono rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></label>
            <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Patrimonio / APR (%)</span><input type="number" step="0.5" [value]="draft().capitalRatio * 100" [disabled]="!canManage()" (input)="setParam('capitalRatio', +$any($event.target).value / 100)" class="w-full text-xs font-mono rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-50" /></label>
            <label class="flex items-center gap-2 text-xs pb-1"><input type="checkbox" [checked]="draft().useIlm" [disabled]="!canManage()" (change)="setParam('useIlm', $any($event.target).checked)" class="rounded" /> Usar ILM con pérdidas</label>
          </div>
          <div class="px-4 pb-3 grid grid-cols-1 2xl:grid-cols-2 gap-2">
            @for (b of draft().buckets; track $index; let bi = $index) {
              <div class="flex items-center gap-2 text-[11px] text-slate-600">
                <span class="shrink-0 font-semibold">Tramo {{ bi + 1 }}:</span>
                @if (b.upToUF !== null) {
                  <span>hasta</span>
                  <input type="number" [value]="b.upToUF" [disabled]="!canManage()" (input)="setBucket(bi, 'upToUF', +$any($event.target).value)" class="w-28 text-xs font-mono rounded border border-slate-300 px-1.5 py-0.5 disabled:bg-slate-50" />
                  <span>UF</span>
                } @else { <span>resto del BI</span> }
                <span>· coef.</span>
                <input type="number" step="0.5" [value]="b.coefficient * 100" [disabled]="!canManage()" (input)="setBucket(bi, 'coefficient', +$any($event.target).value / 100)" class="w-16 text-xs font-mono rounded border border-slate-300 px-1.5 py-0.5 disabled:bg-slate-50" />
                <span>%</span>
              </div>
            }
          </div>
          @if (canManage()) {
            <div class="px-4 pb-3 flex justify-end gap-2">
              <button type="button" (click)="exportCsv()" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm text-emerald-600">download</mat-icon>Exportar cálculo</button>
              <button type="button" (click)="reset()" [disabled]="!dirty()" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white disabled:opacity-40 cursor-pointer">Descartar</button>
              <button type="button" (click)="save()" [disabled]="!dirty()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-40 cursor-pointer">Guardar insumos</button>
            </div>
          }
        </div>

        <!-- Desglose -->
        <div class="bg-white rounded-2xl border border-slate-200 p-4 space-y-2 text-xs">
          <h2 class="text-sm font-bold text-slate-900 mb-1">Cálculo (Basilea III, OPE25)</h2>
          <div class="flex justify-between"><span class="text-slate-600">Componente intereses (ILDC)</span><span class="font-mono">{{ r().ildc | number:'1.0-0' }}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">Componente servicios (SC)</span><span class="font-mono">{{ r().sc | number:'1.0-0' }}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">Componente financiero (FC)</span><span class="font-mono">{{ r().fc | number:'1.0-0' }}</span></div>
          <div class="flex justify-between border-t border-slate-100 pt-1 font-semibold"><span>BI = ILDC + SC + FC</span><span class="font-mono">{{ r().bi | number:'1.0-0' }}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">BIC (coeficientes marginales por tramo)</span><span class="font-mono">{{ r().bic | number:'1.0-0' }}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">Pérdida neta anual promedio</span><span class="font-mono">{{ r().avgNetLossMM | number:'1.1-1' }}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">LC = 15 × pérdida promedio</span><span class="font-mono">{{ r().lc | number:'1.1-1' }}</span></div>
          <div class="flex justify-between"><span class="text-slate-600">ILM = ln(e − 1 + (LC/BIC)^0,8)</span><span class="font-mono">{{ r().ilm | number:'1.3-3' }}</span></div>
          <div class="flex justify-between border-t border-slate-100 pt-1 font-semibold"><span>Requerimiento = BIC × ILM</span><span class="font-mono">{{ r().orc | number:'1.0-0' }}</span></div>
          <div class="flex justify-between font-semibold text-emerald-800"><span>APR = 12,5 × requerimiento</span><span class="font-mono">{{ r().apr | number:'1.0-0' }}</span></div>
          <p class="text-[10px] text-slate-500 pt-2">ILDC = min(|ingresos − gastos por intereses|, 2,25 % × activos que devengan) + dividendos; SC = máx(otros ingresos, otros gastos) + máx(comisiones ganadas, pagadas); FC = |resultado cartera de negociación| + |resultado cartera bancaria|. Promedios de 3 años. Cifras en MM$.</p>
        </div>
      </div>

      <!-- Historial de pérdidas -->
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-bold text-slate-900">Historial de pérdidas operacionales por año</h2>
            <p class="text-[11px] text-slate-500">Base para el componente de pérdidas. Basilea exige 10 años de datos de calidad (5 en transición). Sobre el umbral de registro de {{ rs.lossRegistrationThresholdUSD() | number:'1.0-0' }} USD.</p>
          </div>
          <div class="flex gap-3 text-[11px]">
            <span class="px-2 py-1 rounded-lg bg-slate-100">Años con datos: <strong>{{ q().yearsAvailable }}</strong></span>
            <span class="px-2 py-1 rounded-lg" [class]="(q().completePct ?? 0) >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'">Eventos completos: <strong>{{ q().completePct === null ? '—' : q().completePct + '%' }}</strong></span>
            <span class="px-2 py-1 rounded-lg bg-slate-100">Sin fecha contable: <strong>{{ q().withoutAccountingDate }}</strong></span>
          </div>
        </div>
        <table class="w-full text-xs">
          <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <tr><th class="text-left py-2 px-3">Año</th><th class="text-right py-2 px-3">Eventos</th><th class="text-right py-2 px-3">Sobre umbral</th><th class="text-right py-2 px-3">Bruta USD</th><th class="text-right py-2 px-3">Recuperada USD</th><th class="text-right py-2 px-3">Neta USD</th><th class="text-right py-2 px-3">Neta MM$</th><th class="text-right py-2 px-3">Incompletos</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (h of apr.lossHistory(); track h.year) {
              <tr>
                <td class="py-2 px-3 font-mono font-semibold">{{ h.year }}</td>
                <td class="py-2 px-3 text-right font-mono">{{ h.events }}</td>
                <td class="py-2 px-3 text-right font-mono">{{ h.aboveThreshold }}</td>
                <td class="py-2 px-3 text-right font-mono text-rose-700">{{ h.gross | number:'1.0-0' }}</td>
                <td class="py-2 px-3 text-right font-mono text-emerald-700">{{ h.recovered | number:'1.0-0' }}</td>
                <td class="py-2 px-3 text-right font-mono font-bold">{{ h.net | number:'1.0-0' }}</td>
                <td class="py-2 px-3 text-right font-mono">{{ h.net * inp().usdToClp / 1000000 | number:'1.1-1' }}</td>
                <td class="py-2 px-3 text-right font-mono" [class.text-amber-700]="h.incomplete > 0">{{ h.incomplete }}</td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="py-6 text-center text-slate-500">No hay eventos con pérdida en la base.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AprPanel {
  readonly apr = inject(AprService);
  readonly rs = inject(RiskDataService);
  readonly notify = output<string>();

  readonly fields: { key: YearField; label: string; component: string }[] = [
    { key: 'interestIncome', label: 'Ingresos por intereses', component: 'ILDC' },
    { key: 'interestExpense', label: 'Gastos por intereses', component: 'ILDC' },
    { key: 'interestEarningAssets', label: 'Activos que devengan intereses', component: 'ILDC' },
    { key: 'dividendIncome', label: 'Ingresos por dividendos', component: 'ILDC' },
    { key: 'feeIncome', label: 'Ingresos por comisiones', component: 'SC' },
    { key: 'feeExpense', label: 'Gastos por comisiones', component: 'SC' },
    { key: 'otherOpIncome', label: 'Otros ingresos operacionales', component: 'SC' },
    { key: 'otherOpExpense', label: 'Otros gastos operacionales', component: 'SC' },
    { key: 'netTradingPL', label: 'Resultado neto cartera de negociación', component: 'FC' },
    { key: 'netBankingBookPL', label: 'Resultado neto cartera bancaria', component: 'FC' },
  ];

  readonly draft = signal<AprInputs>(normalizeAprInputs(this.apr.inputs()));
  readonly dirty = computed(() => JSON.stringify(this.draft()) !== JSON.stringify(normalizeAprInputs(this.apr.inputs())));
  readonly canManage = computed(() => !!this.rs.currentProfile().permissions.canManageRegulatoryReports);

  /** Mientras se edita, el resultado refleja el borrador. */
  readonly inp = computed(() => this.draft());
  readonly r = computed(() => computeApr(this.draft(), this.apr.lossHistory()));
  readonly q = this.apr.dataQuality;

  setField(i: number, key: YearField, value: number) {
    this.draft.update(d => ({ ...d, years: d.years.map((y, idx) => (idx === i ? { ...y, [key]: value || 0 } : y)) }));
  }
  setYear(i: number, year: number) {
    this.draft.update(d => ({ ...d, years: d.years.map((y, idx) => (idx === i ? { ...y, year } : y)) }));
  }
  setParam<K extends keyof AprInputs>(key: K, value: AprInputs[K]) {
    this.draft.update(d => ({ ...d, [key]: value }));
  }
  setBucket(i: number, key: 'upToUF' | 'coefficient', value: number) {
    this.draft.update(d => ({ ...d, buckets: d.buckets.map((b, idx) => (idx === i ? { ...b, [key]: value || 0 } : b)) }));
  }
  setOpt(key: 'effectiveEquityMM' | 'otherRwaMM' | 'totalAssetsMM', raw: string) {
    this.draft.update(d => ({ ...d, [key]: raw === '' ? undefined : +raw }));
  }
  reset() { this.draft.set(normalizeAprInputs(this.apr.inputs())); }

  exportCsv() {
    const d = this.draft();
    const r = this.r();
    const rows: (string | number)[][] = [
      ['Simulación APR por riesgo operacional (referencial; CAC-20 en consulta)'],
      ['Generado', new Date().toISOString(), 'Por', this.rs.currentProfile().name],
      [],
      ['Concepto', ...d.years.map(y => String(y.year))],
      ...this.fields.map(f => [f.label, ...d.years.map(y => y[f.key])]),
      [],
      ['Valor UF', d.ufValueClp],
      ...d.buckets.map((b, i) => [`Tramo ${i + 1}`, b.upToUF === null ? 'resto' : b.upToUF, `${b.coefficient * 100}%`]),
      [],
      ['ILDC (MM$)', r.ildc], ['SC (MM$)', r.sc], ['FC (MM$)', r.fc], ['BI (MM$)', r.bi], ['BI (UF)', Math.round(r.biUF)],
      ['BIC (MM$)', r.bic], ['Años de pérdidas', r.lossYears], ['LC (MM$)', r.lc], ['ILM', r.ilm],
      ['Requerimiento (MM$)', r.orc], ['APR operacional (MM$)', r.apr], [`Patrimonio asociado ${d.capitalRatio * 100}% (MM$)`, r.capitalForApr],
    ];
    if (r.solvency) {
      rows.push([], ['APR totales (MM$)', r.solvency.totalRwa], ['Patrimonio efectivo / APR', r.solvency.peToRwa]);
      if (r.solvency.peToAssets !== undefined) rows.push(['Patrimonio efectivo / activos', r.solvency.peToAssets]);
    }
    downloadCsv(`APR_operacional_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
  async save() {
    await this.apr.saveInputs(this.draft());
    this.draft.set(structuredClone(this.apr.inputs()));
    this.notify.emit('Insumos de APR guardados.');
  }
}
