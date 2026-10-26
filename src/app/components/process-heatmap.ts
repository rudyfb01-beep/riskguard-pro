import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { ProcessHeatmapSummary, Risk, RiskLevel } from '../models/risk.model';
import { MoneyPipe } from '../utils/money.pipe';

@Component({
  selector: 'app-process-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MoneyPipe],
  template: `
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">
      
      <!-- Section Header -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <mat-icon class="text-lg">view_cozy</mat-icon>
            </span>
            <h2 class="text-base font-bold text-slate-900">
              Mapa de Calor por Proceso de Negocio
            </h2>
            <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Matriz 4×4 por Proceso
            </span>
          </div>
          <p class="text-xs text-slate-500 mt-1">
            Distribución cuantitativa de calor 4×4 (Probabilidad × Impacto), exposición económica y mitigación de controles por cada macroproceso.
            Pasa el mouse sobre cualquier cuadrante y pincha para navegar directamente al riesgo.
          </p>
        </div>

        <!-- Controls: Mode Switcher & View Switcher -->
        <div class="flex flex-wrap items-center gap-2">
          
          <!-- Mode Switcher (Inherente vs Residual) -->
          <div class="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-medium">
            <button
              type="button"
              (click)="mode.set('residual')"
              [class]="mode() === 'residual'
                ? 'bg-emerald-600 text-white shadow-xs px-3 py-1 rounded-md font-semibold'
                : 'text-slate-600 hover:text-slate-900 px-3 py-1 cursor-pointer'"
            >
              Riesgo Residual
            </button>
            <button
              type="button"
              (click)="mode.set('inherent')"
              [class]="mode() === 'inherent'
                ? 'bg-white text-slate-900 shadow-xs px-3 py-1 rounded-md font-semibold'
                : 'text-slate-600 hover:text-slate-900 px-3 py-1 cursor-pointer'"
            >
              Riesgo Inherente
            </button>
          </div>

          <!-- View Mode Toggle -->
          <div class="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-medium">
            <button
              type="button"
              (click)="viewMode.set('cards')"
              [class]="viewMode() === 'cards'
                ? 'bg-slate-900 text-white shadow-xs px-2.5 py-1 rounded-md font-semibold'
                : 'text-slate-600 hover:text-slate-900 px-2.5 py-1 cursor-pointer'"
              title="Ver cuadrículas de calor por proceso"
            >
              <mat-icon class="text-xs mr-1 align-middle">grid_view</mat-icon>
              <span>Tarjetas 4×4</span>
            </button>
            <button
              type="button"
              (click)="viewMode.set('comparison')"
              [class]="viewMode() === 'comparison'
                ? 'bg-slate-900 text-white shadow-xs px-2.5 py-1 rounded-md font-semibold'
                : 'text-slate-600 hover:text-slate-900 px-2.5 py-1 cursor-pointer'"
              title="Ver tabla comparativa ejecutiva"
            >
              <mat-icon class="text-xs mr-1 align-middle">table_rows</mat-icon>
              <span>Tabla Comparativa</span>
            </button>
            <button
              type="button"
              (click)="viewMode.set('detailed')"
              [class]="viewMode() === 'detailed'
                ? 'bg-slate-900 text-white shadow-xs px-2.5 py-1 rounded-md font-semibold'
                : 'text-slate-600 hover:text-slate-900 px-2.5 py-1 cursor-pointer'"
              title="Ver mapa expandido de un proceso seleccionado"
            >
              <mat-icon class="text-xs mr-1 align-middle">fullscreen</mat-icon>
              <span>Foco en Proceso</span>
            </button>
          </div>

        </div>
      </div>

      <!-- VIEW 1: PROCESS CARDS WITH 4×4 MINI HEATMAPS -->
      @if (viewMode() === 'cards') {
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          @for (summary of riskService.processHeatmapSummaries(); track summary.process) {
            @let level = mode() === 'inherent' ? summary.maxInherentLevel : summary.maxResidualLevel;
            @let exposure = mode() === 'inherent' ? summary.inherentExposureUSD : summary.residualExposureUSD;
            @let avgScore = mode() === 'inherent' ? summary.avgInherentScore : summary.avgResidualScore;

            <div class="bg-slate-50/60 rounded-xl border border-slate-200/90 hover:border-slate-300 hover:shadow-md transition-all p-4 flex flex-col justify-between">
              
              <!-- Process Card Header -->
              <div>
                <div class="flex items-start justify-between gap-2 mb-2">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span
                      class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
                      [class]="processIconContainerClass(level)"
                    >
                      <mat-icon class="text-base">{{ summary.icon }}</mat-icon>
                    </span>
                    <div class="min-w-0">
                      <h3 class="text-xs font-bold text-slate-900 truncate" [title]="summary.process">
                        {{ summary.process }}
                      </h3>
                      <p class="text-[10px] text-slate-500 truncate" [title]="summary.department">
                        {{ summary.department }}
                      </p>
                    </div>
                  </div>

                  <span
                    class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 border"
                    [class]="severityBadgeClass(level)"
                  >
                    {{ summary.risksCount === 0 ? 'Sin Riesgos' : level }}
                  </span>
                </div>

                <!-- Process Metrics Bar -->
                <div class="grid grid-cols-3 gap-2 py-2 mb-3 bg-white rounded-lg border border-slate-200/80 px-2.5 text-center">
                  <div>
                    <span class="text-[9px] uppercase tracking-wider text-slate-400 block font-medium">Riesgos</span>
                    <span class="text-xs font-mono font-bold text-slate-900">{{ summary.risksCount }}</span>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase tracking-wider text-slate-400 block font-medium">Exposición</span>
                    <span class="text-xs font-mono font-bold text-slate-900">{{ exposure | money }}</span>
                  </div>
                  <div>
                    <span class="text-[9px] uppercase tracking-wider text-slate-400 block font-medium">Mitigación</span>
                    <span class="text-xs font-mono font-bold text-emerald-600">{{ summary.mitigationPct }}%</span>
                  </div>
                </div>

                <!-- 4×4 Mini Heatmap Matrix for this process -->
                <div class="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs mb-3">
                  <div class="flex items-center justify-between mb-1.5 px-0.5">
                    <span class="text-[10px] font-semibold text-slate-700 flex items-center gap-1">
                      <mat-icon class="text-xs text-emerald-600">grid_on</mat-icon>
                      <span>Matriz 4×4 de Calor</span>
                    </span>
                    <span class="text-[9px] text-slate-400 font-mono">
                      Score prom: <strong>{{ avgScore }}</strong> / 16
                    </span>
                  </div>

                  <!-- 4×4 Grid Container -->
                  <div class="space-y-1">
                    
                    <!-- Rows (Likelihood: 4 down to 1) -->
                    @for (row of summary.grid; track row[0].likelihood) {
                      <div class="grid grid-cols-4 gap-1">
                        @for (cell of row; track cell.impact) {
                          @let count = mode() === 'inherent' ? cell.inherentCount : cell.residualCount;
                          @let cellRisks = mode() === 'inherent' ? cell.inherentRisks : cell.residualRisks;

                          <div class="relative group/cell">
                            
                            <!-- Mini Cell Button -->
                            <button
                              type="button"
                              (click)="onMiniCellClick(cellRisks)"
                              [class]="getMiniCellClass(cell.level, count > 0)"
                              class="w-full h-8 rounded flex flex-col items-center justify-center p-0.5 transition-all relative border focus:outline-none focus:ring-1 focus:ring-slate-900"
                              [title]="count > 0 ? summary.process + ' | P' + cell.likelihood + ' × I' + cell.impact + ': ' + count + ' riesgo(s). Pincha para ir al riesgo.' : 'P' + cell.likelihood + ' × I' + cell.impact + ': Sin riesgos'"
                            >
                              @if (count > 0) {
                                <div class="flex items-center justify-center w-full h-full">
                                  <span
                                    class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold font-mono text-white shadow-2xs"
                                    [class]="countBadgeColor(cell.level)"
                                  >
                                    {{ count }}
                                  </span>
                                </div>
                              } @else {
                                <span class="text-[9px] text-slate-300 font-mono leading-none">·</span>
                              }
                            </button>

                            <!-- Hover Tooltip / Popover with direct 1-click navigation -->
                            @if (count > 0) {
                              <div
                                class="absolute z-50 w-64 p-2.5 bg-slate-900 text-white rounded-lg shadow-xl border border-slate-700 opacity-0 invisible group-hover/cell:opacity-100 group-hover/cell:visible transition-all duration-150 pointer-events-auto text-left"
                                [class]="getMiniPopoverPosition(cell.likelihood, cell.impact)"
                              >
                                <div class="flex items-center justify-between border-b border-slate-700 pb-1 mb-1.5 text-[10px]">
                                  <span class="font-bold text-slate-100 flex items-center gap-1">
                                    <mat-icon class="text-xs text-emerald-400">gps_fixed</mat-icon>
                                    <span>P{{ cell.likelihood }} × I{{ cell.impact }} ({{ cell.level }})</span>
                                  </span>
                                  <span class="font-mono text-emerald-400 font-semibold">{{ count }} {{ count === 1 ? 'riesgo' : 'riesgos' }}</span>
                                </div>

                                <div class="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                                  @for (rsk of cellRisks; track rsk.id) {
                                    <button
                                      type="button"
                                      (click)="navigateTo(rsk)"
                                      class="w-full text-left p-1.5 bg-slate-800 hover:bg-emerald-950 border border-slate-700 hover:border-emerald-500 rounded transition-all flex items-start gap-1.5 cursor-pointer"
                                    >
                                      <span class="font-mono text-[9px] font-bold text-emerald-400 bg-slate-900 px-1 py-0.2 rounded border border-slate-700 shrink-0">
                                        {{ rsk.code }}
                                      </span>
                                      <div class="flex-1 min-w-0">
                                        <div class="text-[10px] font-medium text-slate-100 line-clamp-1">
                                          {{ rsk.title }}
                                        </div>
                                        <div class="text-[9px] text-emerald-400 flex items-center justify-between mt-0.5">
                                          <span>{{ rsk.residualExposureUSD | money }}</span>
                                          <span class="font-semibold flex items-center gap-0.5">
                                            <span>Ir</span>
                                            <mat-icon class="text-[9px]">arrow_forward</mat-icon>
                                          </span>
                                        </div>
                                      </div>
                                    </button>
                                  }
                                </div>
                                <div class="mt-1 pt-1 border-t border-slate-800 text-[9px] text-slate-400 text-center flex items-center justify-center gap-1">
                                  <mat-icon class="text-[10px] text-emerald-400">touch_app</mat-icon>
                                  <span>Pincha el riesgo para navegar</span>
                                </div>
                              </div>
                            }

                          </div>
                        }
                      </div>
                    }

                  </div>

                  <!-- Axis Mini Indicator -->
                  <div class="flex items-center justify-between mt-1.5 pt-1 border-t border-slate-100 text-[9px] text-slate-400">
                    <span>↑ Probabilidad (1-4)</span>
                    <span>Impacto (1-4) →</span>
                  </div>
                </div>

                <!-- Footer Process Badges: Controls & Incidents -->
                <div class="flex items-center justify-between text-[11px] text-slate-500 mb-2 px-0.5">
                  <span class="flex items-center gap-1">
                    <mat-icon class="text-xs text-slate-400">verified</mat-icon>
                    <span>{{ summary.controlsCount }} controles ({{ summary.avgControlEffectiveness }}% efect.)</span>
                  </span>
                  @if (summary.activeAlertsCount > 0) {
                    <span class="text-rose-600 font-semibold flex items-center gap-0.5">
                      <mat-icon class="text-xs">warning</mat-icon>
                      <span>{{ summary.activeAlertsCount }} alerta(s)</span>
                    </span>
                  }
                </div>

              </div>

              <!-- Card Actions -->
              <div class="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                <button
                  type="button"
                  (click)="filterMainHeatmap(summary.process)"
                  class="text-[11px] font-medium text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1 cursor-pointer"
                  title="Filtrar la matriz principal superior con este proceso"
                >
                  <mat-icon class="text-xs">filter_center_focus</mat-icon>
                  <span>Enfocar matriz principal</span>
                </button>

                <button
                  type="button"
                  (click)="focusProcessDetailed(summary.process)"
                  class="px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <span>Ver detalle</span>
                  <mat-icon class="text-xs">chevron_right</mat-icon>
                </button>
              </div>

            </div>
          }
        </div>
      }

      <!-- VIEW 2: EXECUTIVE COMPARISON TABLE -->
      @if (viewMode() === 'comparison') {
        <div class="overflow-x-auto border border-slate-200 rounded-xl">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th class="py-3 px-4">Proceso Operativo</th>
                <th class="py-3 px-3 text-center">Riesgos</th>
                <th class="py-3 px-3 text-center">Nivel de Calor</th>
                <th class="py-3 px-3">Distribución 4×4 (P×I)</th>
                <th class="py-3 px-3 text-right">Exposición Inherente</th>
                <th class="py-3 px-3 text-right">Exposición Residual</th>
                <th class="py-3 px-3 text-center">Mitigación</th>
                <th class="py-3 px-3 text-center">Salud de Controles</th>
                <th class="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (summary of riskService.processHeatmapSummaries(); track summary.process) {
                @let level = mode() === 'inherent' ? summary.maxInherentLevel : summary.maxResidualLevel;

                <tr class="hover:bg-slate-50/80 transition-colors">
                  <!-- Process Name -->
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2.5">
                      <span
                        class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border"
                        [class]="processIconContainerClass(level)"
                      >
                        <mat-icon class="text-sm">{{ summary.icon }}</mat-icon>
                      </span>
                      <div>
                        <div class="font-bold text-slate-900">{{ summary.process }}</div>
                        <div class="text-[10px] text-slate-500">{{ summary.owner }}</div>
                      </div>
                    </div>
                  </td>

                  <!-- Risks Count -->
                  <td class="py-3 px-3 text-center font-mono font-bold text-slate-800">
                    {{ summary.risksCount }}
                  </td>

                  <!-- Heat Level Badge -->
                  <td class="py-3 px-3 text-center">
                    <span
                      class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border inline-block"
                      [class]="severityBadgeClass(level)"
                    >
                      {{ summary.risksCount === 0 ? 'Sin Riesgos' : level }}
                    </span>
                  </td>

                  <!-- 4×4 Quadrant distribution badges -->
                  <td class="py-3 px-3">
                    <div class="flex flex-wrap items-center gap-1 max-w-xs">
                      @if (summary.risksCount === 0) {
                        <span class="text-slate-400 text-[11px] italic">Sin cuadrantes</span>
                      } @else {
                        @for (rsk of summary.risks; track rsk.id) {
                          @let pl = mode() === 'inherent' ? rsk.inherentLikelihood : rsk.residualLikelihood;
                          @let pi = mode() === 'inherent' ? rsk.inherentImpact : rsk.residualImpact;
                          @let rLvl = mode() === 'inherent' ? rsk.inherentLevel : rsk.residualLevel;

                          <button
                            type="button"
                            (click)="navigateTo(rsk)"
                            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border transition-transform hover:scale-110 cursor-pointer"
                            [class]="getRiskPillClass(rLvl)"
                            [title]="rsk.code + ': ' + rsk.title + ' (P' + pl + ' × I' + pi + '). Pincha para ir al riesgo.'"
                          >
                            <span>{{ rsk.code }}</span>
                            <span class="font-bold">P{{ pl }}×I{{ pi }}</span>
                          </button>
                        }
                      }
                    </div>
                  </td>

                  <!-- Inherent Exposure -->
                  <td class="py-3 px-3 text-right font-mono text-slate-600">
                    {{ summary.inherentExposureUSD | money }}
                  </td>

                  <!-- Residual Exposure -->
                  <td class="py-3 px-3 text-right font-mono font-bold text-slate-900">
                    {{ summary.residualExposureUSD | money }}
                  </td>

                  <!-- Mitigation % -->
                  <td class="py-3 px-3 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                      <div class="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          class="bg-emerald-600 h-1.5 rounded-full"
                          [style.width.%]="summary.mitigationPct"
                        ></div>
                      </div>
                      <span class="font-mono text-[11px] font-semibold text-emerald-700">
                        {{ summary.mitigationPct }}%
                      </span>
                    </div>
                  </td>

                  <!-- Controls Health -->
                  <td class="py-3 px-3 text-center">
                    <span class="text-slate-700 font-mono text-[11px]">
                      {{ summary.controlsCount }} ctrls ({{ summary.avgControlEffectiveness }}%)
                    </span>
                  </td>

                  <!-- Actions -->
                  <td class="py-3 px-4 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        (click)="filterMainHeatmap(summary.process)"
                        class="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                        title="Ver en la Matriz 4×4 Principal"
                      >
                        <mat-icon class="text-sm">filter_center_focus</mat-icon>
                      </button>
                      <button
                        type="button"
                        (click)="focusProcessDetailed(summary.process)"
                        class="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                        title="Abrir vista detallada"
                      >
                        <mat-icon class="text-sm">visibility</mat-icon>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- VIEW 3: DETAILED PROCESS DEEP DIVE -->
      @if (viewMode() === 'detailed') {
        @let activeSummary = getActiveDetailedSummary();
        <div class="space-y-4">
          
          <!-- Process Tabs Selector -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            @for (summary of riskService.processHeatmapSummaries(); track summary.process) {
              <button
                type="button"
                (click)="selectedDetailedProcess.set(summary.process)"
                [class]="selectedDetailedProcess() === summary.process
                  ? 'bg-slate-900 text-white font-semibold shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium'"
                class="px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
              >
                <mat-icon class="text-xs">{{ summary.icon }}</mat-icon>
                <span>{{ summary.process }}</span>
                <span
                  [class]="selectedDetailedProcess() === summary.process ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'"
                  class="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold"
                >
                  {{ summary.risksCount }}
                </span>
              </button>
            }
          </div>

          @if (activeSummary) {
            @let level = mode() === 'inherent' ? activeSummary.maxInherentLevel : activeSummary.maxResidualLevel;

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
              
              <!-- Left Column: Detailed 4×4 Matrix for this process -->
              <div class="lg:col-span-2 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                  <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                      <mat-icon class="text-base">{{ activeSummary.icon }}</mat-icon>
                    </span>
                    <div>
                      <h3 class="text-sm font-bold text-slate-900">{{ activeSummary.process }}</h3>
                      <p class="text-[11px] text-slate-500">Matriz 4×4 interactiva enfocada exclusivamente en este proceso</p>
                    </div>
                  </div>
                  <span
                    class="px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider border"
                    [class]="severityBadgeClass(level)"
                  >
                    Nivel: {{ activeSummary.risksCount === 0 ? 'Sin Riesgos' : level }}
                  </span>
                </div>

                <!-- 4×4 Full Grid for Detailed Process -->
                <div class="grid grid-cols-[100px_repeat(4,1fr)] gap-2 text-xs">
                  <!-- Impact header -->
                  <div class="h-8 flex items-center justify-center font-semibold text-slate-400 text-[10px] uppercase bg-slate-50 rounded border border-slate-100">
                    P / I
                  </div>
                  @for (imp of impactLabels; track imp.level) {
                    <div class="h-8 flex flex-col items-center justify-center text-center font-medium bg-slate-50 rounded border border-slate-200">
                      <span class="text-[10px] font-bold text-slate-800">{{ imp.level }}. {{ imp.name }}</span>
                    </div>
                  }

                  <!-- Rows: Likelihood 4 to 1 -->
                  @for (row of activeSummary.grid; track row[0].likelihood) {
                    <!-- Likelihood label -->
                    <div class="flex flex-col justify-center px-2 py-1 bg-slate-50 rounded border border-slate-200">
                      <span class="text-[10px] font-bold text-slate-900">{{ row[0].likelihood }}. {{ likelihoodNames[row[0].likelihood - 1] }}</span>
                    </div>

                    <!-- Cells -->
                    @for (cell of row; track cell.impact) {
                      @let count = mode() === 'inherent' ? cell.inherentCount : cell.residualCount;
                      @let cellRisks = mode() === 'inherent' ? cell.inherentRisks : cell.residualRisks;

                      <div class="relative group/detcell">
                        <button
                          type="button"
                          (click)="onMiniCellClick(cellRisks)"
                          [class]="getCellClasses(cell.level, count > 0)"
                          class="w-full h-14 rounded-lg flex flex-col items-center justify-center p-1 border transition-all relative focus:outline-none focus:ring-2 focus:ring-slate-900"
                          [title]="count > 0 ? count + ' riesgo(s) en este cuadrante. Pincha para ir al riesgo.' : 'Sin riesgos'"
                        >
                          <span class="text-[9px] font-mono text-slate-500 opacity-80">{{ cell.score }} pts</span>
                          @if (count > 0) {
                            <div class="flex items-center gap-1 mt-0.5">
                              <span
                                class="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-bold font-mono text-white shadow-2xs"
                                [class]="countBadgeColor(cell.level)"
                              >
                                {{ count }}
                              </span>
                              <mat-icon class="text-[11px] text-slate-600">touch_app</mat-icon>
                            </div>
                          } @else {
                            <span class="text-xs text-slate-300 font-mono">-</span>
                          }
                        </button>

                        <!-- Popover on Hover -->
                        @if (count > 0) {
                          <div
                            class="absolute z-50 w-64 p-3 bg-slate-900 text-white rounded-xl shadow-xl border border-slate-700 opacity-0 invisible group-hover/detcell:opacity-100 group-hover/detcell:visible transition-all duration-150 pointer-events-auto text-left"
                            [class]="getMiniPopoverPosition(cell.likelihood, cell.impact)"
                          >
                            <div class="flex items-center justify-between border-b border-slate-700 pb-1 mb-1.5 text-xs">
                              <span class="font-bold text-slate-100">Cuadrante P{{ cell.likelihood }} × I{{ cell.impact }}</span>
                              <span class="font-mono text-emerald-400 font-bold">{{ count }} riesgo(s)</span>
                            </div>

                            <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                              @for (rsk of cellRisks; track rsk.id) {
                                <button
                                  type="button"
                                  (click)="navigateTo(rsk)"
                                  class="w-full text-left p-2 bg-slate-800 hover:bg-emerald-950 border border-slate-700 hover:border-emerald-500 rounded-lg transition-all flex items-start gap-2 cursor-pointer"
                                >
                                  <span class="font-mono text-[10px] font-bold text-emerald-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                                    {{ rsk.code }}
                                  </span>
                                  <div class="flex-1 min-w-0">
                                    <div class="text-[11px] font-medium text-slate-100 line-clamp-1">
                                      {{ rsk.title }}
                                    </div>
                                    <div class="text-[10px] text-emerald-400 flex items-center justify-between mt-1">
                                      <span>{{ rsk.residualExposureUSD | money }}</span>
                                      <span class="font-semibold flex items-center gap-0.5">
                                        <span>Ir</span>
                                        <mat-icon class="text-[10px]">arrow_forward</mat-icon>
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              }
                            </div>
                            <div class="mt-2 pt-1 border-t border-slate-800 text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
                              <mat-icon class="text-[11px] text-emerald-400">touch_app</mat-icon>
                              <span>Pincha para ir directamente al riesgo</span>
                            </div>
                          </div>
                        }

                      </div>
                    }

                  }
                </div>

                <!-- Axis Legend -->
                <div class="text-center mt-3 text-[11px] font-semibold text-slate-500 flex items-center justify-center gap-2">
                  <span>← Severidad de Impacto Operacional (Escala 1 a 4) →</span>
                </div>
              </div>

              <!-- Right Column: Process Risks List & Quick Controls -->
              <div class="space-y-3">
                
                <!-- Financial Exposure Card -->
                <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <mat-icon class="text-emerald-600 text-sm">attach_money</mat-icon>
                    <span>Exposición Financiera</span>
                  </h4>
                  <div class="space-y-2 text-xs">
                    <div class="flex items-center justify-between">
                      <span class="text-slate-500">Exposición Inherente:</span>
                      <span class="font-mono font-bold text-slate-800">{{ activeSummary.inherentExposureUSD | money }}</span>
                    </div>
                    <div class="flex items-center justify-between">
                      <span class="text-slate-500">Exposición Residual:</span>
                      <span class="font-mono font-bold text-emerald-700">{{ activeSummary.residualExposureUSD | money }}</span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div class="bg-emerald-600 h-2 rounded-full" [style.width.%]="activeSummary.mitigationPct"></div>
                    </div>
                    <div class="text-[11px] text-right text-emerald-700 font-semibold">
                      {{ activeSummary.mitigationPct }}% mitigado por controles
                    </div>
                  </div>
                </div>

                <!-- Risks List for this process -->
                <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <div class="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
                    <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <mat-icon class="text-indigo-600 text-sm">list_alt</mat-icon>
                      <span>Riesgos de este Proceso ({{ activeSummary.risks.length }})</span>
                    </h4>
                  </div>

                  @if (activeSummary.risks.length === 0) {
                    <p class="text-xs text-slate-400 italic py-2 text-center">
                      No hay riesgos identificados actualmente en este proceso.
                    </p>
                  } @else {
                    <div class="space-y-2 max-h-56 overflow-y-auto pr-1">
                      @for (rsk of activeSummary.risks; track rsk.id) {
                        <button
                          type="button"
                          (click)="navigateTo(rsk)"
                          class="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all text-xs group cursor-pointer"
                        >
                          <div class="flex items-center justify-between mb-1">
                            <span class="font-mono font-bold text-slate-900">{{ rsk.code }}</span>
                            <span
                              class="px-1.5 py-0.2 rounded text-[10px] font-semibold border"
                              [class]="severityBadgeClass(rsk.residualLevel)"
                            >
                              {{ rsk.residualLevel }} (P{{ rsk.residualLikelihood }}×I{{ rsk.residualImpact }})
                            </span>
                          </div>
                          <div class="font-medium text-slate-800 line-clamp-1 group-hover:text-emerald-950">
                            {{ rsk.title }}
                          </div>
                          <div class="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                            <span>Resp: {{ rsk.responsible }}</span>
                            <span class="text-emerald-700 font-semibold flex items-center gap-0.5">
                              <span>Ver</span>
                              <mat-icon class="text-xs">arrow_forward</mat-icon>
                            </span>
                          </div>
                        </button>
                      }
                    </div>
                  }
                </div>

              </div>

            </div>
          }

        </div>
      }

    </div>
  `
})
export class ProcessHeatmap {
  readonly riskService = inject(RiskDataService);

  readonly mode = signal<'inherent' | 'residual'>('residual');
  readonly viewMode = signal<'cards' | 'comparison' | 'detailed'>('cards');
  readonly selectedDetailedProcess = signal<string>('Operaciones de Pago');

  readonly riskSelected = output<Risk>();
  readonly processSelected = output<string>();

  /** Nombres de la escala vigente (Mantenedores → Escala de riesgo). */
  get likelihoodNames(): string[] { return this.riskService.catalog.riskScale().likelihood.map(l => l.name); }

  get impactLabels(): { level: number; name: string }[] { return this.riskService.catalog.riskScale().impact.map(l => ({ level: l.level, name: l.name })); }

  getActiveDetailedSummary(): ProcessHeatmapSummary | undefined {
    const proc = this.selectedDetailedProcess();
    const summaries = this.riskService.processHeatmapSummaries();
    return summaries.find(s => s.process === proc) || summaries[0];
  }

  focusProcessDetailed(processName: string) {
    this.selectedDetailedProcess.set(processName);
    this.viewMode.set('detailed');
  }

  filterMainHeatmap(processName: string) {
    this.riskService.heatmapSelectedProcess.set(processName);
    // Smooth scroll to main heatmap
    if (typeof document !== 'undefined') {
      const el = document.getElementById('main-heatmap-anchor');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  onMiniCellClick(cellRisks: Risk[]) {
    if (cellRisks && cellRisks.length > 0) {
      this.riskSelected.emit(cellRisks[0]);
    }
  }

  navigateTo(risk: Risk) {
    this.riskSelected.emit(risk);
  }

  getMiniPopoverPosition(likelihood: number, impact: number): string {
    const vPos = likelihood >= 3 ? 'top-full mt-1.5' : 'bottom-full mb-1.5';
    let hPos = 'left-1/2 -translate-x-1/2';
    if (impact === 1) hPos = 'left-0';
    else if (impact >= 3) hPos = 'right-0';
    return `${vPos} ${hPos}`;
  }

  getMiniCellClass(level: RiskLevel, hasRisks: boolean): string {
    const hover = hasRisks ? 'cursor-pointer hover:shadow-xs hover:scale-105 z-10 ' : 'hover:opacity-80 ';
    switch (level) {
      case 'Crítico':
        return `${hover}bg-rose-100/80 border-rose-300 text-rose-950`;
      case 'Alto':
        return `${hover}bg-orange-100/80 border-orange-300 text-orange-950`;
      case 'Medio':
        return `${hover}bg-amber-100/80 border-amber-300 text-amber-950`;
      case 'Bajo':
      default:
        return `${hover}bg-emerald-100/80 border-emerald-300 text-emerald-950`;
    }
  }

  getCellClasses(level: RiskLevel, hasRisks: boolean): string {
    const hover = hasRisks ? 'cursor-pointer hover:shadow-md hover:scale-[1.03] z-10 ' : 'hover:opacity-90 ';
    switch (level) {
      case 'Crítico':
        return `${hover}bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-950 ${hasRisks ? 'font-semibold' : ''}`;
      case 'Alto':
        return `${hover}bg-orange-50 hover:bg-orange-100 border-orange-300 text-orange-950 ${hasRisks ? 'font-semibold' : ''}`;
      case 'Medio':
        return `${hover}bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-950 ${hasRisks ? 'font-semibold' : ''}`;
      case 'Bajo':
      default:
        return `${hover}bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-950 ${hasRisks ? 'font-semibold' : ''}`;
    }
  }

  countBadgeColor(level: RiskLevel): string {
    switch (level) {
      case 'Crítico':
        return 'bg-rose-700';
      case 'Alto':
        return 'bg-orange-600';
      case 'Medio':
        return 'bg-amber-600';
      case 'Bajo':
      default:
        return 'bg-emerald-700';
    }
  }

  severityBadgeClass(level: RiskLevel): string {
    switch (level) {
      case 'Crítico':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Alto':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Medio':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Bajo':
      default:
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
  }

  processIconContainerClass(level: RiskLevel): string {
    switch (level) {
      case 'Crítico':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Alto':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Medio':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Bajo':
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  }

  getRiskPillClass(level: RiskLevel): string {
    switch (level) {
      case 'Crítico':
        return 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100';
      case 'Alto':
        return 'bg-orange-50 text-orange-800 border-orange-300 hover:bg-orange-100';
      case 'Medio':
        return 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100';
      case 'Bajo':
      default:
        return 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100';
    }
  }
}
