import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { Risk, RiskLevel } from '../models/risk.model';

@Component({
  selector: 'app-heatmap-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div id="main-heatmap-anchor" class="bg-white rounded-xl border border-slate-200 shadow-sm p-5 scroll-mt-20">
      
      <!-- Header with Toggle (Inherente vs Residual) and Reset filter -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
        <div>
          <h2 class="text-base font-semibold text-slate-900 flex items-center gap-2">
            <mat-icon class="text-emerald-600 text-lg">grid_view</mat-icon>
            <span>Matriz de Calor 4x4 (Probabilidad × Impacto)</span>
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Pasa el mouse sobre cualquier cuadrante con riesgos para ver el detalle y pincha para ir directamente al riesgo
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Mode Switcher -->
          <div class="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-medium">
            <button
              (click)="mode.set('inherent')"
              [class]="mode() === 'inherent'
                ? 'bg-white text-slate-900 shadow-xs px-3 py-1 rounded-md transition-all font-semibold'
                : 'text-slate-600 hover:text-slate-900 px-3 py-1 transition-all cursor-pointer'"
            >
              Riesgo Inherente
            </button>
            <button
              (click)="mode.set('residual')"
              [class]="mode() === 'residual'
                ? 'bg-emerald-600 text-white shadow-xs px-3 py-1 rounded-md transition-all font-semibold'
                : 'text-slate-600 hover:text-slate-900 px-3 py-1 transition-all cursor-pointer'"
            >
              Riesgo Residual (Con Controles)
            </button>
          </div>

          <!-- Reset Filter Button if a cell is selected -->
          @if (riskService.matrixSelectedCell()) {
            <button
              (click)="riskService.matrixSelectedCell.set(null)"
              class="px-2.5 py-1 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              title="Quitar filtro de cuadrante"
            >
              <mat-icon class="text-xs">close</mat-icon>
              <span>Quitar cuadrante</span>
            </button>
          }
        </div>
      </div>

      <!-- Quick Process Filter Pills -->
      <div class="flex items-center gap-1.5 pb-3 mb-3 border-b border-slate-100 overflow-x-auto text-xs">
        <span class="text-[11px] font-semibold text-slate-500 shrink-0 flex items-center gap-1 mr-1">
          <mat-icon class="text-xs text-slate-400">filter_alt</mat-icon>
          <span>Filtrar Proceso:</span>
        </span>

        <button
          type="button"
          (click)="riskService.heatmapSelectedProcess.set('TODOS')"
          [class]="riskService.heatmapSelectedProcess() === 'TODOS'
            ? 'bg-slate-900 text-white font-bold shadow-xs'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium'"
          class="px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap text-[11px] cursor-pointer"
        >
          Todos ({{ riskService.risks().length }})
        </button>

        @for (proc of riskService.defaultProcesses; track proc) {
          @let pCount = getProcessRiskCount(proc);
          <button
            type="button"
            (click)="riskService.heatmapSelectedProcess.set(proc)"
            [class]="riskService.heatmapSelectedProcess() === proc
              ? 'bg-emerald-700 text-white font-bold shadow-xs'
              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 font-medium'"
            class="px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap text-[11px] flex items-center gap-1 cursor-pointer"
          >
            <span>{{ proc }}</span>
            <span
              [class]="riskService.heatmapSelectedProcess() === proc ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'"
              class="px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold"
            >
              {{ pCount }}
            </span>
          </button>
        }

        @if (riskService.heatmapSelectedProcess() !== 'TODOS') {
          <button
            type="button"
            (click)="riskService.heatmapSelectedProcess.set('TODOS')"
            class="px-2 py-1 text-[11px] text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-0.5 shrink-0 ml-1 font-medium cursor-pointer"
            title="Ver todos los procesos"
          >
            <mat-icon class="text-xs">refresh</mat-icon>
            <span>Ver Todos</span>
          </button>
        }
      </div>

      <!-- 4x4 Matrix Layout -->
      <div class="overflow-visible">
        <div class="w-full">
          
          <div class="grid grid-cols-[120px_repeat(4,1fr)] gap-2 text-xs">
            
            <!-- Column Headers (Impact) -->
            <div class="h-10 flex items-center justify-center font-semibold text-slate-400 text-[11px] uppercase tracking-wider bg-slate-50/50 rounded-lg border border-slate-100">
              Probabilidad
            </div>
            @for (label of impactLabels; track label.level) {
              <div class="h-10 flex flex-col items-center justify-center text-center font-medium text-slate-700 bg-slate-50 rounded-lg border border-slate-200">
                <span class="text-[11px] leading-tight font-bold text-slate-900">{{ label.level }}. {{ label.name }}</span>
                <span class="text-[9px] text-slate-500 uppercase tracking-wide">Impacto</span>
              </div>
            }

            <!-- Rows (Likelihood: 4 down to 1) -->
            @for (row of riskService.heatmapMatrix(); track row[0].likelihood) {
              
              <!-- Row Label -->
              <div class="flex flex-col justify-center px-2.5 py-2 font-medium text-slate-700 bg-slate-50 rounded-lg border border-slate-200">
                <span class="text-[11px] leading-tight font-bold text-slate-900">
                  {{ row[0].likelihood }}. {{ likelihoodNames[row[0].likelihood - 1] }}
                </span>
                <span class="text-[9px] text-slate-500 uppercase tracking-wide">Frecuencia</span>
              </div>

              <!-- Cells for this likelihood -->
              @for (cell of row; track cell.impact) {
                @let isSelected = riskService.matrixSelectedCell()?.likelihood === cell.likelihood && riskService.matrixSelectedCell()?.impact === cell.impact;
                @let count = mode() === 'inherent' ? cell.inherentCount : cell.residualCount;
                @let cellRisks = mode() === 'inherent' ? cell.inherentRisks : cell.residualRisks;
                
                <div class="relative group">
                  
                  <!-- Cell Button -->
                  <button
                    type="button"
                    (click)="onCellClick(cell.likelihood, cell.impact, cellRisks)"
                    [class]="getCellClasses(cell.level, isSelected, count > 0)"
                    class="w-full h-16 rounded-xl flex flex-col items-center justify-center p-2 transition-all text-center border relative focus:outline-none focus:ring-2 focus:ring-slate-900"
                    [title]="count > 0 ? 'Probabilidad ' + cell.likelihood + ', Impacto ' + cell.impact + '. ' + count + ' riesgo(s). Pincha para ir al riesgo.' : 'Sin riesgos en este cuadrante'"
                  >
                    <div class="flex items-center gap-1">
                      <span class="text-[10px] font-mono font-bold opacity-75">
                        {{ cell.score }} pts
                      </span>
                    </div>
                    
                    @if (count > 0) {
                      <div class="flex items-center gap-1 mt-1">
                        <span
                          class="inline-flex items-center justify-center min-w-[24px] h-[24px] px-2 rounded-full text-xs font-bold font-mono text-white shadow-xs"
                          [class]="countBadgeColor(cell.level)"
                        >
                          {{ count }}
                        </span>
                        <mat-icon class="text-xs text-slate-600 transition-transform group-hover:scale-125">
                          touch_app
                        </mat-icon>
                      </div>
                      <span class="text-[9px] font-medium text-slate-600 group-hover:text-slate-950 mt-0.5 leading-none">
                        Pinchar riesgo
                      </span>
                    } @else {
                      <span class="text-xs text-slate-400 font-mono mt-1">-</span>
                    }

                    @if (isSelected) {
                      <div class="absolute -top-1 -right-1 w-3.5 h-3.5 bg-slate-900 rounded-full border-2 border-white shadow-xs"></div>
                    }
                  </button>

                  <!-- Rich Hover Popover: appears when mouse hovers on a quadrant that has risks -->
                  @if (count > 0) {
                    <div
                      class="absolute z-50 w-72 p-3 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-auto"
                      [class]="getPopoverPositionClass(cell.likelihood, cell.impact)"
                    >
                      <!-- Popover Header -->
                      <div class="flex items-center justify-between border-b border-slate-700/80 pb-1.5 mb-2">
                        <span class="text-[11px] font-bold text-slate-100 flex items-center gap-1">
                          <mat-icon class="text-sm text-emerald-400">gps_fixed</mat-icon>
                          <span>Cuadrante P{{ cell.likelihood }} × I{{ cell.impact }}</span>
                        </span>
                        <span
                          class="px-2 py-0.5 rounded text-[10px] font-mono font-bold text-white"
                          [class]="countBadgeColor(cell.level)"
                        >
                          {{ cell.score }} pts ({{ cell.level }})
                        </span>
                      </div>

                      <div class="text-[11px] text-emerald-400 font-semibold mb-2 flex items-center gap-1">
                        <mat-icon class="text-xs">touch_app</mat-icon>
                        <span>{{ count }} {{ count === 1 ? 'riesgo identificado' : 'riesgos identificados' }} — Pincha para ver:</span>
                      </div>

                      <!-- List of Risks with Direct 1-Click Navigation -->
                      <div class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        @for (rsk of cellRisks; track rsk.id) {
                          <button
                            type="button"
                            (click)="navigateTo(rsk)"
                            class="w-full text-left p-2 bg-slate-800/90 hover:bg-emerald-950/80 border border-slate-700 hover:border-emerald-500 rounded-lg transition-all group/item flex items-start gap-2 cursor-pointer shadow-xs"
                          >
                            <span class="font-mono text-[10px] font-bold text-emerald-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 shrink-0">
                              {{ rsk.code }}
                            </span>
                            <div class="flex-1 min-w-0">
                              <div class="text-[11px] font-medium text-slate-100 line-clamp-1 group-hover/item:text-emerald-300">
                                {{ rsk.title }}
                              </div>
                              <div class="text-[10px] text-slate-400 flex items-center justify-between mt-0.5">
                                <span class="truncate max-w-[120px]">{{ rsk.process }}</span>
                                <span class="text-emerald-400 font-semibold flex items-center gap-0.5">
                                  <span>Ir</span>
                                  <mat-icon class="text-[10px]">arrow_forward</mat-icon>
                                </span>
                              </div>
                            </div>
                          </button>
                        }
                      </div>
                      
                      <div class="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-center text-slate-400 flex items-center justify-center gap-1">
                        <mat-icon class="text-[11px] text-emerald-400">touch_app</mat-icon>
                        <span>Haz clic para navegar y resaltar en el catálogo</span>
                      </div>
                    </div>
                  }

                </div>
              }

            }

          </div>

          <!-- Axis Footers -->
          <div class="text-center mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-center gap-2">
            <span>← Severidad de Impacto Operacional (Escala 1 a 4) →</span>
          </div>

        </div>
      </div>

      <!-- Color Legend for 4x4 Scale -->
      <div class="flex flex-wrap items-center justify-between gap-4 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600">
        <div class="flex flex-wrap items-center gap-4">
          <span class="font-medium text-slate-700">Severidad de Riesgo 4x4:</span>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-emerald-100 border border-emerald-400"></span>
            <span>Bajo (1-3 pts)</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-amber-100 border border-amber-400"></span>
            <span>Medio (4-7 pts)</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-orange-100 border border-orange-400"></span>
            <span>Alto (8-11 pts)</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded bg-rose-100 border border-rose-400"></span>
            <span>Crítico (12-16 pts)</span>
          </div>
        </div>

        <div class="text-slate-500">
          Modo actual: <strong class="text-slate-800">{{ mode() === 'inherent' ? 'Riesgo Inherente (Bruto)' : 'Riesgo Residual (Neto)' }}</strong>
        </div>
      </div>

      <!-- Interactive Helper Banner when a cell with risks is selected -->
      @if (riskService.matrixSelectedCell(); as cell) {
        @let selectedRisks = getRisksForSelectedCell();
        <div class="mt-4 p-3 bg-slate-900 text-white rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <mat-icon class="text-base">filter_alt</mat-icon>
            </div>
            <div>
              <div class="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Cuadrante Seleccionado: Probabilidad {{ cell.likelihood }} × Impacto {{ cell.impact }}</span>
                <span class="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-emerald-400 border border-slate-700">
                  {{ selectedRisks.length }} riesgo(s)
                </span>
              </div>
              <p class="text-[11px] text-slate-300">
                El catálogo de riesgos está filtrado por este cuadrante.
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            @if (selectedRisks.length > 0) {
              <button
                type="button"
                (click)="navigateTo(selectedRisks[0])"
                class="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 shadow-sm cursor-pointer"
              >
                <mat-icon class="text-xs">arrow_forward</mat-icon>
                <span>Ir al riesgo {{ selectedRisks[0].code }}</span>
              </button>
            }
            <button
              type="button"
              (click)="riskService.matrixSelectedCell.set(null)"
              class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              Restablecer filtro
            </button>
          </div>
        </div>
      }

    </div>
  `
})
export class HeatmapMatrix {
  readonly riskService = inject(RiskDataService);

  readonly mode = signal<'inherent' | 'residual'>('residual');

  readonly riskSelected = output<Risk>();

  /** Nombres de la escala vigente (Mantenedores → Escala de riesgo). */
  get likelihoodNames(): string[] { return this.riskService.catalog.riskScale().likelihood.map(l => l.name); }

  get impactLabels(): { level: number; name: string }[] { return this.riskService.catalog.riskScale().impact.map(l => ({ level: l.level, name: l.name })); }

  getProcessRiskCount(processName: string): number {
    return this.riskService.risks().filter(r => r.process === processName).length;
  }

  onCellClick(likelihood: number, impact: number, cellRisks: Risk[]) {
    // If there is any risk in the cell, navigate directly to it!
    if (cellRisks && cellRisks.length > 0) {
      this.toggleCellSelection(likelihood, impact);
      this.riskSelected.emit(cellRisks[0]);
    } else {
      this.toggleCellSelection(likelihood, impact);
    }
  }

  navigateTo(risk: Risk) {
    this.riskSelected.emit(risk);
  }

  toggleCellSelection(likelihood: number, impact: number) {
    const current = this.riskService.matrixSelectedCell();
    if (current && current.likelihood === likelihood && current.impact === impact) {
      this.riskService.matrixSelectedCell.set(null);
    } else {
      this.riskService.matrixSelectedCell.set({ likelihood, impact });
    }
  }

  getRisksForSelectedCell(): Risk[] {
    const cell = this.riskService.matrixSelectedCell();
    if (!cell) return [];
    const risks = this.riskService.risks();
    if (this.mode() === 'inherent') {
      return risks.filter(r => r.inherentLikelihood === cell.likelihood && r.inherentImpact === cell.impact);
    } else {
      return risks.filter(r => r.residualLikelihood === cell.likelihood && r.residualImpact === cell.impact);
    }
  }

  getPopoverPositionClass(likelihood: number, impact: number): string {
    // Top rows (4 and 3) pop down; bottom rows (1 and 2) pop up
    const vPos = likelihood >= 3 ? 'top-full mt-2' : 'bottom-full mb-2';
    // Left col aligns left-0, right col aligns right-0, middle centers
    let hPos = 'left-1/2 -translate-x-1/2';
    if (impact === 1) {
      hPos = 'left-0';
    } else if (impact === 4) {
      hPos = 'right-0';
    }
    return `${vPos} ${hPos}`;
  }

  getCellClasses(level: RiskLevel, isSelected: boolean, hasRisks: boolean): string {
    const selectedRing = isSelected ? 'ring-2 ring-slate-900 ring-offset-2 ' : '';
    const hoverEffects = hasRisks
      ? 'cursor-pointer hover:shadow-md hover:scale-[1.03] hover:z-20 '
      : 'cursor-pointer hover:opacity-90 ';

    switch (level) {
      case 'Crítico':
        return `${selectedRing}${hoverEffects}bg-rose-50 hover:bg-rose-100 border-rose-300 text-rose-950 ${hasRisks ? 'font-semibold' : ''}`;
      case 'Alto':
        return `${selectedRing}${hoverEffects}bg-orange-50 hover:bg-orange-100 border-orange-300 text-orange-950 ${hasRisks ? 'font-semibold' : ''}`;
      case 'Medio':
        return `${selectedRing}${hoverEffects}bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-950 ${hasRisks ? 'font-semibold' : ''}`;
      case 'Bajo':
      default:
        return `${selectedRing}${hoverEffects}bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-950 ${hasRisks ? 'font-semibold' : ''}`;
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
}
