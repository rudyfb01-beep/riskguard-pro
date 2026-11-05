import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PermissionDeniedError, RiskDataService } from '../services/risk-data.service';
import { ResilienceService } from '../services/resilience.service';
import { SecurityService } from '../services/security.service';
import { downloadCsv } from '../utils/csv';
import { ActionPlanService } from '../services/action-plan.service';
import { LinkedPlans, PlanChips } from './linked-plans';
import {
  ASSESSMENT_DOMAINS,
  ASSET_TYPES,
  AssessmentStatus,
  AssetLocation,
  CiaRating,
  InfoClassification,
  InformationAsset,
  SecurityAssessmentItem,
  VulnSeverity,
  VulnSource,
  VulnStatus,
  Vulnerability,
} from '../models/security.model';
import { SECURITY_TEST_TYPES, SecurityTest } from '../models/compliance.model';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';
type SubTab = 'activos' | 'vulnerabilidades' | 'autoevaluacion' | 'pruebas' | 'incidentes';

/** Seguridad de la información: activos, vulnerabilidades y autoevaluación. */
@Component({
  selector: 'app-security-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, LinkedPlans, PlanChips],
  template: `
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-violet-100 text-violet-800 rounded-lg"><mat-icon class="text-lg">security</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Seguridad de la Información y Ciberseguridad</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Inventario y clasificación de activos de información, gestión de vulnerabilidades con plazos según severidad y
            autoevaluación del marco de seguridad.
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
        @if (canExport()) {
          <button type="button" (click)="exportReport()" class="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 cursor-pointer">
            <mat-icon class="text-sm text-emerald-600">download</mat-icon>Exportar informe
          </button>
        }
        @if (canManage()) {
          @switch (tab()) {
            @case ('activos') { <button type="button" (click)="newAsset()" class="px-3.5 py-2 text-xs font-semibold text-white bg-violet-700 hover:bg-violet-600 rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer"><mat-icon class="text-sm">add</mat-icon>Nuevo activo</button> }
            @case ('vulnerabilidades') { <button type="button" (click)="newVuln()" class="px-3.5 py-2 text-xs font-semibold text-white bg-violet-700 hover:bg-violet-600 rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer"><mat-icon class="text-sm">add</mat-icon>Registrar vulnerabilidad</button> }
          }
        }
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Activos</span><span class="text-2xl font-bold font-mono text-slate-900">{{ k().assets }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30"><span class="text-[11px] font-semibold text-rose-800 block">Activos críticos</span><span class="text-2xl font-bold font-mono text-rose-700">{{ k().criticalAssets }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-sky-200 bg-sky-50/30"><span class="text-[11px] font-semibold text-sky-800 block">Con datos personales</span><span class="text-2xl font-bold font-mono text-sky-800">{{ k().personalData }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30"><span class="text-[11px] font-semibold text-amber-800 block">Vulnerabilidades abiertas</span><span class="text-2xl font-bold font-mono text-amber-900">{{ k().openVulns }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-300"><span class="text-[11px] font-semibold text-rose-800 block">Fuera de plazo</span><span class="text-2xl font-bold font-mono text-rose-700">{{ k().overdueVulns }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-300"><span class="text-[11px] font-semibold text-rose-800 block">Críticas abiertas</span><span class="text-2xl font-bold font-mono text-rose-700">{{ k().criticalVulns }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30"><span class="text-[11px] font-semibold text-emerald-800 block">Cumplimiento</span><span class="text-2xl font-bold font-mono text-emerald-700">{{ k().compliancePct === null ? '—' : k().compliancePct + '%' }}</span></div>
      </div>

      <!-- Alertas -->
      @if (sec.alerts().length > 0) {
        <div class="bg-white rounded-2xl border border-slate-200 p-4">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-rose-600">gpp_bad</mat-icon> Alertas de seguridad ({{ sec.alerts().length }})</h2>
            @if (sec.alerts().length > 6) {
              <button type="button" (click)="showAllAlerts.set(!showAllAlerts())" class="text-[11px] text-violet-700 font-semibold cursor-pointer">{{ showAllAlerts() ? 'Ver menos' : 'Ver todas' }}</button>
            }
          </div>
          <ul class="divide-y divide-slate-100">
            @for (a of visibleAlerts(); track $index) {
              <li class="py-1.5 flex items-start gap-2 text-xs">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0" [class]="sevClass(a.severity)">{{ a.severity }}</span>
                <span class="text-slate-500 shrink-0">{{ a.type }}:</span>
                <span class="text-slate-700">{{ a.detail }}</span>
              </li>
            }
          </ul>
        </div>
      }

      <!-- Subpestañas -->
      <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        @for (t of subTabs; track t.id) {
          <button type="button" (click)="tab.set(t.id)"
            [class]="tab() === t.id ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'"
            class="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer">
            <mat-icon class="text-sm">{{ t.icon }}</mat-icon><span>{{ t.label }}</span>
          </button>
        }
      </div>

      @switch (tab()) {
        <!-- ACTIVOS -->
        @case ('activos') {
          <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table class="w-full text-xs min-w-[1050px]">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr>
                  <th class="text-left py-2.5 px-3">Activo</th>
                  <th class="text-left py-2.5 px-3">Clasificación</th>
                  <th class="text-center py-2.5 px-3" title="Confidencialidad · Integridad · Disponibilidad">C · I · D</th>
                  <th class="text-left py-2.5 px-3">Criticidad</th>
                  <th class="text-left py-2.5 px-3">Ubicación</th>
                  <th class="text-left py-2.5 px-3">Dueño / custodio</th>
                  <th class="text-center py-2.5 px-3">Vulns. abiertas</th>
                  <th class="text-left py-2.5 px-3">Revisión</th>
                  <th class="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (a of sortedAssets(); track a.id) {
                  @let crit = sec.assetCriticality(a);
                  @let openV = openVulnCount(a.id);
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 max-w-[260px]">
                      <div class="font-semibold text-slate-900">{{ a.name }} <span class="font-mono text-[10px] text-slate-400">{{ a.code }}</span></div>
                      <div class="text-[10px] text-slate-500 flex items-center gap-1">{{ a.type }}
                        @if (a.handlesPersonalData) { <span class="px-1 rounded bg-sky-100 text-sky-800 font-semibold">Datos personales</span> }
                        @if (a.criticalInfrastructure) { <span class="px-1 rounded bg-violet-100 text-violet-800 font-semibold">Infraestructura crítica</span> }
                      </div>
                    </td>
                    <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-semibold" [class]="classifClass(a.classification)">{{ a.classification }}</span></td>
                    <td class="py-2.5 px-3 text-center">
                      <div class="inline-flex gap-0.5">
                        @for (v of ciaValues(a.cia); track $index) {
                          <span class="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center" [class]="levelClass(v)">{{ v }}</span>
                        }
                      </div>
                    </td>
                    <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold border" [class]="critClass(crit)">{{ crit }}</span></td>
                    <td class="py-2.5 px-3 text-[11px]">
                      <div class="text-slate-700">{{ a.location }}</div>
                      @if (a.providerId) {
                        <div class="text-[10px]" [class]="sec.isDataAbroad(a) ? 'text-amber-700 font-semibold' : 'text-slate-500'">
                          {{ res.providerById(a.providerId)?.name }}@if (sec.isDataAbroad(a)) { · {{ res.providerById(a.providerId)?.dataCountry }} }
                        </div>
                      }
                    </td>
                    <td class="py-2.5 px-3 text-[11px]">
                      <div class="text-slate-700">{{ a.owner || '—' }}</div>
                      <div class="text-[10px]" [class]="a.custodian ? 'text-slate-500' : 'text-rose-700 font-semibold'">{{ a.custodian || 'Sin custodio' }}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                      @if (openV) { <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">{{ openV }}</span> } @else { <span class="text-slate-300">—</span> }
                    </td>
                    <td class="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap" [class]="sec.isAssetStale(a) ? 'text-amber-700 font-bold' : 'text-slate-500'">{{ a.lastReviewDate }}</td>
                    <td class="py-2.5 px-3 text-right"><button type="button" (click)="editAsset(a)" class="px-2.5 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">{{ canManage() ? 'Editar' : 'Ver' }}</button></td>
                  </tr>
                } @empty {
                  <tr><td colspan="9" class="py-8 text-center text-slate-500">Aún no hay activos de información registrados.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }

        <!-- VULNERABILIDADES -->
        @case ('vulnerabilidades') {
          <div class="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2 text-xs">
            @for (f of vulnFilters; track f.id) {
              <button type="button" (click)="vulnFilter.set(f.id)"
                [class]="vulnFilter() === f.id ? 'bg-slate-900 text-white font-semibold' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'"
                class="px-2.5 py-1 rounded-lg cursor-pointer">{{ f.label }}</button>
            }
            <span class="text-[11px] text-slate-500 ml-auto">Plazos: crítica {{ sla['Crítica'] }} d · alta {{ sla['Alta'] }} d · media {{ sla['Media'] }} d · baja {{ sla['Baja'] }} d</span>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table class="w-full text-xs min-w-[1000px]">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr>
                  <th class="text-left py-2.5 px-3">Vulnerabilidad</th>
                  <th class="text-left py-2.5 px-3">Severidad</th>
                  <th class="text-left py-2.5 px-3">Origen</th>
                  <th class="text-left py-2.5 px-3">Detectada</th>
                  <th class="text-left py-2.5 px-3">Plazo</th>
                  <th class="text-left py-2.5 px-3">Estado</th>
                  <th class="text-left py-2.5 px-3">Responsable</th>
                  <th class="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (v of filteredVulns(); track v.id) {
                  <tr class="hover:bg-slate-50" [class.bg-rose-50]="sec.isVulnOverdue(v)">
                    <td class="py-2.5 px-3 max-w-[320px]">
                      <div class="font-semibold text-slate-900">{{ v.title }} <span class="font-mono text-[10px] text-slate-400">{{ v.code }}</span></div>
                      <div class="text-[10px] text-slate-500">{{ sec.assetById(v.assetId)?.name ?? v.assetId }}</div>
                    </td>
                    <td class="py-2.5 px-3 whitespace-nowrap"><span class="px-2 py-0.5 rounded text-[10px] font-bold border" [class]="vulnSevClass(v.severity)">{{ v.severity }}</span>@if (v.cvssScore) { <span class="font-mono text-[10px] text-slate-500 ml-1">{{ v.cvssScore }}</span> }</td>
                    <td class="py-2.5 px-3 text-[11px] text-slate-600">{{ v.source }}</td>
                    <td class="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">{{ v.detectedDate }}</td>
                    <td class="py-2.5 px-3 font-mono text-[11px] whitespace-nowrap">
                      <div>{{ v.dueDate }}</div>
                      @if (sec.isVulnOpen(v)) {
                        <div class="text-[10px]" [class]="sec.daysToDue(v) < 0 ? 'text-rose-700 font-bold' : sec.daysToDue(v) <= 7 ? 'text-amber-700 font-bold' : 'text-slate-400'">
                          {{ sec.daysToDue(v) < 0 ? 'vencida hace ' + (-sec.daysToDue(v)) + ' d' : 'quedan ' + sec.daysToDue(v) + ' d' }}
                        </div>
                      }
                    </td>
                    <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded-full text-[10px] font-semibold" [class]="statusClass(v.status)">{{ v.status }}</span></td>
                    <td class="py-2.5 px-3 text-[11px] text-slate-700">{{ v.owner }}</td>
                    <td class="py-2.5 px-3 text-right"><button type="button" (click)="editVuln(v)" class="px-2.5 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">{{ canManage() ? 'Editar' : 'Ver' }}</button></td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="py-8 text-center text-slate-500">No hay vulnerabilidades en esta vista.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }

        <!-- AUTOEVALUACIÓN -->
        @case ('autoevaluacion') {
          <div class="p-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex items-start gap-2">
            <mat-icon class="text-sm text-amber-600 shrink-0">info</mat-icon>
            <span class="flex-1">Lista <strong>referencial</strong> basada en buenas prácticas (ISO/IEC 27001 y el marco que la CMF aplica a la banca). Ajústela al texto vigente de la RAN CACs: puede agregar, editar o quitar requisitos. Donde el sistema tiene datos, se muestra evidencia automática.</span>
            @if (canManage()) {
              <button type="button" (click)="newRequirement()" class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-violet-700 text-white hover:bg-violet-600 cursor-pointer shrink-0 flex items-center gap-1"><mat-icon class="text-sm">add</mat-icon>Nuevo requisito</button>
            }
          </div>

          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            @for (d of sec.assessmentByDomain(); track d.domain) {
              <div class="bg-white p-3 rounded-xl border border-slate-200">
                <span class="text-[11px] font-semibold text-slate-600 block">{{ d.domain }}</span>
                <span class="text-xl font-bold font-mono" [class]="pctClass(d.pct)">{{ d.pct === null ? '—' : d.pct + '%' }}</span>
                <div class="w-full bg-slate-100 rounded-full h-1.5 mt-1 overflow-hidden"><div class="h-1.5 rounded-full" [class]="pctBar(d.pct)" [style.width.%]="d.pct ?? 0"></div></div>
                <span class="text-[10px] text-slate-400">{{ d.rated }} de {{ d.total }} evaluados</span>
              </div>
            }
          </div>

          @for (d of sec.assessmentByDomain(); track d.domain) {
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">{{ d.domain }}</div>
              <div class="divide-y divide-slate-100">
                @for (i of d.items; track i.id) {
                  @let auto = sec.autoEvidence(i.code);
                  <div class="px-4 py-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <div class="text-xs font-semibold text-slate-900"><span class="font-mono text-[10px] text-slate-400 mr-1">{{ i.code }}</span>{{ i.requirement }}</div>
                        <div class="text-[11px] text-slate-500 mt-0.5">{{ i.guidance }}</div>
                        @if (auto) {
                          <div class="mt-1.5 text-[11px] text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 inline-flex items-start gap-1">
                            <mat-icon class="text-[14px] w-3.5 h-3.5 text-indigo-500 shrink-0">insights</mat-icon>
                            <span>{{ auto.text }}@if (auto.suggested && auto.suggested !== i.status) { <strong> Sugerido: {{ auto.suggested }}.</strong> }</span>
                          </div>
                        }
                        @if (editingItem()?.id !== i.id) {
                          @if (i.evidence || i.actionPlan) {
                            <div class="mt-1.5 text-[11px] text-slate-600 space-y-0.5">
                              @if (i.evidence) { <div><strong>Evidencia:</strong> {{ i.evidence }}</div> }
                              @if (i.actionPlan) { <div><strong>Plan de acción (texto anterior):</strong> {{ i.actionPlan }}@if (i.dueDate) { <span class="font-mono"> (hasta {{ i.dueDate }})</span> }@if (i.owner) { · {{ i.owner }} }</div> }
                            </div>
                          }
                          <div class="mt-1"><app-plan-chips sourceType="Autoevaluación de seguridad" [sourceId]="i.id" /></div>
                          @if (i.assessedBy) { <div class="text-[10px] text-slate-400 mt-1">Evaluado por {{ i.assessedBy }} el {{ i.assessedDate }}</div> }
                        }
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" [class]="assessClass(i.status)">{{ i.status }}</span>
                        @if (canManage() && editingItem()?.id !== i.id) {
                          <button type="button" (click)="editItem(i)" class="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">Evaluar</button>
                          <button type="button" (click)="editRequirement(i)" title="Editar el requisito" class="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"><mat-icon class="text-sm">edit</mat-icon></button>
                        }
                      </div>
                    </div>

                    @if (editingItem(); as e) {
                      @if (e.id === i.id) {
                        <div class="mt-3 p-3 rounded-xl border border-violet-200 bg-violet-50/40 grid grid-cols-1 md:grid-cols-4 gap-2.5">
                          <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Estado</span>
                            <select [class]="inputCls" (change)="setItem('status', $any($event.target).value)">
                              @for (s of assessStatuses; track s) { <option [value]="s" [selected]="s === e.status">{{ s }}</option> }
                            </select></label>
                          <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Responsable</span><input [class]="inputCls" [value]="e.owner" (input)="setItem('owner', $any($event.target).value)" /></label>
                          <label class="block md:col-span-2"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Evidencia</span><textarea rows="2" [class]="inputCls" [value]="e.evidence" (input)="setItem('evidence', $any($event.target).value)"></textarea></label>
                          @if (e.actionPlan) {
                            <label class="block md:col-span-4"><span class="block text-[10px] font-medium text-slate-600 mb-0.5">Plan de acción (texto anterior; conviértalo en un plan con seguimiento)</span><textarea rows="2" [class]="inputCls" [value]="e.actionPlan" (input)="setItem('actionPlan', $any($event.target).value)"></textarea></label>
                          }
                          <div class="md:col-span-4">
                            <app-linked-plans sourceType="Autoevaluación de seguridad" [sourceId]="e.id" [sourceLabel]="e.code + ' ' + e.requirement"
                              [defaultTitle]="e.actionPlan" [defaultOwner]="e.owner" [defaultDueDate]="e.dueDate ?? ''" [defaultPriority]="e.status === 'No cumple' ? 'Alta' : 'Media'"
                              emptyText="Sin planes de acción. Las brechas (No cumple o Cumple parcialmente) requieren uno." />
                          </div>
                          <div class="md:col-span-4 flex items-center justify-between gap-2">
                            <span class="text-[11px] text-rose-700">{{ formError() }}</span>
                            <div class="flex gap-2">
                              <button type="button" (click)="editingItem.set(null)" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white cursor-pointer">Cancelar</button>
                              <button type="button" (click)="saveItem()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-700 text-white hover:bg-violet-600 cursor-pointer">Guardar evaluación</button>
                            </div>
                          </div>
                        </div>
                      }
                    }
                  </div>
                }
              </div>
            </div>
          }
        }
        @case ('pruebas') {
          <div class="p-3 rounded-xl border border-violet-200 bg-violet-50/40 text-[11px] text-violet-900 flex items-start gap-2">
            <mat-icon class="text-sm text-violet-600 shrink-0">policy</mat-icon>
            <span class="flex-1">RAN 20-10: pruebas de seguridad periódicas (penetración o hacking ético) con resultados informados al Consejo al menos semestralmente;
              prueba de restauración de respaldos y del plan de respuesta a incidentes al menos una vez al año.</span>
            @if (canManage()) {
              <button type="button" (click)="newTest()" class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-violet-700 text-white hover:bg-violet-600 cursor-pointer shrink-0 flex items-center gap-1"><mat-icon class="text-sm">add</mat-icon>Registrar prueba</button>
            }
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            @for (k of testKpis(); track k.label) {
              <div class="bg-white p-3 rounded-xl border" [class]="k.ok ? 'border-emerald-200' : 'border-rose-300'">
                <span class="text-[11px] font-semibold text-slate-600 block">{{ k.label }}</span>
                <span class="text-sm font-bold" [class]="k.ok ? 'text-emerald-700' : 'text-rose-700'">{{ k.value }}</span>
              </div>
            }
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table class="w-full text-xs min-w-[860px]">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr><th class="text-left py-2.5 px-3">Fecha</th><th class="text-left py-2.5 px-3">Tipo</th><th class="text-left py-2.5 px-3">Alcance</th><th class="text-left py-2.5 px-3">Ejecutó</th><th class="text-left py-2.5 px-3">Resultado</th><th class="text-left py-2.5 px-3">Informe al Consejo</th><th class="py-2.5 px-3"></th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (t of sec.securityTests(); track t.id) {
                  <tr>
                    <td class="py-2 px-3 font-mono text-[11px]">{{ t.date }}</td>
                    <td class="py-2 px-3 font-semibold text-slate-900">{{ t.type }}</td>
                    <td class="py-2 px-3 text-slate-700 max-w-[260px]">{{ t.scope }}@if (t.findings) { <div class="text-[10px] text-slate-500">{{ t.findings }}</div> }</td>
                    <td class="py-2 px-3 text-slate-600">{{ t.executedBy }}</td>
                    <td class="py-2 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold" [class]="t.result === 'Satisfactoria' ? 'bg-emerald-100 text-emerald-800' : t.result === 'Con observaciones' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'">{{ t.result }}</span></td>
                    <td class="py-2 px-3 font-mono text-[11px]">{{ t.reportedToBoardDate || '—' }}</td>
                    <td class="py-2 px-3 text-right"><button type="button" (click)="editTest(t)" class="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">{{ canManage() ? 'Editar' : 'Ver' }}</button></td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="py-8 text-center text-slate-500">Sin pruebas registradas.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
        @case ('incidentes') {
          <div class="p-3 rounded-xl border border-violet-200 bg-violet-50/40 text-[11px] text-violet-900 flex items-start gap-2">
            <mat-icon class="text-sm text-violet-600 shrink-0">policy</mat-icon>
            <span>Base de incidentes de ciberseguridad y lecciones aprendidas (RAN 20-10 4.2). Un incidente entra a esta base al marcarlo como
              "Incidente de ciberseguridad" en su ficha de Incidentes y Pérdidas.</span>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table class="w-full text-xs min-w-[900px]">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr><th class="text-left py-2.5 px-3">Incidente</th><th class="text-left py-2.5 px-3">Amenaza</th><th class="text-left py-2.5 px-3">Alerta a la industria</th><th class="text-left py-2.5 px-3">Forense</th><th class="text-left py-2.5 px-3">Lecciones aprendidas</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (f of cyberIncidents(); track f.id) {
                  <tr>
                    <td class="py-2 px-3"><div class="font-semibold text-slate-900">{{ f.title }}</div><div class="text-[10px] text-slate-500 font-mono">{{ f.id }} · {{ f.reportedAt | date:'yyyy-MM-dd' }}</div></td>
                    <td class="py-2 px-3 text-slate-700">{{ f.cyber!.threatType || '—' }}@if (f.cyber!.malware) { <div class="text-[10px] text-slate-500">{{ f.cyber!.malware }}</div> }</td>
                    <td class="py-2 px-3 text-[11px]" [class]="f.cyber!.industryAlertAt ? 'text-emerald-700' : 'text-rose-700 font-semibold'">{{ f.cyber!.industryAlertAt ? (f.cyber!.industryAlertAt | date:'yyyy-MM-dd HH:mm') : 'Pendiente' }}</td>
                    <td class="py-2 px-3 text-[11px]" [class]="!f.cyber!.forensicRequired ? 'text-slate-400' : f.cyber!.forensicDate ? 'text-emerald-700' : 'text-rose-700 font-semibold'">{{ !f.cyber!.forensicRequired ? 'No requerido' : (f.cyber!.forensicDate || 'Pendiente') }}</td>
                    <td class="py-2 px-3 text-[11px] text-slate-700 max-w-[320px]">{{ f.cyber!.lessonsLearned || '—' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="py-8 text-center text-slate-500">No hay incidentes marcados como de ciberseguridad.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>

    <!-- Modal activo -->
    @if (assetDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-6">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2"><mat-icon class="text-violet-700">inventory_2</mat-icon>{{ d.name || 'Nuevo activo' }} <span class="font-mono text-xs text-slate-400">{{ d.code }}</span></h2>
            <button type="button" (click)="assetDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <div class="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
            <fieldset class="lg:col-span-2 space-y-4" [disabled]="!canManage()">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Nombre *</span><input [class]="inputCls" [value]="d.name" (input)="setAsset('name', $any($event.target).value)" /></label>
                <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Descripción</span><textarea rows="2" [class]="inputCls" [value]="d.description" (input)="setAsset('description', $any($event.target).value)"></textarea></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Tipo</span>
                  <select [class]="inputCls" (change)="setAsset('type', $any($event.target).value)">
                    @for (t of assetTypes; track t) { <option [value]="t" [selected]="t === d.type">{{ t }}</option> }
                  </select></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Clasificación</span>
                  <select [class]="inputCls" (change)="setAsset('classification', $any($event.target).value)">
                    @for (c of classifications; track c) { <option [value]="c" [selected]="c === d.classification">{{ c }}</option> }
                  </select></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Dueño de la información *</span><input [class]="inputCls" [value]="d.owner" (input)="setAsset('owner', $any($event.target).value)" /></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Custodio técnico</span><input [class]="inputCls" [value]="d.custodian" (input)="setAsset('custodian', $any($event.target).value)" /></label>
              </div>

              <div class="p-3.5 rounded-xl border border-slate-200 space-y-2">
                <span class="text-xs font-bold text-slate-800">Valoración (1 baja · 4 crítica)</span>
                <div class="grid grid-cols-3 gap-3">
                  @for (k of ciaKeys; track k.key) {
                    <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">{{ k.label }}</span>
                      <select [class]="inputCls" (change)="setCia(k.key, +$any($event.target).value)">
                        @for (v of [1, 2, 3, 4]; track v) { <option [value]="v" [selected]="v === d.cia[k.key]">{{ v }}</option> }
                      </select></label>
                  }
                </div>
                <p class="text-[11px] text-slate-500">Criticidad resultante: <strong>{{ sec.assetCriticality(d) }}</strong></p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Ubicación</span>
                  <select [class]="inputCls" (change)="setAsset('location', $any($event.target).value)">
                    @for (l of locations; track l) { <option [value]="l" [selected]="l === d.location">{{ l }}</option> }
                  </select></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Proveedor que lo opera</span>
                  <select [class]="inputCls" (change)="setAsset('providerId', $any($event.target).value || undefined)">
                    <option value="">— Ninguno —</option>
                    @for (p of res.providers(); track p.id) { <option [value]="p.id" [selected]="p.id === d.providerId">{{ p.name }}</option> }
                  </select></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Última revisión</span><input type="date" [class]="inputCls" [value]="d.lastReviewDate" (input)="setAsset('lastReviewDate', $any($event.target).value)" /></label>
                <label class="flex items-center gap-2 text-xs sm:col-span-3"><input type="checkbox" [checked]="d.handlesPersonalData" (change)="setAsset('handlesPersonalData', $any($event.target).checked)" class="rounded" /> Contiene datos personales (socios o colaboradores)</label>
                <label class="flex items-center gap-2 text-xs sm:col-span-3"><input type="checkbox" [checked]="!!d.criticalInfrastructure" (change)="setAsset('criticalInfrastructure', $any($event.target).checked)" class="rounded" /> Forma parte de la infraestructura crítica de la industria financiera o del sistema de pagos (RAN 20-10 §5)</label>
              </div>
              @if (d.handlesPersonalData && sec.isDataAbroad(d)) {
                <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">El proveedor guarda los datos en {{ res.providerById(d.providerId!)?.dataCountry || 'el extranjero' }}: revise los requisitos de transferencia internacional de datos personales.</p>
              }

              <div class="p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <span class="text-xs font-bold text-slate-800">Procesos críticos que soporta (BIA)</span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  @for (b of res.biaProcesses(); track b.id) {
                    <label class="flex items-center gap-2 text-[11px] text-slate-700">
                      <input type="checkbox" [checked]="d.biaProcessIds.includes(b.id)" (change)="toggleBia(b.id, $any($event.target).checked)" class="rounded" />
                      <span>{{ b.name }}</span>
                    </label>
                  } @empty { <p class="text-[11px] text-slate-400">No hay procesos en el BIA.</p> }
                </div>
              </div>
            </fieldset>

            <div class="space-y-4">
              <div class="p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <span class="text-xs font-bold text-slate-800">Vulnerabilidades</span>
                @for (v of sec.assetVulnerabilities(d.id); track v.id) {
                  <div class="text-[11px] flex items-center gap-1.5"><span class="px-1 rounded text-[9px] font-bold" [class]="vulnSevClass(v.severity)">{{ v.severity }}</span><span class="text-slate-700">{{ v.title }}</span><span class="text-slate-400">· {{ v.status }}</span></div>
                } @empty { <p class="text-[11px] text-slate-400">Sin vulnerabilidades registradas.</p> }
              </div>
              <div class="p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <span class="text-xs font-bold text-slate-800">Incidentes asociados</span>
                @for (f of sec.assetIncidents(d.id); track f.id) {
                  <div class="text-[11px] text-slate-700"><span class="font-mono text-slate-400">{{ f.id }}</span> {{ f.title }}</div>
                } @empty { <p class="text-[11px] text-slate-400">Sin incidentes asociados.</p> }
              </div>
            </div>
          </div>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <span class="text-[11px] text-rose-700">{{ formError() }}</span>
            <div class="flex gap-2">
              <button type="button" (click)="assetDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
              @if (canManage()) { <button type="button" (click)="saveAsset()" class="px-4 py-2 text-xs font-semibold text-white bg-violet-700 hover:bg-violet-600 rounded-lg cursor-pointer">Guardar activo</button> }
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Modal vulnerabilidad -->
    @if (vulnDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-6">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2"><mat-icon class="text-violet-700">bug_report</mat-icon>Vulnerabilidad <span class="font-mono text-xs text-slate-400">{{ d.code }}</span></h2>
            <button type="button" (click)="vulnDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <fieldset class="flex-1 overflow-y-auto p-6 space-y-3" [disabled]="!canManage()">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Título *</span><input [class]="inputCls" [value]="d.title" (input)="setVuln('title', $any($event.target).value)" /></label>
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Descripción</span><textarea rows="2" [class]="inputCls" [value]="d.description" (input)="setVuln('description', $any($event.target).value)"></textarea></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Activo afectado *</span>
                <select [class]="inputCls" (change)="setVuln('assetId', $any($event.target).value)">
                  <option value="">— Seleccionar —</option>
                  @for (a of sec.assets(); track a.id) { <option [value]="a.id" [selected]="a.id === d.assetId">{{ a.code }} · {{ a.name }}</option> }
                </select></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Origen</span>
                <select [class]="inputCls" (change)="setVuln('source', $any($event.target).value)">
                  @for (s of sources; track s) { <option [value]="s" [selected]="s === d.source">{{ s }}</option> }
                </select></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Severidad</span>
                <select [class]="inputCls" (change)="setSeverity($any($event.target).value)">
                  @for (s of severities; track s) { <option [value]="s" [selected]="s === d.severity">{{ s }} ({{ sla[s] }} días)</option> }
                </select></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">CVSS (opcional)</span><input type="number" min="0" max="10" step="0.1" [class]="inputCls" [value]="d.cvssScore ?? ''" (input)="setVuln('cvssScore', $any($event.target).value === '' ? undefined : +$any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Fecha de detección</span><input type="date" [class]="inputCls" [value]="d.detectedDate" (input)="setDetected($any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Plazo de remediación</span><input type="date" [class]="inputCls" [value]="d.dueDate" (input)="setVuln('dueDate', $any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Estado</span>
                <select [class]="inputCls" (change)="setVuln('status', $any($event.target).value)">
                  @for (s of statuses; track s) { <option [value]="s" [selected]="s === d.status">{{ s }}</option> }
                </select></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Responsable</span><input [class]="inputCls" [value]="d.owner" (input)="setVuln('owner', $any($event.target).value)" /></label>
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Remediación</span><textarea rows="2" [class]="inputCls" [value]="d.remediation" (input)="setVuln('remediation', $any($event.target).value)"></textarea></label>
            </div>
            @if (d.status === 'Riesgo aceptado') {
              <div class="p-3.5 rounded-xl border border-amber-300 bg-amber-50 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <span class="sm:col-span-3 text-xs font-bold text-amber-900">Aceptación formal del riesgo</span>
                <label class="block sm:col-span-3"><span class="block text-[11px] font-medium text-slate-600 mb-1">Justificación y controles compensatorios *</span><textarea rows="2" [class]="inputCls" [value]="d.acceptance?.justification ?? ''" (input)="setAcceptance('justification', $any($event.target).value)"></textarea></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Aprobado por *</span>
                  <select [class]="inputCls" (change)="setAcceptance('approvedBy', $any($event.target).value)">
                    <option value="">— Seleccionar —</option>
                    @for (u of rs.userProfiles(); track u.id) { <option [value]="u.name" [selected]="u.name === d.acceptance?.approvedBy">{{ u.name }} ({{ u.role }})</option> }
                  </select></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Fecha de aprobación</span><input type="date" [class]="inputCls" [value]="d.acceptance?.approvedDate ?? ''" (input)="setAcceptance('approvedDate', $any($event.target).value)" /></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Revisar el *</span><input type="date" [class]="inputCls" [value]="d.acceptance?.reviewDate ?? ''" (input)="setAcceptance('reviewDate', $any($event.target).value)" /></label>
              </div>
            }
          </fieldset>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <span class="text-[11px] text-rose-700">{{ formError() }}</span>
            <div class="flex gap-2">
              <button type="button" (click)="vulnDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
              @if (canManage()) { <button type="button" (click)="saveVuln()" class="px-4 py-2 text-xs font-semibold text-white bg-violet-700 hover:bg-violet-600 rounded-lg cursor-pointer">Guardar</button> }
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Modal requisito de la lista de seguridad -->
    @if (reqDraft(); as r) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl my-6 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2"><mat-icon class="text-violet-700">checklist</mat-icon>{{ reqIsNew() ? 'Nuevo requisito' : 'Editar requisito ' + r.code }}</h2>
            <button type="button" (click)="reqDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <div class="p-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Dominio</span>
              <select [class]="inputCls" (change)="setReqDomain($any($event.target).value)">@for (d of domains; track d) { <option [value]="d" [selected]="d === r.domain">{{ d }}</option> }</select></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Código *</span><input [class]="inputCls" [value]="r.code" (input)="setReq('code', $any($event.target).value)" /></label>
            <label class="block sm:col-span-3"><span class="block text-[11px] font-medium text-slate-600 mb-1">Requisito *</span><textarea rows="2" [class]="inputCls" [value]="r.requirement" (input)="setReq('requirement', $any($event.target).value)"></textarea></label>
            <label class="block sm:col-span-3"><span class="block text-[11px] font-medium text-slate-600 mb-1">Guía para evaluarlo</span><textarea rows="2" [class]="inputCls" [value]="r.guidance" (input)="setReq('guidance', $any($event.target).value)"></textarea></label>
          </div>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
            @if (!reqIsNew()) {
              <button type="button" (click)="removeRequirement(r)" class="px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">delete</mat-icon>Quitar de la lista</button>
            }
            <span class="text-[11px] text-rose-700 flex-1">{{ reqError() }}</span>
            <button type="button" (click)="reqDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">Cancelar</button>
            <button type="button" (click)="saveRequirement()" class="px-4 py-2 text-xs font-semibold text-white bg-violet-700 hover:bg-violet-600 rounded-lg cursor-pointer">Guardar requisito</button>
          </div>
        </div>
      </div>
    }

    <!-- Modal prueba de seguridad -->
    @if (testDraft(); as t) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl my-6 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2"><mat-icon class="text-violet-700">science</mat-icon>{{ testIsNew() ? 'Registrar prueba de seguridad' : t.type }}</h2>
            <button type="button" (click)="testDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <fieldset class="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3" [disabled]="!canManage()">
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Tipo</span>
              <select [class]="inputCls" (change)="setTest('type', $any($event.target).value)">@for (k of testTypes; track k) { <option [value]="k" [selected]="k === t.type">{{ k }}</option> }</select></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Fecha *</span><input type="date" [class]="inputCls" [value]="t.date" (input)="setTest('date', $any($event.target).value)" /></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Alcance *</span><input [class]="inputCls" [value]="t.scope" (input)="setTest('scope', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Ejecutada por</span><input [class]="inputCls" [value]="t.executedBy" (input)="setTest('executedBy', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Resultado</span>
              <select [class]="inputCls" (change)="setTest('result', $any($event.target).value)">@for (r of testResults; track r) { <option [value]="r" [selected]="r === t.result">{{ r }}</option> }</select></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Hallazgos y acciones</span><textarea rows="2" [class]="inputCls" [value]="t.findings" (input)="setTest('findings', $any($event.target).value)"></textarea></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Informada al Consejo (fecha)</span><input type="date" [class]="inputCls" [value]="t.reportedToBoardDate ?? ''" (input)="setTest('reportedToBoardDate', $any($event.target).value || undefined)" /></label>
          </fieldset>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
            @if (!testIsNew() && canManage()) {
              <button type="button" (click)="removeTest(t)" class="px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">delete</mat-icon>Eliminar</button>
            }
            <span class="text-[11px] text-rose-700 flex-1">{{ testError() }}</span>
            <button type="button" (click)="testDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
            @if (canManage()) {
              <button type="button" (click)="saveTest()" class="px-4 py-2 text-xs font-semibold text-white bg-violet-700 hover:bg-violet-600 rounded-lg cursor-pointer">Guardar prueba</button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class SecurityPanel {
  readonly sec = inject(SecurityService);
  readonly actionPlans = inject(ActionPlanService);
  readonly res = inject(ResilienceService);
  readonly rs = inject(RiskDataService);
  readonly notify = output<string>();

  readonly inputCls = INPUT;
  get sla() { return this.rs.catalog.params().vulnSlaDays; }
  readonly assetTypes = ASSET_TYPES;
  readonly classifications: InfoClassification[] = ['Pública', 'Interna', 'Confidencial', 'Restringida'];
  readonly locations: AssetLocation[] = ['Instalaciones propias', 'Nube', 'Proveedor externo'];
  readonly ciaKeys: { key: keyof CiaRating; label: string }[] = [
    { key: 'confidentiality', label: 'Confidencialidad' },
    { key: 'integrity', label: 'Integridad' },
    { key: 'availability', label: 'Disponibilidad' },
  ];
  readonly severities: VulnSeverity[] = ['Crítica', 'Alta', 'Media', 'Baja'];
  readonly sources: VulnSource[] = ['Escaneo automatizado', 'Prueba de intrusión', 'Auditoría', 'Aviso de proveedor', 'Reporte interno'];
  readonly statuses: VulnStatus[] = ['Abierta', 'En remediación', 'Mitigada', 'Riesgo aceptado', 'Cerrada'];
  readonly assessStatuses: AssessmentStatus[] = ['Sin evaluar', 'Cumple', 'Cumple parcialmente', 'No cumple', 'No aplica'];
  readonly subTabs: { id: SubTab; label: string; icon: string }[] = [
    { id: 'activos', label: 'Activos de información', icon: 'inventory_2' },
    { id: 'vulnerabilidades', label: 'Vulnerabilidades', icon: 'bug_report' },
    { id: 'autoevaluacion', label: 'Autoevaluación', icon: 'fact_check' },
    { id: 'pruebas', label: 'Pruebas de seguridad', icon: 'science' },
    { id: 'incidentes', label: 'Incidentes de ciberseguridad', icon: 'gpp_maybe' },
  ];
  readonly vulnFilters = [
    { id: 'abiertas', label: 'Abiertas' },
    { id: 'vencidas', label: 'Fuera de plazo' },
    { id: 'aceptadas', label: 'Riesgo aceptado' },
    { id: 'todas', label: 'Todas' },
  ] as const;

  readonly tab = signal<SubTab>('activos');
  readonly vulnFilter = signal<'abiertas' | 'vencidas' | 'aceptadas' | 'todas'>('abiertas');
  readonly showAllAlerts = signal(false);
  readonly assetDraft = signal<InformationAsset | null>(null);
  readonly vulnDraft = signal<Vulnerability | null>(null);
  readonly editingItem = signal<SecurityAssessmentItem | null>(null);

  // Pruebas de seguridad e incidentes de ciberseguridad (RAN 20-10)
  readonly testTypes = SECURITY_TEST_TYPES;
  readonly testResults: SecurityTest['result'][] = ['Satisfactoria', 'Con observaciones', 'Insatisfactoria'];
  readonly testDraft = signal<SecurityTest | null>(null);
  readonly testIsNew = signal(false);
  readonly testError = signal('');

  readonly cyberIncidents = computed(() => this.rs.flaws().filter(f => f.cyber?.isCyber));

  readonly testKpis = computed(() => {
    const pen = this.sec.lastTest('Prueba de penetración', 'Hacking ético');
    const restore = this.sec.lastTest('Prueba de restauración de respaldos');
    const resp = this.sec.lastTest('Prueba del plan de respuesta a incidentes', 'Ejercicio de gestión de crisis');
    const board = [...this.sec.securityTests()].map(t => t.reportedToBoardDate).filter((d): d is string => !!d).sort().reverse()[0];
    const fmt = (t: SecurityTest | null) => (t ? `${t.date}` : 'Sin registro');
    return [
      { label: 'Pentest / hacking ético (12 meses)', value: fmt(pen), ok: this.sec.within(pen?.date, 365) },
      { label: 'Restauración de respaldos (12 meses)', value: fmt(restore), ok: this.sec.within(restore?.date, 365) },
      { label: 'Plan de respuesta (12 meses) · informe al Consejo (6 meses)', value: `${fmt(resp)} · ${board ?? 'sin informe'}`, ok: this.sec.within(resp?.date, 365) && this.sec.within(board, 183) },
    ];
  });

  newTest() {
    this.testIsNew.set(true);
    this.testError.set('');
    this.testDraft.set({ id: `stest-${Date.now().toString(36)}`, date: this.sec.today(), type: 'Prueba de penetración', scope: '', executedBy: '', result: 'Satisfactoria', findings: '' });
  }

  editTest(t: SecurityTest) {
    this.testIsNew.set(false);
    this.testError.set('');
    this.testDraft.set({ ...t });
  }

  setTest<K extends keyof SecurityTest>(k: K, v: SecurityTest[K]) {
    this.testDraft.update(t => (t ? { ...t, [k]: v } : t));
  }

  async saveTest() {
    const t = this.testDraft();
    if (!t) return;
    try {
      await this.sec.saveSecurityTest(t);
      this.notify.emit('Prueba de seguridad guardada.');
      this.testDraft.set(null);
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) this.testError.set((err as Error).message);
    }
  }

  async removeTest(t: SecurityTest) {
    try {
      await this.sec.deleteSecurityTest(t.id);
      this.notify.emit('Prueba eliminada.');
      this.testDraft.set(null);
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) this.testError.set((err as Error).message);
    }
  }

  // Definición de requisitos (lista de verificación editable)
  readonly domains = ASSESSMENT_DOMAINS;
  readonly reqDraft = signal<SecurityAssessmentItem | null>(null);
  readonly reqIsNew = signal(false);
  readonly reqError = signal('');

  newRequirement() {
    const domain = ASSESSMENT_DOMAINS[0];
    this.reqIsNew.set(true);
    this.reqError.set('');
    this.reqDraft.set({
      id: `sec-req-${Date.now().toString(36)}`, code: this.sec.nextRequirementCode(domain), domain, requirement: '', guidance: '',
      status: 'Sin evaluar', evidence: '', owner: '', actionPlan: '',
    });
  }

  editRequirement(i: SecurityAssessmentItem) {
    this.reqIsNew.set(false);
    this.reqError.set('');
    this.reqDraft.set({ ...i });
  }

  setReq<K extends keyof SecurityAssessmentItem>(k: K, v: SecurityAssessmentItem[K]) {
    this.reqDraft.update(r => (r ? { ...r, [k]: v } : r));
  }

  setReqDomain(domain: SecurityAssessmentItem['domain']) {
    this.reqDraft.update(r => (r ? { ...r, domain, code: this.reqIsNew() ? this.sec.nextRequirementCode(domain) : r.code } : r));
  }

  async saveRequirement() {
    const r = this.reqDraft();
    if (!r) return;
    try {
      await this.sec.saveRequirement(r);
      this.notify.emit(`Requisito ${r.code.trim().toUpperCase()} guardado.`);
      this.reqDraft.set(null);
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) this.reqError.set((err as Error).message);
    }
  }

  async removeRequirement(r: SecurityAssessmentItem) {
    try {
      await this.sec.deleteRequirement(r.id);
      this.notify.emit(`Requisito ${r.code} quitado de la lista.`);
      this.reqDraft.set(null);
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) this.reqError.set((err as Error).message);
    }
  }
  readonly formError = signal('');
  private dueEdited = false;

  readonly k = this.sec.kpis;
  readonly canManage = computed(() => !!this.rs.currentProfile().permissions.canManageInfoSecurity);
  readonly canExport = computed(() => !!this.rs.currentProfile().permissions.canExportReports);

  /** Informe de seguridad: autoevaluación por dominio, vulnerabilidades y activos. */
  exportReport() {
    const s = this.sec.assessmentSummary();
    const rows: (string | number | undefined)[][] = [
      ['Informe de seguridad de la información y ciberseguridad', `Generado ${new Date().toISOString().slice(0, 16)}`, this.rs.currentProfile().name],
      ['Cumplimiento total', s.pct === null ? 'sin evaluar' : `${s.pct}%`, 'Requisitos evaluados', s.rated, 'Brechas', s.gaps],
      [],
      ['AUTOEVALUACIÓN'],
      ['Código', 'Dominio', 'Requisito', 'Estado', 'Evidencia', 'Evidencia automática', 'Plan de acción', 'Responsable', 'Fecha compromiso', 'Evaluado por', 'Fecha evaluación'],
      ...this.sec.assessment().map(i => [i.code, i.domain, i.requirement, i.status, i.evidence, this.sec.autoEvidence(i.code)?.text ?? '',
        i.actionPlan, i.owner, i.dueDate ?? '', i.assessedBy ?? '', i.assessedDate ?? '']),
      [],
      ['VULNERABILIDADES'],
      ['Código', 'Título', 'Activo', 'Severidad', 'CVSS', 'Origen', 'Detectada', 'Plazo', 'Estado', 'Fuera de plazo', 'Responsable', 'Cierre', 'Aceptación aprobada por', 'Revisión aceptación'],
      ...this.sec.vulnerabilities().map(v => [v.code, v.title, this.sec.assetById(v.assetId)?.name ?? v.assetId, v.severity, v.cvssScore, v.source,
        v.detectedDate, v.dueDate, v.status, this.sec.isVulnOverdue(v) ? 'Sí' : 'No', v.owner, v.closedDate ?? '',
        v.acceptance?.approvedBy ?? '', v.acceptance?.reviewDate ?? '']),
      [],
      ['ACTIVOS DE INFORMACIÓN'],
      ['Código', 'Activo', 'Tipo', 'Clasificación', 'C', 'I', 'D', 'Criticidad', 'Datos personales', 'Ubicación', 'Proveedor', 'Dueño', 'Custodio', 'Última revisión'],
      ...this.sec.assets().map(a => [a.code, a.name, a.type, a.classification, a.cia.confidentiality, a.cia.integrity, a.cia.availability,
        this.sec.assetCriticality(a), a.handlesPersonalData ? 'Sí' : 'No', a.location, a.providerId ? this.res.providerById(a.providerId)?.name : '',
        a.owner, a.custodian, a.lastReviewDate]),
    ];
    downloadCsv(`Informe_seguridad_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
  readonly visibleAlerts = computed(() => (this.showAllAlerts() ? this.sec.alerts() : this.sec.alerts().slice(0, 6)));

  readonly sortedAssets = computed(() => {
    const rank = { 'Crítico': 0, 'Alto': 1, 'Medio': 2, 'Bajo': 3 };
    return [...this.sec.assets()].sort((a, b) => rank[this.sec.assetCriticality(a)] - rank[this.sec.assetCriticality(b)] || a.code.localeCompare(b.code));
  });

  readonly filteredVulns = computed(() => {
    const f = this.vulnFilter();
    const rank = { 'Crítica': 0, 'Alta': 1, 'Media': 2, 'Baja': 3 };
    return this.sec.vulnerabilities()
      .filter(v => f === 'todas' || (f === 'abiertas' && this.sec.isVulnOpen(v)) || (f === 'vencidas' && this.sec.isVulnOverdue(v)) || (f === 'aceptadas' && v.status === 'Riesgo aceptado'))
      .sort((a, b) => rank[a.severity] - rank[b.severity] || a.dueDate.localeCompare(b.dueDate));
  });

  openVulnCount(assetId: string) {
    return this.sec.assetVulnerabilities(assetId).filter(v => this.sec.isVulnOpen(v)).length;
  }
  ciaValues(c: CiaRating) { return [c.confidentiality, c.integrity, c.availability]; }

  // ---- Activos ----
  newAsset() {
    this.formError.set('');
    this.assetDraft.set({
      id: this.sec.newId('ast'), code: this.sec.nextAssetCode(), name: '', description: '', type: 'Aplicación',
      owner: '', custodian: '', classification: 'Interna', cia: { confidentiality: 2, integrity: 2, availability: 2 },
      handlesPersonalData: false, location: 'Instalaciones propias', biaProcessIds: [], lastReviewDate: this.sec.today(),
    });
  }
  editAsset(a: InformationAsset) { this.formError.set(''); this.assetDraft.set(structuredClone(a)); }
  setAsset<K extends keyof InformationAsset>(key: K, value: InformationAsset[K]) { this.assetDraft.update(d => (d ? { ...d, [key]: value } : d)); }
  setCia(key: keyof CiaRating, value: number) { this.assetDraft.update(d => (d ? { ...d, cia: { ...d.cia, [key]: value } } : d)); }
  toggleBia(id: string, on: boolean) {
    this.assetDraft.update(d => (d ? { ...d, biaProcessIds: on ? [...d.biaProcessIds, id] : d.biaProcessIds.filter(x => x !== id) } : d));
  }
  async saveAsset() {
    const d = this.assetDraft();
    if (!d) return;
    if (!d.name.trim() || !d.owner.trim()) { this.formError.set('Indique nombre y dueño de la información.'); return; }
    await this.sec.saveAsset({ ...d, name: d.name.trim() });
    this.notify.emit(`Activo ${d.code} guardado.`);
    this.assetDraft.set(null);
  }

  // ---- Vulnerabilidades ----
  newVuln() {
    this.formError.set('');
    this.dueEdited = false;
    const today = this.sec.today();
    this.vulnDraft.set({
      id: this.sec.newId('vul'), code: this.sec.nextVulnCode(), title: '', description: '', assetId: '',
      source: 'Escaneo automatizado', severity: 'Alta', detectedDate: today, dueDate: this.sec.dueDateFor('Alta', today),
      status: 'Abierta', owner: this.rs.currentProfile().name, remediation: '',
    });
  }
  editVuln(v: Vulnerability) { this.formError.set(''); this.dueEdited = true; this.vulnDraft.set(structuredClone(v)); }
  setVuln<K extends keyof Vulnerability>(key: K, value: Vulnerability[K]) {
    if (key === 'dueDate') this.dueEdited = true;
    this.vulnDraft.update(d => (d ? { ...d, [key]: value } : d));
  }
  /** Al cambiar severidad o fecha de detección se recalcula el plazo (si no se fijó a mano). */
  setSeverity(s: VulnSeverity) {
    this.vulnDraft.update(d => (d ? { ...d, severity: s, dueDate: this.dueEdited ? d.dueDate : this.sec.dueDateFor(s, d.detectedDate) } : d));
  }
  setDetected(date: string) {
    this.vulnDraft.update(d => (d ? { ...d, detectedDate: date, dueDate: this.dueEdited ? d.dueDate : this.sec.dueDateFor(d.severity, date) } : d));
  }
  setAcceptance(key: 'justification' | 'approvedBy' | 'approvedDate' | 'reviewDate', value: string) {
    this.vulnDraft.update(d => {
      if (!d) return d;
      const base = d.acceptance ?? { justification: '', approvedBy: '', approvedDate: this.sec.today(), reviewDate: '' };
      return { ...d, acceptance: { ...base, [key]: value } };
    });
  }
  async saveVuln() {
    const d = this.vulnDraft();
    if (!d) return;
    if (!d.title.trim() || !d.assetId) { this.formError.set('Indique título y activo afectado.'); return; }
    if (d.dueDate < d.detectedDate) { this.formError.set('El plazo no puede ser anterior a la detección.'); return; }
    if (d.status === 'Riesgo aceptado') {
      const a = d.acceptance;
      if (!a?.justification.trim() || !a.approvedBy || !a.reviewDate) { this.formError.set('Para aceptar el riesgo indique justificación, quién aprueba y fecha de revisión.'); return; }
    }
    await this.sec.saveVulnerability({ ...d, title: d.title.trim() });
    this.notify.emit(`Vulnerabilidad ${d.code} guardada.`);
    this.vulnDraft.set(null);
  }

  // ---- Autoevaluación ----
  editItem(i: SecurityAssessmentItem) {
    this.formError.set('');
    const auto = this.sec.autoEvidence(i.code);
    this.editingItem.set({
      ...i,
      status: i.status === 'Sin evaluar' && auto?.suggested ? auto.suggested : i.status,
      evidence: i.evidence || (auto ? auto.text : ''),
      owner: i.owner || this.rs.currentProfile().name,
    });
  }
  setItem<K extends keyof SecurityAssessmentItem>(key: K, value: SecurityAssessmentItem[K]) { this.editingItem.update(d => (d ? { ...d, [key]: value } : d)); }
  async saveItem() {
    const e = this.editingItem();
    if (!e) return;
    if ((e.status === 'No cumple' || e.status === 'Cumple parcialmente') && !e.actionPlan.trim() && !this.actionPlans.openForSource('Autoevaluación de seguridad', e.id).length) {
      this.formError.set('Las brechas requieren un plan de acción: créelo en "Planes de acción" antes de guardar.');
      return;
    }
    await this.sec.saveAssessmentItem(e);
    this.notify.emit(`Autoevaluación ${e.code} guardada.`);
    this.editingItem.set(null);
  }

  // ---- estilos ----
  sevClass(s: string) { return s === 'Alta' ? 'bg-rose-100 text-rose-800' : s === 'Media' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'; }
  critClass(c: string) {
    switch (c) {
      case 'Crítico': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Alto': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Medio': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  }
  vulnSevClass(s: VulnSeverity) { return this.critClass(s === 'Crítica' ? 'Crítico' : s === 'Alta' ? 'Alto' : s === 'Media' ? 'Medio' : 'Bajo'); }
  levelClass(v: number) { return v >= 4 ? 'bg-rose-500 text-white' : v === 3 ? 'bg-orange-300 text-orange-950' : v === 2 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'; }
  classifClass(c: InfoClassification) {
    return c === 'Restringida' ? 'bg-rose-100 text-rose-800' : c === 'Confidencial' ? 'bg-orange-100 text-orange-800' : c === 'Interna' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800';
  }
  statusClass(s: VulnStatus) {
    switch (s) {
      case 'Abierta': return 'bg-rose-100 text-rose-800';
      case 'En remediación': return 'bg-amber-100 text-amber-800';
      case 'Riesgo aceptado': return 'bg-violet-100 text-violet-800';
      case 'Mitigada': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-slate-100 text-slate-600';
    }
  }
  assessClass(s: AssessmentStatus) {
    switch (s) {
      case 'Cumple': return 'bg-emerald-100 text-emerald-800';
      case 'Cumple parcialmente': return 'bg-amber-100 text-amber-800';
      case 'No cumple': return 'bg-rose-100 text-rose-800';
      case 'No aplica': return 'bg-slate-100 text-slate-500';
      default: return 'bg-slate-50 text-slate-500 border border-dashed border-slate-300';
    }
  }
  pctClass(p: number | null) { return p === null ? 'text-slate-400' : p >= 80 ? 'text-emerald-700' : p >= 50 ? 'text-amber-700' : 'text-rose-700'; }
  pctBar(p: number | null) { return p === null ? 'bg-slate-200' : p >= 80 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-500' : 'bg-rose-500'; }
}
