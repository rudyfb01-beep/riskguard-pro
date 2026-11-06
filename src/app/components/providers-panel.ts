import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { EvidenceFiles } from './evidence-files';
import { RiskDataService } from '../services/risk-data.service';
import { downloadCsv } from '../utils/csv';
import { CLOUD_DUE_DILIGENCE, EMPTY_RAN207, ProviderRan207, SIGNIFICANCE_CRITERIA, Subcontractor } from '../models/compliance.model';
import { ResilienceService } from '../services/resilience.service';
import {
  ProviderAlert,
  ProviderCriticality,
  ServiceProvider,
} from '../models/resilience.model';
import { MoneyPipe } from '../utils/money.pipe';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';

/** Registro de proveedores y servicios externalizados. */
import { LinkedPlans, PlanChips } from './linked-plans';
@Component({
  selector: 'app-providers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MoneyPipe, LinkedPlans, PlanChips, EvidenceFiles],
  template: `
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-sky-100 text-sky-800 rounded-lg"><mat-icon class="text-lg">handshake</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Proveedores y Externalización de Servicios</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Registro de servicios externalizados con su criticidad, uso de nube, ubicación de los datos, cláusulas contractuales,
            evaluaciones periódicas y plan de salida.
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
        @if (canExport()) {
          <button type="button" (click)="exportRegister()" title="Registro de servicios externalizados (RAN 20-7, aplicable vía CAC-3)"
            class="px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 cursor-pointer">
            <mat-icon class="text-sm text-emerald-600">download</mat-icon><span>Exportar registro</span>
          </button>
        }
          @if (canManage()) {
            <button type="button" (click)="openNew()" title="Registrar un nuevo proveedor o servicio externalizado"
              class="px-4 py-2.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-600 rounded-xl flex items-center gap-2 shrink-0 cursor-pointer">
              <mat-icon class="text-sm">add_business</mat-icon><span>Nuevo proveedor</span>
            </button>
          }
        </div>
      </div>

      @if (!canManage()) {
        <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 flex items-start gap-2">
          <mat-icon class="text-sm text-slate-500 shrink-0">lock</mat-icon>
          <span>{{ noPermissionText() }}</span>
        </div>
      }

      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Proveedores activos</span><span class="text-2xl font-bold font-mono text-slate-900">{{ kpis().active }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30"><span class="text-[11px] font-semibold text-rose-800 block">Críticos</span><span class="text-2xl font-bold font-mono text-rose-700">{{ kpis().critical }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-sky-200 bg-sky-50/30"><span class="text-[11px] font-semibold text-sky-800 block">En la nube</span><span class="text-2xl font-bold font-mono text-sky-800">{{ kpis().cloud }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30"><span class="text-[11px] font-semibold text-amber-800 block">Datos en el extranjero</span><span class="text-2xl font-bold font-mono text-amber-900">{{ kpis().abroad }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-300"><span class="text-[11px] font-semibold text-rose-800 block">Alertas altas</span><span class="text-2xl font-bold font-mono text-rose-700">{{ kpis().highAlerts }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Costo anual</span><span class="text-xl font-bold font-mono text-slate-900">{{ kpis().annualCostUSD | money }}</span></div>
      </div>

      <!-- Alertas -->
      @if (res.providerAlerts().length > 0) {
        <div class="bg-white rounded-2xl border border-slate-200 p-4">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-rose-600">notification_important</mat-icon> Alertas de terceros ({{ res.providerAlerts().length }})</h2>
            @if (res.providerAlerts().length > 6) {
              <button type="button" (click)="showAllAlerts.set(!showAllAlerts())" class="text-[11px] text-sky-700 font-semibold cursor-pointer">{{ showAllAlerts() ? 'Ver menos' : 'Ver todas' }}</button>
            }
          </div>
          <ul class="divide-y divide-slate-100">
            @for (a of visibleAlerts(); track $index) {
              <li class="py-1.5 flex items-start gap-2 text-xs">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0" [class]="alertClass(a.severity)">{{ a.severity }}</span>
                <button type="button" (click)="openEdit(res.providerById(a.providerId)!)" class="font-semibold text-slate-900 hover:underline shrink-0 cursor-pointer">{{ res.providerById(a.providerId)?.name }}</button>
                <span class="text-slate-500 shrink-0">· {{ a.type }}:</span>
                <span class="text-slate-700">{{ a.detail }}</span>
              </li>
            }
          </ul>
        </div>
      }

      <!-- Filtros -->
      <div class="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
        <input type="search" placeholder="Buscar proveedor o servicio..." [value]="search()" (input)="search.set($any($event.target).value)"
          class="text-xs rounded-lg border border-slate-300 px-3 py-1.5 w-60" />
        <select [value]="critFilter()" (change)="critFilter.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-2 py-1.5">
          <option value="">Toda criticidad</option>
          @for (c of criticalities; track c) { <option [value]="c">{{ c }}</option> }
        </select>
        <select [value]="catFilter()" (change)="catFilter.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-2 py-1.5">
          <option value="">Todas las categorías</option>
          @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
        </select>
        <span class="text-[11px] text-slate-500 ml-auto">{{ filtered().length }} de {{ res.providers().length }}</span>
      </div>

      <!-- Tabla -->
      <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table class="w-full text-xs min-w-[1000px]">
          <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
            <tr>
              <th class="text-left py-2.5 px-3">Proveedor</th>
              <th class="text-left py-2.5 px-3">Criticidad</th>
              <th class="text-left py-2.5 px-3">Nube / datos</th>
              <th class="text-left py-2.5 px-3">Contrato</th>
              <th class="text-left py-2.5 px-3">Evaluación</th>
              <th class="text-center py-2.5 px-3">Cláusulas</th>
              <th class="text-center py-2.5 px-3">Salida</th>
              <th class="text-center py-2.5 px-3">Alertas</th>
              <th class="py-2.5 px-3"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (p of filtered(); track p.id) {
              @let days = res.daysToContractEnd(p);
              @let due = res.nextAssessmentDue(p);
              @let alerts = alertsFor(p.id);
              <tr class="hover:bg-slate-50" [class.opacity-60]="p.status === 'En término'">
                <td class="py-2.5 px-3 max-w-[280px]">
                  <div class="font-semibold text-slate-900">{{ p.name }} <span class="font-mono text-[10px] text-slate-400">{{ p.code }}</span></div>
                  <div class="text-[10px] text-slate-500">{{ p.category }}@if (p.status !== 'Activo') { · <strong>{{ p.status }}</strong> }</div>
                </td>
                <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold border" [class]="critClass(p.criticality)">{{ p.criticality }}</span></td>
                <td class="py-2.5 px-3 text-[11px] text-slate-700">
                  @if (p.isCloud) { <span class="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold text-[10px]">{{ p.cloudModel }}</span> }
                  <span [class.text-amber-700]="p.dataLocation === 'Extranjero'" [class.font-semibold]="p.dataLocation === 'Extranjero'">
                    {{ p.dataLocation === 'Extranjero' ? (p.dataCountry || 'Extranjero') : 'Chile' }}
                  </span>
                  @if (p.handlesMemberData) { <div class="text-[10px] text-slate-500">Datos de socios</div> }
                </td>
                <td class="py-2.5 px-3 font-mono text-[11px]">
                  <div class="text-slate-700">{{ p.contractEnd }}</div>
                  <div class="text-[10px]" [class]="days < 0 ? 'text-rose-700 font-bold' : days <= 90 ? 'text-amber-700 font-bold' : 'text-slate-400'">
                    {{ days < 0 ? 'vencido' : days + ' días' }}
                  </div>
                </td>
                <td class="py-2.5 px-3 text-[11px]">
                  @if (p.lastAssessmentDate) {
                    <div><span class="font-mono font-bold" [class]="(p.assessmentScore || 0) >= 80 ? 'text-emerald-700' : (p.assessmentScore || 0) >= 70 ? 'text-amber-700' : 'text-rose-700'">{{ p.assessmentScore }}</span>/100</div>
                    <div class="text-[10px] font-mono" [class]="due && due < res.today() ? 'text-rose-700 font-bold' : 'text-slate-400'">próx. {{ due | date:'yyyy-MM-dd' }}</div>
                  } @else {
                    <span class="text-rose-700 font-semibold">Sin evaluar</span>
                  }
                </td>
                <td class="py-2.5 px-3 text-center font-mono" [class]="res.missingClauses(p).length ? 'text-amber-700 font-bold' : 'text-emerald-700'">
                  {{ clauseCount - res.missingClauses(p).length }}/{{ clauseCount }}
                </td>
                <td class="py-2.5 px-3 text-center">
                  <mat-icon class="text-base" [class]="p.hasExitPlan ? 'text-emerald-600' : 'text-rose-500'">{{ p.hasExitPlan ? 'check_circle' : 'cancel' }}</mat-icon>
                </td>
                <td class="py-2.5 px-3 text-center">
                  @if (alerts.length) {
                    <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold" [class]="alerts.some(isHigh) ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-800'">{{ alerts.length }}</span>
                  } @else { <span class="text-slate-300">—</span> }
                  <div class="mt-1"><app-plan-chips sourceType="Proveedor" [sourceId]="p.id" [onlyOpen]="true" /></div>
                </td>
                <td class="py-2.5 px-3 text-right">
                  <button type="button" (click)="openEdit(p)" class="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">
                    {{ canManage() ? 'Editar' : 'Ver' }}
                  </button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="py-8 text-center text-slate-500">
                {{ res.providers().length ? 'No hay proveedores que coincidan con el filtro.' : 'Aún no hay proveedores registrados.' }}
                @if (canManage() && !res.providers().length) {
                  <button type="button" (click)="openNew()" class="ml-2 font-semibold text-sky-700 hover:underline cursor-pointer">Agregar el primero</button>
                }
              </td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal proveedor -->
    @if (draft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-6">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <mat-icon class="text-sky-700">handshake</mat-icon>
              <span>{{ isNew() ? 'Nuevo proveedor' : d.name }}</span>
              <span class="font-mono text-xs text-slate-400">{{ d.code }}</span>
            </h2>
            <button type="button" (click)="draft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>

          <div class="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
            <fieldset class="lg:col-span-2 space-y-4" [disabled]="!canManage()">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Razón social *</span><input [class]="inputCls" [value]="d.name" (input)="set('name', $any($event.target).value)" /></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">RUT</span><input [class]="inputCls" [value]="d.taxId" (input)="set('taxId', $any($event.target).value)" placeholder="76.123.456-7" /></label>
                <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Servicio externalizado *</span><textarea rows="2" [class]="inputCls" [value]="d.serviceDescription" (input)="set('serviceDescription', $any($event.target).value)"></textarea></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Categoría</span>
                  <select [class]="inputCls" [value]="d.category" (change)="set('category', $any($event.target).value)">
                    @for (c of rs.catalog.providerCategoryOptions(d.category); track c) { <option [value]="c" [selected]="c === d.category">{{ c }}</option> }
                  </select></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Criticidad (materialidad)</span>
                  <select [class]="inputCls" [value]="d.criticality" (change)="set('criticality', $any($event.target).value)">
                    @for (c of criticalities; track c) { <option [value]="c" [selected]="c === d.criticality">{{ c }} · evaluar cada {{ freq[c] }} meses</option> }
                  </select></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Responsable interno</span><input [class]="inputCls" [value]="d.internalOwner" (input)="set('internalOwner', $any($event.target).value)" /></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Estado</span>
                  <select [class]="inputCls" [value]="d.status" (change)="set('status', $any($event.target).value)">
                    @for (s of statuses; track s) { <option [value]="s" [selected]="s === d.status">{{ s }}</option> }
                  </select></label>
                <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Procesos que soporta (separados por coma)</span><input [class]="inputCls" [value]="d.supportedProcesses.join(', ')" (change)="set('supportedProcesses', splitList($any($event.target).value))" /></label>
              </div>

              <div class="p-3.5 rounded-xl border border-sky-200 bg-sky-50/40 space-y-3">
                <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5"><mat-icon class="text-sm text-sky-700">cloud</mat-icon> Nube y datos</span>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label class="flex items-center gap-2 text-xs"><input type="checkbox" [checked]="d.isCloud" (change)="set('isCloud', $any($event.target).checked)" class="rounded" /> Servicio en la nube</label>
                  @if (d.isCloud) {
                    <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Modelo</span>
                      <select [class]="inputCls" [value]="d.cloudModel || 'SaaS'" (change)="set('cloudModel', $any($event.target).value)">
                        @for (m of ['IaaS', 'PaaS', 'SaaS']; track m) { <option [value]="m" [selected]="m === (d.cloudModel || 'SaaS')">{{ m }}</option> }
                      </select></label>
                  }
                  <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Ubicación de los datos</span>
                    <select [class]="inputCls" [value]="d.dataLocation" (change)="set('dataLocation', $any($event.target).value)">
                      <option value="Chile" [selected]="d.dataLocation === 'Chile'">Chile</option>
                      <option value="Extranjero" [selected]="d.dataLocation === 'Extranjero'">Extranjero</option>
                    </select></label>
                  @if (d.dataLocation === 'Extranjero') {
                    <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">País</span><input [class]="inputCls" [value]="d.dataCountry || ''" (input)="set('dataCountry', $any($event.target).value)" /></label>
                  }
                  <label class="flex items-center gap-2 text-xs"><input type="checkbox" [checked]="d.handlesMemberData" (change)="set('handlesMemberData', $any($event.target).checked)" class="rounded" /> Procesa datos de socios</label>
                  <label class="flex items-center gap-2 text-xs"><input type="checkbox" [checked]="d.usesSubcontractors" (change)="set('usesSubcontractors', $any($event.target).checked)" class="rounded" /> Usa subcontratistas</label>
                </div>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Inicio contrato</span><input type="date" [class]="inputCls" [value]="d.contractStart" (input)="set('contractStart', $any($event.target).value)" /></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Término contrato *</span><input type="date" [class]="inputCls" [value]="d.contractEnd" (input)="set('contractEnd', $any($event.target).value)" /></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Costo anual ({{ rs.currencyCode() }})</span><input type="number" min="0" [class]="inputCls" [value]="d.annualCostUSD" (input)="set('annualCostUSD', +$any($event.target).value)" /></label>
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">RTO comprometido (h)</span><input type="number" min="0" step="0.5" [class]="inputCls" [value]="d.committedRtoHours ?? ''" (input)="set('committedRtoHours', $any($event.target).value === '' ? undefined : +$any($event.target).value)" /></label>
              </div>

              <div class="p-3.5 rounded-xl border border-slate-200 space-y-2">
                <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5"><mat-icon class="text-sm text-indigo-600">gavel</mat-icon> Cláusulas contractuales ({{ clauseCount - res.missingClauses(d).length }}/{{ clauseCount }})</span>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  @for (c of clauses; track c.key) {
                    <label class="flex items-start gap-2 text-[11px] text-slate-700 p-1.5 rounded-lg" [class.bg-amber-50]="!d.clauses[c.key]">
                      <input type="checkbox" [checked]="d.clauses[c.key]" (change)="setClause(c.key, $any($event.target).checked)" class="mt-0.5 rounded" />
                      <span>{{ c.label }}</span>
                    </label>
                  }
                </div>
              </div>

              <div class="p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label class="flex items-center gap-2 text-xs font-bold text-slate-800"><input type="checkbox" [checked]="d.hasExitPlan" (change)="set('hasExitPlan', $any($event.target).checked)" class="rounded" /> Plan de salida documentado</label>
                @if (d.hasExitPlan) {
                  <textarea rows="2" [class]="inputCls" placeholder="Estrategia de salida, proveedor alternativo, plazos y devolución de datos..." [value]="d.exitPlanNotes || ''" (input)="set('exitPlanNotes', $any($event.target).value)"></textarea>
                }
              </div>

              @if (!isNew()) {
                <app-linked-plans sourceType="Proveedor" [sourceId]="d.id" [sourceLabel]="d.code + ' ' + d.name + ' (' + d.serviceDescription + ')'"
                  [defaultOwner]="d.internalOwner" [defaultPriority]="d.criticality === 'Crítico' ? 'Alta' : 'Media'"
                  [defaultTitle]="d.hasExitPlan ? '' : 'Documentar y probar el plan de salida del servicio'"
                  emptyText="Sin planes de acción (por ejemplo, para brechas de contrato, de la evaluación o del plan de salida)." />
              }

              <!-- Antecedentes RAN 20-7 -->
              @let ran = d.ran207 ?? emptyRan;
              <div class="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-3">
                <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5"><mat-icon class="text-sm text-emerald-700">policy</mat-icon> Antecedentes RAN 20-7</span>

                <div>
                  <span class="block text-[11px] font-medium text-slate-600 mb-1">Actividad significativa o estratégica: marque los criterios que aplican (I.2)</span>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    @for (c of significance; track c.key) {
                      <label class="flex items-start gap-2 text-[11px] text-slate-700"><input type="checkbox" class="mt-0.5 rounded" [checked]="ran.significance.includes(c.key)" (change)="toggleSignificance(c.key, $any($event.target).checked)" />{{ c.label }}</label>
                    }
                  </div>
                  @if (ran.significance.length && d.criticality !== 'Crítico') {
                    <p class="text-[10px] text-amber-800 mt-1">Cumple criterios de actividad significativa: considere clasificarlo como Crítico.</p>
                  }
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Centro de datos principal (ciudad, país) (III.1.m)</span><input [class]="inputCls" [value]="ran.primarySite" (input)="setRan('primarySite', $any($event.target).value)" /></label>
                  <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Centro de contingencia (ciudad, país)</span><input [class]="inputCls" [value]="ran.contingencySite" (input)="setRan('contingencySite', $any($event.target).value)" /></label>
                </div>

                @if (d.dataLocation === 'Extranjero') {
                  <div class="p-2.5 rounded-lg bg-white border border-slate-200 space-y-2">
                    <span class="text-[11px] font-semibold text-slate-700">Procesamiento en el exterior (IV y III.5)</span>
                    <label class="flex items-center gap-2 text-[11px]"><input type="checkbox" class="rounded" [checked]="ran.contingencyInChile" (change)="setRan('contingencyInChile', $any($event.target).checked)" /> Tiene sitio de contingencia en Chile</label>
                    @if (!ran.contingencyInChile) {
                      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Dispensa del Consejo (fecha)</span><input type="date" [class]="inputCls" [value]="ran.boardWaiverDate ?? ''" (input)="setRan('boardWaiverDate', $any($event.target).value || undefined)" /></label>
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Informe anual de empresa independiente (fecha)</span><input type="date" [class]="inputCls" [value]="ran.independentReportDate ?? ''" (input)="setRan('independentReportDate', $any($event.target).value || undefined)" /></label>
                      </div>
                    }
                    <label class="flex items-center gap-2 text-[11px]"><input type="checkbox" class="rounded" [checked]="ran.investmentGradeCountry" (change)="setRan('investmentGradeCountry', $any($event.target).checked)" /> País con clasificación de riesgo en grado de inversión</label>
                    @if (!ran.investmentGradeCountry) {
                      <textarea rows="2" [class]="inputCls" placeholder="Análisis documentado del Consejo sobre leyes de protección de datos del país..." [value]="ran.countryRiskAnalysis" (input)="setRan('countryRiskAnalysis', $any($event.target).value)"></textarea>
                    }
                  </div>
                }

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-1">Última prueba de continuidad del proveedor (III.3)</span><input type="date" [class]="inputCls" [value]="ran.providerContinuityTestDate ?? ''" (input)="setRan('providerContinuityTestDate', $any($event.target).value || undefined)" /></label>
                  <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-1">Última prueba de vulnerabilidades / pentest (III.4)</span><input type="date" [class]="inputCls" [value]="ran.providerSecurityTestDate ?? ''" (input)="setRan('providerSecurityTestDate', $any($event.target).value || undefined)" /></label>
                  <label class="block"><span class="block text-[10px] font-medium text-slate-600 mb-1">Última auditoría o revisión independiente (III.1.i)</span><input type="date" [class]="inputCls" [value]="ran.lastAuditDate ?? ''" (input)="setRan('lastAuditDate', $any($event.target).value || undefined)" /></label>
                </div>

                @if (d.usesSubcontractors) {
                  <div class="space-y-1.5">
                    <span class="block text-[11px] font-medium text-slate-600">Subcontratistas (III.1.k)</span>
                    @for (s of ran.subcontractors; track $index; let i = $index) {
                      <div class="grid grid-cols-12 gap-1.5 items-center">
                        <input class="col-span-4 text-xs rounded-lg border border-slate-300 px-2 py-1" placeholder="Nombre" [value]="s.name" (input)="setSub(i, 'name', $any($event.target).value)" />
                        <input class="col-span-2 text-xs rounded-lg border border-slate-300 px-2 py-1" placeholder="País" [value]="s.country" (input)="setSub(i, 'country', $any($event.target).value)" />
                        <input class="col-span-3 text-xs rounded-lg border border-slate-300 px-2 py-1" placeholder="Servicio" [value]="s.service" (input)="setSub(i, 'service', $any($event.target).value)" />
                        <label class="col-span-2 flex items-center gap-1 text-[10px]"><input type="checkbox" class="rounded" [checked]="s.meetsConditions" (change)="setSub(i, 'meetsConditions', $any($event.target).checked)" />Conforme</label>
                        <button type="button" (click)="removeSub(i)" [class.perm-hidden]="!canManage()" class="col-span-1 text-slate-400 hover:text-rose-600 cursor-pointer"><mat-icon class="text-sm">close</mat-icon></button>
                      </div>
                    }
                    <button type="button" (click)="addSub()" [class.perm-hidden]="!canManage()" class="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer flex items-center gap-0.5"><mat-icon class="text-sm">add</mat-icon>Agregar subcontratista</button>
                  </div>
                }

                @if (d.isCloud && (d.criticality === 'Crítico' || ran.significance.length)) {
                  <div class="space-y-1">
                    <span class="block text-[11px] font-medium text-slate-600">Debida diligencia reforzada para servicio crítico en la nube (V)</span>
                    @for (c of cloudDd; track c.key) {
                      <label class="flex items-start gap-2 text-[11px] text-slate-700"><input type="checkbox" class="mt-0.5 rounded" [checked]="!!ran.cloudDueDiligence[c.key]" (change)="setCloudDd(c.key, $any($event.target).checked)" />{{ c.label }}</label>
                    }
                  </div>
                }
              </div>
            </fieldset>

            <!-- Columna lateral -->
            <div class="space-y-4">
              @if (!isNew()) {
                <div class="p-3.5 rounded-xl border border-slate-200">
                  <app-evidence-files entity="providers" [entityId]="d.id" [label]="d.code" [parent]="d"
                    title="Contrato y certificaciones" emptyText="Adjunte el contrato, anexos de nivel de servicio, certificaciones (SOC 2, ISO 27001) y la debida diligencia." />
                </div>
              }
              @if (!isNew()) {
                <div class="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <span class="text-xs font-bold text-slate-800">Evaluación de riesgo del proveedor</span>
                  <p class="text-[11px] text-slate-600">
                    Última: @if (d.lastAssessmentDate) { <strong>{{ d.assessmentScore }}/100</strong> el {{ d.lastAssessmentDate }} } @else { <strong class="text-rose-700">sin evaluación</strong> }
                  </p>
                  @if (canManage()) {
                    <div class="flex flex-wrap items-end gap-2">
                      <label class="block"><span class="block text-[10px] text-slate-500">Puntaje</span><input type="number" min="0" max="100" class="w-16 text-xs rounded-lg border border-slate-300 px-2 py-1 font-mono" [value]="evalScore()" (input)="evalScore.set(+$any($event.target).value)" /></label>
                      <label class="block"><span class="block text-[10px] text-slate-500">Fecha</span><input type="date" class="text-xs rounded-lg border border-slate-300 px-2 py-1" [value]="evalDate()" (input)="evalDate.set($any($event.target).value)" /></label>
                      <button type="button" (click)="saveAssessment()" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 cursor-pointer">Registrar</button>
                    </div>
                  }
                </div>

                <div class="p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                  <span class="text-xs font-bold text-slate-800">Alertas</span>
                  @for (a of alertsFor(d.id); track $index) {
                    <div class="text-[11px] flex gap-1.5"><span class="px-1 rounded text-[9px] font-bold h-fit" [class]="alertClass(a.severity)">{{ a.severity }}</span><span><strong>{{ a.type }}.</strong> {{ a.detail }}</span></div>
                  } @empty { <p class="text-[11px] text-emerald-700">Sin alertas.</p> }
                </div>

                <div class="p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                  <span class="text-xs font-bold text-slate-800">Procesos críticos que dependen (BIA)</span>
                  @for (b of res.dependentProcesses(d.id); track b.id) {
                    <div class="text-[11px] text-slate-700">{{ b.name }} <span class="text-slate-400">· RTO {{ b.rtoHours }} h</span></div>
                  } @empty { <p class="text-[11px] text-slate-400">Ninguno registrado.</p> }
                </div>

                <div class="p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                  <span class="text-xs font-bold text-slate-800">Incidentes asociados</span>
                  @for (f of res.providerIncidents(d.id); track f.id) {
                    <div class="text-[11px] text-slate-700"><span class="font-mono text-slate-400">{{ f.id }}</span> {{ f.title }}</div>
                  } @empty { <p class="text-[11px] text-slate-400">Sin incidentes registrados.</p> }
                </div>
              }
            </div>
          </div>

          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <span class="text-[11px] text-rose-700">{{ formError() }}</span>
            <div class="flex gap-2">
              <button type="button" (click)="draft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
              @if (canManage()) {
                <button type="button" (click)="save()" class="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-600 rounded-lg cursor-pointer">Guardar proveedor</button>
              }
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProvidersPanel {
  readonly res = inject(ResilienceService);
  readonly rs = inject(RiskDataService);
  readonly notify = output<string>();

  readonly inputCls = INPUT;
  get categories(): string[] { return this.rs.catalog.providerCatalogs().categories; }
  readonly criticalities: ProviderCriticality[] = ['Crítico', 'Alto', 'Medio', 'Bajo'];
  readonly statuses: ServiceProvider['status'][] = ['Activo', 'En evaluación', 'En término'];
  get clauses() { return this.rs.catalog.providerCatalogs().clauses; }
  get clauseCount(): number { return this.clauses.length; }
  get freq() { return this.rs.catalog.params().providerAssessmentMonths; }

  readonly search = signal('');
  readonly critFilter = signal('');
  readonly catFilter = signal('');
  readonly showAllAlerts = signal(false);

  readonly draft = signal<ServiceProvider | null>(null);
  readonly isNew = signal(false);
  readonly formError = signal('');
  readonly evalScore = signal(80);
  readonly evalDate = signal(new Date().toISOString().slice(0, 10));

  readonly kpis = this.res.providerKpis;
  readonly canManage = computed(() => !!this.rs.currentProfile().permissions.canManageProviders);
  /** Explica por qué el cargo actual no puede agregar proveedores y qué cargos sí pueden. */
  readonly noPermissionText = computed(() => {
    const me = this.rs.currentProfile();
    const allowed = [...new Set(this.rs.userProfiles().filter(u => u.active !== false && u.permissions.canManageProviders).map(u => u.role))];
    return `Tu cargo (${me.role}) puede consultar el registro, pero no agregar ni editar proveedores.`
      + (allowed.length ? ` Pueden hacerlo: ${allowed.join(', ')}.` : '')
      + ' El permiso se asigna en Puestos & Permisos ("Gestionar Proveedores").';
  });
  readonly canExport = computed(() => !!this.rs.currentProfile().permissions.canExportReports);

  /** Registro de servicios externalizados con cláusulas, nube, evaluación y dependencias. */
  exportRegister() {
    const clauseLabels = this.clauses.map(c => c.label);
    const rows: (string | number | boolean | undefined)[][] = [
      ['Registro de servicios externalizados', `Generado ${new Date().toISOString().slice(0, 16)}`, this.rs.currentProfile().name],
      [],
      ['Código', 'Proveedor', 'RUT', 'Servicio', 'Categoría', 'Criticidad', 'Estado', 'Responsable', 'Procesos que soporta',
       'Nube', 'Modelo', 'Ubicación datos', 'País', 'Datos de socios', 'Subcontrata', 'Inicio contrato', 'Término contrato',
       `Costo anual ${this.rs.currencyCode()}`, 'RTO comprometido (h)', 'Última evaluación', 'Puntaje', 'Próxima evaluación', 'Plan de salida',
       ...clauseLabels, 'Procesos críticos BIA dependientes', 'Alertas',
       'Actividad significativa (criterios RAN 20-7)', 'Centro de datos principal', 'Centro de contingencia', 'Contingencia en Chile',
       'Dispensa del Consejo', 'Informe independiente', 'País grado de inversión', 'Subcontratistas', 'Prueba continuidad proveedor',
       'Prueba seguridad proveedor', 'Última auditoría', 'Debida diligencia nube (a–g)'],
      ...this.res.providers().map(p => [
        p.code, p.name, p.taxId, p.serviceDescription, p.category, p.criticality, p.status, p.internalOwner, p.supportedProcesses.join(', '),
        p.isCloud ? 'Sí' : 'No', p.cloudModel ?? '', p.dataLocation, p.dataCountry ?? '', p.handlesMemberData ? 'Sí' : 'No',
        p.usesSubcontractors ? 'Sí' : 'No', p.contractStart, p.contractEnd, p.annualCostUSD, p.committedRtoHours,
        p.lastAssessmentDate ?? '', p.assessmentScore, this.res.nextAssessmentDue(p)?.toISOString().slice(0, 10) ?? '',
        p.hasExitPlan ? 'Sí' : 'No', ...this.clauses.map(c => (p.clauses[c.key] ? 'Sí' : 'No')),
        this.res.dependentProcesses(p.id).map(b => b.name).join(', '),
        this.alertsFor(p.id).map(a => a.type).join(', '),
        ...this.ran207Columns(p),
      ]),
    ];
    downloadCsv(`Registro_externalizacion_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  readonly visibleAlerts = computed(() => (this.showAllAlerts() ? this.res.providerAlerts() : this.res.providerAlerts().slice(0, 6)));

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const crit = this.critFilter();
    const cat = this.catFilter();
    const rank = { 'Crítico': 0, 'Alto': 1, 'Medio': 2, 'Bajo': 3 };
    return this.res.providers()
      .filter(p => (!crit || p.criticality === crit) && (!cat || p.category === cat))
      .filter(p => !q || `${p.name} ${p.serviceDescription} ${p.code}`.toLowerCase().includes(q))
      .sort((a, b) => rank[a.criticality] - rank[b.criticality] || a.code.localeCompare(b.code));
  });

  readonly isHigh = (a: ProviderAlert) => a.severity === 'Alta';

  alertsFor(providerId: string): ProviderAlert[] {
    return this.res.providerAlerts().filter(a => a.providerId === providerId);
  }

  openNew() {
    const today = new Date().toISOString().slice(0, 10);
    const inAYear = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    this.isNew.set(true);
    this.formError.set('');
    this.draft.set({
      id: this.res.newId('prv'), code: this.res.nextProviderCode(), name: '', taxId: '', serviceDescription: '',
      category: 'Otros servicios', criticality: 'Medio', internalOwner: this.rs.currentProfile().name,
      supportedProcesses: [], status: 'En evaluación', isCloud: false, dataLocation: 'Chile',
      handlesMemberData: false, usesSubcontractors: false, contractStart: today, contractEnd: inAYear, annualCostUSD: 0,
      clauses: Object.fromEntries(this.clauses.map(c => [c.key, false])),
      hasExitPlan: false,
    });
  }

  openEdit(p: ServiceProvider) {
    this.isNew.set(false);
    this.formError.set('');
    this.evalScore.set(p.assessmentScore ?? 80);
    this.evalDate.set(new Date().toISOString().slice(0, 10));
    this.draft.set({ ...p, clauses: { ...p.clauses }, supportedProcesses: [...p.supportedProcesses] });
  }

  set<K extends keyof ServiceProvider>(key: K, value: ServiceProvider[K]) {
    this.draft.update(d => (d ? { ...d, [key]: value } : d));
  }

  private ran207Columns(p: ServiceProvider): string[] {
    const r = p.ran207;
    if (!r) return Array(12).fill('');
    return [
      SIGNIFICANCE_CRITERIA.filter(c => r.significance.includes(c.key)).map(c => c.label).join(' | ') || 'No',
      r.primarySite, r.contingencySite, r.contingencyInChile ? 'Sí' : 'No', r.boardWaiverDate ?? '', r.independentReportDate ?? '',
      r.investmentGradeCountry ? 'Sí' : 'No', r.subcontractors.map(s => `${s.name} (${s.country}, ${s.service}${s.meetsConditions ? '' : ', no conforme'})`).join('; '),
      r.providerContinuityTestDate ?? '', r.providerSecurityTestDate ?? '', r.lastAuditDate ?? '',
      p.isCloud ? `${CLOUD_DUE_DILIGENCE.filter(c => r.cloudDueDiligence[c.key]).length}/7` : 'N/A',
    ];
  }

  // --- Antecedentes RAN 20-7
  readonly emptyRan = EMPTY_RAN207;
  readonly significance = SIGNIFICANCE_CRITERIA;
  readonly cloudDd = CLOUD_DUE_DILIGENCE;

  private updRan(fn: (r: ProviderRan207) => ProviderRan207) {
    this.draft.update(d => (d ? { ...d, ran207: fn(structuredClone(d.ran207 ?? EMPTY_RAN207)) } : d));
  }

  setRan<K extends keyof ProviderRan207>(k: K, v: ProviderRan207[K]) {
    this.updRan(r => ({ ...r, [k]: v }));
  }

  toggleSignificance(key: string, on: boolean) {
    this.updRan(r => ({ ...r, significance: on ? [...r.significance, key] : r.significance.filter(x => x !== key) }));
  }

  setCloudDd(key: string, on: boolean) {
    this.updRan(r => ({ ...r, cloudDueDiligence: { ...r.cloudDueDiligence, [key]: on } }));
  }

  addSub() {
    this.updRan(r => ({ ...r, subcontractors: [...r.subcontractors, { name: '', country: '', service: '', meetsConditions: false }] }));
  }

  setSub<K extends keyof Subcontractor>(i: number, k: K, v: Subcontractor[K]) {
    this.updRan(r => ({ ...r, subcontractors: r.subcontractors.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  }

  removeSub(i: number) {
    this.updRan(r => ({ ...r, subcontractors: r.subcontractors.filter((_, j) => j !== i) }));
  }

  setClause(key: string, value: boolean) {
    this.draft.update(d => (d ? { ...d, clauses: { ...d.clauses, [key]: value } } : d));
  }

  splitList(v: string): string[] {
    return v.split(',').map(s => s.trim()).filter(Boolean);
  }

  async save() {
    const d = this.draft();
    if (!d) return;
    if (!d.name.trim() || !d.serviceDescription.trim()) { this.formError.set('Complete razón social y servicio.'); return; }
    if (!d.contractEnd || (d.contractStart && d.contractEnd < d.contractStart)) { this.formError.set('Revise las fechas del contrato.'); return; }
    await this.res.saveProvider({ ...d, name: d.name.trim() });
    this.notify.emit(`Proveedor ${d.code} guardado.`);
    this.draft.set(null);
  }

  async saveAssessment() {
    const d = this.draft();
    if (!d) return;
    await this.res.recordAssessment(d.id, this.evalScore(), this.evalDate());
    const updated = this.res.providerById(d.id);
    if (updated) this.draft.update(x => (x ? { ...x, assessmentScore: updated.assessmentScore, lastAssessmentDate: updated.lastAssessmentDate } : x));
    this.notify.emit(`Evaluación de ${d.name} registrada.`);
  }

  critClass(c: ProviderCriticality) {
    switch (c) {
      case 'Crítico': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Alto': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Medio': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  }

  alertClass(s: 'Alta' | 'Media' | 'Baja') {
    return s === 'Alta' ? 'bg-rose-100 text-rose-800' : s === 'Media' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  }
}
