import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { ResilienceService } from '../services/resilience.service';
import { SecurityService } from '../services/security.service';
import { AiRiskService, AIAnalysisResult } from '../services/ai-risk.service';
import { BASEL_SUBCATEGORIES, BaselCategory, CAC_BUSINESS_LINES, CacBusinessLine, IncidentType, OperationalFlaw } from '../models/risk.model';
import { MoneyPipe } from '../utils/money.pipe';
import { CyberIncidentInfo, EMPTY_CYBER } from '../models/compliance.model';

@Component({
  selector: 'app-flaw-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MoneyPipe],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-6">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <mat-icon class="text-amber-600">report_problem</mat-icon>
              <span>{{ incidentToEdit() ? 'Actualizar Incidente / Evento Operacional' : 'Registrar Incidente Operacional' }}</span>
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">
              En la pestaña "Incidentes y Pérdidas", puedes reportar o actualizar eventos de pérdida real o fallas de control.
            </p>
          </div>
          <button
            type="button"
            (click)="closeModal.emit()"
            class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <mat-icon class="text-lg">close</mat-icon>
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          
          <form [formGroup]="form" class="space-y-4">
            
            <!-- Tipo de Incidente / Evento -->
            <div>
              <label for="incident-type" class="block text-xs font-semibold text-slate-700 mb-1">
                Tipo de Incidencia / Evento Operacional *
              </label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  (click)="setIncidentType('Falla de Control')"
                  [class]="form.get('incidentType')?.value === 'Falla de Control'
                    ? 'border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  class="p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer"
                >
                  <mat-icon class="text-amber-600 text-sm mt-0.5">gpp_maybe</mat-icon>
                  <div>
                    <div class="text-xs font-bold leading-tight">Falla de Control</div>
                    <div class="text-[11px] text-slate-500 leading-snug">Ruptura, ausencia o ineficacia de un control existente</div>
                  </div>
                </button>

                <button
                  type="button"
                  (click)="setIncidentType('Evento de Pérdida Real')"
                  [class]="form.get('incidentType')?.value === 'Evento de Pérdida Real'
                    ? 'border-rose-500 bg-rose-50 text-rose-900 ring-1 ring-rose-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  class="p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer"
                >
                  <mat-icon class="text-rose-600 text-sm mt-0.5">paid</mat-icon>
                  <div>
                    <div class="text-xs font-bold leading-tight">Evento de Pérdida Real</div>
                    <div class="text-[11px] text-slate-500 leading-snug">Impacto financiero o contable cuantificado en {{ riskService.currencyCode() }}</div>
                  </div>
                </button>

                <button
                  type="button"
                  (click)="setIncidentType('Casi Pérdida (Near Miss)')"
                  [class]="form.get('incidentType')?.value === 'Casi Pérdida (Near Miss)'
                    ? 'border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  class="p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer"
                >
                  <mat-icon class="text-blue-600 text-sm mt-0.5">shield</mat-icon>
                  <div>
                    <div class="text-xs font-bold leading-tight">Casi Pérdida (Near Miss)</div>
                    <div class="text-[11px] text-slate-500 leading-snug">Evento contenido que pudo derivar en pérdida</div>
                  </div>
                </button>

                <button
                  type="button"
                  (click)="setIncidentType('Vulnerabilidad Operativa')"
                  [class]="form.get('incidentType')?.value === 'Vulnerabilidad Operativa'
                    ? 'border-purple-500 bg-purple-50 text-purple-900 ring-1 ring-purple-500'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'"
                  class="p-2.5 rounded-xl border text-left flex items-start gap-2 transition-all cursor-pointer"
                >
                  <mat-icon class="text-purple-600 text-sm mt-0.5">warning</mat-icon>
                  <div>
                    <div class="text-xs font-bold leading-tight">Vulnerabilidad Operativa</div>
                    <div class="text-[11px] text-slate-500 leading-snug">Debilidad estructural en procesos o tecnología</div>
                  </div>
                </button>
              </div>
            </div>

            <!-- Quick Title -->
            <div>
              <label for="flaw-title" class="block text-xs font-semibold text-slate-700 mb-1">
                Título de la Incidencia o Evento *
              </label>
              <input
                id="flaw-title"
                type="text"
                formControlName="title"
                placeholder="Ej. Liquidación duplicada en pasarela de pagos o clave maestra compartida"
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <!-- Process & Severity -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="flaw-process" class="block text-xs font-semibold text-slate-700 mb-1">
                  Proceso Afectado
                </label>
                <select
                  id="flaw-process"
                  formControlName="process"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  @for (proc of riskService.catalog.processOptions(form.value.process ?? undefined); track proc) {
                    <option [value]="proc">{{ proc }}</option>
                  }
                </select>
              </div>

              <div>
                <label for="flaw-severity" class="block text-xs font-semibold text-slate-700 mb-1">
                  Severidad Percibida
                </label>
                <select
                  id="flaw-severity"
                  formControlName="severity"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Crítica">Crítica (Interrupción severa o pérdida grave)</option>
                  <option value="Alta">Alta (Pérdida relevante o falla de control clave)</option>
                  <option value="Media">Media (Desviación operativa moderada)</option>
                  <option value="Baja">Baja (Incidencia menor con bajo impacto)</option>
                </select>
              </div>
            </div>

            <!-- Financial Impact Section (especially for Evento de Pérdida Real) -->
            <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <mat-icon class="text-sm text-emerald-600">attach_money</mat-icon>
                  <span>Impacto Financiero de la Incidencia ({{ riskService.currencyCode() }})</span>
                </span>
                @if (form.get('incidentType')?.value === 'Evento de Pérdida Real') {
                  <span class="text-[10px] bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded">
                    Requerido para Pérdida Real
                  </span>
                }
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label for="loss-amount" class="block text-[11px] font-medium text-slate-600 mb-1">
                    Monto de Pérdida Real ({{ riskService.currencyCode() }})
                  </label>
                  <input
                    id="loss-amount"
                    type="number"
                    min="0"
                    step="100"
                    formControlName="realLossAmountUSD"
                    placeholder="0"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label for="recovered-amount" class="block text-[11px] font-medium text-slate-600 mb-1">
                    Pérdida Recuperada ({{ riskService.currencyCode() }})
                  </label>
                  <input
                    id="recovered-amount"
                    type="number"
                    min="0"
                    step="100"
                    formControlName="recoveredAmountUSD"
                    placeholder="0"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label for="impacted-system" class="block text-[11px] font-medium text-slate-600 mb-1">
                    Sistema / Cuenta Afectada
                  </label>
                  <input
                    id="impacted-system"
                    type="text"
                    formControlName="impactedSystemOrAccount"
                    placeholder="Ej. Switch Bancario, SWIFT, AWS"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            <!-- Base de Pérdidas Operacionales -->
            <div class="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <mat-icon class="text-sm text-indigo-600">table_chart</mat-icon>
                  <span>Base de Pérdidas Operacionales</span>
                </span>
                @if ((form.get('realLossAmountUSD')?.value || 0) > 0) {
                  <span class="text-[10px] bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded">
                    Evento con pérdida: complete todos los campos
                  </span>
                }
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label for="business-line" class="block text-[11px] font-medium text-slate-600 mb-1">Línea de negocio</label>
                  <select id="business-line" formControlName="businessLine"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">— Seleccionar —</option>
                    @for (bl of businessLines; track bl) {
                      <option [value]="bl">{{ bl }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label for="accounting-account" class="block text-[11px] font-medium text-slate-600 mb-1">Cuenta contable</label>
                  @if (riskService.catalog.accountingAccounts().length) {
                    <select id="accounting-account" formControlName="accountingAccount"
                      class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="">Sin asignar</option>
                      @for (a of riskService.catalog.accountOptions(form.value.accountingAccount || undefined); track a.code) {
                        <option [value]="a.code">{{ a.code }} · {{ a.name }}</option>
                      }
                    </select>
                  } @else {
                    <input id="accounting-account" type="text" formControlName="accountingAccount"
                      placeholder="Cargue el plan de cuentas en Mantenedores"
                      class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  }
                </div>
                <div>
                  <label for="basel-category" class="block text-[11px] font-medium text-slate-600 mb-1">Categoría Basilea (nivel 1)</label>
                  <select id="basel-category" formControlName="baselCategory" (change)="form.patchValue({ baselSubcategory: '' })"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">— Seleccionar —</option>
                    @for (cat of baselCategories; track cat) {
                      <option [value]="cat">{{ cat }}</option>
                    }
                  </select>
                </div>
                <div>
                  <label for="basel-subcategory" class="block text-[11px] font-medium text-slate-600 mb-1">Subcategoría (nivel 2)</label>
                  <select id="basel-subcategory" formControlName="baselSubcategory"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100">
                    <option value="">— Seleccionar —</option>
                    @for (sub of subcategories(); track sub) {
                      <option [value]="sub">{{ sub }}</option>
                    }
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label for="occurrence-date" class="block text-[11px] font-medium text-slate-600 mb-1">Fecha de ocurrencia</label>
                  <input id="occurrence-date" type="date" formControlName="occurrenceDate"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label for="discovery-date" class="block text-[11px] font-medium text-slate-600 mb-1">Fecha de descubrimiento</label>
                  <input id="discovery-date" type="date" formControlName="discoveryDate"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label for="accounting-date" class="block text-[11px] font-medium text-slate-600 mb-1">Fecha de contabilización</label>
                  <input id="accounting-date" type="date" formControlName="accountingDate"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              @if (dateOrderWarning()) {
                <p class="text-[11px] text-amber-700 flex items-center gap-1">
                  <mat-icon class="text-xs">warning</mat-icon>
                  <span>{{ dateOrderWarning() }}</span>
                </p>
              }

              <div>
                <label for="provider-id" class="block text-[11px] font-medium text-slate-600 mb-1">Proveedor involucrado (servicio externalizado)</label>
                <select id="provider-id" formControlName="providerId"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">— Ninguno —</option>
                  @for (p of resilience.providers(); track p.id) {
                    <option [value]="p.id">{{ p.code }} · {{ p.name }}</option>
                  }
                </select>
              </div>

              @if (security.assets().length > 0) {
                <div>
                  <span class="block text-[11px] font-medium text-slate-600 mb-1">Activos de información afectados</span>
                  <div class="max-h-28 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 p-2 rounded-lg border border-slate-200">
                    @for (a of security.assets(); track a.id) {
                      <label class="flex items-center gap-1.5 text-[11px] text-slate-700 cursor-pointer">
                        <input type="checkbox" [checked]="affectedAssetIds().includes(a.id)" (change)="toggleAsset(a.id, $any($event.target).checked)" class="rounded" />
                        <span class="truncate">{{ a.code }} · {{ a.name }}</span>
                      </label>
                    }
                  </div>
                </div>
              }

              <label class="flex items-start gap-2 text-[11px] text-slate-700 cursor-pointer">
                <input type="checkbox" formControlName="creditRiskBoundary" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                <span><strong>Frontera con riesgo de crédito:</strong> la pérdida se origina en una falla operacional pero se materializa en la cartera de créditos (p. ej., error en la constitución de garantías).</span>
              </label>
            </div>

            <!-- Ciberseguridad (RAN 20-10 4.2 y RAN 20-8 §1.3) -->
            @let cy = cyber();
            <div class="p-4 rounded-xl border border-violet-200 bg-violet-50/40 space-y-3">
              <label class="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input type="checkbox" class="rounded" [checked]="cy.isCyber" (change)="setCyber('isCyber', $any($event.target).checked)" />
                <mat-icon class="text-sm text-violet-700">shield</mat-icon> Incidente de ciberseguridad (base de incidentes RAN 20-10)
              </label>
              @if (cy.isCyber) {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Tipo de amenaza</span><input [class]="inputCls" list="cyber-threats" [value]="cy.threatType" (input)="setCyber('threatType', $any($event.target).value)" />
                    <datalist id="cyber-threats">@for (t of threatTypes; track t) { <option [value]="t"></option> }</datalist></label>
                  <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Software malicioso / indicadores de compromiso</span><input [class]="inputCls" [value]="cy.malware" (input)="setCyber('malware', $any($event.target).value)" /></label>
                  <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Mecanismo de protección identificado</span><input [class]="inputCls" [value]="cy.protection" (input)="setCyber('protection', $any($event.target).value)" /></label>
                  <div class="sm:col-span-2 p-2.5 rounded-lg bg-white border border-violet-100 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <span class="sm:col-span-2 text-[11px] font-semibold text-slate-700">Alerta a la industria (RAN 20-8 §1.3)</span>
                    <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Enviada el (fecha y hora)</span><input type="datetime-local" [class]="inputCls" [value]="localOf(cy.industryAlertAt)" (input)="setCyber('industryAlertAt', isoOf($any($event.target).value))" /></label>
                    <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Medio (plataforma de la industria, CSIRT, correo)</span><input [class]="inputCls" [value]="cy.industryAlertChannel" (input)="setCyber('industryAlertChannel', $any($event.target).value)" /></label>
                  </div>
                  <div class="sm:col-span-2 p-2.5 rounded-lg bg-white border border-violet-100 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label class="sm:col-span-3 flex items-center gap-2 text-[11px] font-semibold text-slate-700"><input type="checkbox" class="rounded" [checked]="cy.forensicRequired" (change)="setCyber('forensicRequired', $any($event.target).checked)" /> Incidente relevante: requiere análisis forense independiente</label>
                    @if (cy.forensicRequired) {
                      <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Fecha del informe forense</span><input type="date" [class]="inputCls" [value]="cy.forensicDate ?? ''" (input)="setCyber('forensicDate', $any($event.target).value || undefined)" /></label>
                      <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Realizado por</span><input [class]="inputCls" [value]="cy.forensicBy" (input)="setCyber('forensicBy', $any($event.target).value)" /></label>
                      <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Conclusión</span><input [class]="inputCls" [value]="cy.forensicSummary" (input)="setCyber('forensicSummary', $any($event.target).value)" /></label>
                    }
                  </div>
                  <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Lecciones aprendidas</span><textarea rows="2" [class]="inputCls" [value]="cy.lessonsLearned" (input)="setCyber('lessonsLearned', $any($event.target).value)"></textarea></label>
                </div>
              }
            </div>

            <!-- Reporte Regulatorio CMF / ANCI -->
            <div class="p-3.5 rounded-xl space-y-3 border"
              [class]="form.get('reportCMF')?.value || form.get('reportANCI')?.value ? 'bg-rose-50/40 border-rose-200' : 'bg-white border-slate-200'">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <mat-icon class="text-sm text-rose-600">gavel</mat-icon>
                  <span>Reporte Regulatorio</span>
                </span>
                @if (suggestRegulatory()) {
                  <span class="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded">
                    Severidad {{ form.get('severity')?.value }}: evaluar si debe reportarse
                  </span>
                }
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label class="p-2 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                  <input type="checkbox" formControlName="reportCMF" class="mt-0.5 rounded text-rose-600 focus:ring-rose-500" />
                  <span class="text-[11px]"><strong class="text-slate-900 block">Reportar a la CMF</strong><span class="text-slate-500">Incidente operacional relevante</span></span>
                </label>
                <label class="p-2 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                  <input type="checkbox" formControlName="reportANCI" class="mt-0.5 rounded text-rose-600 focus:ring-rose-500" />
                  <span class="text-[11px]"><strong class="text-slate-900 block">Reportar a la ANCI</strong><span class="text-slate-500">Ciberincidente (Ley 21.663)</span></span>
                </label>
              </div>

              @if (form.get('reportCMF')?.value || form.get('reportANCI')?.value) {
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label for="occurred-at" class="block text-[11px] font-medium text-slate-600 mb-1">
                      Inicio del incidente (base del plazo CMF, RAN 20-8)
                    </label>
                    <input id="occurred-at" type="datetime-local" formControlName="occurredAt"
                      class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500" />
                  </div>
                  <div>
                  <label for="awareness-at" class="block text-[11px] font-medium text-slate-600 mb-1">
                    Toma de conocimiento por la administración (base de plazos ANCI)
                  </label>
                  <input id="awareness-at" type="datetime-local" formControlName="awarenessAt"
                    class="w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500" />
                  </div>
                  @if (incidentToEdit()?.regulatoryReport) {
                    <p class="text-[11px] text-slate-500 sm:col-span-2">Este incidente ya tiene un reporte en curso. Los envíos se registran en la pestaña "Reporte CMF / ANCI".</p>
                  }
                </div>
              }
            </div>

            <!-- Detailed Description -->
            <div>
              <label for="flaw-description" class="block text-xs font-semibold text-slate-700 mb-1">
                Descripción detallada del evento o falla de control *
              </label>
              <textarea
                id="flaw-description"
                formControlName="description"
                rows="3"
                placeholder="Explica qué ocurrió, qué control falló, monto estimado de pérdida o debilidad detectada..."
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              ></textarea>
            </div>

            <!-- AI Risk Advisor Button -->
            <div class="pt-1">
              <button
                type="button"
                (click)="analyzeWithAI()"
                [disabled]="isAnalyzing() || !form.get('description')?.value"
                class="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-300 text-emerald-900 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                @if (isAnalyzing()) {
                  <mat-icon class="animate-spin text-sm">autorenew</mat-icon>
                  <span>Analizando taxonomía de riesgo y recomendando controles mitigantes...</span>
                } @else {
                  <mat-icon class="text-sm text-emerald-700">psychology</mat-icon>
                  <span>Categorizar con Asistente de Riesgo (Gemini AI)</span>
                }
              </button>
            </div>

          </form>

          <!-- AI Analysis Result Card -->
          @if (aiResult(); as ai) {
            <div class="bg-slate-50 border border-emerald-200 rounded-xl p-4 space-y-3">
              <div class="flex items-center justify-between border-b border-slate-200 pb-2">
                <span class="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <mat-icon class="text-emerald-600 text-sm">verified</mat-icon>
                  <span>Evaluación Inteligente Sugerida</span>
                </span>
                <span class="text-[11px] font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-semibold">
                  {{ ai.category }}
                </span>
              </div>

              <div class="text-xs text-slate-700 leading-relaxed">
                {{ ai.technicalDescription }}
              </div>

              <!-- Suggested Metrics (4x4 scale) -->
              <div class="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase">Probabilidad</span>
                  <span class="font-bold font-mono text-slate-800">{{ ai.inherentLikelihood }} / 4</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase">Impacto</span>
                  <span class="font-bold font-mono text-slate-800">{{ ai.inherentImpact }} / 4</span>
                </div>
                <div>
                  <span class="text-slate-400 block text-[10px] uppercase">Exposición Est.</span>
                  <span class="font-bold font-mono text-emerald-700">{{ ai.financialExposureEstUSD | money }}</span>
                </div>
              </div>

              <!-- Suggested Controls -->
              @if (ai.suggestedControls && ai.suggestedControls.length > 0) {
                <div>
                  <span class="text-[11px] font-bold text-slate-700 block mb-1">
                    Controles Proactivos Recomendados:
                  </span>
                  <div class="space-y-1.5">
                    @for (ctrl of ai.suggestedControls; track ctrl.name) {
                      <div class="text-xs bg-white p-2 rounded border border-slate-200 flex items-center justify-between">
                        <div>
                          <span class="font-semibold text-slate-800">{{ ctrl.name }}</span>
                          <span class="text-[11px] text-slate-500 block">{{ ctrl.description }}</span>
                        </div>
                        <span class="text-[11px] font-mono text-emerald-700 font-semibold px-2">
                          ~{{ ctrl.effectivenessPct }}% mitigación
                        </span>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Mitigation Plan Actions -->
              @if (ai.mitigationPlan.recommendedActions.length > 0) {
                <div class="text-xs text-slate-600 bg-emerald-50/50 p-2.5 rounded border border-emerald-100">
                  <span class="font-bold text-emerald-950 block mb-1">
                    Pasos sugeridos para el Plan de Mitigación:
                  </span>
                  <ul class="list-disc pl-4 space-y-0.5">
                    @for (act of ai.mitigationPlan.recommendedActions; track act) {
                      <li>{{ act }}</li>
                    }
                  </ul>
                </div>
              }
            </div>
          }

        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            (click)="closeModal.emit()"
            class="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>

          <div class="flex items-center gap-2">
            <!-- Save as Incident only -->
            <button
              type="button"
              (click)="saveIncidentOnly()"
              [class.perm-locked]="!canSave()"
              [disabled]="form.invalid || isSaving()"
              class="px-3.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              <mat-icon class="text-sm text-slate-500">save</mat-icon>
              <span>{{ incidentToEdit() ? 'Actualizar Incidente' : 'Registrar Incidente' }}</span>
            </button>

            <!-- Direct Convert to Risk -->
            <button
              type="button"
              (click)="saveAndConvertToRisk()"
              [class.perm-locked]="!canSave() || !riskService.canAny('canConvertFlaws')"
              [disabled]="form.invalid || isSaving()"
              class="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <mat-icon class="text-sm">bolt</mat-icon>
              <span>Convertir en Riesgo Operacional</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `
})
export class FlawModal {
  readonly riskService = inject(RiskDataService);
  readonly aiService = inject(AiRiskService);
  readonly resilience = inject(ResilienceService);
  readonly security = inject(SecurityService);
  /** Activos de información afectados (fuera del formulario reactivo por ser una lista). */
  readonly affectedAssetIds = signal<string[]>([]);

  /** Datos de ciberseguridad del incidente (RAN 20-10 4.2 y 20-8 §1.3). */
  readonly cyber = signal<CyberIncidentInfo>({ ...EMPTY_CYBER });
  readonly threatTypes = ['Ransomware', 'Malware', 'Phishing / ingeniería social', 'Denegación de servicio (DDoS)', 'Acceso no autorizado', 'Fuga de información', 'Fraude en canales digitales', 'Vulneración de proveedor'];
  readonly inputCls = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500';

  setCyber<K extends keyof CyberIncidentInfo>(k: K, v: CyberIncidentInfo[K]) {
    this.cyber.update(c => ({ ...c, [k]: v }));
  }

  isoOf(v: string): string | undefined {
    return v ? new Date(v).toISOString() : undefined;
  }

  localOf(iso?: string): string {
    return iso ? toLocalInput(iso) : '';
  }

  readonly incidentToEdit = input<OperationalFlaw | null>(null);
  readonly closeModal = output<void>();

  readonly isAnalyzing = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly aiResult = signal<AIAnalysisResult | null>(null);

  readonly businessLines = CAC_BUSINESS_LINES;
  readonly baselCategories = Object.keys(BASEL_SUBCATEGORIES) as BaselCategory[];

  form = new FormGroup({
    incidentType: new FormControl<IncidentType>('Falla de Control', [Validators.required]),
    title: new FormControl('', [Validators.required, Validators.minLength(5)]),
    process: new FormControl(this.riskService.catalog.processNames()[0] ?? '', [Validators.required]),
    severity: new FormControl<'Crítica' | 'Alta' | 'Media' | 'Baja'>('Alta', [Validators.required]),
    description: new FormControl('', [Validators.required, Validators.minLength(10)]),
    realLossAmountUSD: new FormControl<number>(0),
    recoveredAmountUSD: new FormControl<number>(0),
    impactedSystemOrAccount: new FormControl<string>(''),
    // Base de pérdidas
    businessLine: new FormControl<string>(''),
    baselCategory: new FormControl<string>(''),
    baselSubcategory: new FormControl<string>(''),
    occurrenceDate: new FormControl<string>(''),
    discoveryDate: new FormControl<string>(''),
    accountingDate: new FormControl<string>(''),
    accountingAccount: new FormControl<string>(''),
    creditRiskBoundary: new FormControl<boolean>(false),
    providerId: new FormControl<string>(''),
    // Reporte regulatorio
    reportCMF: new FormControl<boolean>(false),
    reportANCI: new FormControl<boolean>(false),
    awarenessAt: new FormControl<string>(''),
    occurredAt: new FormControl<string>(''),
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  constructor() {
    effect(() => {
      const inc = this.incidentToEdit();
      if (inc) {
        const rr = inc.regulatoryReport;
        this.form.patchValue({
          incidentType: inc.incidentType || 'Falla de Control',
          title: inc.title,
          process: inc.process,
          severity: inc.severity,
          description: inc.description,
          realLossAmountUSD: inc.realLossAmountUSD || 0,
          recoveredAmountUSD: inc.recoveredAmountUSD || 0,
          impactedSystemOrAccount: inc.impactedSystemOrAccount || '',
          businessLine: inc.businessLine || '',
          baselCategory: inc.baselCategory || inc.aiSuggestedCategory || '',
          baselSubcategory: inc.baselSubcategory || '',
          occurrenceDate: inc.occurrenceDate || '',
          discoveryDate: inc.discoveryDate || '',
          accountingDate: inc.accountingDate || '',
          accountingAccount: inc.accountingAccount || '',
          creditRiskBoundary: !!inc.creditRiskBoundary,
          providerId: inc.providerId || '',
          reportCMF: !!rr?.reportableToCMF,
          reportANCI: !!rr?.reportableToANCI,
          awarenessAt: toLocalInput(rr?.awarenessAt ?? new Date().toISOString()),
          occurredAt: toLocalInput(rr?.occurredAt ?? rr?.awarenessAt ?? new Date().toISOString()),
        });
        this.affectedAssetIds.set([...(inc.affectedAssetIds ?? [])]);
        this.cyber.set({ ...EMPTY_CYBER, ...(inc.cyber ?? {}) });
        if (inc.aiAnalysis) {
          this.aiResult.set(inc.aiAnalysis as unknown as AIAnalysisResult);
        }
      } else {
        const today = new Date().toISOString().slice(0, 10);
        this.form.reset({
          incidentType: 'Falla de Control',
          title: '',
          process: this.riskService.catalog.processNames()[0] ?? '',
          severity: 'Alta',
          description: '',
          realLossAmountUSD: 0,
          recoveredAmountUSD: 0,
          impactedSystemOrAccount: '',
          businessLine: '',
          baselCategory: '',
          baselSubcategory: '',
          occurrenceDate: today,
          discoveryDate: today,
          accountingDate: '',
          accountingAccount: '',
          creditRiskBoundary: false,
          providerId: '',
          reportCMF: false,
          reportANCI: false,
          awarenessAt: toLocalInput(new Date().toISOString()),
          occurredAt: toLocalInput(new Date().toISOString()),
        });
        this.aiResult.set(null);
        this.affectedAssetIds.set([]);
        this.cyber.set({ ...EMPTY_CYBER });
      }
    });
  }

  subcategories(): string[] {
    const cat = this.formValue().baselCategory as BaselCategory | '';
    return cat ? BASEL_SUBCATEGORIES[cat] ?? [] : [];
  }

  suggestRegulatory(): boolean {
    const v = this.formValue();
    return (v.severity === 'Crítica' || v.severity === 'Alta') && !v.reportCMF && !v.reportANCI;
  }

  dateOrderWarning(): string | null {
    const v = this.formValue();
    if (v.occurrenceDate && v.discoveryDate && v.discoveryDate < v.occurrenceDate) {
      return 'La fecha de descubrimiento es anterior a la de ocurrencia.';
    }
    if (v.discoveryDate && v.accountingDate && v.accountingDate < v.discoveryDate) {
      return 'La fecha de contabilización es anterior a la de descubrimiento.';
    }
    return null;
  }

  toggleAsset(id: string, on: boolean) {
    this.affectedAssetIds.update(l => (on ? [...l, id] : l.filter(x => x !== id)));
  }

  setIncidentType(type: IncidentType) {
    this.form.patchValue({ incidentType: type });
  }

  async analyzeWithAI() {
    const desc = this.form.get('description')?.value;
    const process = this.form.get('process')?.value;
    const incidentType = this.form.get('incidentType')?.value;
    if (!desc) return;

    this.isAnalyzing.set(true);
    try {
      const res = await this.aiService.analyzeIncidencia(desc, process || undefined, incidentType || undefined);
      this.aiResult.set(res);
      if (res.title && !this.form.get('title')?.value) {
        this.form.patchValue({ title: res.title });
      }
      if (res.category && !this.form.get('baselCategory')?.value && res.category in BASEL_SUBCATEGORIES) {
        this.form.patchValue({ baselCategory: res.category, baselSubcategory: '' });
      }
    } finally {
      this.isAnalyzing.set(false);
    }
  }

  /** Datos comunes del incidente a partir del formulario. */
  private buildPayload(): Partial<OperationalFlaw> {
    const val = this.form.value;
    const ai = this.aiResult();
    const existing = this.incidentToEdit();
    return {
      title: val.title || '',
      description: val.description || '',
      process: val.process || 'Operaciones',
      severity: val.severity || 'Alta',
      incidentType: val.incidentType || 'Falla de Control',
      realLossAmountUSD: Number(val.realLossAmountUSD) || 0,
      recoveredAmountUSD: Number(val.recoveredAmountUSD) || 0,
      impactedSystemOrAccount: val.impactedSystemOrAccount || '',
      aiSuggestedCategory: (ai?.category as BaselCategory) || existing?.aiSuggestedCategory,
      aiSuggestedControls: ai?.suggestedControls?.map(c => c.name) || existing?.aiSuggestedControls,
      aiAnalysis: ai ? (ai as unknown as Record<string, unknown>) : existing?.aiAnalysis,
      businessLine: (val.businessLine || undefined) as CacBusinessLine | undefined,
      baselCategory: (val.baselCategory || undefined) as BaselCategory | undefined,
      baselSubcategory: val.baselSubcategory || undefined,
      occurrenceDate: val.occurrenceDate || undefined,
      discoveryDate: val.discoveryDate || undefined,
      accountingDate: val.accountingDate || undefined,
      accountingAccount: val.accountingAccount || undefined,
      creditRiskBoundary: !!val.creditRiskBoundary,
      providerId: val.providerId || undefined,
      affectedAssetIds: this.affectedAssetIds(),
      cyber: this.cyber().isCyber ? this.cyber() : undefined,
    };
  }

  /** Guarda (crea o actualiza) el incidente y, si corresponde, inicia o ajusta el reporte regulatorio. */
  private async persist(): Promise<string> {
    const payload = this.buildPayload();
    const existing = this.incidentToEdit();
    const id = existing
      ? (await this.riskService.updateFlaw(existing.id, payload)).id
      : (await this.riskService.reportFlaw(payload)).id;

    const v = this.form.value;
    const cmf = !!v.reportCMF, anci = !!v.reportANCI;
    const rr = existing?.regulatoryReport;
    const awarenessIso = v.awarenessAt ? new Date(v.awarenessAt).toISOString() : new Date().toISOString();
    // Se compara a nivel de minuto: el campo datetime-local no tiene segundos.
    const occurredIso = v.occurredAt ? new Date(v.occurredAt).toISOString() : awarenessIso;
    const changed = !rr || rr.reportableToCMF !== cmf || rr.reportableToANCI !== anci || toLocalInput(rr.awarenessAt) !== v.awarenessAt
      || toLocalInput(rr.occurredAt ?? rr.awarenessAt) !== v.occurredAt;
    if ((cmf || anci) && changed) {
      await this.riskService.startRegulatoryReport(id, { awarenessAt: awarenessIso, occurredAt: occurredIso, cmf, anci });
    }
    return id;
  }

  canSave(): boolean {
    return this.riskService.canAny(...this.savePerms());
  }

  savePerms(): ('canReportFlaws' | 'canConvertFlaws' | 'canManageRegulatoryReports')[] {
    return this.incidentToEdit() ? ['canReportFlaws', 'canConvertFlaws', 'canManageRegulatoryReports'] : ['canReportFlaws'];
  }

  async saveIncidentOnly() {
    if (this.form.invalid) return;
    if (!this.riskService.requirePermission(this.savePerms(), 'registrar o editar incidencias')) return;
    this.isSaving.set(true);
    try {
      await this.persist();
      this.closeModal.emit();
    } finally {
      this.isSaving.set(false);
    }
  }

  async saveAndConvertToRisk() {
    if (this.form.invalid) return;
    if (!this.riskService.requirePermission(this.savePerms(), 'registrar o editar incidencias')) return;
    if (!this.riskService.requirePermission(['canConvertFlaws'], 'convertir incidencias en riesgos')) return;
    this.isSaving.set(true);
    try {
      const val = this.form.value;
      const ai = this.aiResult();
      const targetId = await this.persist();
      const lossAmount = Number(val.realLossAmountUSD) || 0;
      await this.riskService.convertFlawToRisk(targetId, {
        title: ai?.title || val.title || 'Riesgo operacional derivado de incidencia',
        process: ai?.process || val.process || 'Operaciones',
        category: (val.baselCategory as BaselCategory) || (ai?.category as BaselCategory) || 'Ejecución y Procesos',
        inherentLikelihood: ai?.inherentLikelihood || (val.severity === 'Crítica' ? 4 : 3),
        inherentImpact: ai?.inherentImpact || (val.severity === 'Crítica' ? 4 : 3),
        financialExposureUSD: lossAmount > 0 ? lossAmount * 2 : (ai?.financialExposureEstUSD || (this.riskService.currencyCode() === 'CLP' ? 120_000_000 : 120000)),
        description: `${val.description}\n\n[Tipo de Evento]: ${val.incidentType || 'Incidencia Operativa'}\n[Impacto Registrado]: ${this.riskService.catalog.formatMoney(lossAmount)}\n[Análisis Técnico]: ${ai?.technicalDescription || 'Identificado y registrado en Incidentes y Pérdidas.'}`
      });
      this.closeModal.emit();
    } finally {
      this.isSaving.set(false);
    }
  }
}

/** ISO → valor para <input type="datetime-local"> en hora local. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
