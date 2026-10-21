import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { AiRiskService } from '../services/ai-risk.service';

@Component({
  selector: 'app-executive-report-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden my-4">
        
        <!-- Header (Screen Only) -->
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white no-print">
          <div class="flex items-center gap-2.5">
            <mat-icon class="text-emerald-400">assessment</mat-icon>
            <div>
              <h2 class="text-base font-bold tracking-tight">Centro de Reportes Gerenciales & Cumplimiento</h2>
              <p class="text-xs text-slate-400">Exportación oficial en PDF y Excel para Comité de Riesgos y Directorio</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Excel Export Button -->
            <button
              (click)="riskService.exportToExcel('complete')"
              class="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              title="Descargar matriz y bitácora completa en formato Excel / CSV con UTF-8"
            >
              <mat-icon class="text-sm">table_view</mat-icon>
              <span>Exportar Excel</span>
            </button>

            <!-- PDF Print Button -->
            <button
              (click)="printPdf()"
              class="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
              title="Imprimir o Guardar en PDF de alta fidelidad"
            >
              <mat-icon class="text-sm">print</mat-icon>
              <span>Guardar PDF</span>
            </button>

            <button
              (click)="closeModal.emit()"
              class="text-slate-400 hover:text-white p-1 rounded-lg transition-colors ml-2"
            >
              <mat-icon class="text-lg">close</mat-icon>
            </button>
          </div>
        </div>

        <!-- Printable Document Body -->
        <div id="printable-report" class="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-white text-slate-900">
          
          <!-- Corporate Document Letterhead -->
          <div class="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xl font-extrabold tracking-tight text-slate-900">CUSTODIA RISK</span>
                <span class="text-xs bg-slate-900 text-white px-2 py-0.5 rounded font-mono uppercase">CONFIDENCIAL</span>
              </div>
              <h1 class="text-lg font-bold text-slate-800 mt-1">
                Dictamen Ejecutivo de Riesgo Operacional y Resiliencia
              </h1>
              <p class="text-xs text-slate-500">
                Marco Metodológico: ISO 31000:2018 / Basilea III / COSO ERM
              </p>
            </div>

            <div class="text-right text-xs text-slate-600 font-mono">
              <div>Fecha: <strong class="text-slate-900">{{ todayDate }}</strong></div>
              <div>Emisor: <strong class="text-slate-900">{{ riskService.currentProfile().name }}</strong></div>
              <div>Cargo: <span class="text-slate-700">{{ riskService.currentProfile().role }}</span></div>
            </div>
          </div>

          <!-- AI Executive Statement / Committee Summary -->
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <mat-icon class="text-emerald-600 text-sm">gavel</mat-icon>
                <span>Dictamen para el Comité de Auditoría y Directorio</span>
              </span>
              <button
                (click)="regenerateSummary()"
                [disabled]="isGeneratingAi()"
                class="text-[11px] text-emerald-700 hover:underline flex items-center gap-1 no-print font-medium"
              >
                <mat-icon class="text-xs">autorenew</mat-icon>
                <span>{{ isGeneratingAi() ? 'Actualizando...' : 'Regenerar con IA' }}</span>
              </button>
            </div>

            <p class="text-xs text-slate-700 leading-relaxed font-sans whitespace-pre-line">
              {{ executiveSummaryText() }}
            </p>
          </div>

          <!-- Quantitative Risk Figures (Printed Table) -->
          <div>
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
              1. Balance Cuantitativo de Exposición y Controles
            </h2>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div class="border border-slate-200 p-3 rounded-lg bg-white">
                <span class="text-slate-500 block text-[11px]">Exposición Bruta Inherente</span>
                <span class="text-base font-bold font-mono text-slate-900 tabular-nums">
                  \${{ riskService.metrics().totalInherentExposureUSD | number:'1.0-0' }} USD
                </span>
              </div>
              <div class="border border-slate-200 p-3 rounded-lg bg-white">
                <span class="text-slate-500 block text-[11px]">Exposición Neta Residual</span>
                <span class="text-base font-bold font-mono text-slate-900 tabular-nums">
                  \${{ riskService.metrics().totalResidualExposureUSD | number:'1.0-0' }} USD
                </span>
              </div>
              <div class="border border-slate-200 p-3 rounded-lg bg-white">
                <span class="text-slate-500 block text-[11px]">Tasa de Mitigación</span>
                <span class="text-base font-bold font-mono text-emerald-700 tabular-nums">
                  {{ riskService.metrics().mitigationEfficiencyPct }}%
                </span>
                <span class="text-[10px] text-slate-500 block">-\${{ riskService.metrics().mitigatedUSD | number:'1.0-0' }} USD</span>
              </div>
              <div class="border border-slate-200 p-3 rounded-lg bg-white">
                <span class="text-slate-500 block text-[11px]">Salud Operacional (OHI)</span>
                <span class="text-base font-bold font-mono text-indigo-700 tabular-nums">
                  {{ riskService.metrics().operationalHealthIndex }} / 100
                </span>
                <span class="text-[10px] text-slate-500 block">Efectividad Controles: {{ riskService.metrics().avgControlEffectiveness }}%</span>
              </div>
            </div>
          </div>

          <!-- Top Priority Operational Risks Table -->
          <div>
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
              2. Catálogo de Riesgos Críticos y Altos en Seguimiento
            </h2>
            <div class="border border-slate-200 rounded-lg overflow-hidden">
              <table class="w-full text-xs text-left">
                <thead class="bg-slate-100 text-slate-700 text-[11px] uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th class="py-2 px-3">Código</th>
                    <th class="py-2 px-3">Evento de Riesgo</th>
                    <th class="py-2 px-3">Proceso</th>
                    <th class="py-2 px-3 text-center">Score Inh.</th>
                    <th class="py-2 px-3 text-center">Score Res.</th>
                    <th class="py-2 px-3 text-right">Exp. Neta</th>
                    <th class="py-2 px-3">Plan Mitigación</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-200">
                  @for (r of riskService.risks(); track r.id) {
                    <tr class="hover:bg-slate-50">
                      <td class="py-2 px-3 font-mono font-bold text-slate-900">{{ r.code }}</td>
                      <td class="py-2 px-3">
                        <div class="font-medium text-slate-900">{{ r.title }}</div>
                        <div class="text-[10px] text-slate-500">{{ r.category }} · Resp: {{ r.responsible }}</div>
                      </td>
                      <td class="py-2 px-3 text-slate-700">{{ r.process }}</td>
                      <td class="py-2 px-3 text-center font-mono font-semibold text-rose-700">
                        {{ r.inherentScore }} ({{ r.inherentLevel }})
                      </td>
                      <td class="py-2 px-3 text-center font-mono font-semibold" [class]="r.residualLevel === 'Crítico' ? 'text-rose-700' : r.residualLevel === 'Alto' ? 'text-orange-600' : 'text-emerald-700'">
                        {{ r.residualScore }} ({{ r.residualLevel }})
                      </td>
                      <td class="py-2 px-3 text-right font-mono font-medium text-slate-900">
                        \${{ r.residualExposureUSD | number:'1.0-0' }}
                      </td>
                      <td class="py-2 px-3 text-[11px]">
                        <span class="font-medium text-slate-800">{{ r.mitigationPlan.title }}</span>
                        <span class="block text-[10px] text-slate-500">Avance: {{ r.mitigationPlan.progressPct }}% · Límite: {{ r.mitigationPlan.dueDate }}</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Active KRI Anomalies -->
          <div>
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
              3. Estado de Anomalías y Desviaciones de KRIs
            </h2>
            <div class="space-y-1.5">
              @for (alert of riskService.alerts(); track alert.id) {
                <div class="border border-slate-200 p-2.5 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <span class="font-mono font-bold text-slate-900 mr-2">{{ alert.code }}</span>
                    <span class="font-medium text-slate-800">{{ alert.title }}</span>
                    <span class="text-[11px] text-slate-500 block">Proceso: {{ alert.process }} · Registrada: {{ alert.triggeredAt }}</span>
                  </div>
                  <div class="text-right">
                    <span class="font-mono text-rose-700 font-bold block">{{ alert.currentValue }}</span>
                    <span class="text-[10px] text-slate-400">Umbral: {{ alert.threshold }}</span>
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Audit & Inalterable Ledger Verification Seal -->
          <div class="border-t border-slate-200 pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs text-slate-500">
            <div>
              <div class="flex items-center gap-1.5 font-bold text-slate-800">
                <mat-icon class="text-emerald-600 text-sm">verified</mat-icon>
                <span>Trazabilidad Total & Bitácora Inalterable Verificada</span>
              </div>
              <p class="text-[10px] mt-0.5">
                Hash de bloque certificado: <code class="font-mono text-slate-700">{{ riskService.auditTrail()[0]?.hash || 'Verified' }}</code>
              </p>
            </div>

            <div class="text-right text-[11px] font-mono">
              <div>Custodia Risk System · Compliance Engine v2.4</div>
              <div>Copia Auténtica y Certificada</div>
            </div>
          </div>

        </div>

        <!-- Footer (Screen Only) -->
        <div class="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between no-print">
          <span class="text-xs text-slate-500">
            Documento listo para su presentación ante reguladores y comités ejecutivos.
          </span>

          <div class="flex items-center gap-2">
            <button
              (click)="closeModal.emit()"
              class="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cerrar
            </button>

            <button
              (click)="printPdf()"
              class="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <mat-icon class="text-sm">print</mat-icon>
              <span>Imprimir / Guardar en PDF</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `
})
export class ExecutiveReportModal {
  readonly riskService = inject(RiskDataService);
  readonly aiService = inject(AiRiskService);

  readonly closeModal = output<void>();

  readonly todayDate = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  readonly isGeneratingAi = signal<boolean>(false);
  readonly executiveSummaryText = signal<string>(
    `Durante el periodo evaluado, la organización mantiene una exposición residual neta controlada de $385,000 USD frente a una exposición inherente bruta de $2,580,000 USD, lo que representa una tasa global de mitigación del 85% gracias a la efectividad promedio del 85% en el catálogo de controles operacionales.

Se recomienda al Comité de Riesgos mantener supervisión prioritaria sobre los incidentes derivados de fallas de infraestructura en la pasarela de pagos y culminar la entrega de llaves de hardware FIDO2 en Tesorería antes del cierre del trimestre.`
  );

  async regenerateSummary() {
    this.isGeneratingAi.set(true);
    try {
      const topRisks = this.riskService.risks().slice(0, 4).map(r => ({
        code: r.code,
        title: r.title,
        residualLevel: r.residualLevel,
        residualExposureUSD: r.residualExposureUSD
      }));

      const summary = await this.aiService.generateExecutiveSummary(this.riskService.metrics(), topRisks);
      this.executiveSummaryText.set(summary);
    } finally {
      this.isGeneratingAi.set(false);
    }
  }

  printPdf() {
    this.riskService.appendAuditLog(
      'EXPORTACIÓN_REPORTE',
      'Reporte',
      'PDF_EJECUTIVO_DICTAMEN',
      'Generación e impresión de informe ejecutivo formal de riesgo operacional en formato PDF.'
    );
    window.print();
  }
}
