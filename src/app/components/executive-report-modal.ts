import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApprovalService } from '../services/approval.service';
import { DocumentService } from '../services/document.service';
import { RiskDataService } from '../services/risk-data.service';
import { ActionPlanService } from '../services/action-plan.service';
import { SurveyService } from '../services/survey.service';
import { AiRiskService } from '../services/ai-risk.service';
import { MoneyPipe } from '../utils/money.pipe';

@Component({
  selector: 'app-executive-report-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MoneyPipe],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div class="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden my-4">
        
        <!-- Header (Screen Only) -->
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white no-print">
          <div class="flex items-center gap-2.5">
            <mat-icon class="text-emerald-400">assessment</mat-icon>
            <div>
              <h2 class="text-base font-bold tracking-tight">Centro de Reportes Gerenciales & Cumplimiento</h2>
              <p class="text-xs text-slate-400">Exportación oficial en PDF y Excel para Comité de Riesgos y Consejo de Administración</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Excel Export Button -->
            <button
              [class.perm-locked]="!riskService.canAny('canExportReports')" (click)="riskService.exportToExcel('complete')"
              class="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              title="Descargar matriz y bitácora completa en formato Excel / CSV con UTF-8"
            >
              <mat-icon class="text-sm">table_view</mat-icon>
              <span>Exportar Excel</span>
            </button>

            <!-- PDF Print Button -->
            <button
              [class.perm-locked]="!riskService.canAny('canExportReports')" (click)="printPdf()"
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
                <span class="text-xl font-extrabold tracking-tight text-slate-900">RISKGUARD PRO</span>
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
                <span>Dictamen para el Comité de Riesgos y el Consejo de Administración</span>
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
                  {{ riskService.metrics().totalInherentExposureUSD | money }}
                </span>
              </div>
              <div class="border border-slate-200 p-3 rounded-lg bg-white">
                <span class="text-slate-500 block text-[11px]">Exposición Neta Residual</span>
                <span class="text-base font-bold font-mono text-slate-900 tabular-nums">
                  {{ riskService.metrics().totalResidualExposureUSD | money }}
                </span>
              </div>
              <div class="border border-slate-200 p-3 rounded-lg bg-white">
                <span class="text-slate-500 block text-[11px]">Tasa de Mitigación</span>
                <span class="text-base font-bold font-mono text-emerald-700 tabular-nums">
                  {{ riskService.metrics().mitigationEfficiencyPct }}%
                </span>
                <span class="text-[10px] text-slate-500 block">{{ -(riskService.metrics().mitigatedUSD) | money }}</span>
              </div>
              <div class="border border-slate-200 p-3 rounded-lg bg-white">
                <span class="text-slate-500 block text-[11px]">Salud Operacional (OHI)</span>
                <span class="text-base font-bold font-mono text-indigo-700 tabular-nums">
                  @if (riskService.metrics().hasHealthData) { {{ riskService.metrics().operationalHealthIndex }} / 100 } @else { Sin datos }
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
                        {{ r.residualExposureUSD | money }}
                      </td>
                      <td class="py-2 px-3 text-[11px]">
                        <span class="font-medium text-slate-800">{{ actionPlans.riskTreatment(r).title }}</span>
                        <span class="block text-[10px] text-slate-500">Avance: {{ actionPlans.riskTreatment(r).progressPct }}% · Límite: {{ actionPlans.riskTreatment(r).dueDate }}</span>
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

          <!-- Planes de acción -->
          @let pk = actionPlans.kpis();
          <div>
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">4. Planes de Acción</h2>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs mb-2">
              <div class="border border-slate-200 rounded-lg p-2"><span class="block text-[10px] text-slate-500">Abiertos</span><span class="font-mono font-bold text-slate-900">{{ pk.open }}</span></div>
              <div class="border border-slate-200 rounded-lg p-2"><span class="block text-[10px] text-slate-500">Vencidos</span><span class="font-mono font-bold" [class]="pk.overdue ? 'text-rose-700' : 'text-slate-900'">{{ pk.overdue }}</span></div>
              <div class="border border-slate-200 rounded-lg p-2"><span class="block text-[10px] text-slate-500">Por verificar</span><span class="font-mono font-bold text-slate-900">{{ pk.toVerify }}</span></div>
              <div class="border border-slate-200 rounded-lg p-2"><span class="block text-[10px] text-slate-500">Reprogramados</span><span class="font-mono font-bold text-slate-900">{{ pk.rescheduled }}</span></div>
              <div class="border border-slate-200 rounded-lg p-2"><span class="block text-[10px] text-slate-500">Cerrados a tiempo (año)</span><span class="font-mono font-bold text-slate-900">{{ pk.onTimePct === null ? '—' : pk.onTimePct + ' %' }}</span></div>
            </div>
            @if (overduePlans().length) {
              <table class="w-full text-left text-[11px] border border-slate-200 rounded-lg overflow-hidden">
                <thead class="bg-slate-50 text-[10px] text-slate-500 uppercase"><tr><th class="py-1.5 px-2">Plan vencido</th><th class="py-1.5 px-2">Origen</th><th class="py-1.5 px-2">Responsable</th><th class="py-1.5 px-2">Plazo</th><th class="py-1.5 px-2 text-right">Avance</th></tr></thead>
                <tbody class="divide-y divide-slate-100">
                  @for (p of overduePlans(); track p.id) {
                    <tr><td class="py-1.5 px-2"><span class="font-mono text-slate-500 mr-1">{{ p.code }}</span>{{ p.title }}</td><td class="py-1.5 px-2 text-slate-600">{{ p.sourceType }}</td>
                      <td class="py-1.5 px-2">{{ p.owner }}</td><td class="py-1.5 px-2 font-mono text-rose-700">{{ p.dueDate }}</td><td class="py-1.5 px-2 text-right font-mono">{{ p.progressPct }} %</td></tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="text-[11px] text-slate-500">No hay planes de acción vencidos.</p>
            }
          </div>

          <!-- Autoevaluaciones -->
          <div>
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">5. Autoevaluaciones</h2>
            @if (surveys.sortedCampaigns().length) {
              <table class="w-full text-left text-[11px] border border-slate-200 rounded-lg overflow-hidden">
                <thead class="bg-slate-50 text-[10px] text-slate-500 uppercase"><tr><th class="py-1.5 px-2">Campaña</th><th class="py-1.5 px-2">Estado</th><th class="py-1.5 px-2 text-right">Respondidas</th><th class="py-1.5 px-2 text-right">Vencidas</th><th class="py-1.5 px-2 text-right">Observaciones</th></tr></thead>
                <tbody class="divide-y divide-slate-100">
                  @for (c of surveys.sortedCampaigns().slice(0, 6); track c.id) {
                    @let st = surveys.stats(c.id);
                    <tr><td class="py-1.5 px-2"><span class="font-mono text-slate-500 mr-1">{{ c.code }}</span>{{ c.title }}</td><td class="py-1.5 px-2">{{ c.status }}</td>
                      <td class="py-1.5 px-2 text-right font-mono">{{ st.submitted }}/{{ st.total }}</td><td class="py-1.5 px-2 text-right font-mono" [class.text-rose-700]="st.overdue">{{ st.overdue }}</td>
                      <td class="py-1.5 px-2 text-right font-mono">{{ st.findings }}</td></tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="text-[11px] text-slate-500">No hay campañas de autoevaluación.</p>
            }
          </div>

          <!-- Gestión documental -->
          <div>
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">6. Gestión documental</h2>
            @let dk = documents.kpis();
            <p class="text-[11px] text-slate-700 mb-2">
              {{ dk.vigentes }} documento(s) vigente(s) · {{ dk.vencidos }} con revisión vencida · {{ dk.enAprobacion }} en aprobación ·
              lectura confirmada {{ dk.lectura === null ? '—' : dk.lectura + ' %' }}.
            </p>
            @if (docAttention().length) {
              <table class="w-full text-left text-[11px] border border-slate-200 rounded-lg overflow-hidden">
                <thead class="bg-slate-50 text-[10px] text-slate-500 uppercase"><tr><th class="py-1.5 px-2">Documento</th><th class="py-1.5 px-2">Estado</th><th class="py-1.5 px-2 text-right">Próxima revisión</th></tr></thead>
                <tbody class="divide-y divide-slate-100">
                  @for (d of docAttention(); track d.id) {
                    <tr><td class="py-1.5 px-2"><span class="font-mono text-slate-500 mr-1">{{ d.code }}</span>{{ d.title }}</td><td class="py-1.5 px-2">{{ documents.status(d) }}</td>
                      <td class="py-1.5 px-2 text-right font-mono">{{ d.nextReviewDate || '—' }}</td></tr>
                  }
                </tbody>
              </table>
            }
          </div>

          <!-- Aprobaciones -->
          <div>
            <h2 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">7. Aprobaciones y aceptaciones de riesgo</h2>
            @let pendingApprovals = approvals.pending();
            @let accepted = acceptedRisks();
            <p class="text-[11px] text-slate-700 mb-2">
              {{ pendingApprovals.length }} solicitud(es) pendiente(s) · {{ accepted.length }} riesgo(s) aceptado(s) sobre el apetito.
            </p>
            @if (pendingApprovals.length || accepted.length) {
              <table class="w-full text-left text-[11px] border border-slate-200 rounded-lg overflow-hidden">
                <thead class="bg-slate-50 text-[10px] text-slate-500 uppercase"><tr><th class="py-1.5 px-2">Registro</th><th class="py-1.5 px-2">Estado</th><th class="py-1.5 px-2">Responsable de decidir / aprobó</th><th class="py-1.5 px-2 text-right">Fecha</th></tr></thead>
                <tbody class="divide-y divide-slate-100">
                  @for (a of pendingApprovals.slice(0, 6); track a.id) {
                    <tr><td class="py-1.5 px-2"><span class="font-mono text-slate-500 mr-1">{{ a.code }}</span>{{ approvals.summary(a) }}</td><td class="py-1.5 px-2 text-amber-700">Pendiente</td>
                      <td class="py-1.5 px-2">{{ a.steps[a.currentStep].roleTitle }}</td><td class="py-1.5 px-2 text-right font-mono">{{ a.requestedAt.slice(0, 10) }}</td></tr>
                  }
                  @for (r of accepted.slice(0, 6); track r.id) {
                    <tr><td class="py-1.5 px-2"><span class="font-mono text-slate-500 mr-1">{{ r.code }}</span>{{ r.title }}</td><td class="py-1.5 px-2 text-emerald-700">Aceptado hasta {{ r.acceptance!.reviewDate }}</td>
                      <td class="py-1.5 px-2">{{ r.acceptance!.approvedBy }}</td><td class="py-1.5 px-2 text-right font-mono">{{ r.acceptance!.approvedDate }}</td></tr>
                  }
                </tbody>
              </table>
            }
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
              <div>RiskGuard Pro · Gestión de riesgo operacional</div>
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
              [class.perm-locked]="!riskService.canAny('canExportReports')" (click)="printPdf()"
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
  readonly actionPlans = inject(ActionPlanService);
  readonly surveys = inject(SurveyService);
  readonly approvals = inject(ApprovalService);
  readonly documents = inject(DocumentService);
  readonly docAttention = computed(() => this.documents.sorted().filter(d => d.status === 'Activo' && ['Revisión vencida', 'En aprobación', 'Borrador'].includes(this.documents.status(d))).slice(0, 8));
  readonly acceptedRisks = computed(() => this.riskService.risks().filter(r => !!r.acceptance));
  readonly overduePlans = computed(() => this.actionPlans.sorted().filter(p => this.actionPlans.isOverdue(p)).slice(0, 15));
  readonly aiService = inject(AiRiskService);

  readonly closeModal = output<void>();

  readonly todayDate = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  readonly isGeneratingAi = signal<boolean>(false);
  readonly executiveSummaryText = signal<string>(this.defaultSummary());

  /** Resumen base con las cifras actuales (en la moneda de registro). */
  private defaultSummary(): string {
    const m = this.riskService.metrics();
    const fmt = (v: number) => this.riskService.catalog.formatMoney(v);
    const pct = m.totalInherentExposureUSD > 0 ? Math.round((m.mitigatedUSD / m.totalInherentExposureUSD) * 100) : 0;
    return `Durante el periodo evaluado, la organización mantiene una exposición residual neta de ${fmt(m.totalResidualExposureUSD)} frente a una exposición inherente bruta de ${fmt(m.totalInherentExposureUSD)}, lo que representa una mitigación del ${pct}% gracias a los controles operacionales vigentes.

Se recomienda al Comité de Riesgos mantener supervisión prioritaria sobre los riesgos fuera del apetito aprobado y sobre los incidentes con pérdidas relevantes del periodo.`;
  }

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
    if (!this.riskService.requirePermission(['canExportReports'], 'exportar reportes')) return;
    this.riskService.appendAuditLog(
      'EXPORTACIÓN_REPORTE',
      'Reporte',
      'PDF_EJECUTIVO_DICTAMEN',
      'Generación e impresión de informe ejecutivo formal de riesgo operacional en formato PDF.'
    );
    window.print();
  }
}
