import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { ResilienceService, ASSESSMENT_FREQUENCY_MONTHS } from '../services/resilience.service';
import {
  CONTRACT_CLAUSES,
  ContractClauseKey,
  PROVIDER_SERVICE_CATEGORIES,
  ProviderAlert,
  ProviderCriticality,
  ServiceProvider,
} from '../models/resilience.model';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';

/** Registro de proveedores y servicios externalizados. */
@Component({
  selector: 'app-providers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
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
        @if (canManage()) {
          <button type="button" (click)="openNew()"
            class="px-4 py-2.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-600 rounded-xl flex items-center gap-2 shrink-0 cursor-pointer">
            <mat-icon class="text-sm">add_business</mat-icon><span>Nuevo proveedor</span>
          </button>
        }
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Proveedores activos</span><span class="text-2xl font-bold font-mono text-slate-900">{{ kpis().active }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30"><span class="text-[11px] font-semibold text-rose-800 block">Críticos</span><span class="text-2xl font-bold font-mono text-rose-700">{{ kpis().critical }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-sky-200 bg-sky-50/30"><span class="text-[11px] font-semibold text-sky-800 block">En la nube</span><span class="text-2xl font-bold font-mono text-sky-800">{{ kpis().cloud }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30"><span class="text-[11px] font-semibold text-amber-800 block">Datos en el extranjero</span><span class="text-2xl font-bold font-mono text-amber-900">{{ kpis().abroad }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-300"><span class="text-[11px] font-semibold text-rose-800 block">Alertas altas</span><span class="text-2xl font-bold font-mono text-rose-700">{{ kpis().highAlerts }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Costo anual</span><span class="text-xl font-bold font-mono text-slate-900">\${{ kpis().annualCostUSD | number:'1.0-0' }}</span><span class="text-[10px] text-slate-500 ml-1">USD</span></div>
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
                </td>
                <td class="py-2.5 px-3 text-right">
                  <button type="button" (click)="openEdit(p)" class="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">
                    {{ canManage() ? 'Editar' : 'Ver' }}
                  </button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="py-8 text-center text-slate-500">No hay proveedores que coincidan con el filtro.</td></tr>
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
                    @for (c of categories; track c) { <option [value]="c" [selected]="c === d.category">{{ c }}</option> }
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
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Costo anual (USD)</span><input type="number" min="0" [class]="inputCls" [value]="d.annualCostUSD" (input)="set('annualCostUSD', +$any($event.target).value)" /></label>
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
            </fieldset>

            <!-- Columna lateral -->
            <div class="space-y-4">
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
  private readonly rs = inject(RiskDataService);
  readonly notify = output<string>();

  readonly inputCls = INPUT;
  readonly categories = PROVIDER_SERVICE_CATEGORIES;
  readonly criticalities: ProviderCriticality[] = ['Crítico', 'Alto', 'Medio', 'Bajo'];
  readonly statuses: ServiceProvider['status'][] = ['Activo', 'En evaluación', 'En término'];
  readonly clauses = CONTRACT_CLAUSES;
  readonly clauseCount = CONTRACT_CLAUSES.length;
  readonly freq = ASSESSMENT_FREQUENCY_MONTHS;

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
      clauses: Object.fromEntries(CONTRACT_CLAUSES.map(c => [c.key, false])) as Record<ContractClauseKey, boolean>,
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

  setClause(key: ContractClauseKey, value: boolean) {
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
