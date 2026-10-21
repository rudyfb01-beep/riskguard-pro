import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';

@Component({
  selector: 'app-executive-kpis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      
      <!-- Card 1: Exposición Financiera Neta -->
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span class="text-xs font-medium uppercase tracking-wider">Exposición Residual Neta</span>
          <mat-icon class="text-slate-400 text-lg">attach_money</mat-icon>
        </div>
        <div class="text-2xl font-bold font-mono text-slate-900 tabular-nums">
          \${{ riskService.metrics().totalResidualExposureUSD | number:'1.0-0' }}
        </div>
        <div class="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <span class="text-emerald-700 font-semibold font-mono tabular-nums">-\${{ riskService.metrics().mitigatedUSD | number:'1.0-0' }}</span>
          <span>mitigados por controles</span>
        </div>
      </div>

      <!-- Card 2: Eficiencia de Mitigación -->
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span class="text-xs font-medium uppercase tracking-wider">Mitigación de Riesgo</span>
          <mat-icon class="text-slate-400 text-lg">trending_down</mat-icon>
        </div>
        <div class="text-2xl font-bold font-mono text-emerald-600 tabular-nums">
          {{ riskService.metrics().mitigationEfficiencyPct }}%
        </div>
        <div class="mt-2 text-xs text-slate-500 flex items-center justify-between">
          <span>Inherente: \${{ riskService.metrics().totalInherentExposureUSD | number:'1.0-0' }}</span>
        </div>
      </div>

      <!-- Card 3: Efectividad Global de Controles -->
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span class="text-xs font-medium uppercase tracking-wider">Efectividad Controles</span>
          <mat-icon class="text-slate-400 text-lg">verified_user</mat-icon>
        </div>
        <div class="text-2xl font-bold font-mono text-indigo-600 tabular-nums">
          {{ riskService.metrics().avgControlEffectiveness }}%
        </div>
        <div class="mt-2 text-xs text-slate-500">
          <span>{{ riskService.metrics().totalControls }} controles operando activamente</span>
        </div>
      </div>

      <!-- Card 4: Alertas de Proceso en Tiempo Real -->
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span class="text-xs font-medium uppercase tracking-wider">Alertas / Anomalías</span>
          <mat-icon class="text-amber-500 text-lg">notification_important</mat-icon>
        </div>
        <div class="text-2xl font-bold font-mono text-slate-900 tabular-nums">
          {{ riskService.metrics().activeAlertsCount }}
          @if (riskService.metrics().criticalAlertsCount > 0) {
            <span class="text-xs font-semibold text-rose-600 font-sans ml-1">
              ({{ riskService.metrics().criticalAlertsCount }} críticas)
            </span>
          }
        </div>
        <div class="mt-2 text-xs text-slate-500">
          <span>Monitoreo continuo de KRIs</span>
        </div>
      </div>

      <!-- Card 5: Índice de Salud Operacional (OHI) -->
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span class="text-xs font-medium uppercase tracking-wider">Índice OHI (Salud)</span>
          <mat-icon class="text-emerald-500 text-lg">health_and_safety</mat-icon>
        </div>
        <div class="text-2xl font-bold font-mono text-slate-900 tabular-nums">
          {{ riskService.metrics().operationalHealthIndex }}/100
        </div>
        <div class="mt-2 text-xs text-slate-500">
          @if (riskService.metrics().operationalHealthIndex >= 80) {
            <span class="text-emerald-700 font-medium">Postura Operacional Óptima</span>
          } @else if (riskService.metrics().operationalHealthIndex >= 60) {
            <span class="text-amber-700 font-medium">Postura Aceptable con Alertas</span>
          } @else {
            <span class="text-rose-700 font-medium">Atención Requerida</span>
          }
        </div>
      </div>

    </div>
  `
})
export class ExecutiveKpis {
  readonly riskService = inject(RiskDataService);
}
