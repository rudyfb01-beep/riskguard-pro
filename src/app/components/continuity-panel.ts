import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApprovalBox } from './approval-box';
import { EvidenceFiles } from './evidence-files';
import { EvidenceService } from '../services/evidence.service';
import { ApprovalService } from '../services/approval.service';
import { RiskDataService } from '../services/risk-data.service';
import { ResilienceService } from '../services/resilience.service';
import { BiaRan209, MIN_SCENARIOS, PlanRan209, TestRan209 } from '../models/compliance.model';
import { SecurityService } from '../services/security.service';
import { CAC_BUSINESS_LINES } from '../models/risk.model';
import {
  BiaImpact,
  BiaProcess,
  ContinuityPlan,
  ContinuityPlanType,
  ContinuityTest,
  ContinuityTestType,
} from '../models/resilience.model';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';

type SubTab = 'bia' | 'planes' | 'pruebas';

/** Continuidad del negocio: análisis de impacto (BIA), planes y pruebas. */
import { LinkedPlans, PlanChips } from './linked-plans';
import { ActionPlanService } from '../services/action-plan.service';
@Component({
  selector: 'app-continuity-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LinkedPlans, PlanChips, CommonModule, MatIconModule, ApprovalBox, EvidenceFiles],
  template: `
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-teal-100 text-teal-800 rounded-lg"><mat-icon class="text-lg">restart_alt</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Continuidad del Negocio</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Análisis de impacto (BIA) de los procesos críticos con sus tiempos de recuperación, planes de continuidad y recuperación
            ante desastres, y resultados de las pruebas.
          </p>
        </div>
        @if (canManage()) {
          <div class="flex gap-2 shrink-0">
            @switch (tab()) {
              @case ('bia') { <button type="button" (click)="newBia()" class="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-xl flex items-center gap-1.5 cursor-pointer"><mat-icon class="text-sm">add</mat-icon>Nuevo proceso</button> }
              @case ('planes') { <button type="button" (click)="newPlan()" class="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-xl flex items-center gap-1.5 cursor-pointer"><mat-icon class="text-sm">add</mat-icon>Nuevo plan</button> }
              @case ('pruebas') { <button type="button" (click)="newTest()" class="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-xl flex items-center gap-1.5 cursor-pointer"><mat-icon class="text-sm">add</mat-icon>Registrar prueba</button> }
            }
          </div>
        }
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Procesos en BIA</span><span class="text-2xl font-bold font-mono text-slate-900">{{ kpis().processes }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30"><span class="text-[11px] font-semibold text-rose-800 block">Procesos críticos</span><span class="text-2xl font-bold font-mono text-rose-700">{{ kpis().critical }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-teal-200 bg-teal-50/30"><span class="text-[11px] font-semibold text-teal-800 block">Cobertura de planes</span><span class="text-2xl font-bold font-mono text-teal-800">{{ kpis().coveragePct }}%</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Planes</span><span class="text-2xl font-bold font-mono text-slate-900">{{ kpis().plans }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30"><span class="text-[11px] font-semibold text-emerald-800 block">Planes probados (12 m)</span><span class="text-2xl font-bold font-mono text-emerald-700">{{ kpis().testedPct }}%</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-300"><span class="text-[11px] font-semibold text-rose-800 block">Alertas altas</span><span class="text-2xl font-bold font-mono text-rose-700">{{ kpis().highAlerts }}</span></div>
      </div>

      <!-- Alertas -->
      @if (res.continuityAlerts().length > 0) {
        <div class="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-2"><mat-icon class="text-base text-rose-600">warning</mat-icon> Brechas de continuidad ({{ res.continuityAlerts().length }})</h2>
          <ul class="divide-y divide-slate-100">
            @for (a of res.continuityAlerts(); track $index) {
              <li class="py-1.5 flex items-start gap-2 text-xs">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0" [class]="a.severity === 'Alta' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'">{{ a.severity }}</span>
                <span class="text-slate-500 shrink-0">{{ a.type }}:</span>
                <span class="text-slate-700">{{ a.detail }}</span>
              </li>
            }
          </ul>
        </div>
      }

      <!-- Sub tabs -->
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
        <!-- BIA -->
        @case ('bia') {
          <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table class="w-full text-xs min-w-[1050px]">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr>
                  <th class="text-left py-2.5 px-3">Proceso</th>
                  <th class="text-left py-2.5 px-3">Criticidad</th>
                  <th class="text-center py-2.5 px-3" title="Financiero · Socios · Regulatorio · Reputacional">Impacto F·S·R·Rep</th>
                  <th class="text-right py-2.5 px-3">MTPD</th>
                  <th class="text-right py-2.5 px-3">RTO</th>
                  <th class="text-right py-2.5 px-3">RPO</th>
                  <th class="text-left py-2.5 px-3">Proveedores</th>
                  <th class="text-left py-2.5 px-3">Planes</th>
                  <th class="text-left py-2.5 px-3">Revisión</th>
                  <th class="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (b of sortedBia(); track b.id) {
                  @let crit = res.biaCriticality(b);
                  <tr class="hover:bg-slate-50">
                    <td class="py-2.5 px-3 max-w-[260px]">
                      <div class="font-semibold text-slate-900">{{ b.name }}</div>
                      <div class="text-[10px] text-slate-500">{{ b.businessLine }} · {{ b.owner }}</div>
                    </td>
                    <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold border" [class]="critClass(crit)">{{ crit }}</span></td>
                    <td class="py-2.5 px-3 text-center">
                      <div class="inline-flex gap-0.5">
                        @for (v of impactValues(b.impact); track $index) {
                          <span class="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center" [class]="impactClass(v)">{{ v }}</span>
                        }
                      </div>
                    </td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-right font-mono">{{ b.mtpdHours }} h</td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-right font-mono font-bold" [class.text-rose-700]="b.rtoHours > b.mtpdHours">{{ b.rtoHours }} h</td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-right font-mono">{{ b.rpoHours < 1 ? (b.rpoHours * 60) + ' min' : b.rpoHours + ' h' }}</td>
                    <td class="py-2.5 px-3 text-[11px]">
                      @for (pid of b.providerIds; track pid) {
                        @let p = res.providerById(pid);
                        <div [class]="p?.committedRtoHours !== undefined && p!.committedRtoHours! > b.rtoHours ? 'text-rose-700 font-semibold' : 'text-slate-700'">
                          {{ p?.name }}@if (p?.committedRtoHours !== undefined) { <span class="text-[10px] font-mono"> ({{ p?.committedRtoHours }} h)</span> }
                        </div>
                      } @empty { <span class="text-slate-400">—</span> }
                    </td>
                    <td class="py-2.5 px-3 text-[11px]">
                      @for (pl of res.plansForProcess(b.id); track pl.id) {
                        <span class="inline-block px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 font-mono text-[10px] mr-0.5">{{ pl.code }}</span>
                      } @empty { <span class="text-rose-700 font-semibold">Sin plan</span> }
                    </td>
                    <td class="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]" [class]="isStale(b.lastReviewDate) ? 'text-amber-700 font-bold' : 'text-slate-500'">{{ b.lastReviewDate }}</td>
                    <td class="py-2.5 px-3 text-right">
                      <button type="button" (click)="editBia(b)" class="px-2.5 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">{{ canManage() ? 'Editar' : 'Ver' }}</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="px-4 py-2 text-[10px] text-slate-500 border-t border-slate-100">
              MTPD: máximo período tolerable de interrupción · RTO: tiempo objetivo de recuperación · RPO: pérdida de datos tolerable.
              Impacto de 1 (bajo) a 4 (severo). En rojo, proveedores cuyo RTO comprometido no alcanza el RTO del proceso.
            </p>
          </div>
        }

        <!-- Planes -->
        @case ('planes') {
          <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800 flex items-center gap-1.5"><mat-icon class="text-sm text-emerald-700">policy</mat-icon> Escenarios mínimos (RAN 20-9 I.8 e I.10): cobertura y pruebas de los últimos 12 meses</div>
            <table class="w-full text-xs min-w-[640px]">
              <tbody class="divide-y divide-slate-100">
                @for (c of scenarioCoverage(); track c.scenario) {
                  <tr>
                    <td class="py-2 px-4 font-medium text-slate-800">{{ c.scenario }}</td>
                    <td class="py-2 px-3 text-[11px]" [class]="c.plans.length ? 'text-slate-700' : 'text-rose-700 font-semibold'">{{ c.plans.length ? 'Planes: ' + c.plans.join(', ') : 'Sin plan vigente que lo cubra' }}</td>
                    <td class="py-2 px-3 text-[11px] text-right" [class]="c.tested ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'">{{ c.tested ? 'Probado ' + c.lastTest : (c.lastTest ? 'Prueba vencida (' + c.lastTest + ')' : 'Sin prueba') }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            @for (pl of res.plans(); track pl.id) {
              @let last = res.lastTest(pl.id);
              <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 flex flex-col">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <span class="font-mono text-[11px] font-bold text-teal-800">{{ pl.code }} · v{{ pl.version }}</span>
                    <h3 class="font-bold text-sm text-slate-900 leading-snug">{{ pl.name }}</h3>
                    <span class="text-[10px] text-slate-500">{{ pl.type }}</span>
                  </div>
                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold shrink-0"
                    [class]="pl.status === 'Vigente' ? 'bg-emerald-100 text-emerald-800' : pl.status === 'En actualización' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'">{{ pl.status }}</span>
                </div>
                @if (approvals.pendingFor('plan-continuidad', pl.id); as ap) {
                  <button type="button" (click)="approvals.open(ap.id)" class="self-start px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold cursor-pointer hover:bg-amber-200 flex items-center gap-1">
                    <mat-icon class="text-[12px] w-3 h-3">approval</mat-icon>En aprobación · {{ ap.steps[ap.currentStep].roleTitle }}</button>
                }
                <div class="text-[11px] text-slate-600 space-y-0.5">
                  <div>Responsable: <strong class="text-slate-800">{{ pl.owner }}</strong></div>
                  <div>Aprobado por: {{ pl.approvedBy || '—' }}{{ pl.approvalDate ? ' (' + pl.approvalDate + ')' : '' }}</div>
                  <div [class]="isPast(pl.nextReviewDate) ? 'text-rose-700 font-bold' : ''">Próxima revisión: {{ pl.nextReviewDate }}@if (isPast(pl.nextReviewDate)) { · vencida }</div>
                </div>
                <div class="text-[11px]">
                  <span class="text-slate-500 block mb-0.5">Procesos cubiertos:</span>
                  @for (pid of pl.processIds; track pid) {
                    <span class="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] mr-0.5 mb-0.5">{{ biaName(pid) }}</span>
                  } @empty { <span class="text-slate-400">Plan transversal</span> }
                </div>
                <div class="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  @if (last) {
                    <span class="text-[11px]">Última prueba {{ last.date }}: <strong [class]="resultClass(last.result)">{{ last.result }}</strong></span>
                  } @else {
                    <span class="text-[11px] text-rose-700 font-semibold">Sin pruebas registradas</span>
                  }
                  <button type="button" (click)="editPlan(pl)" class="px-2.5 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer shrink-0">{{ canManage() ? 'Editar' : 'Ver' }}</button>
                </div>
              </div>
            }
          </div>
        }

        <!-- Pruebas -->
        @case ('pruebas') {
          <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
            <table class="w-full text-xs min-w-[950px]">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr>
                  <th class="text-left py-2.5 px-3">Fecha</th>
                  <th class="text-left py-2.5 px-3">Plan</th>
                  <th class="text-left py-2.5 px-3">Tipo / escenario</th>
                  <th class="text-left py-2.5 px-3">Proceso</th>
                  <th class="text-right py-2.5 px-3">RTO logrado / objetivo</th>
                  <th class="text-left py-2.5 px-3">Resultado</th>
                  <th class="text-left py-2.5 px-3">Hallazgos y acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (t of sortedTests(); track t.id) {
                  @let proc = t.processId ? biaById(t.processId) : undefined;
                  <tr class="align-top">
                    <td class="py-2.5 px-3 font-mono whitespace-nowrap">{{ t.date }}</td>
                    <td class="py-2.5 px-3 font-mono text-teal-800 font-bold">{{ planCode(t.planId) }}</td>
                    <td class="py-2.5 px-3 max-w-[240px]"><div class="font-semibold text-slate-800">{{ t.type }}</div><div class="text-[11px] text-slate-500">{{ t.scenario }}</div></td>
                    <td class="py-2.5 px-3 text-[11px] text-slate-700">{{ proc?.name || '—' }}</td>
                    <td class="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                      @if (t.achievedRtoHours !== undefined && proc) {
                        <span [class]="t.achievedRtoHours > proc.rtoHours ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'">{{ t.achievedRtoHours }} h</span>
                        <span class="text-slate-400"> / {{ proc.rtoHours }} h</span>
                      } @else { — }
                    </td>
                    <td class="py-2.5 px-3"><span class="font-semibold" [class]="resultClass(t.result)">{{ t.result }}</span></td>
                    <td class="py-2.5 px-3 text-[11px] text-slate-700 max-w-[300px]"><div>{{ t.findings }}</div>@if (t.actions) { <div class="text-slate-500 mt-0.5">→ {{ t.actions }}</div> }
                      <button type="button" (click)="evidenceFor.set(evidenceFor() === t.id ? null : t.id)" class="mt-1 text-[10px] font-semibold text-indigo-700 hover:underline cursor-pointer flex items-center gap-0.5">
                        <mat-icon class="text-[12px] w-3 h-3">attach_file</mat-icon>Evidencias ({{ evidence.count('continuity-tests', t.id) }})</button>
                      @if (evidenceFor() === t.id) {
                        <div class="mt-1.5 min-w-[260px]">
                          <app-evidence-files entity="continuity-tests" [entityId]="t.id" [label]="planCode(t.planId) + ' ' + t.date" [parent]="t"
                            title="" emptyText="Adjunte el informe de la prueba, actas y registros de tiempos." />
                        </div>
                      }
                      @if (t.result !== 'Exitosa' || actionPlans.forSource('Continuidad', t.id).length) {
                        <div class="mt-1.5">
                          @if (planFor() === t.id) {
                            <app-linked-plans sourceType="Continuidad" [sourceId]="t.id" [sourceLabel]="'Prueba ' + t.type + ' del ' + t.date + ': ' + t.scenario"
                              [process]="proc?.name" [defaultTitle]="t.actions" [defaultPriority]="t.result === 'Fallida' ? 'Alta' : 'Media'" />
                            <button type="button" (click)="planFor.set(null)" class="mt-1 text-[10px] text-slate-500 hover:underline cursor-pointer">Ocultar</button>
                          } @else {
                            <span class="inline-flex flex-wrap items-center gap-1.5">
                              <app-plan-chips sourceType="Continuidad" [sourceId]="t.id" />
                              <button type="button" (click)="planFor.set(t.id)" class="text-[10px] font-semibold text-teal-700 hover:underline cursor-pointer">{{ actionPlans.forSource('Continuidad', t.id).length ? 'Ver planes' : 'Crear plan de acción' }}</button>
                            </span>
                          }
                        </div>
                      }</td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="py-8 text-center text-slate-500">No hay pruebas registradas.</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    </div>

    <!-- Modal BIA -->
    @if (biaDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden my-6">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900">Análisis de impacto (BIA)</h2>
            <button type="button" (click)="biaDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto"><fieldset class="p-6 space-y-4" [disabled]="!canManage()">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Proceso *</span><input [class]="inputCls" list="bia-process-names" [value]="d.name" (input)="setBia('name', $any($event.target).value)" />
                <datalist id="bia-process-names">@for (p of rs.catalog.processNames(); track p) { <option [value]="p"></option> }</datalist></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Dueño del proceso</span><input [class]="inputCls" [value]="d.owner" (input)="setBia('owner', $any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Línea de negocio</span>
                <select [class]="inputCls" (change)="setBia('businessLine', $any($event.target).value)">
                  @for (l of businessLines; track l) { <option [value]="l" [selected]="l === d.businessLine">{{ l }}</option> }
                </select></label>
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Descripción</span><textarea rows="2" [class]="inputCls" [value]="d.description" (input)="setBia('description', $any($event.target).value)"></textarea></label>
            </div>

            <div class="p-3.5 rounded-xl border border-slate-200 space-y-2">
              <span class="text-xs font-bold text-slate-800">Impacto de una interrupción (1 bajo · 4 severo)</span>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                @for (k of impactKeys; track k.key) {
                  <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">{{ k.label }}</span>
                    <select [class]="inputCls" (change)="setImpact(k.key, +$any($event.target).value)">
                      @for (v of [1, 2, 3, 4]; track v) { <option [value]="v" [selected]="v === d.impact[k.key]">{{ v }}</option> }
                    </select></label>
                }
              </div>
              <p class="text-[11px] text-slate-500">Criticidad resultante: <strong>{{ res.biaCriticality(d) }}</strong></p>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">MTPD (horas)</span><input type="number" min="0" step="0.5" [class]="inputCls" [value]="d.mtpdHours" (input)="setBia('mtpdHours', +$any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">RTO (horas)</span><input type="number" min="0" step="0.5" [class]="inputCls" [value]="d.rtoHours" (input)="setBia('rtoHours', +$any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">RPO (horas)</span><input type="number" min="0" step="0.25" [class]="inputCls" [value]="d.rpoHours" (input)="setBia('rpoHours', +$any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Dotación mínima</span><input type="number" min="0" [class]="inputCls" [value]="d.minimumStaff" (input)="setBia('minimumStaff', +$any($event.target).value)" /></label>
            </div>
            @if (d.rtoHours > d.mtpdHours) {
              <p class="text-[11px] text-rose-700 flex items-center gap-1"><mat-icon class="text-xs">error</mat-icon> El RTO no puede superar el MTPD.</p>
            }

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div class="block sm:col-span-2">
                <span class="block text-[11px] font-medium text-slate-600 mb-1">Sistemas que usa <span class="font-normal text-slate-400">(del inventario de activos de Seguridad de la Información)</span></span>
                @if (systemAssets().length) {
                  <div class="flex flex-wrap gap-1.5 p-2 rounded-lg border border-slate-200 max-h-32 overflow-y-auto">
                    @for (a of systemAssets(); track a.id) {
                      <button type="button" (click)="toggleSystem(a.name)"
                        class="px-2 py-0.5 rounded-full text-[11px] border cursor-pointer"
                        [class]="d.systems.includes(a.name) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'">
                        {{ a.name }} <span class="opacity-60">· {{ a.code }}</span>
                      </button>
                    }
                  </div>
                }
                <input [class]="inputCls" class="mt-1.5" placeholder="Otros sistemas no inventariados (separados por coma)"
                  [value]="otherSystems(d).join(', ')" (change)="setOtherSystems($any($event.target).value)" />
              </div>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Sitio o modalidad alterna</span><input [class]="inputCls" [value]="d.alternateSite" (input)="setBia('alternateSite', $any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Fecha de revisión del BIA</span><input type="date" [class]="inputCls" [value]="d.lastReviewDate" (input)="setBia('lastReviewDate', $any($event.target).value)" /></label>
            </div>

            @let br = d.ran209 ?? emptyBia;
            <div class="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <span class="sm:col-span-2 text-xs font-bold text-slate-800 flex items-center gap-1.5"><mat-icon class="text-sm text-emerald-700">policy</mat-icon> RAN 20-9 I.7: aprobación del RTO y análisis de riesgos</span>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">RTO aprobado por el Consejo (fecha)</span><input type="date" [class]="inputCls" [value]="br.rtoApprovedDate ?? ''" (input)="setBiaRan('rtoApprovedDate', $any($event.target).value || undefined)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Acta o sesión</span><input [class]="inputCls" placeholder="Ej. Sesión N° 512" [value]="br.rtoApprovalRef" (input)="setBiaRan('rtoApprovalRef', $any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Análisis de riesgos (RIA): fecha</span><input type="date" [class]="inputCls" [value]="br.riaDate ?? ''" (input)="setBiaRan('riaDate', $any($event.target).value || undefined)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Resultado del RIA</span><input [class]="inputCls" placeholder="Riesgos principales y tratamiento" [value]="br.riaSummary" (input)="setBiaRan('riaSummary', $any($event.target).value)" /></label>
            </div>

            <div class="p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <span class="text-xs font-bold text-slate-800">Proveedores de los que depende</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
                @for (p of res.providers(); track p.id) {
                  <label class="flex items-center gap-2 text-[11px] text-slate-700">
                    <input type="checkbox" [checked]="d.providerIds.includes(p.id)" (change)="toggleProvider(p.id, $any($event.target).checked)" class="rounded" />
                    <span>{{ p.name }}@if (p.committedRtoHours !== undefined) { <span class="font-mono text-[10px]" [class]="p.committedRtoHours > d.rtoHours ? 'text-rose-700 font-bold' : 'text-slate-400'"> · RTO {{ p.committedRtoHours }} h</span> }</span>
                  </label>
                }
              </div>
            </div>
          </fieldset></div>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <span class="text-[11px] text-rose-700">{{ formError() }}</span>
            <div class="flex gap-2">
              <button type="button" (click)="biaDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
              @if (canManage()) { <button type="button" (click)="saveBia()" class="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-lg cursor-pointer">Guardar BIA</button> }
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Modal Plan -->
    @if (planDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-6">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900">Plan {{ d.code }}</h2>
            <button type="button" (click)="planDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto"><fieldset class="p-6 space-y-4" [disabled]="!canManage()">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Nombre *</span><input [class]="inputCls" [value]="d.name" (input)="setPlan('name', $any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Código</span><input [class]="inputCls" [value]="d.code" (input)="setPlan('code', $any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Tipo</span>
                <select [class]="inputCls" (change)="setPlan('type', $any($event.target).value)">
                  @for (t of planTypes; track t) { <option [value]="t" [selected]="t === d.type">{{ t }}</option> }
                </select></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Responsable</span><input [class]="inputCls" [value]="d.owner" (input)="setPlan('owner', $any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Versión</span><input [class]="inputCls" [value]="d.version" (input)="setPlan('version', $any($event.target).value)" /></label>
              <div class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Aprobación vigente</span>
                <div class="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 min-h-[30px]">{{ d.approvedBy ? d.approvedBy + (d.approvalDate ? ' · ' + d.approvalDate : '') : 'Sin aprobar' }}</div>
                <span class="text-[10px] text-slate-500">Se registra al aprobarse la solicitud.</span></div>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Estado</span>
                <select [class]="inputCls" (change)="setPlan('status', $any($event.target).value)">
                  @for (s of planStatuses; track s) {
                    <option [value]="s" [selected]="s === d.status" [disabled]="s === 'Vigente' && !planWasVigente(d)">{{ s }}{{ s === 'Vigente' && !planWasVigente(d) ? ' (requiere aprobación)' : '' }}</option>
                  }
                </select></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Próxima revisión</span><input type="date" [class]="inputCls" [value]="d.nextReviewDate" (input)="setPlan('nextReviewDate', $any($event.target).value)" /></label>
            </div>
            @if (planSaved(d)) {
              <app-evidence-files entity="plans" [entityId]="d.id" [label]="d.code" [parent]="d"
                title="Documento del plan y anexos" emptyText="Adjunte el documento vigente del plan y sus anexos." />
              <app-approval-box kind="plan-continuidad" [targetId]="d.id" [targetLabel]="d.code + ' ' + d.name"
                title="Aprobación del plan" requestLabel="Solicitar aprobación del plan"
                hint="Guarde los cambios y envíe el plan a aprobación: al aprobarse queda Vigente con la versión, quien aprobó y la fecha."
                [defaults]="{ version: d.version, nextReviewDate: nextYear() }" (notify)="notify.emit($event); planDraft.set(null)" />
            }
            @let pr = d.ran209 ?? emptyPlan;
            <div class="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-1.5">
              <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5"><mat-icon class="text-sm text-emerald-700">policy</mat-icon> Escenarios que cubre (RAN 20-9 I.8)</span>
              @for (sc of scenarios; track sc) {
                <label class="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" class="rounded" [checked]="pr.scenarios.includes(sc)" (change)="togglePlanScenario(sc, $any($event.target).checked)" />{{ sc }}</label>
              }
              <label class="flex items-center gap-2 text-[11px] text-slate-700 pt-1 border-t border-emerald-100"><input type="checkbox" class="rounded" [checked]="pr.returnToNormal" (change)="setPlanRan('returnToNormal', $any($event.target).checked)" /> Incluye procedimiento de retorno a la operación normal (I.9)</label>
            </div>
            <div class="p-3.5 rounded-xl border border-slate-200 space-y-1.5">
              <span class="text-xs font-bold text-slate-800">Procesos cubiertos</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1">
                @for (b of res.biaProcesses(); track b.id) {
                  <label class="flex items-center gap-2 text-[11px] text-slate-700">
                    <input type="checkbox" [checked]="d.processIds.includes(b.id)" (change)="togglePlanProcess(b.id, $any($event.target).checked)" class="rounded" />
                    <span>{{ b.name }}</span>
                  </label>
                }
              </div>
            </div>
          </fieldset></div>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <span class="text-[11px] text-rose-700">{{ formError() }}</span>
            <div class="flex gap-2">
              <button type="button" (click)="planDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
              @if (canManage()) { <button type="button" (click)="savePlan()" class="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-lg cursor-pointer">Guardar plan</button> }
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Modal Prueba -->
    @if (testDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-6">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900">Registrar prueba de continuidad</h2>
            <button type="button" (click)="testDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Plan probado</span>
                <select [class]="inputCls" (change)="setTest('planId', $any($event.target).value)">
                  @for (pl of res.plans(); track pl.id) { <option [value]="pl.id" [selected]="pl.id === d.planId">{{ pl.code }} · {{ pl.name }}</option> }
                </select></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Fecha</span><input type="date" [class]="inputCls" [value]="d.date" (input)="setTest('date', $any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Tipo de prueba</span>
                <select [class]="inputCls" (change)="setTest('type', $any($event.target).value)">
                  @for (t of testTypes; track t) { <option [value]="t" [selected]="t === d.type">{{ t }}</option> }
                </select></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Resultado</span>
                <select [class]="inputCls" (change)="setTest('result', $any($event.target).value)">
                  @for (r of testResults; track r) { <option [value]="r" [selected]="r === d.result">{{ r }}</option> }
                </select></label>
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Escenario *</span><input [class]="inputCls" [value]="d.scenario" (input)="setTest('scenario', $any($event.target).value)" placeholder="Ej. Caída del core financiero por 6 horas" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Proceso medido</span>
                <select [class]="inputCls" (change)="setTest('processId', $any($event.target).value || undefined)">
                  <option value="">— Ninguno —</option>
                  @for (b of planProcesses(d.planId); track b.id) { <option [value]="b.id" [selected]="b.id === d.processId">{{ b.name }} (RTO {{ b.rtoHours }} h)</option> }
                </select></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">RTO logrado (horas)</span><input type="number" min="0" step="0.5" [class]="inputCls" [value]="d.achievedRtoHours ?? ''" (input)="setTest('achievedRtoHours', $any($event.target).value === '' ? undefined : +$any($event.target).value)" /></label>
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Hallazgos</span><textarea rows="2" [class]="inputCls" [value]="d.findings" (input)="setTest('findings', $any($event.target).value)"></textarea></label>
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Acciones de mejora</span><textarea rows="2" [class]="inputCls" [value]="d.actions" (input)="setTest('actions', $any($event.target).value)"></textarea></label>
            </div>
            @let tr = d.ran209 ?? emptyTest;
            <div class="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <span class="sm:col-span-2 text-xs font-bold text-slate-800 flex items-center gap-1.5"><mat-icon class="text-sm text-emerald-700">policy</mat-icon> RAN 20-9 I.10–I.11</span>
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Escenario mínimo que prueba</span>
                <select [class]="inputCls" (change)="setTestRan('scenario', $any($event.target).value || undefined)">
                  <option value="" [selected]="!tr.scenario">Otro escenario</option>
                  @for (sc of scenarios; track sc) { <option [value]="sc" [selected]="sc === tr.scenario">{{ sc }}</option> }
                </select></label>
              <label class="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" class="rounded" [checked]="tr.siteUnavailability" (change)="setTestRan('siteUnavailability', $any($event.target).checked)" /> Simula la indisponibilidad del sitio de procesamiento</label>
              @if (tr.siteUnavailability) {
                <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Procesos probados</span>
                  <select [class]="inputCls" (change)="setTestRan('processingMode', $any($event.target).value)">
                    @for (m of processingModes; track m) { <option [value]="m" [selected]="m === tr.processingMode">{{ m }}</option> }
                  </select></label>
                <label class="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" class="rounded" [checked]="tr.priorRiskAnalysis" (change)="setTestRan('priorRiskAnalysis', $any($event.target).checked)" /> Con análisis de riesgos previo</label>
              }
            </div>
            @if (testRtoGap(d); as gap) {
              <p class="text-[11px] text-rose-700 flex items-center gap-1"><mat-icon class="text-xs">error</mat-icon> {{ gap }}</p>
            }
            <p class="text-[11px] text-slate-500 flex items-center gap-1"><mat-icon class="text-sm">info</mat-icon>Después de registrar la prueba, adjunte su informe y evidencias desde la tabla de pruebas.</p>
          </div>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
            <span class="text-[11px] text-rose-700">{{ formError() }}</span>
            <div class="flex gap-2">
              <button type="button" (click)="testDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer">Cancelar</button>
              <button type="button" (click)="saveTest()" class="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-600 rounded-lg cursor-pointer">Registrar prueba</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ContinuityPanel {
  readonly res = inject(ResilienceService);
  readonly rs = inject(RiskDataService);
  private readonly sec = inject(SecurityService);

  /** Activos que representan sistemas (aplicaciones, nube, servidores, bases de datos). */
  readonly systemAssets = computed(() => this.sec.assets()
    .filter(a => ['Aplicación', 'Servicio en la nube', 'Infraestructura / Servidor', 'Datos / Base de datos'].includes(a.type))
    .sort((a, b) => a.name.localeCompare(b.name, 'es')));

  otherSystems(d: BiaProcess): string[] {
    const names = new Set(this.systemAssets().map(a => a.name));
    return d.systems.filter(s => !names.has(s));
  }

  toggleSystem(name: string) {
    const d = this.biaDraft();
    if (!d) return;
    this.setBia('systems', d.systems.includes(name) ? d.systems.filter(s => s !== name) : [...d.systems, name]);
  }

  setOtherSystems(v: string) {
    const d = this.biaDraft();
    if (!d) return;
    const names = new Set(this.systemAssets().map(a => a.name));
    this.setBia('systems', [...d.systems.filter(s => names.has(s)), ...this.splitList(v)]);
  }
  readonly notify = output<string>();

  readonly inputCls = INPUT;
  readonly businessLines = CAC_BUSINESS_LINES;
  readonly subTabs: { id: SubTab; label: string; icon: string }[] = [
    { id: 'bia', label: 'Análisis de impacto (BIA)', icon: 'account_tree' },
    { id: 'planes', label: 'Planes', icon: 'menu_book' },
    { id: 'pruebas', label: 'Pruebas', icon: 'science' },
  ];
  readonly impactKeys: { key: keyof BiaImpact; label: string }[] = [
    { key: 'financial', label: 'Financiero' },
    { key: 'members', label: 'Socios' },
    { key: 'regulatory', label: 'Regulatorio' },
    { key: 'reputational', label: 'Reputacional' },
  ];
  readonly planTypes: ContinuityPlanType[] = ['Plan de Continuidad (BCP)', 'Recuperación ante Desastres (DRP)', 'Gestión de Crisis', 'Comunicaciones de Crisis'];
  readonly planStatuses: ContinuityPlan['status'][] = ['Vigente', 'En actualización', 'Borrador'];
  readonly approvals = inject(ApprovalService);
  readonly testTypes: ContinuityTestType[] = ['Ejercicio de escritorio', 'Simulacro', 'Prueba técnica DRP', 'Prueba integral con proveedores'];
  readonly testResults: ContinuityTest['result'][] = ['Exitosa', 'Con observaciones', 'Fallida'];

  readonly tab = signal<SubTab>('bia');
  readonly biaDraft = signal<BiaProcess | null>(null);
  readonly planDraft = signal<ContinuityPlan | null>(null);
  readonly testDraft = signal<ContinuityTest | null>(null);
  readonly formError = signal('');

  readonly kpis = this.res.continuityKpis;
  readonly canManage = computed(() => !!this.rs.currentProfile().permissions.canManageContinuity);

  readonly sortedBia = computed(() => {
    const rank = { 'Crítico': 0, 'Alto': 1, 'Medio': 2, 'Bajo': 3 };
    return [...this.res.biaProcesses()].sort((a, b) => rank[this.res.biaCriticality(a)] - rank[this.res.biaCriticality(b)] || a.rtoHours - b.rtoHours);
  });
  readonly actionPlans = inject(ActionPlanService);
  /** Prueba cuyos planes de acción se muestran. */
  readonly planFor = signal<string | null>(null);
  readonly sortedTests = computed(() => [...this.res.tests()].sort((a, b) => b.date.localeCompare(a.date)));

  // ---- helpers ----
  impactValues(i: BiaImpact) { return [i.financial, i.members, i.regulatory, i.reputational]; }
  biaById(id: string) { return this.res.biaProcesses().find(b => b.id === id); }
  biaName(id: string) { return this.biaById(id)?.name ?? id; }
  planCode(id: string) { return this.res.plans().find(p => p.id === id)?.code ?? id; }
  isPast(date: string) { return new Date(date + 'T00:00:00') < this.res.today(); }
  isStale(date: string) {
    const d = new Date(date + 'T00:00:00');
    d.setFullYear(d.getFullYear() + 1);
    return d < this.res.today();
  }
  splitList(v: string) { return v.split(',').map(s => s.trim()).filter(Boolean); }
  planProcesses(planId: string) {
    const plan = this.res.plans().find(p => p.id === planId);
    return plan && plan.processIds.length ? this.res.biaProcesses().filter(b => plan.processIds.includes(b.id)) : this.res.biaProcesses();
  }
  testRtoGap(t: ContinuityTest): string | null {
    const proc = t.processId ? this.biaById(t.processId) : undefined;
    if (proc && t.achievedRtoHours !== undefined && t.achievedRtoHours > proc.rtoHours) {
      return `El RTO logrado (${t.achievedRtoHours} h) supera el objetivo de ${proc.rtoHours} h: se generará una brecha.`;
    }
    return null;
  }

  // ---- BIA ----
  newBia() {
    this.formError.set('');
    this.biaDraft.set({
      id: this.res.newId('bia'), name: '', owner: this.rs.currentProfile().name, businessLine: 'Captaciones y Ahorro', description: '',
      impact: { financial: 2, members: 2, regulatory: 2, reputational: 2 }, mtpdHours: 24, rtoHours: 12, rpoHours: 4,
      systems: [], providerIds: [], minimumStaff: 1, alternateSite: '', lastReviewDate: new Date().toISOString().slice(0, 10),
    });
  }
  editBia(b: BiaProcess) {
    this.formError.set('');
    this.biaDraft.set({ ...b, impact: { ...b.impact }, systems: [...b.systems], providerIds: [...b.providerIds] });
  }
  setBia<K extends keyof BiaProcess>(key: K, value: BiaProcess[K]) { this.biaDraft.update(d => (d ? { ...d, [key]: value } : d)); }

  // --- RAN 20-9
  readonly scenarios = MIN_SCENARIOS;
  readonly processingModes: NonNullable<TestRan209['processingMode']>[] = ['Online y batch', 'Online', 'Batch'];
  readonly emptyBia: BiaRan209 = { rtoApprovalRef: '', riaSummary: '' };
  readonly emptyPlan: PlanRan209 = { scenarios: [], returnToNormal: false };
  readonly emptyTest: TestRan209 = { siteUnavailability: false, priorRiskAnalysis: false };

  setBiaRan<K extends keyof BiaRan209>(k: K, v: BiaRan209[K]) {
    this.biaDraft.update(d => (d ? { ...d, ran209: { ...(d.ran209 ?? this.emptyBia), [k]: v } } : d));
  }

  setPlanRan<K extends keyof PlanRan209>(k: K, v: PlanRan209[K]) {
    this.planDraft.update(d => (d ? { ...d, ran209: { ...(d.ran209 ?? this.emptyPlan), [k]: v } } : d));
  }

  togglePlanScenario(sc: string, on: boolean) {
    const cur = this.planDraft()?.ran209?.scenarios ?? [];
    this.setPlanRan('scenarios', on ? [...cur, sc] : cur.filter(x => x !== sc));
  }

  setTestRan<K extends keyof TestRan209>(k: K, v: TestRan209[K]) {
    this.testDraft.update(d => {
      if (!d) return d;
      const next = { ...(d.ran209 ?? this.emptyTest), [k]: v };
      if (k === 'siteUnavailability' && v && !next.processingMode) next.processingMode = 'Online y batch';
      return { ...d, ran209: next };
    });
  }

  /** Cobertura de los escenarios mínimos: planes vigentes que los cubren y última prueba (12 meses). */
  readonly scenarioCoverage = computed(() => {
    const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    return MIN_SCENARIOS.map(sc => ({
      scenario: sc,
      plans: this.res.plans().filter(p => p.status === 'Vigente' && p.ran209?.scenarios.includes(sc)).map(p => p.code),
      lastTest: this.res.tests().filter(t => t.ran209?.scenario === sc).map(t => t.date).sort().reverse()[0] as string | undefined,
      tested: this.res.tests().some(t => t.ran209?.scenario === sc && t.date >= yearAgo),
    }));
  });
  setImpact(key: keyof BiaImpact, value: number) { this.biaDraft.update(d => (d ? { ...d, impact: { ...d.impact, [key]: value } } : d)); }
  toggleProvider(id: string, on: boolean) {
    this.biaDraft.update(d => (d ? { ...d, providerIds: on ? [...d.providerIds, id] : d.providerIds.filter(x => x !== id) } : d));
  }
  async saveBia() {
    const d = this.biaDraft();
    if (!d) return;
    if (!d.name.trim()) { this.formError.set('Indique el nombre del proceso.'); return; }
    if (d.rtoHours > d.mtpdHours) { this.formError.set('El RTO no puede superar el MTPD.'); return; }
    await this.res.saveBiaProcess({ ...d, name: d.name.trim() });
    this.notify.emit(`BIA de "${d.name}" guardado.`);
    this.biaDraft.set(null);
  }

  // ---- Planes ----
  newPlan() {
    this.formError.set('');
    const next = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    this.planDraft.set({
      id: this.res.newId('pln'), code: `BCP-${String(this.res.plans().length + 1).padStart(2, '0')}`, name: '',
      type: 'Plan de Continuidad (BCP)', processIds: [], owner: this.rs.currentProfile().name, version: '1.0',
      approvedBy: '', approvalDate: '', nextReviewDate: next, status: 'Borrador',
    });
  }
  readonly evidenceFor = signal<string | null>(null);
  readonly evidence = inject(EvidenceService);
  planSaved(d: ContinuityPlan) { return this.res.plans().some(p => p.id === d.id); }
  planWasVigente(d: ContinuityPlan) { return this.res.plans().find(p => p.id === d.id)?.status === 'Vigente'; }
  nextYear() { return new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10); }
  editPlan(p: ContinuityPlan) { this.formError.set(''); this.planDraft.set({ ...p, processIds: [...p.processIds] }); }
  setPlan<K extends keyof ContinuityPlan>(key: K, value: ContinuityPlan[K]) { this.planDraft.update(d => (d ? { ...d, [key]: value } : d)); }
  togglePlanProcess(id: string, on: boolean) {
    this.planDraft.update(d => (d ? { ...d, processIds: on ? [...d.processIds, id] : d.processIds.filter(x => x !== id) } : d));
  }
  async savePlan() {
    const d = this.planDraft();
    if (!d) return;
    if (!d.name.trim() || !d.code.trim()) { this.formError.set('Indique código y nombre del plan.'); return; }
    if (d.approvalDate && d.nextReviewDate < d.approvalDate) { this.formError.set('La próxima revisión debe ser posterior a la aprobación.'); return; }
    if (d.status === 'Vigente' && !this.planWasVigente(d)) { this.formError.set('El plan queda Vigente al aprobarse: use "Enviar a aprobación".'); return; }
    await this.res.savePlan({ ...d, name: d.name.trim(), code: d.code.trim() });
    this.notify.emit(`Plan ${d.code} guardado.`);
    this.planDraft.set(null);
  }

  // ---- Pruebas ----
  newTest() {
    this.formError.set('');
    const first = this.res.plans()[0];
    this.testDraft.set({
      id: this.res.newId('tst'), planId: first?.id ?? '', date: new Date().toISOString().slice(0, 10),
      type: 'Ejercicio de escritorio', scenario: '', result: 'Exitosa', findings: '', actions: '',
    });
  }
  setTest<K extends keyof ContinuityTest>(key: K, value: ContinuityTest[K]) { this.testDraft.update(d => (d ? { ...d, [key]: value } : d)); }
  async saveTest() {
    const d = this.testDraft();
    if (!d) return;
    if (!d.planId || !d.scenario.trim()) { this.formError.set('Seleccione el plan y describa el escenario.'); return; }
    await this.res.registerTest({ ...d, scenario: d.scenario.trim() });
    this.notify.emit('Prueba de continuidad registrada.');
    this.testDraft.set(null);
    this.tab.set('pruebas');
  }

  // ---- estilos ----
  critClass(c: string) {
    switch (c) {
      case 'Crítico': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Alto': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Medio': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  }
  impactClass(v: number) {
    return v >= 4 ? 'bg-rose-500 text-white' : v === 3 ? 'bg-orange-300 text-orange-950' : v === 2 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900';
  }
  resultClass(r: string) {
    return r === 'Exitosa' ? 'text-emerald-700' : r === 'Con observaciones' ? 'text-amber-700' : 'text-rose-700';
  }
}
