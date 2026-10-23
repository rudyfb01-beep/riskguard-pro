import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { AiRiskService } from '../services/ai-risk.service';

export type ReportType =
  | 'dictamen-directorio'
  | 'informe-departamental'
  | 'registro-perdidas'
  | 'controles-auditoria';

@Component({
  selector: 'app-reports-center',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-6">

      <!-- Configuration & Export Control Bar (Screen Only - No Print) -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-xs p-5 no-print">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                <mat-icon class="text-lg">picture_as_pdf</mat-icon>
              </span>
              <h2 class="text-base font-bold text-slate-900 tracking-tight">
                Centro de Reportes Oficiales & Exportación PDF
              </h2>
            </div>
            <p class="text-xs text-slate-500 mt-1">
              Genere dictámenes ejecutivos, fichas por departamento y registros de pérdidas con formato imprimible de alta fidelidad para Comités y Reguladores.
            </p>
          </div>

          <!-- Main Actions: Print to PDF & Excel -->
          <div class="flex items-center gap-2 shrink-0">
            <button
              [class.perm-locked]="!riskService.canAny('canExportReports')" (click)="exportExcel()"
              class="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors flex items-center gap-1.5"
              title="Descargar matriz en Excel (.csv UTF-8)"
            >
              <mat-icon class="text-sm">table_view</mat-icon>
              <span>Exportar Excel</span>
            </button>

            <button
              [class.perm-locked]="!riskService.canAny('canExportReports')" (click)="printReport()"
              class="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-sm flex items-center gap-2"
              title="Abre la ventana de impresión para guardar directamente en PDF"
            >
              <mat-icon class="text-sm text-emerald-400">print</mat-icon>
              <span>Imprimir / Guardar en PDF</span>
            </button>
          </div>
        </div>

        <!-- Report Template & Customization Controls -->
        <div class="mt-5 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          
          <!-- Control 1: Template Type -->
          <div>
            <label for="template-select" class="block font-semibold text-slate-700 mb-1">Plantilla de Informe:</label>
            <select
              id="template-select"
              [value]="selectedTemplate()"
              (change)="onTemplateChange($event)"
              class="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer font-medium"
            >
              <option value="dictamen-directorio">Dictamen Ejecutivo para el Consejo de Administración</option>
              <option value="informe-departamental">Informe por Departamento / Macroproceso</option>
              <option value="registro-perdidas">Registro Oficial de Pérdidas e Incidentes</option>
              <option value="controles-auditoria">Informe de Aseguramiento de Controles</option>
            </select>
          </div>

          <!-- Control 2: Department Filter -->
          <div>
            <label for="dept-select" class="block font-semibold text-slate-700 mb-1">Alcance / Departamento:</label>
            <select
              id="dept-select"
              [value]="selectedDepartment()"
              (change)="onDepartmentChange($event)"
              class="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer font-medium"
            >
              <option value="TODOS">Toda la Organización (Global)</option>
              @for (proc of riskService.defaultProcesses; track proc) {
                <option [value]="proc">{{ proc }}</option>
              }
            </select>
          </div>

          <!-- Control 3: Period Selection -->
          <div>
            <label for="period-select" class="block font-semibold text-slate-700 mb-1">Periodo Evaluado:</label>
            <select
              id="period-select"
              [value]="selectedPeriod()"
              (change)="selectedPeriod.set($any($event.target).value)"
              class="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer font-medium"
            >
              <option value="Ejercicio 2026 - Q3 (Cierre Actual)">Ejercicio 2026 - Q3 (Cierre Actual)</option>
              <option value="Ejercicio 2026 - Q2">Ejercicio 2026 - Q2</option>
              <option value="Ejercicio 2026 - Q1">Ejercicio 2026 - Q1</option>
              <option value="Consolidado Anual 2026">Consolidado Anual 2026</option>
            </select>
          </div>

          <!-- Control 4: Options Checkboxes -->
          <div>
            <span class="block font-semibold text-slate-700 mb-1">Opciones de Impresión:</span>
            <div class="space-y-1.5 pt-0.5">
              <label class="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  [checked]="includeCharts()"
                  (change)="includeCharts.set(!includeCharts())"
                  class="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span>Incluir gráficos analíticos</span>
              </label>

              <label class="flex items-center gap-2 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  [checked]="includeSignatures()"
                  (change)="includeSignatures.set(!includeSignatures())"
                  class="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span>Incluir pliego de firmas</span>
              </label>
            </div>
          </div>

        </div>
      </div>

      <!-- Live Printable Document Preview Container -->
      <div class="bg-white rounded-2xl shadow-md border border-slate-300 p-6 sm:p-10 text-slate-900 printable-document-container">
        
        <!-- Document Head / Official Letterhead -->
        <div class="border-b-2 border-slate-900 pb-5 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
          <div>
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold">
                <mat-icon class="text-xl">shield</mat-icon>
              </div>
              <div>
                <span class="text-xl font-extrabold tracking-tight text-slate-900">RISKGUARD PRO</span>
                <span class="text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded font-mono uppercase ml-2">OFICIAL & CONFIDENCIAL</span>
                <div class="text-[11px] text-slate-500">Sistema Integral de Resiliencia y Control Operacional</div>
              </div>
            </div>

            <h1 class="text-lg sm:text-xl font-bold text-slate-900 mt-3">
              {{ documentTitle() }}
            </h1>
            <p class="text-xs text-slate-600">
              Marco de Cumplimiento: ISO 31000:2018 · Basilea III (Pilar 1 y 2) · COSO ERM 2017
            </p>
          </div>

          <div class="text-right text-xs text-slate-600 font-mono space-y-0.5">
            <div>Folio: <strong class="text-slate-900">CR-2026-{{ reportFolio() }}</strong></div>
            <div>Fecha Emisión: <strong class="text-slate-900">{{ todayFormatted }}</strong></div>
            <div>Periodo: <span class="text-slate-800">{{ selectedPeriod() }}</span></div>
            <div>Emisor: <span class="text-slate-800">{{ riskService.currentProfile().name }} ({{ riskService.currentProfile().role }})</span></div>
            <div>Alcance: <strong class="text-slate-900">{{ selectedDepartment() }}</strong></div>
          </div>
        </div>

        <!-- Section 1: Executive Statement / Committee Mandate -->
        <div class="mb-6 bg-slate-50 p-5 rounded-xl border border-slate-200 avoid-page-break">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <mat-icon class="text-emerald-700 text-sm">gavel</mat-icon>
              <span>Dictamen y Conclusiones del Comité</span>
            </span>
            <div class="flex items-center gap-2 no-print">
              <button
                (click)="regenerateWithAi()"
                [disabled]="isAiGenerating()"
                class="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
              >
                <mat-icon class="text-xs">autorenew</mat-icon>
                <span>{{ isAiGenerating() ? 'Generando...' : 'Regenerar con IA' }}</span>
              </button>
            </div>
          </div>

          <p class="text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-line">
            {{ executiveStatement() }}
          </p>
        </div>

        <!-- Section 2: Quantitative Exposure & Health Balance -->
        <div class="mb-6 avoid-page-break">
          <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5">
            1. Balance Cuantitativo de Exposición Financiera y Resiliencia
          </h3>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div class="border border-slate-200 p-3 rounded-lg bg-white">
              <span class="text-slate-500 block text-[11px]">Exposición Bruta Inherente</span>
              <span class="text-base font-bold font-mono text-slate-900 tabular-nums">
                \${{ reportMetrics().inherentUSD | number:'1.0-0' }} {{ riskService.currencyCode() }}
              </span>
              <span class="text-[10px] text-slate-400 block">Sin aplicación de controles</span>
            </div>

            <div class="border border-slate-200 p-3 rounded-lg bg-white">
              <span class="text-slate-500 block text-[11px]">Exposición Neta Residual</span>
              <span class="text-base font-bold font-mono text-slate-900 tabular-nums">
                \${{ reportMetrics().residualUSD | number:'1.0-0' }} {{ riskService.currencyCode() }}
              </span>
              <span class="text-[10px] text-slate-400 block">Exposición real asumida</span>
            </div>

            <div class="border border-slate-200 p-3 rounded-lg bg-white">
              <span class="text-slate-500 block text-[11px]">Eficiencia de Mitigación</span>
              <span class="text-base font-bold font-mono text-emerald-700 tabular-nums">
                {{ reportMetrics().mitigationPct }}%
              </span>
              <span class="text-[10px] text-emerald-700 block">-\${{ reportMetrics().mitigatedUSD | number:'1.0-0' }} {{ riskService.currencyCode() }} mitigados</span>
            </div>

            <div class="border border-slate-200 p-3 rounded-lg bg-white">
              <span class="text-slate-500 block text-[11px]">Índice de Salud Operacional (OHI)</span>
              <span class="text-base font-bold font-mono text-indigo-700 tabular-nums">
                {{ reportMetrics().ohi }} / 100
              </span>
              <span class="text-[10px] text-slate-500 block">Efectividad Controles: {{ reportMetrics().avgControlEff }}%</span>
            </div>
          </div>
        </div>

        <!-- Section 3: Visual Print-Ready Charts (If enabled) -->
        @if (includeCharts()) {
          <div class="mb-6 p-4 border border-slate-200 rounded-xl bg-slate-50/50 avoid-page-break">
            <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              2. Análisis Gráfico de Exposición y Migración de Severidad
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <!-- Visual Chart 1: Exposure Bar -->
              <div class="bg-white p-3 rounded-lg border border-slate-200 text-xs">
                <span class="font-bold text-slate-800 block mb-2">Exposición Financiera Consolidada</span>
                <div class="space-y-2">
                  <div>
                    <div class="flex justify-between text-[11px] mb-0.5">
                      <span class="text-slate-600">Exposición Inherente</span>
                      <span class="font-mono font-bold">\${{ reportMetrics().inherentUSD | number:'1.0-0' }}</span>
                    </div>
                    <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                      <div class="bg-slate-300 h-full w-full"></div>
                    </div>
                  </div>

                  <div>
                    <div class="flex justify-between text-[11px] mb-0.5">
                      <span class="text-slate-600">Exposición Residual (Post-Controles)</span>
                      <span class="font-mono font-bold text-emerald-700">\${{ reportMetrics().residualUSD | number:'1.0-0' }}</span>
                    </div>
                    <div class="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                      <div
                        class="bg-emerald-600 h-full rounded-full"
                        [style.width.%]="(reportMetrics().residualUSD / (reportMetrics().inherentUSD || 1)) * 100"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Visual Chart 2: Severity Migration -->
              <div class="bg-white p-3 rounded-lg border border-slate-200 text-xs">
                <span class="font-bold text-slate-800 block mb-2">Distribución de Severidad de Riesgos</span>
                <div class="grid grid-cols-4 gap-2 text-center">
                  <div class="p-2 bg-rose-50 border border-rose-200 rounded">
                    <span class="text-[9px] uppercase font-bold text-rose-800 block">Crítico</span>
                    <span class="text-sm font-bold font-mono text-rose-900">{{ reportMetrics().resCritCount }}</span>
                  </div>
                  <div class="p-2 bg-amber-50 border border-amber-200 rounded">
                    <span class="text-[9px] uppercase font-bold text-amber-800 block">Alto</span>
                    <span class="text-sm font-bold font-mono text-amber-900">{{ reportMetrics().resHighCount }}</span>
                  </div>
                  <div class="p-2 bg-blue-50 border border-blue-200 rounded">
                    <span class="text-[9px] uppercase font-bold text-blue-800 block">Medio</span>
                    <span class="text-sm font-bold font-mono text-blue-900">{{ reportMetrics().resMedCount }}</span>
                  </div>
                  <div class="p-2 bg-emerald-50 border border-emerald-200 rounded">
                    <span class="text-[9px] uppercase font-bold text-emerald-800 block">Bajo</span>
                    <span class="text-sm font-bold font-mono text-emerald-900">{{ reportMetrics().resLowCount }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Section 4: Inventory of Critical & Priority Risks Table -->
        <div class="mb-6 avoid-page-break">
          <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5">
            3. Registro y Estado de Riesgos Operacionales
          </h3>

          <div class="border border-slate-200 rounded-lg overflow-hidden">
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-100 text-slate-700 text-[10px] uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-2 px-3">Código</th>
                  <th class="py-2 px-3">Evento de Riesgo</th>
                  <th class="py-2 px-3">Proceso</th>
                  <th class="py-2 px-3 text-center">Score Inh.</th>
                  <th class="py-2 px-3 text-center">Score Res.</th>
                  <th class="py-2 px-3 text-right">Exp. Neta {{ riskService.currencyCode() }}</th>
                  <th class="py-2 px-3">Plan de Mitigación</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                @for (r of targetRisks(); track r.id) {
                  <tr>
                    <td class="py-2 px-3 font-mono font-bold text-slate-900">{{ r.code }}</td>
                    <td class="py-2 px-3">
                      <div class="font-medium text-slate-900">{{ r.title }}</div>
                      <div class="text-[10px] text-slate-500">Cat: {{ r.category }} · Resp: {{ r.responsible }}</div>
                    </td>
                    <td class="py-2 px-3 text-slate-700">{{ r.process }}</td>
                    <td class="py-2 px-3 text-center font-mono font-semibold text-rose-700">
                      {{ r.inherentScore }} ({{ r.inherentLevel }})
                    </td>
                    <td class="py-2 px-3 text-center font-mono font-semibold" [class]="r.residualLevel === 'Crítico' ? 'text-rose-700' : r.residualLevel === 'Alto' ? 'text-amber-600' : 'text-emerald-700'">
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

        <!-- Section 5: Real Operational Losses & Incidents Table -->
        <div class="mb-6 avoid-page-break">
          <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5">
            4. Registro Regulatorio de Incidentes y Eventos de Pérdida Real
          </h3>

          <div class="border border-slate-200 rounded-lg overflow-hidden">
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-100 text-slate-700 text-[10px] uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-2 px-3">Código</th>
                  <th class="py-2 px-3">Incidencia</th>
                  <th class="py-2 px-3">Proceso</th>
                  <th class="py-2 px-3">Fecha</th>
                  <th class="py-2 px-3 text-right">Pérdida Bruta</th>
                  <th class="py-2 px-3 text-right">Recuperado</th>
                  <th class="py-2 px-3 text-right">Pérdida Neta</th>
                  <th class="py-2 px-3">Estado</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                @for (inc of targetIncidents(); track inc.id) {
                  <tr>
                    <td class="py-2 px-3 font-mono font-bold text-rose-700">{{ inc.id.toUpperCase() }}</td>
                    <td class="py-2 px-3">
                      <div class="font-medium text-slate-900">{{ inc.title }}</div>
                      <div class="text-[10px] text-slate-500">Sistema: {{ inc.impactedSystemOrAccount || 'General' }}</div>
                    </td>
                    <td class="py-2 px-3 text-slate-700">{{ inc.process }}</td>
                    <td class="py-2 px-3 text-slate-600 font-mono">{{ inc.reportedAt }}</td>
                    <td class="py-2 px-3 text-right font-mono text-rose-700 font-semibold">\${{ inc.realLossAmountUSD || 0 | number:'1.0-0' }}</td>
                    <td class="py-2 px-3 text-right font-mono text-emerald-700 font-semibold">\${{ inc.recoveredAmountUSD || 0 | number:'1.0-0' }}</td>
                    <td class="py-2 px-3 text-right font-mono font-bold text-slate-900">
                      \${{ ((inc.realLossAmountUSD || 0) - (inc.recoveredAmountUSD || 0)) | number:'1.0-0' }}
                    </td>
                    <td class="py-2 px-3">
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-800">
                        {{ inc.status }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 6: Controls & Testing Status -->
        <div class="mb-6 avoid-page-break">
          <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5">
            5. Cobertura y Eficacia de Controles Operacionales Evaluados
          </h3>

          <div class="border border-slate-200 rounded-lg overflow-hidden">
            <table class="w-full text-xs text-left">
              <thead class="bg-slate-100 text-slate-700 text-[10px] uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th class="py-2 px-3">Código</th>
                  <th class="py-2 px-3">Nombre del Control</th>
                  <th class="py-2 px-3">Proceso</th>
                  <th class="py-2 px-3">Naturaleza</th>
                  <th class="py-2 px-3 text-center">Eficacia Total</th>
                  <th class="py-2 px-3">Última Prueba</th>
                  <th class="py-2 px-3">Evidencia Documental Adjunta</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                @for (c of targetControls().slice(0, 8); track c.id) {
                  <tr>
                    <td class="py-2 px-3 font-mono font-bold text-slate-900">{{ c.code }}</td>
                    <td class="py-2 px-3 font-medium text-slate-900">{{ c.name }}</td>
                    <td class="py-2 px-3 text-slate-700">{{ c.process }}</td>
                    <td class="py-2 px-3 text-slate-600">{{ c.type }} · {{ c.automation }}</td>
                    <td class="py-2 px-3 text-center font-mono font-bold" [class]="c.totalEffectiveness >= 80 ? 'text-emerald-700' : 'text-amber-700'">
                      {{ c.totalEffectiveness }}%
                    </td>
                    <td class="py-2 px-3 text-slate-600 font-mono">{{ c.lastTested }}</td>
                    <td class="py-2 px-3 text-[11px]">
                      <div class="text-slate-800 truncate max-w-[220px]" [title]="c.evidence">{{ c.evidence }}</div>
                      @if (c.attachments && c.attachments.length > 0) {
                        <div class="text-[10px] text-emerald-800 font-mono flex items-center gap-1 mt-0.5">
                          <mat-icon class="text-[11px] text-emerald-600">attach_file</mat-icon>
                          <span>{{ c.attachments.length }} soporte(s): {{ c.attachments[0].fileName }}</span>
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Section 7: Formal Sign-off Sheet (If enabled) -->
        @if (includeSignatures()) {
          <div class="border-t border-slate-300 pt-6 mt-8 avoid-page-break">
            <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-8">
              6. Declaración de Conformidad y Pliego de Firmas
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center text-xs">
              
              <!-- Signature 1 -->
              <div class="flex flex-col items-center">
                <div class="w-48 border-b-2 border-slate-400 pb-1 mb-2"></div>
                <strong class="text-slate-900">Dr. Roberto Valenzuela</strong>
                <span class="text-slate-500 text-[11px]">Jefe de Riesgo Operacional</span>
                <span class="text-[10px] text-slate-400 font-mono">Gerencia de Riesgos</span>
              </div>

              <!-- Signature 2 -->
              <div class="flex flex-col items-center">
                <div class="w-48 border-b-2 border-slate-400 pb-1 mb-2"></div>
                <strong class="text-slate-900">Dra. Claudia Benítez</strong>
                <span class="text-slate-500 text-[11px]">Auditora Interna Líder (CIA / CISA)</span>
                <span class="text-[10px] text-slate-400 font-mono">Instituto de Auditores Internos</span>
              </div>

              <!-- Signature 3 -->
              <div class="flex flex-col items-center">
                <div class="w-48 border-b-2 border-slate-400 pb-1 mb-2"></div>
                <strong class="text-slate-900">Ing. Andrés Mendoza</strong>
                <span class="text-slate-500 text-[11px]">Presidente del Comité de Auditoría</span>
                <span class="text-[10px] text-slate-400 font-mono">Consejo de Administración</span>
              </div>

            </div>
          </div>
        }

        <!-- Section 8: Cryptographic Ledger & Compliance Stamp -->
        <div class="border-t border-slate-200 pt-5 mt-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs text-slate-500 avoid-page-break">
          <div>
            <div class="flex items-center gap-1.5 font-bold text-slate-800">
              <mat-icon class="text-emerald-600 text-sm">verified</mat-icon>
              <span>Bitácora Inalterable Certificada por Cadena Criptográfica</span>
            </div>
            <p class="text-[10px] mt-0.5">
              Hash SHA-256 de integridad: <code class="font-mono text-slate-700">{{ riskService.auditTrail()[0]?.hash || 'Verified-Blockchain-Ledger' }}</code>
            </p>
          </div>

          <div class="text-right text-[11px] font-mono">
            <div>RiskGuard Pro · Gestión de riesgo operacional</div>
            <div>Copia Oficial Auténtica para Archivo Regulador</div>
          </div>
        </div>

      </div>

    </div>
  `
})
export class ReportsCenter {
  readonly riskService = inject(RiskDataService);
  readonly aiService = inject(AiRiskService);

  readonly selectedTemplate = signal<ReportType>('dictamen-directorio');
  readonly selectedDepartment = signal<string>('TODOS');
  readonly selectedPeriod = signal<string>('Ejercicio 2026 - Q3 (Cierre Actual)');
  readonly includeCharts = signal<boolean>(true);
  readonly includeSignatures = signal<boolean>(true);

  readonly isAiGenerating = signal<boolean>(false);
  readonly todayFormatted = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  readonly reportFolio = computed(() => {
    return Math.floor(1000 + Math.random() * 9000);
  });

  readonly executiveStatement = signal<string>(
    `Durante el periodo evaluado, la organización mantiene una exposición residual neta controlada frente a la exposición bruta inherente, logrando una tasa global de mitigación del 85% gracias a la efectividad promedio del 85% en el catálogo de controles operacionales.

Se certifica que no existen desviaciones no mitigadas que comprometan el apetito de riesgo corporativo fijado por el Consejo de Administración conforme a Basilea III y la norma ISO 31000:2018.`
  );

  readonly documentTitle = computed(() => {
    const t = this.selectedTemplate();
    const dept = this.selectedDepartment();
    if (t === 'informe-departamental') {
      return `Informe Departamental de Riesgos y Controles: ${dept === 'TODOS' ? 'Consolidado General' : dept}`;
    }
    if (t === 'registro-perdidas') {
      return 'Registro Regulatorio de Pérdidas e Incidentes Operacionales (Basilea III)';
    }
    if (t === 'controles-auditoria') {
      return 'Informe de Aseguramiento y Evaluación de Eficacia de Controles Internos';
    }
    return 'Dictamen Ejecutivo de Riesgo Operacional y Resiliencia para el Consejo de Administración';
  });

  readonly targetRisks = computed(() => {
    const dept = this.selectedDepartment();
    const all = this.riskService.risks();
    if (dept === 'TODOS') return all;
    return all.filter(r => r.process === dept);
  });

  readonly targetControls = computed(() => {
    const dept = this.selectedDepartment();
    const all = this.riskService.controls();
    if (dept === 'TODOS') return all;
    return all.filter(c => c.process === dept);
  });

  readonly targetIncidents = computed(() => {
    const dept = this.selectedDepartment();
    const all = this.riskService.flaws().filter(f => f.status !== 'Descartada');
    if (dept === 'TODOS') return all;
    return all.filter(f => f.process === dept);
  });

  readonly reportMetrics = computed(() => {
    const risks = this.targetRisks();
    const controls = this.targetControls();

    const inherentUSD = risks.reduce((acc, r) => acc + r.financialExposureUSD, 0);
    const residualUSD = risks.reduce((acc, r) => acc + r.residualExposureUSD, 0);
    const mitigatedUSD = Math.max(0, inherentUSD - residualUSD);
    const mitigationPct = inherentUSD > 0 ? Math.round((mitigatedUSD / inherentUSD) * 100) : 0;

    const resCritCount = risks.filter(r => r.residualLevel === 'Crítico').length;
    const resHighCount = risks.filter(r => r.residualLevel === 'Alto').length;
    const resMedCount = risks.filter(r => r.residualLevel === 'Medio').length;
    const resLowCount = risks.filter(r => r.residualLevel === 'Bajo').length;

    const avgControlEff = controls.length > 0
      ? Math.round(controls.reduce((acc, c) => acc + c.totalEffectiveness, 0) / controls.length)
      : 85;

    const ohi = this.riskService.metrics().operationalHealthIndex;

    return {
      inherentUSD,
      residualUSD,
      mitigatedUSD,
      mitigationPct,
      resCritCount,
      resHighCount,
      resMedCount,
      resLowCount,
      avgControlEff,
      ohi
    };
  });

  onTemplateChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value as ReportType;
    this.selectedTemplate.set(val);
  }

  onDepartmentChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedDepartment.set(val);
  }

  async regenerateWithAi() {
    this.isAiGenerating.set(true);
    try {
      const topRisks = this.targetRisks().slice(0, 4).map(r => ({
        code: r.code,
        title: r.title,
        residualLevel: r.residualLevel,
        residualExposureUSD: r.residualExposureUSD
      }));

      const summary = await this.aiService.generateExecutiveSummary(
        this.riskService.metrics(),
        topRisks
      );
      this.executiveStatement.set(summary);
    } finally {
      this.isAiGenerating.set(false);
    }
  }

  exportExcel() {
    if (!this.riskService.requirePermission(['canExportReports'], 'exportar reportes')) return;
    this.riskService.exportToExcel('complete');
  }

  printReport() {
    if (!this.riskService.requirePermission(['canExportReports'], 'exportar reportes')) return;
    this.riskService.appendAuditLog(
      'EXPORTACIÓN_REPORTE',
      'Reporte',
      `PDF_OFICIAL_${this.selectedTemplate().toUpperCase()}`,
      `Exportación e impresión formal en PDF de "${this.documentTitle()}" para el periodo ${this.selectedPeriod()}.`
    );
    window.print();
  }
}
