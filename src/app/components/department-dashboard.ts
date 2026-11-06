import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { EvidenceService } from '../services/evidence.service';
import { RiskDataService } from '../services/risk-data.service';
import { ActionPlanService } from '../services/action-plan.service';
import { Risk } from '../models/risk.model';
import { MoneyPipe } from '../utils/money.pipe';

@Component({
  selector: 'app-department-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MoneyPipe],
  template: `
    <div class="space-y-6">
      
      <!-- Top Department Selector Banner -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
                <mat-icon class="text-lg">corporate_fare</mat-icon>
              </span>
              <h2 class="text-base font-bold text-slate-900 tracking-tight">
                Tableros de Riesgo por Departamento & Macroproceso
              </h2>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              Supervisión descentralizada de riesgo operacional, efectividad de controles y planes de mitigación por unidad de negocio
            </p>
          </div>

          <!-- View Mode Toggle: Single Department vs Comparative Matrix -->
          <div class="flex items-center gap-2">
            <div class="bg-slate-100 p-1 rounded-lg flex items-center gap-1 border border-slate-200">
              <button
                (click)="viewMode.set('focused')"
                [class]="viewMode() === 'focused' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600 hover:text-slate-900 font-medium'"
                class="px-3 py-1 text-xs rounded-md transition-all flex items-center gap-1.5"
              >
                <mat-icon class="text-xs">domain</mat-icon>
                <span>Ficha Departamental</span>
              </button>

              <button
                (click)="viewMode.set('comparative')"
                [class]="viewMode() === 'comparative' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600 hover:text-slate-900 font-medium'"
                class="px-3 py-1 text-xs rounded-md transition-all flex items-center gap-1.5"
              >
                <mat-icon class="text-xs">table_chart</mat-icon>
                <span>Matriz Comparativa</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Department Carousel / Pills -->
        <div class="flex items-center gap-2 overflow-x-auto pt-4 pb-1">
          @for (d of departmentList(); track d.process) {
            <button
              (click)="selectedProcess.set(d.process)"
              [class]="selectedProcess() === d.process
                ? 'bg-slate-900 text-white font-semibold ring-2 ring-slate-900/20 shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'"
              class="px-3 py-2 rounded-xl text-xs transition-all flex items-center gap-2 shrink-0 text-left"
            >
              <mat-icon class="text-sm" [class]="selectedProcess() === d.process ? 'text-emerald-400' : 'text-slate-500'">
                {{ d.icon }}
              </mat-icon>
              <div>
                <div class="leading-tight font-medium">{{ d.process }}</div>
                <div class="text-[10px] opacity-75 font-mono">
                  {{ d.risksCount }} riesgos · {{ d.residualExposureUSD | money }}
                </div>
              </div>
            </button>
          }
        </div>
      </div>

      <!-- VIEW 1: FOCUSED DEPARTMENT VIEW -->
      @if (viewMode() === 'focused' && currentDeptSummary(); as dept) {
        
        <!-- Department Header & Quick PDF Export Bar -->
        <div class="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 flex items-center justify-center text-emerald-400 shrink-0">
              <mat-icon class="text-3xl">{{ dept.icon }}</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2.5">
                <h3 class="text-xl font-bold tracking-tight text-white">{{ dept.process }}</h3>
                <span
                  class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                  [class]="dept.maxResidualLevel === 'Crítico' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : dept.maxResidualLevel === 'Alto' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'"
                >
                  Nivel Residual: {{ dept.maxResidualLevel }}
                </span>
              </div>
              <p class="text-xs text-slate-300 mt-1 flex items-center gap-2">
                <span>Líder Responsable: <strong class="text-white">{{ dept.owner }}</strong></span>
                <span>·</span>
                <span>Unidad: {{ dept.department }}</span>
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 self-stretch md:self-auto">
            <button
              (click)="exportDepartmentPdf.emit(dept.process)"
              class="flex-1 md:flex-initial px-4 py-2 text-xs font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-1.5"
              title="Generar e imprimir informe PDF específico de este departamento"
            >
              <mat-icon class="text-sm">picture_as_pdf</mat-icon>
              <span>Exportar PDF Departamental</span>
            </button>

            <button
              [class.perm-hidden]="!riskService.canAny('canExportReports')" (click)="riskService.exportToExcel('complete')"
              class="px-3 py-2 text-xs font-medium text-slate-200 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl transition-colors flex items-center gap-1.5"
              title="Descargar matriz en Excel"
            >
              <mat-icon class="text-sm">download</mat-icon>
              <span class="hidden sm:inline">Excel</span>
            </button>
          </div>
        </div>

        <!-- 4 Key KPI Cards for the Department -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <!-- Card 1: Exposición Financiera -->
          <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium">Exposición Residual Neta</span>
              <mat-icon class="text-sm text-slate-400">attach_money</mat-icon>
            </div>
            <div class="text-xl font-bold font-mono text-slate-900">
              {{ dept.residualExposureUSD | money }}
            </div>
            <div class="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Bruta: {{ dept.inherentExposureUSD | money }}</span>
              <span class="text-emerald-700 font-semibold font-mono">{{ dept.mitigationPct }}% mitigado</span>
            </div>
          </div>

          <!-- Card 2: Inventario de Riesgos -->
          <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium">Inventario de Riesgos</span>
              <mat-icon class="text-sm text-slate-400">warning</mat-icon>
            </div>
            <div class="text-xl font-bold font-mono text-slate-900">
              {{ dept.risksCount }}
              <span class="text-xs font-normal text-slate-500 font-sans">riesgos</span>
            </div>
            <div class="text-[11px] text-slate-500 mt-1 flex items-center gap-2 font-mono">
              <span class="text-rose-700 font-semibold">{{ dept.criticalRisksCount }} Críticos</span>
              <span>·</span>
              <span class="text-amber-700 font-semibold">{{ dept.highRisksCount }} Altos</span>
              <span>·</span>
              <span class="text-blue-700">{{ dept.mediumRisksCount + dept.lowRisksCount }} Med/Baj</span>
            </div>
          </div>

          <!-- Card 3: Eficacia de Controles -->
          <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium">Efectividad de Controles</span>
              <mat-icon class="text-sm text-slate-400">shield</mat-icon>
            </div>
            <div class="text-xl font-bold font-mono text-emerald-700">
              {{ dept.avgControlEffectiveness }}%
            </div>
            <div class="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>{{ dept.controlsCount }} controles vigentes</span>
              <span class="text-indigo-700 font-semibold">Salud: Óptima</span>
            </div>
          </div>

          <!-- Card 4: Incidentes y Pérdidas Reales -->
          <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <div class="flex items-center justify-between text-slate-500 mb-1">
              <span class="text-xs font-medium">Pérdida Operacional Neta</span>
              <mat-icon class="text-sm text-slate-400">account_balance_wallet</mat-icon>
            </div>
            <div class="text-xl font-bold font-mono text-rose-700">
              {{ deptNetLossUSD() | money }}
            </div>
            <div class="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
              <span>{{ deptIncidents().length }} incidentes reportados</span>
              <span class="text-slate-400 font-mono">Recup: {{ deptRecoveredUSD() | money }}</span>
            </div>
          </div>

        </div>

        <!-- 4×4 Mini-Heatmap & Department Details Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

          <!-- Left: 4×4 Department Heatmap -->
          <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <mat-icon class="text-emerald-600 text-sm">grid_view</mat-icon>
                  <h4 class="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Matriz 4×4: {{ dept.process }}
                  </h4>
                </div>
                <div class="flex items-center gap-1 bg-slate-100 p-0.5 rounded text-[11px]">
                  <button
                    (click)="heatmapMode.set('residual')"
                    [class]="heatmapMode() === 'residual' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600'"
                    class="px-2 py-0.5 rounded transition-all"
                  >
                    Residual
                  </button>
                  <button
                    (click)="heatmapMode.set('inherent')"
                    [class]="heatmapMode() === 'inherent' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600'"
                    class="px-2 py-0.5 rounded transition-all"
                  >
                    Inherente
                  </button>
                </div>
              </div>

              <!-- 4×4 Heatmap Table -->
              <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div class="grid grid-cols-4 gap-1.5 aspect-square">
                  @for (row of dept.grid; track $index) {
                    @for (cell of row; track cell.score) {
                      <button
                        type="button"
                        [class]="getCellBackground(cell.score, cell.level)"
                        class="rounded-lg p-1 flex flex-col items-center justify-center transition-all border relative group cursor-pointer hover:scale-105 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        (click)="inspectCellRisks(cell)"
                        [title]="'Score ' + cell.score + ' (' + cell.level + '): ' + (heatmapMode() === 'residual' ? cell.residualCount : cell.inherentCount) + ' riesgos'"
                      >
                        <span class="text-sm font-extrabold font-mono" [class]="(heatmapMode() === 'residual' ? cell.residualCount : cell.inherentCount) > 0 ? 'text-slate-900' : 'text-slate-400/50'">
                          {{ heatmapMode() === 'residual' ? cell.residualCount : cell.inherentCount }}
                        </span>
                        <span class="text-[9px] font-mono text-slate-500">s{{ cell.score }}</span>

                        <!-- Cell Hover Popover -->
                        @if ((heatmapMode() === 'residual' ? cell.residualRisks.length : cell.inherentRisks.length) > 0) {
                          <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-30 w-56 bg-slate-900 text-white p-2.5 rounded-xl shadow-xl text-left pointer-events-none">
                            <div class="text-[10px] font-bold text-emerald-400 mb-1 border-b border-slate-700 pb-1">
                              Score {{ cell.score }} ({{ cell.level }})
                            </div>
                            @for (r of (heatmapMode() === 'residual' ? cell.residualRisks : cell.inherentRisks); track r.id) {
                              <div class="text-[10px] py-0.5 truncate">
                                <strong class="text-emerald-300 font-mono">{{ r.code }}:</strong> {{ r.title }}
                              </div>
                            }
                          </div>
                        }
                      </button>
                    }
                  }
                </div>
              </div>

              <div class="mt-3 flex items-center justify-between text-[10px] text-slate-500">
                <span>Eje Y: Frecuencia (1-4)</span>
                <span>Eje X: Impacto (1-4)</span>
              </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span class="text-slate-600 font-medium">Score Promedio:</span>
              <span class="font-mono font-bold text-slate-900">
                {{ heatmapMode() === 'residual' ? dept.avgResidualScore : dept.avgInherentScore }} / 16
              </span>
            </div>
          </div>

          <!-- Right: Department Risks & Controls Tabs -->
          <div class="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div>
              
              <!-- Subtabs: Riesgos, Controles, Incidentes -->
              <div class="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                <div class="flex items-center gap-2">
                  <button
                    (click)="deptSubTab.set('riesgos')"
                    [class]="deptSubTab() === 'riesgos' ? 'bg-slate-900 text-white font-semibold' : 'text-slate-600 hover:bg-slate-100'"
                    class="px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <mat-icon class="text-xs">warning</mat-icon>
                    <span>Riesgos ({{ deptRisks().length }})</span>
                  </button>

                  <button
                    (click)="deptSubTab.set('controles')"
                    [class]="deptSubTab() === 'controles' ? 'bg-slate-900 text-white font-semibold' : 'text-slate-600 hover:bg-slate-100'"
                    class="px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <mat-icon class="text-xs">shield</mat-icon>
                    <span>Controles ({{ deptControls().length }})</span>
                  </button>

                  <button
                    (click)="deptSubTab.set('incidentes')"
                    [class]="deptSubTab() === 'incidentes' ? 'bg-slate-900 text-white font-semibold' : 'text-slate-600 hover:bg-slate-100'"
                    class="px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <mat-icon class="text-xs">report_problem</mat-icon>
                    <span>Incidentes & Pérdidas ({{ deptIncidents().length }})</span>
                  </button>
                </div>
              </div>

              <!-- Content Tab: Riesgos del Departamento -->
              @if (deptSubTab() === 'riesgos') {
                <div class="space-y-3 overflow-y-auto max-h-[380px] pr-1">
                  @for (r of deptRisks(); track r.id) {
                    <button
                      type="button"
                      (click)="riskSelected.emit(r)"
                      class="w-full text-left border border-slate-200 hover:border-slate-300 p-3 rounded-xl hover:bg-slate-50 transition-all cursor-pointer space-y-2 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div>
                          <div class="flex items-center gap-2">
                            <span class="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{{ r.code }}</span>
                            <span
                              class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                              [class]="r.residualLevel === 'Crítico' ? 'bg-rose-100 text-rose-800' : r.residualLevel === 'Alto' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'"
                            >
                              Residual: {{ r.residualLevel }} (Score {{ r.residualScore }})
                            </span>
                          </div>
                          <h5 class="text-xs font-semibold text-slate-900 mt-1">{{ r.title }}</h5>
                        </div>
                        <div class="text-right shrink-0">
                          <span class="font-mono font-bold text-xs text-slate-900 block">{{ r.residualExposureUSD | money }}</span>
                          <span class="text-[10px] text-slate-400">Exp. Neta</span>
                        </div>
                      </div>

                      <!-- Mitigation Plan Bar -->
                      <div class="bg-slate-100/70 p-2 rounded-lg text-[11px] flex items-center justify-between gap-3">
                        <div class="truncate text-slate-700">
                          <strong class="text-slate-900">Plan:</strong> {{ actionPlans.riskTreatment(r).title }}
                        </div>
                        <div class="flex items-center gap-2 shrink-0 font-mono">
                          <div class="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div class="bg-emerald-600 h-full rounded-full" [style.width.%]="actionPlans.riskTreatment(r).progressPct"></div>
                          </div>
                          <span class="text-slate-600">{{ actionPlans.riskTreatment(r).progressPct }}%</span>
                        </div>
                      </div>
                    </button>
                  }
                  @if (deptRisks().length === 0) {
                    <div class="text-center py-8 text-slate-400 text-xs">
                      No se han registrado riesgos en esta unidad de negocio.
                    </div>
                  }
                </div>
              }

              <!-- Content Tab: Controles del Departamento -->
              @if (deptSubTab() === 'controles') {
                <div class="space-y-3 overflow-y-auto max-h-[380px] pr-1">
                  @for (c of deptControls(); track c.id) {
                    <div class="border border-slate-200 p-3 rounded-xl space-y-1.5 text-xs">
                      <div class="flex items-start justify-between gap-2">
                        <div>
                          <span class="font-mono font-bold text-slate-900 mr-2">{{ c.code }}</span>
                          <span class="font-semibold text-slate-800">{{ c.name }}</span>
                        </div>
                        <span
                          class="px-2 py-0.5 rounded text-[10px] font-bold font-mono"
                          [class]="c.totalEffectiveness >= 80 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'"
                        >
                          {{ c.totalEffectiveness }}% Eficaz
                        </span>
                      </div>
                      <p class="text-slate-600 text-[11px]">{{ c.description }}</p>
                      <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                        <span>Tipo: {{ c.type }} · {{ c.automation }}</span>
                        <span>Última prueba: {{ c.lastTested }} ({{ c.lastTestedBy || c.owner }})</span>
                      </div>

                      @let files = evidence.forEntity('controls', c.id);
                      @if (files.length) {
                        <div class="flex items-center gap-1.5 flex-wrap pt-1">
                          @for (att of files; track att.id) {
                            <button
                              type="button"
                              (click)="evidence.open(att)"
                              class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 text-[10px] border border-slate-200 transition-colors cursor-pointer"
                              title="Descargar evidencia adjunta"
                            >
                              <mat-icon class="text-[11px] text-indigo-600">attach_file</mat-icon>
                              <span class="truncate max-w-[150px] font-medium">{{ att.fileName }}</span>
                            </button>
                          }
                        </div>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Content Tab: Incidentes y Pérdidas -->
              @if (deptSubTab() === 'incidentes') {
                <div class="space-y-3 overflow-y-auto max-h-[380px] pr-1">
                  @for (inc of deptIncidents(); track inc.id) {
                    <div class="border border-slate-200 p-3 rounded-xl space-y-1.5 text-xs">
                      <div class="flex items-start justify-between gap-2">
                        <div>
                          <span class="font-mono font-bold text-rose-700 mr-2">{{ inc.id.toUpperCase() }}</span>
                          <span class="font-semibold text-slate-800">{{ inc.title }}</span>
                        </div>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                          Pérdida: {{ (inc.realLossAmountUSD || 0) | money }}
                        </span>
                      </div>
                      <p class="text-slate-600 text-[11px]">{{ inc.description }}</p>
                      <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                        <span>Fecha: {{ inc.reportedAt }} · {{ inc.severity }}</span>
                        <span class="text-emerald-700 font-medium">Recuperado: {{ (inc.recoveredAmountUSD || 0) | money }}</span>
                      </div>
                    </div>
                  }
                  @if (deptIncidents().length === 0) {
                    <div class="text-center py-8 text-slate-400 text-xs">
                      No hay incidentes de pérdida operacional registrados en este departamento.
                    </div>
                  }
                </div>
              }

            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Auditoría de cumplimiento: ISO 31000</span>
              <span class="font-mono">RiskGuard Pro</span>
            </div>
          </div>

        </div>

      }

      <!-- VIEW 2: MULTI-DEPARTMENT COMPARATIVE MATRIX -->
      @if (viewMode() === 'comparative') {
        <div class="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div class="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <mat-icon class="text-slate-700 text-sm">compare</mat-icon>
              <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Matriz Comparativa de Resiliencia y Riesgo por Departamento
              </h3>
            </div>
            <button
              [class.perm-hidden]="!riskService.canAny('canExportReports')" (click)="riskService.exportToExcel('complete')"
              class="text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1"
            >
              <mat-icon class="text-xs">file_download</mat-icon>
              <span>Exportar Matriz</span>
            </button>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-100 text-slate-700 text-[11px] uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-2.5 px-4">Macroproceso / Departamento</th>
                  <th class="py-2.5 px-3">Líder</th>
                  <th class="py-2.5 px-3 text-center">Riesgos</th>
                  <th class="py-2.5 px-3 text-center">Residual Crítico</th>
                  <th class="py-2.5 px-3 text-right">Exp. Inherente</th>
                  <th class="py-2.5 px-3 text-right">Exp. Residual</th>
                  <th class="py-2.5 px-3 text-center">Mitigación %</th>
                  <th class="py-2.5 px-3 text-center">Eficacia Controles</th>
                  <th class="py-2.5 px-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                @for (d of departmentList(); track d.process) {
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-2.5">
                        <mat-icon class="text-slate-500 text-base">{{ d.icon }}</mat-icon>
                        <div>
                          <span class="font-bold text-slate-900 block">{{ d.process }}</span>
                          <span class="text-[10px] text-slate-400">{{ d.department }}</span>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-3 text-slate-700 font-medium">{{ d.owner }}</td>
                    <td class="py-3 px-3 text-center font-mono font-bold text-slate-900">{{ d.risksCount }}</td>
                    <td class="py-3 px-3 text-center font-mono">
                      <span
                        class="px-2 py-0.5 rounded text-[11px] font-bold"
                        [class]="d.criticalRisksCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'"
                      >
                        {{ d.criticalRisksCount }}
                      </span>
                    </td>
                    <td class="py-3 px-3 text-right font-mono text-slate-500">{{ d.inherentExposureUSD | money }}</td>
                    <td class="py-3 px-3 text-right font-mono font-bold text-slate-900">{{ d.residualExposureUSD | money }}</td>
                    <td class="py-3 px-3 text-center font-mono font-bold text-emerald-700">{{ d.mitigationPct }}%</td>
                    <td class="py-3 px-3 text-center font-mono">
                      <span class="font-bold" [class]="d.avgControlEffectiveness >= 80 ? 'text-emerald-700' : 'text-amber-700'">
                        {{ d.avgControlEffectiveness }}%
                      </span>
                    </td>
                    <td class="py-3 px-3 text-center">
                      <button
                        (click)="selectedProcess.set(d.process); viewMode.set('focused')"
                        class="text-xs text-indigo-700 hover:text-indigo-900 font-semibold hover:underline"
                      >
                        Ver Ficha
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

    </div>
  `
})
export class DepartmentDashboard {
  readonly riskService = inject(RiskDataService);
  readonly evidence = inject(EvidenceService);
  readonly actionPlans = inject(ActionPlanService);

  readonly viewMode = signal<'focused' | 'comparative'>('focused');
  readonly selectedProcess = signal<string>('Operaciones de Pago');
  readonly heatmapMode = signal<'residual' | 'inherent'>('residual');
  readonly deptSubTab = signal<'riesgos' | 'controles' | 'incidentes'>('riesgos');

  readonly riskSelected = output<Risk>();
  readonly exportDepartmentPdf = output<string>();

  readonly departmentList = computed(() => {
    return this.riskService.processHeatmapSummaries();
  });

  readonly currentDeptSummary = computed(() => {
    const list = this.departmentList();
    const target = this.selectedProcess();
    return list.find(d => d.process === target) || list[0] || null;
  });

  readonly deptRisks = computed(() => {
    const proc = this.selectedProcess();
    return this.riskService.risks().filter(r => r.process === proc);
  });

  readonly deptControls = computed(() => {
    const proc = this.selectedProcess();
    return this.riskService.controls().filter(c => c.process === proc);
  });

  readonly deptIncidents = computed(() => {
    const proc = this.selectedProcess();
    return this.riskService.flaws().filter(f => f.process === proc && f.status !== 'Descartada');
  });

  readonly deptNetLossUSD = computed(() => {
    const incs = this.deptIncidents();
    const gross = incs.reduce((acc, f) => acc + (f.realLossAmountUSD || 0), 0);
    const rec = incs.reduce((acc, f) => acc + (f.recoveredAmountUSD || 0), 0);
    return Math.max(0, gross - rec);
  });

  readonly deptRecoveredUSD = computed(() => {
    const incs = this.deptIncidents();
    return incs.reduce((acc, f) => acc + (f.recoveredAmountUSD || 0), 0);
  });

  getCellBackground(score: number, level: string): string {
    if (level === 'Crítico') return 'bg-rose-50 border-rose-200 hover:bg-rose-100 text-rose-950';
    if (level === 'Alto') return 'bg-amber-50 border-amber-200 hover:bg-amber-100 text-amber-950';
    if (level === 'Medio') return 'bg-blue-50 border-blue-200 hover:bg-blue-100 text-blue-950';
    return 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100 text-emerald-950';
  }

  inspectCellRisks(cell: { residualRisks: Risk[]; inherentRisks: Risk[] }) {
    const target = this.heatmapMode() === 'residual' ? cell.residualRisks[0] : cell.inherentRisks[0];
    if (target) {
      this.riskSelected.emit(target);
    }
  }
}
