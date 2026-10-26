import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { Risk } from '../models/risk.model';
import { MoneyPipe } from '../utils/money.pipe';

@Component({
  selector: 'app-risk-charts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MoneyPipe],
  template: `
    <div class="space-y-6">
      
      <!-- Section Header with Department Filter -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                <mat-icon class="text-lg">analytics</mat-icon>
              </span>
              <h2 class="text-base font-bold text-slate-900 tracking-tight">
                Centro de Gráficos & Analítica Avanzada
              </h2>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              Visualización comparativa de exposición financiera, migración de severidad, pérdidas e indicadores de salud operacional
            </p>
          </div>

          <!-- Process / Department Quick Selector -->
          <div class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <span class="text-xs font-medium text-slate-500 whitespace-nowrap">Filtrar por Proceso:</span>
            <select
              [value]="selectedProcess()"
              (change)="onProcessChange($event)"
              class="text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="TODOS">Todos los Macroprocesos</option>
              @for (proc of riskService.defaultProcesses; track proc) {
                <option [value]="proc">{{ proc }}</option>
              }
            </select>
          </div>
        </div>
      </div>

      <!-- Top Row: Financial Exposure Comparison & Risk Severity Migration -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Chart 1: Comparativa de Exposición Financiera (Inherente vs Residual vs Mitigada) -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <mat-icon class="text-emerald-600 text-sm">paid</mat-icon>
                <h3 class="text-sm font-bold text-slate-900">
                  Exposición Financiera por Proceso ({{ riskService.currencyCode() }})
                </h3>
              </div>
              <span class="text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Inherente vs Residual
              </span>
            </div>

            <!-- Horizontal Bars for each process -->
            <div class="space-y-4 pt-1">
              @for (item of exposureChartData(); track item.process) {
                <div class="space-y-1.5">
                  <div class="flex items-center justify-between text-xs">
                    <span class="font-medium text-slate-800 truncate max-w-[200px]" [title]="item.process">
                      {{ item.process }}
                    </span>
                    <div class="text-[11px] font-mono text-slate-600 space-x-2">
                      <span class="text-slate-400">Inh: {{ item.inherentExposureUSD | money }}</span>
                      <span class="font-bold text-slate-900">Res: {{ item.residualExposureUSD | money }}</span>
                      <span class="text-emerald-700 font-semibold">(-{{ item.mitigationPct }}%)</span>
                    </div>
                  </div>

                  <!-- Stacked / Comparison Progress Track -->
                  <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden flex relative">
                    <!-- Inherent Exposure total ghost background -->
                    <div
                      class="h-full bg-slate-200 absolute left-0 top-0 transition-all duration-500"
                      [style.width.%]="(item.inherentExposureUSD / maxExposureUSD()) * 100"
                      title="Exposición Bruta Inherente"
                    ></div>
                    <!-- Residual Exposure fill -->
                    <div
                      class="h-full transition-all duration-500 relative z-10 rounded-full"
                      [class]="item.maxResidualLevel === 'Crítico' ? 'bg-rose-600' : item.maxResidualLevel === 'Alto' ? 'bg-amber-500' : 'bg-emerald-500'"
                      [style.width.%]="(item.residualExposureUSD / maxExposureUSD()) * 100"
                      title="Exposición Neta Residual"
                    ></div>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Legend -->
          <div class="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <div class="flex items-center gap-3">
              <span class="flex items-center gap-1">
                <span class="w-2.5 h-2.5 rounded bg-slate-200"></span>
                <span>Exposición Inherente</span>
              </span>
              <span class="flex items-center gap-1">
                <span class="w-2.5 h-2.5 rounded bg-rose-600"></span>
                <span>Residual Crítica</span>
              </span>
              <span class="flex items-center gap-1">
                <span class="w-2.5 h-2.5 rounded bg-emerald-500"></span>
                <span>Residual Mitigada</span>
              </span>
            </div>
            <span class="font-mono text-slate-700 font-medium">Mitigación Total: {{ riskService.metrics().mitigationEfficiencyPct }}%</span>
          </div>
        </div>

        <!-- Chart 2: Matriz de Migración de Severidad de Riesgos -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <mat-icon class="text-indigo-600 text-sm">compare_arrows</mat-icon>
                <h3 class="text-sm font-bold text-slate-900">
                  Migración de Severidad (Efecto de Controles)
                </h3>
              </div>
              <span class="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Antes vs Después
              </span>
            </div>

            <!-- Migration comparison visual cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <!-- Crítico -->
              <div class="bg-rose-50/70 border border-rose-200 rounded-xl p-3 text-center">
                <span class="text-[10px] font-bold uppercase tracking-wider text-rose-800">Crítico</span>
                <div class="flex items-center justify-center gap-1.5 my-1 font-mono">
                  <span class="text-lg font-bold text-slate-500 line-through">{{ severityStats().inherentCrit }}</span>
                  <mat-icon class="text-xs text-rose-600">arrow_forward</mat-icon>
                  <span class="text-xl font-extrabold text-rose-700">{{ severityStats().residualCrit }}</span>
                </div>
                <span class="text-[10px] text-rose-600 font-medium">
                  {{ severityStats().residualCrit < severityStats().inherentCrit ? 'Mitigado ' + (severityStats().inherentCrit - severityStats().residualCrit) : 'Sin cambio' }}
                </span>
              </div>

              <!-- Alto -->
              <div class="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-center">
                <span class="text-[10px] font-bold uppercase tracking-wider text-amber-800">Alto</span>
                <div class="flex items-center justify-center gap-1.5 my-1 font-mono">
                  <span class="text-lg font-bold text-slate-500">{{ severityStats().inherentHigh }}</span>
                  <mat-icon class="text-xs text-amber-600">arrow_forward</mat-icon>
                  <span class="text-xl font-extrabold text-amber-700">{{ severityStats().residualHigh }}</span>
                </div>
                <span class="text-[10px] text-amber-700 font-medium">Bajo control activo</span>
              </div>

              <!-- Medio -->
              <div class="bg-blue-50/70 border border-blue-200 rounded-xl p-3 text-center">
                <span class="text-[10px] font-bold uppercase tracking-wider text-blue-800">Medio</span>
                <div class="flex items-center justify-center gap-1.5 my-1 font-mono">
                  <span class="text-lg font-bold text-slate-500">{{ severityStats().inherentMed }}</span>
                  <mat-icon class="text-xs text-blue-600">arrow_forward</mat-icon>
                  <span class="text-xl font-extrabold text-blue-700">{{ severityStats().residualMed }}</span>
                </div>
                <span class="text-[10px] text-blue-600 font-medium">Monitoreo trimestral</span>
              </div>

              <!-- Bajo -->
              <div class="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-center">
                <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Bajo</span>
                <div class="flex items-center justify-center gap-1.5 my-1 font-mono">
                  <span class="text-lg font-bold text-slate-500">{{ severityStats().inherentLow }}</span>
                  <mat-icon class="text-xs text-emerald-600">arrow_forward</mat-icon>
                  <span class="text-xl font-extrabold text-emerald-700">{{ severityStats().residualLow }}</span>
                </div>
                <span class="text-[10px] text-emerald-700 font-medium">Riesgo aceptado</span>
              </div>
            </div>

            <!-- Proportional Distribution Progress Bars -->
            <div class="space-y-3">
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="font-medium text-slate-700">Distribución de Riesgo Inherente (Bruto)</span>
                  <span class="font-mono text-slate-500 text-[11px]">{{ filteredRisks().length }} Riesgos</span>
                </div>
                <div class="h-3.5 w-full bg-slate-100 rounded-full flex overflow-hidden">
                  <div class="bg-rose-500 h-full" [style.width.%]="severityStats().inhCritPct" [title]="'Crítico: ' + severityStats().inherentCrit"></div>
                  <div class="bg-amber-400 h-full" [style.width.%]="severityStats().inhHighPct" [title]="'Alto: ' + severityStats().inherentHigh"></div>
                  <div class="bg-blue-400 h-full" [style.width.%]="severityStats().inhMedPct" [title]="'Medio: ' + severityStats().inherentMed"></div>
                  <div class="bg-emerald-400 h-full" [style.width.%]="severityStats().inhLowPct" [title]="'Bajo: ' + severityStats().inherentLow"></div>
                </div>
              </div>

              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="font-medium text-slate-700">Distribución de Riesgo Residual (Post-Controles)</span>
                  <span class="font-mono text-emerald-700 font-semibold text-[11px]">{{ riskService.metrics().mitigationEfficiencyPct }}% Mitigación</span>
                </div>
                <div class="h-3.5 w-full bg-slate-100 rounded-full flex overflow-hidden">
                  <div class="bg-rose-600 h-full" [style.width.%]="severityStats().resCritPct" [title]="'Crítico: ' + severityStats().residualCrit"></div>
                  <div class="bg-amber-500 h-full" [style.width.%]="severityStats().resHighPct" [title]="'Alto: ' + severityStats().residualHigh"></div>
                  <div class="bg-blue-500 h-full" [style.width.%]="severityStats().resMedPct" [title]="'Medio: ' + severityStats().residualMed"></div>
                  <div class="bg-emerald-500 h-full" [style.width.%]="severityStats().resLowPct" [title]="'Bajo: ' + severityStats().residualLow"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Reducción de severidad crítica por controles efectivos</span>
            <span class="font-mono font-bold text-slate-700">ISO 31000 / Basilea III</span>
          </div>
        </div>

      </div>

      <!-- Bottom Row: Operational Losses/Incidents & Control Effectiveness Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Chart 3: Balance de Pérdidas Operacionales e Incidentes -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <mat-icon class="text-rose-600 text-sm">report_problem</mat-icon>
                <h3 class="text-sm font-bold text-slate-900">
                  Pérdidas Operacionales & Recuperación
                </h3>
              </div>
              <span class="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Incidentes Reales
              </span>
            </div>

            <!-- Financial Loss Totals -->
            <div class="grid grid-cols-2 gap-2 mb-4">
              <div class="p-3 bg-rose-50 rounded-lg border border-rose-100">
                <span class="text-[10px] text-rose-700 uppercase font-bold block">Pérdida Bruta</span>
                <span class="text-base font-extrabold font-mono text-rose-800">
                  {{ incidentLossStats().grossUSD | money }}
                </span>
                <span class="text-[10px] text-slate-500 block">Total contabilizado</span>
              </div>
              <div class="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <span class="text-[10px] text-emerald-700 uppercase font-bold block">Recuperado</span>
                <span class="text-base font-extrabold font-mono text-emerald-800">
                  {{ incidentLossStats().recoveredUSD | money }}
                </span>
                <span class="text-[10px] text-emerald-700 block font-medium">
                  {{ incidentLossStats().recoveryPct }}% recuperado
                </span>
              </div>
            </div>

            <!-- Breakdown by incident type -->
            <div class="space-y-2.5">
              <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Pérdida Neta por Macroproceso
              </span>
              @for (item of incidentLossStats().byProcess; track item.process) {
                <div class="text-xs space-y-1">
                  <div class="flex justify-between text-slate-700">
                    <span class="font-medium truncate max-w-[180px]">{{ item.process }}</span>
                    <span class="font-mono font-bold text-slate-900">{{ item.netLossUSD | money }}</span>
                  </div>
                  <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      class="bg-rose-500 h-full rounded-full"
                      [style.width.%]="(item.netLossUSD / (incidentLossStats().grossUSD || 1)) * 100"
                    ></div>
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Incidentes reportados: {{ riskService.flaws().length }}</span>
            <span class="text-rose-700 font-semibold font-mono">Pérdida neta: {{ incidentLossStats().netUSD | money }}</span>
          </div>
        </div>

        <!-- Chart 4: Cobertura y Tipología de Controles Internos -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <mat-icon class="text-blue-600 text-sm">verified_user</mat-icon>
                <h3 class="text-sm font-bold text-slate-900">
                  Tipología & Automatización de Controles
                </h3>
              </div>
              <span class="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {{ riskService.controls().length }} Controles
              </span>
            </div>

            <!-- Breakdown by Control Type (Preventive, Detective, Corrective) -->
            <div class="space-y-3 mb-4">
              <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Por Naturaleza Operacional
              </span>
              
              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-slate-700 font-medium">Preventivos</span>
                  <span class="font-mono text-emerald-700 font-bold">{{ controlStats().preventive }} ({{ controlStats().preventivePct }}%)</span>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div class="bg-emerald-500 h-full rounded-full" [style.width.%]="controlStats().preventivePct"></div>
                </div>
              </div>

              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-slate-700 font-medium">Detectivos</span>
                  <span class="font-mono text-indigo-700 font-bold">{{ controlStats().detective }} ({{ controlStats().detectivePct }}%)</span>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div class="bg-indigo-500 h-full rounded-full" [style.width.%]="controlStats().detectivePct"></div>
                </div>
              </div>

              <div>
                <div class="flex justify-between text-xs mb-1">
                  <span class="text-slate-700 font-medium">Correctivos</span>
                  <span class="font-mono text-amber-700 font-bold">{{ controlStats().corrective }} ({{ controlStats().correctivePct }}%)</span>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div class="bg-amber-500 h-full rounded-full" [style.width.%]="controlStats().correctivePct"></div>
                </div>
              </div>
            </div>

            <!-- Breakdown by Automation Level -->
            <div class="space-y-2 pt-2 border-t border-slate-100">
              <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Grado de Automatización
              </span>
              <div class="grid grid-cols-3 gap-2 text-center text-xs">
                <div class="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <span class="text-[10px] text-slate-500 block">Automático</span>
                  <span class="text-sm font-bold font-mono text-emerald-700">{{ controlStats().automatic }}</span>
                </div>
                <div class="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <span class="text-[10px] text-slate-500 block">Semiauto</span>
                  <span class="text-sm font-bold font-mono text-blue-700">{{ controlStats().semiauto }}</span>
                </div>
                <div class="p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <span class="text-[10px] text-slate-500 block">Manual</span>
                  <span class="text-sm font-bold font-mono text-slate-700">{{ controlStats().manual }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Eficacia promedio global</span>
            <span class="font-mono font-bold text-slate-900">{{ riskService.metrics().avgControlEffectiveness }}%</span>
          </div>
        </div>

        <!-- Chart 5: Termómetro del Índice de Salud Operacional (OHI) -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <mat-icon class="text-emerald-600 text-sm">health_and_safety</mat-icon>
                <h3 class="text-sm font-bold text-slate-900">
                  Salud Operacional (OHI)
                </h3>
              </div>
              <span class="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Score 0 - 100
              </span>
            </div>

            <!-- Big Gauge / OHI Number -->
            <div class="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center mb-4">
              <span class="text-3xl font-extrabold font-mono text-slate-900">
                {{ riskService.metrics().operationalHealthIndex }}
                <span class="text-xs text-slate-500 font-sans font-normal">/ 100</span>
              </span>
              <div class="mt-1 flex items-center justify-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span class="text-xs font-bold text-emerald-800">
                  Nivel Resiliente & Controlado
                </span>
              </div>
            </div>

            <!-- Health Factors Breakdown -->
            <div class="space-y-2 text-xs">
              <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                Factores Ponderados
              </span>
              
              <div class="flex justify-between items-center py-1 border-b border-slate-100">
                <span class="text-slate-600">Eficacia de Controles</span>
                <span class="font-mono font-semibold text-slate-900">{{ riskService.metrics().avgControlEffectiveness }}% (Pond. 40%)</span>
              </div>

              <div class="flex justify-between items-center py-1 border-b border-slate-100">
                <span class="text-slate-600">Mitigación Financiera</span>
                <span class="font-mono font-semibold text-slate-900">{{ riskService.metrics().mitigationEfficiencyPct }}% (Pond. 35%)</span>
              </div>

              <div class="flex justify-between items-center py-1 border-b border-slate-100">
                <span class="text-slate-600">Auditorías & Cumplimiento</span>
                <span class="font-mono font-semibold text-slate-900">{{ riskService.metrics().auditCompliancePct }}% (Pond. 25%)</span>
              </div>

              <div class="flex justify-between items-center py-1 text-rose-700">
                <span>Penalización por KRIs Activos</span>
                <span class="font-mono font-semibold">-{{ riskService.metrics().appliedAlertsPenalty }} pts</span>
              </div>
            </div>
          </div>

          <div class="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Calificación según Basilea III</span>
            <span class="font-mono text-emerald-700 font-bold">Grado A (Excelente)</span>
          </div>
        </div>

      </div>

    </div>
  `
})
export class RiskCharts {
  readonly riskService = inject(RiskDataService);

  readonly selectedProcess = signal<string>('TODOS');
  readonly riskSelected = output<Risk>();

  onProcessChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedProcess.set(val);
  }

  readonly filteredRisks = computed(() => {
    const p = this.selectedProcess();
    const all = this.riskService.risks();
    if (p === 'TODOS') return all;
    return all.filter(r => r.process === p);
  });

  readonly maxExposureUSD = computed(() => {
    const list = this.riskService.processHeatmapSummaries();
    const max = Math.max(...list.map(i => i.inherentExposureUSD), 100000);
    return max;
  });

  readonly exposureChartData = computed(() => {
    const p = this.selectedProcess();
    const list = this.riskService.processHeatmapSummaries();
    if (p === 'TODOS') return list;
    return list.filter(i => i.process === p);
  });

  readonly severityStats = computed(() => {
    const risks = this.filteredRisks();
    const total = risks.length || 1;

    const inherentCrit = risks.filter(r => r.inherentLevel === 'Crítico').length;
    const inherentHigh = risks.filter(r => r.inherentLevel === 'Alto').length;
    const inherentMed = risks.filter(r => r.inherentLevel === 'Medio').length;
    const inherentLow = risks.filter(r => r.inherentLevel === 'Bajo').length;

    const residualCrit = risks.filter(r => r.residualLevel === 'Crítico').length;
    const residualHigh = risks.filter(r => r.residualLevel === 'Alto').length;
    const residualMed = risks.filter(r => r.residualLevel === 'Medio').length;
    const residualLow = risks.filter(r => r.residualLevel === 'Bajo').length;

    return {
      inherentCrit,
      inherentHigh,
      inherentMed,
      inherentLow,
      residualCrit,
      residualHigh,
      residualMed,
      residualLow,
      inhCritPct: Math.round((inherentCrit / total) * 100),
      inhHighPct: Math.round((inherentHigh / total) * 100),
      inhMedPct: Math.round((inherentMed / total) * 100),
      inhLowPct: Math.round((inherentLow / total) * 100),
      resCritPct: Math.round((residualCrit / total) * 100),
      resHighPct: Math.round((residualHigh / total) * 100),
      resMedPct: Math.round((residualMed / total) * 100),
      resLowPct: Math.round((residualLow / total) * 100),
    };
  });

  readonly incidentLossStats = computed(() => {
    const flaws = this.riskService.flaws().filter(f => f.status !== 'Descartada');
    const grossUSD = flaws.reduce((acc, f) => acc + (f.realLossAmountUSD || 0), 0);
    const recoveredUSD = flaws.reduce((acc, f) => acc + (f.recoveredAmountUSD || 0), 0);
    const netUSD = Math.max(0, grossUSD - recoveredUSD);
    const recoveryPct = grossUSD > 0 ? Math.round((recoveredUSD / grossUSD) * 100) : 0;

    const processMap = new Map<string, number>();
    for (const f of flaws) {
      const net = Math.max(0, (f.realLossAmountUSD || 0) - (f.recoveredAmountUSD || 0));
      processMap.set(f.process, (processMap.get(f.process) || 0) + net);
    }

    const byProcess: { process: string; netLossUSD: number }[] = [];
    processMap.forEach((netLossUSD, process) => {
      byProcess.push({ process, netLossUSD });
    });
    byProcess.sort((a, b) => b.netLossUSD - a.netLossUSD);

    return {
      grossUSD,
      recoveredUSD,
      netUSD,
      recoveryPct,
      byProcess
    };
  });

  readonly controlStats = computed(() => {
    const controls = this.riskService.controls();
    const total = controls.length || 1;

    const preventive = controls.filter(c => c.type === 'Preventivo').length;
    const detective = controls.filter(c => c.type === 'Detectivo').length;
    const corrective = controls.filter(c => c.type === 'Correctivo').length;

    const automatic = controls.filter(c => c.automation === 'Automático').length;
    const semiauto = controls.filter(c => c.automation === 'Semiautomático').length;
    const manual = controls.filter(c => c.automation === 'Manual').length;

    return {
      preventive,
      detective,
      corrective,
      preventivePct: Math.round((preventive / total) * 100),
      detectivePct: Math.round((detective / total) * 100),
      correctivePct: Math.round((corrective / total) * 100),
      automatic,
      semiauto,
      manual
    };
  });
}
