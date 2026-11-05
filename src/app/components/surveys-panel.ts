import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { SurveyService, CampaignDraft } from '../services/survey.service';
import { RiskDataService } from '../services/risk-data.service';
import { CatalogService } from '../services/catalog.service';
import { ResilienceService } from '../services/resilience.service';
import { ComplianceService } from '../services/compliance.service';
import { ActionPlanService } from '../services/action-plan.service';
import {
  CUSTOM_ITEM_TYPES, SURVEY_KINDS, SurveyAnswer, SurveyCampaign, SurveyItem, SurveyKind, SurveyResponse,
} from '../models/survey.model';
import { ActionPlanPriority } from '../models/action-plan.model';
import { SurveyFinding, isAnswered, parseCustomItems } from '../utils/surveys';
import { todayIso } from '../utils/action-plans';
import { downloadCsv } from '../utils/csv';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';

type View = 'mias' | 'campanas';

interface ItemGroup { section: string; items: SurveyItem[] }
interface PlanForm { key: string; title: string; owner: string; dueDate: string; priority: ActionPlanPriority }
interface NewCampaign { id?: string; kind: SurveyKind; title: string; description: string; dueDate: string; scope: string[]; normId: string; respondent: string; onlyGaps: boolean; questions: string; people: string }

/** Autoevaluaciones a dueños de procesos: responder, seguir campañas y revisar respuestas. */
@Component({
  selector: 'app-surveys-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-sky-100 text-sky-800 rounded-lg"><mat-icon class="text-lg">fact_check</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Autoevaluaciones</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Campañas que envían un cuestionario a cada dueño de proceso: autoevaluación de riesgos y controles (RCSA), actualización del BIA,
            cumplimiento de una norma o preguntas propias. Las respuestas se revisan, se aplican a la matriz, al BIA o al cumplimiento,
            y las brechas pasan a planes de acción.
          </p>
        </div>
        @if (sv.canManage()) {
          <button type="button" (click)="startCampaign()" class="shrink-0 px-3.5 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-xl flex items-center gap-1.5 cursor-pointer">
            <mat-icon class="text-sm">playlist_add</mat-icon>Nueva campaña
          </button>
        }
      </div>

      @let k = sv.kpis();
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <button type="button" (click)="setView('mias')" class="text-left bg-white p-3 rounded-xl border cursor-pointer" [class]="view() === 'mias' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mis encuestas</span>
          <span class="text-2xl font-bold font-mono tabular-nums" [class]="k.minePending ? 'text-sky-700' : 'text-slate-400'">{{ k.minePending }}</span>
          <span class="block text-[10px] text-slate-500">por responder</span>
        </button>
        <button type="button" (click)="setView('campanas')" class="text-left bg-white p-3 rounded-xl border cursor-pointer" [class]="view() === 'campanas' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Campañas en curso</span>
          <span class="text-2xl font-bold font-mono tabular-nums text-slate-800">{{ k.activeCampaigns }}</span>
          <span class="block text-[10px] text-slate-500">{{ sv.campaigns().length }} en total</span>
        </button>
        <div class="bg-white p-3 rounded-xl border border-slate-200">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pendientes</span>
          <span class="text-2xl font-bold font-mono tabular-nums text-slate-800">{{ k.pending }}</span>
          <span class="block text-[10px] text-slate-500">sin enviar</span>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Vencidas</span>
          <span class="text-2xl font-bold font-mono tabular-nums" [class]="k.overdue ? 'text-rose-700' : 'text-slate-400'">{{ k.overdue }}</span>
          <span class="block text-[10px] text-slate-500">plazo cumplido sin enviar</span>
        </div>
        <div class="bg-white p-3 rounded-xl border border-slate-200">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Por revisar</span>
          <span class="text-2xl font-bold font-mono tabular-nums" [class]="k.toReview ? 'text-amber-700' : 'text-slate-400'">{{ k.toReview }}</span>
          <span class="block text-[10px] text-slate-500">enviadas sin revisión</span>
        </div>
      </div>

      <!-- ===================== MIS ENCUESTAS ===================== -->
      @if (view() === 'mias') {
        @if (answering(); as r) {
          <ng-container *ngTemplateOutlet="questionnaire; context: { $implicit: r }" />
        } @else {
          <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800">Encuestas asignadas a {{ rs.currentProfile().name }}</div>
            <ul class="divide-y divide-slate-100">
              @for (r of sv.mine(); track r.id) {
                @let c = sv.campaign(r.campaignId);
                @let pr = sv.progress(r);
                <li>
                  <button type="button" (click)="openAnswer(r)" class="w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer flex flex-wrap items-center gap-3">
                    <span class="min-w-0 flex-1">
                      <span class="block text-xs font-semibold text-slate-900">{{ c?.title }} · {{ r.subject }}</span>
                      <span class="block text-[10px] text-slate-500">{{ c?.code }} · {{ kindLabel(c?.kind) }} · {{ r.items.length }} preguntas · plazo
                        <span [class.text-rose-700]="sv.isOverdue(r)" [class.font-bold]="sv.isOverdue(r)">{{ r.dueDate }}</span></span>
                      @if (r.status === 'Devuelta' && r.returnedNote) { <span class="block text-[11px] text-amber-800 mt-0.5">Devuelta: {{ r.returnedNote }}</span> }
                    </span>
                    <span class="w-28 shrink-0"><span class="block h-1.5 rounded-full bg-slate-100 overflow-hidden"><span class="block h-full bg-sky-600 rounded-full" [style.width.%]="pr.pct"></span></span>
                      <span class="block text-[10px] text-slate-500 text-right tabular-nums">{{ pr.answered }} de {{ pr.total }}</span></span>
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" [class]="statusClass(r)">{{ statusLabel(r) }}</span>
                  </button>
                </li>
              } @empty {
                <li class="px-4 py-8 text-center text-xs text-slate-500">No tienes encuestas asignadas en campañas en curso.@if (sv.canManage()) { Revisa las campañas o crea una nueva. }</li>
              }
            </ul>
          </div>
        }
      }

      <!-- ===================== CAMPAÑAS ===================== -->
      @if (view() === 'campanas') {
        @if (creating()) {
          <ng-container *ngTemplateOutlet="campaignForm" />
        } @else if (reviewing(); as r) {
          <ng-container *ngTemplateOutlet="review; context: { $implicit: r }" />
        } @else if (selectedCampaign(); as c) {
          <ng-container *ngTemplateOutlet="campaignDetail; context: { $implicit: c }" />
        } @else {
          <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <ul class="divide-y divide-slate-100">
              @for (c of sv.sortedCampaigns(); track c.id) {
                @let st = sv.stats(c.id);
                <li>
                  <button type="button" (click)="selectedId.set(c.id)" class="w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer flex flex-wrap items-center gap-3">
                    <span class="font-mono text-[10px] text-slate-500 w-20 shrink-0">{{ c.code }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-xs font-semibold text-slate-900">{{ c.title }}</span>
                      <span class="block text-[10px] text-slate-500">{{ kindLabel(c.kind) }} · plazo {{ c.dueDate }} · {{ c.scope.length }} en el alcance</span>
                    </span>
                    @if (c.status !== 'Borrador') {
                      <span class="w-36 shrink-0"><span class="block h-1.5 rounded-full bg-slate-100 overflow-hidden"><span class="block h-full bg-emerald-600 rounded-full" [style.width.%]="st.pct"></span></span>
                        <span class="block text-[10px] text-slate-500 text-right tabular-nums">{{ st.submitted }} de {{ st.total }} respondidas@if (st.toReview) { · {{ st.toReview }} por revisar }</span></span>
                    }
                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" [class]="campaignClass(c)">{{ c.status }}</span>
                  </button>
                </li>
              } @empty {
                <li class="px-4 py-8 text-center text-xs text-slate-500">No hay campañas.@if (sv.canManage()) { Cree la primera con "Nueva campaña". }</li>
              }
            </ul>
          </div>
        }
      }
    </div>

    <!-- ===================== CUESTIONARIO ===================== -->
    <ng-template #questionnaire let-r>
      @let c = sv.campaign(r.campaignId);
      @let editable = canAnswer(r);
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <button type="button" (click)="closeAnswer()" class="text-[11px] text-emerald-700 hover:underline cursor-pointer flex items-center gap-0.5"><mat-icon class="text-[14px] w-3.5 h-3.5">arrow_back</mat-icon>Volver</button>
            <h2 class="text-sm font-bold text-slate-900 mt-1">{{ c?.title }} · {{ r.subject }}</h2>
            <p class="text-[11px] text-slate-500">{{ c?.code }} · {{ kindLabel(c?.kind) }} · responde {{ r.respondent }} · plazo <span [class.text-rose-700]="sv.isOverdue(r)">{{ r.dueDate }}</span></p>
            @if (c?.description) { <p class="text-[11px] text-slate-600 mt-1 max-w-3xl">{{ c?.description }}</p> }
          </div>
          <div class="text-right">
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" [class]="statusClass(r)">{{ statusLabel(r) }}</span>
            <span class="block text-[10px] text-slate-500 mt-1 tabular-nums">{{ answeredCount(r) }} de {{ r.items.length }} respondidas</span>
          </div>
        </div>
        @if (r.status === 'Devuelta' && r.returnedNote) {
          <div class="mx-4 mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900"><strong>Devuelta para completar:</strong> {{ r.returnedNote }}</div>
        }
        @if (!editable && isOpenResponse(r)) {
          <div class="mx-4 mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700">Vista de consulta: solo {{ r.respondent }} puede responder esta encuesta.</div>
        }
        <div class="p-4 space-y-4">
          @for (g of groups(r); track g.section) {
            <fieldset class="rounded-xl border border-slate-200">
              <legend class="mx-3 px-1.5 text-[11px] font-bold text-slate-800">{{ g.section }}</legend>
              <div class="px-3 pb-3 space-y-3">
                @for (it of g.items; track it.id) {
                  @let v = answerOf(r, it.id);
                  <div>
                    <div class="flex flex-wrap items-baseline justify-between gap-2">
                      <span class="text-xs text-slate-900" [id]="'q-' + it.id">{{ it.label }}@if (it.required) { <span class="text-rose-700"> *</span> }</span>
                      @if (it.current !== undefined && it.current !== '' && it.type !== 'texto') { <span class="text-[10px] text-slate-500">Vigente: <strong>{{ currentLabel(it) }}</strong></span> }
                    </div>
                    @if (it.help) { <p class="text-[10px] text-slate-500 mt-0.5">{{ it.help }}</p> }
                    <div class="mt-1.5" role="group" [attr.aria-labelledby]="'q-' + it.id">
                      @switch (it.type) {
                        @case ('probabilidad') { <ng-container *ngTemplateOutlet="choices; context: { r, it, v, opts: scaleOpts('likelihood'), editable }" /> }
                        @case ('impacto') { <ng-container *ngTemplateOutlet="choices; context: { r, it, v, opts: scaleOpts('impact'), editable }" /> }
                        @case ('si-no') { <ng-container *ngTemplateOutlet="choices; context: { r, it, v, opts: yesNo, editable }" /> }
                        @case ('si-parcial-no') { <ng-container *ngTemplateOutlet="choices; context: { r, it, v, opts: yesPartialNo, editable }" /> }
                        @case ('escala-5') { <ng-container *ngTemplateOutlet="choices; context: { r, it, v, opts: scale5, editable }" /> }
                        @case ('opcion') { <ng-container *ngTemplateOutlet="choices; context: { r, it, v, opts: optionsOf(it), editable }" /> }
                        @case ('texto') {
                          <textarea [id]="'a-' + it.id" rows="2" [class]="inputCls" [disabled]="!editable" [value]="v ?? ''" (input)="setAnswer(it.id, $any($event.target).value)"></textarea>
                        }
                        @default {
                          <input [id]="'a-' + it.id" type="number" min="0" step="1" [class]="inputCls + ' max-w-[10rem]'" [disabled]="!editable" [value]="v ?? ''" (input)="setAnswer(it.id, $any($event.target).value === '' ? null : +$any($event.target).value)" />
                          @if (it.type === 'horas') { <span class="text-[10px] text-slate-500 ml-1.5">horas</span> }
                        }
                      }
                    </div>
                  </div>
                }
              </div>
            </fieldset>
          }
        </div>
        @if (editable) {
          <div class="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
            @if (answerError()) { <span class="text-[11px] text-rose-700 mr-auto" role="alert">{{ answerError() }}</span> }
            <button type="button" (click)="saveAnswers(r, false)" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Guardar avance</button>
            <button type="button" (click)="saveAnswers(r, true)" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer">Enviar respuestas</button>
          </div>
        }
      </div>
    </ng-template>

    <ng-template #choices let-r="r" let-it="it" let-v="v" let-opts="opts" let-editable="editable">
      <div class="flex flex-wrap gap-1.5">
        @for (o of opts; track o.value) {
          <button type="button" [disabled]="!editable" (click)="setAnswer(it.id, o.value)" [attr.aria-pressed]="v === o.value"
            class="px-2.5 py-1.5 text-[11px] rounded-lg border cursor-pointer disabled:cursor-default"
            [class]="v === o.value ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'"
            [class.ring-2]="o.value === it.current && v !== o.value" [class.ring-emerald-200]="o.value === it.current && v !== o.value" [title]="o.title ?? ''">{{ o.label }}</button>
        }
      </div>
    </ng-template>

    <!-- ===================== DETALLE DE CAMPAÑA ===================== -->
    <ng-template #campaignDetail let-c>
      @let st = sv.stats(c.id);
      <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <button type="button" (click)="selectedId.set(null)" class="text-[11px] text-emerald-700 hover:underline cursor-pointer flex items-center gap-0.5"><mat-icon class="text-[14px] w-3.5 h-3.5">arrow_back</mat-icon>Campañas</button>
            <h2 class="text-sm font-bold text-slate-900 mt-1"><span class="font-mono text-[11px] text-slate-500 mr-1">{{ c.code }}</span>{{ c.title }}</h2>
            <p class="text-[11px] text-slate-500">{{ kindLabel(c.kind) }} · plazo {{ c.dueDate }} · creada por {{ c.createdBy }}@if (c.launchedAt) { · lanzada el {{ c.launchedAt | date: 'dd-MM-yyyy' }} }</p>
            @if (c.description) { <p class="text-[11px] text-slate-600 mt-1 max-w-3xl">{{ c.description }}</p> }
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" [class]="campaignClass(c)">{{ c.status }}</span>
            @if (sv.canManage()) {
              @if (c.status === 'Borrador') {
                <button type="button" (click)="editCampaign(c)" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Editar</button>
                <button type="button" (click)="launch(c)" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">send</mat-icon>Lanzar</button>
              }
              @if (c.status === 'En curso') {
                <button type="button" (click)="exportCampaign(c)" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">download</mat-icon>Exportar</button>
                <button type="button" (click)="confirm.set(confirm() === 'close' ? '' : 'close')" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Cerrar campaña</button>
              }
              @if (c.status === 'Cerrada') {
                <button type="button" (click)="exportCampaign(c)" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">download</mat-icon>Exportar</button>
              }
              <button type="button" (click)="confirm.set(confirm() === 'delete' ? '' : 'delete')" class="p-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer" aria-label="Eliminar campaña"><mat-icon class="text-sm">delete</mat-icon></button>
            }
          </div>
        </div>
        @if (confirm() === 'close') {
          <div class="px-4 py-2.5 bg-amber-50 border-b border-amber-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-amber-900">
            <span>Al cerrar, las {{ st.total - st.submitted }} encuestas sin enviar ya no se podrán responder. Las enviadas se pueden seguir revisando.</span>
            <button type="button" (click)="closeCampaign(c)" class="px-2.5 py-1 font-semibold rounded-lg bg-amber-700 text-white cursor-pointer">Cerrar campaña</button>
          </div>
        }
        @if (confirm() === 'delete') {
          <div class="px-4 py-2.5 bg-rose-50 border-b border-rose-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-900">
            <span>¿Eliminar la campaña y sus {{ st.total }} encuestas? La bitácora conserva el registro.</span>
            <button type="button" (click)="removeCampaign(c)" class="px-2.5 py-1 font-semibold rounded-lg bg-rose-700 text-white cursor-pointer">Eliminar</button>
          </div>
        }

        @if (c.status === 'Borrador') {
          @let preview = sv.previewResponses(c);
          <div class="p-4 text-xs text-slate-700 space-y-2">
            <p>Al lanzarla se enviarán <strong>{{ preview.length }} encuestas</strong> con {{ questionCount(preview) }} preguntas en total.@if (unassignedCount(preview)) { <span class="text-rose-700"> {{ unassignedCount(preview) }} sin responsable: asigne un dueño en Mantenedores → Procesos o en el BIA, o reasígnelas después del lanzamiento.</span> }</p>
            <ul class="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              @for (p of preview; track p.subject) { <li class="px-3 py-1.5 flex justify-between gap-2 text-[11px]"><span>{{ p.subject }}</span><span class="text-slate-500">{{ p.respondent }} · {{ p.items.length }} preguntas</span></li> }
            </ul>
          </div>
        } @else {
          <div class="px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] border-b border-slate-100">
            <div><span class="block text-[10px] text-slate-500">Encuestas</span><strong class="tabular-nums">{{ st.total }}</strong></div>
            <div><span class="block text-[10px] text-slate-500">Respondidas</span><strong class="tabular-nums">{{ st.submitted }} ({{ st.pct }} %)</strong></div>
            <div><span class="block text-[10px] text-slate-500">Por revisar</span><strong class="tabular-nums" [class.text-amber-700]="st.toReview">{{ st.toReview }}</strong></div>
            <div><span class="block text-[10px] text-slate-500">Vencidas</span><strong class="tabular-nums" [class.text-rose-700]="st.overdue">{{ st.overdue }}</strong></div>
            <div><span class="block text-[10px] text-slate-500">Observaciones</span><strong class="tabular-nums">{{ st.findings }}</strong></div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs min-w-[640px]">
              <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>
                <th class="text-left py-2 px-4">Proceso o tema</th><th class="text-left py-2 px-3">Responde</th><th class="text-right py-2 px-3">Avance</th>
                <th class="text-left py-2 px-3">Estado</th><th class="text-right py-2 px-3">Observaciones</th><th class="py-2 px-4"></th></tr></thead>
              <tbody class="divide-y divide-slate-100">
                @for (r of sv.responsesOf(c.id); track r.id) {
                  @let pr = sv.progress(r);
                  <tr>
                    <td class="py-2 px-4 font-semibold text-slate-800">{{ r.subject }}</td>
                    <td class="py-2 px-3">
                      @if (reassigning() === r.id) {
                        <span class="flex gap-1"><input [id]="'re-' + r.id" [class]="inputCls" list="sv-people" [value]="reassignTo()" (input)="reassignTo.set($any($event.target).value)" />
                          <button type="button" (click)="reassign(r)" class="px-2 text-[11px] rounded-lg bg-slate-900 text-white cursor-pointer">OK</button></span>
                      } @else {
                        <span [class.text-rose-700]="r.respondent === 'Sin asignar'">{{ r.respondent }}</span>
                        @if (sv.canManage() && isOpenResponse(r) && c.status === 'En curso') { <button type="button" (click)="reassigning.set(r.id); reassignTo.set(r.respondent === 'Sin asignar' ? '' : r.respondent)" class="ml-1 text-[10px] text-emerald-700 hover:underline cursor-pointer">Reasignar</button> }
                      }
                    </td>
                    <td class="py-2 px-3 text-right tabular-nums text-slate-600">{{ pr.answered }}/{{ pr.total }}</td>
                    <td class="py-2 px-3"><span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" [class]="statusClass(r)">{{ statusLabel(r) }}</span></td>
                    <td class="py-2 px-3 text-right tabular-nums">{{ r.status === 'Enviada' || r.status === 'Revisada' ? sv.findings(r).length : '—' }}</td>
                    <td class="py-2 px-4 text-right">
                      @if (r.status === 'Enviada' || r.status === 'Revisada') {
                        <button type="button" (click)="openReview(r)" class="px-2 py-1 text-[11px] rounded-lg cursor-pointer" [class]="r.status === 'Enviada' && sv.canManage() ? 'bg-emerald-700 text-white hover:bg-emerald-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'">{{ r.status === 'Enviada' && sv.canManage() ? 'Revisar' : 'Ver' }}</button>
                      } @else {
                        <button type="button" (click)="openAnswerFromCampaign(r)" class="px-2 py-1 text-[11px] rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer">{{ sv.isMine(r) ? 'Responder' : 'Ver' }}</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
      <datalist id="sv-people">@for (u of people(); track u) { <option [value]="u"></option> }</datalist>
    </ng-template>

    <!-- ===================== REVISIÓN ===================== -->
    <ng-template #review let-r>
      @let c = sv.campaign(r.campaignId);
      @let fs = sv.findings(r);
      <div class="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <div class="xl:col-span-3 bg-white rounded-2xl border border-slate-200 overflow-hidden min-w-0">
          <div class="px-4 py-3 border-b border-slate-100">
            <button type="button" (click)="reviewId.set(null)" class="text-[11px] text-emerald-700 hover:underline cursor-pointer flex items-center gap-0.5"><mat-icon class="text-[14px] w-3.5 h-3.5">arrow_back</mat-icon>{{ c?.code }} {{ c?.title }}</button>
            <h2 class="text-sm font-bold text-slate-900 mt-1">{{ r.subject }}</h2>
            <p class="text-[11px] text-slate-500">Respondió {{ r.respondent }}@if (r.submittedAt) { el {{ r.submittedAt | date: 'dd-MM-yyyy' }} }@if (r.reviewedBy) { · revisada por {{ r.reviewedBy }} el {{ r.reviewedAt | date: 'dd-MM-yyyy' }} }</p>
          </div>
          <div class="px-4 py-3 space-y-2">
            <h3 class="text-[11px] font-bold text-slate-800">Observaciones ({{ fs.length }})</h3>
            @for (f of fs; track f.itemId) {
              <div class="rounded-lg border p-2.5" [class]="f.kind === 'brecha' ? 'border-rose-200 bg-rose-50/40' : f.kind === 'cambio' ? 'border-sky-200 bg-sky-50/40' : 'border-amber-200 bg-amber-50/40'">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <span class="text-[9px] font-bold uppercase tracking-wide" [class]="f.kind === 'brecha' ? 'text-rose-700' : f.kind === 'cambio' ? 'text-sky-700' : 'text-amber-700'">{{ f.kind }}</span>
                    <span class="block text-[11px] font-semibold text-slate-800">{{ f.section }}</span>
                    <span class="block text-[11px] text-slate-700">{{ f.text }}</span>
                  </div>
                  @if (sv.canManage()) {
                    <div class="flex flex-wrap gap-1.5 shrink-0">
                      @if (sv.applyLabel(f); as al) {
                        @if (sv.isApplied(r, f)) { <span class="text-[10px] font-semibold text-emerald-700 flex items-center gap-0.5"><mat-icon class="text-[14px] w-3.5 h-3.5">check</mat-icon>Aplicado</span> }
                        @else { <button type="button" (click)="apply(r, f)" class="px-2 py-1 text-[10px] font-semibold rounded-lg bg-sky-700 text-white hover:bg-sky-600 cursor-pointer">{{ al }}</button> }
                      }
                      @if (f.kind === 'brecha' || f.kind === 'alerta') {
                        @if (planFor()?.key === r.id + f.itemId) {} @else {
                          <button type="button" (click)="startPlan(r, f)" class="px-2 py-1 text-[10px] font-semibold rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer">Crear plan de acción</button>
                        }
                      }
                    </div>
                  }
                </div>
                @if (planFor(); as pf) {
                  @if (pf.key === r.id + f.itemId) {
                    <div class="mt-2 grid grid-cols-1 sm:grid-cols-6 gap-2">
                      <input [id]="'pf-title-' + f.itemId" [class]="inputCls + ' sm:col-span-6'" [value]="pf.title" (input)="setPlan('title', $any($event.target).value)" placeholder="Qué se hará" />
                      <input [id]="'pf-owner-' + f.itemId" [class]="inputCls + ' sm:col-span-3'" list="sv-people" [value]="pf.owner" (input)="setPlan('owner', $any($event.target).value)" placeholder="Responsable" />
                      <input [id]="'pf-due-' + f.itemId" type="date" [class]="inputCls + ' sm:col-span-2'" [value]="pf.dueDate" (input)="setPlan('dueDate', $any($event.target).value)" />
                      <select [id]="'pf-prio-' + f.itemId" [class]="inputCls" (change)="setPlan('priority', $any($event.target).value)">
                        @for (p of priorities; track p) { <option [value]="p" [selected]="p === pf.priority">{{ p }}</option> }
                      </select>
                      <div class="sm:col-span-6 flex justify-end gap-2">
                        <button type="button" (click)="planFor.set(null)" class="px-2.5 py-1 text-[11px] rounded-lg bg-white border border-slate-300 cursor-pointer">Cancelar</button>
                        <button type="button" (click)="createPlan(r, f)" class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-700 text-white cursor-pointer">Crear plan</button>
                      </div>
                    </div>
                  }
                }
                @if (linkedPlans(r, f).length) {
                  <div class="mt-1.5 flex flex-wrap gap-1">
                    @for (p of linkedPlans(r, f); track p.id) {
                      <button type="button" (click)="actionPlans.open(p.id)" class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 cursor-pointer">{{ p.code }} · {{ p.status.toLowerCase() }}</button>
                    }
                  </div>
                }
              </div>
            } @empty {
              <p class="text-[11px] text-slate-500">Sin observaciones: las respuestas coinciden con lo registrado y no declaran brechas.</p>
            }
          </div>
          @if (sv.canManage() && r.status === 'Enviada') {
            <div class="px-4 py-3 border-t border-slate-100 bg-slate-50 space-y-2">
              <input id="sv-review-note" [class]="inputCls" [value]="reviewNote()" (input)="reviewNote.set($any($event.target).value)" placeholder="Observación de la revisión (obligatoria para devolver)" />
              <div class="flex flex-wrap justify-end gap-2">
                <button type="button" (click)="returnResponse(r)" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Devolver a {{ r.respondent }}</button>
                <button type="button" (click)="markReviewed(r)" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer">Marcar como revisada</button>
              </div>
            </div>
          }
          @if (r.reviewNote) { <p class="px-4 py-2 text-[11px] text-slate-600 border-t border-slate-100"><strong>Revisión:</strong> {{ r.reviewNote }}</p> }
        </div>

        <div class="xl:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden min-w-0">
          <h3 class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-800">Respuestas</h3>
          <div class="max-h-[640px] overflow-y-auto divide-y divide-slate-100">
            @for (g of groups(r); track g.section) {
              <div class="px-4 py-2">
                <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{{ g.section }}</div>
                @for (it of g.items; track it.id) {
                  <div class="text-[11px] py-0.5">
                    <span class="text-slate-500">{{ it.label }}</span>
                    <span class="block font-semibold" [class]="isAnsweredItem(r, it) ? 'text-slate-900' : 'text-slate-400'">{{ answerLabel(r, it) }}@if (changed(r, it)) { <span class="font-normal text-sky-700"> (vigente {{ currentLabel(it) }})</span> }</span>
                  </div>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </ng-template>

    <!-- ===================== NUEVA CAMPAÑA ===================== -->
    <ng-template #campaignForm>
      @let f = form();
      <div class="bg-white rounded-2xl border border-emerald-300 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 class="text-sm font-bold text-slate-900">{{ f.id ? 'Editar campaña' : 'Nueva campaña de autoevaluación' }}</h2>
          <button type="button" (click)="creating.set(false)" class="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer" aria-label="Cerrar"><mat-icon class="text-[18px] w-[18px] h-[18px]">close</mat-icon></button>
        </div>
        <div class="p-4 space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" role="radiogroup" aria-label="Tipo de campaña">
            @for (kd of kinds; track kd.id) {
              <button type="button" role="radio" [attr.aria-checked]="f.kind === kd.id" (click)="setKind(kd.id)" [disabled]="!!f.id"
                class="text-left p-3 rounded-xl border cursor-pointer disabled:cursor-default" [class]="f.kind === kd.id ? 'border-emerald-500 ring-2 ring-emerald-200 bg-emerald-50/40' : 'border-slate-200 hover:border-slate-300'">
                <span class="block text-xs font-bold text-slate-900">{{ kd.label }}</span>
                <span class="block text-[10px] text-slate-600 mt-0.5">{{ kd.hint }}</span>
              </button>
            }
          </div>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            <label class="block md:col-span-3"><span class="block text-[10px] text-slate-600 mb-0.5">Nombre *</span>
              <input id="sv-title" [class]="inputCls" [value]="f.title" (input)="setForm('title', $any($event.target).value)" placeholder="RCSA 2026 segundo semestre" /></label>
            <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Plazo para responder *</span>
              <input id="sv-due" type="date" [class]="inputCls" [value]="f.dueDate" (input)="setForm('dueDate', $any($event.target).value)" /></label>
            <label class="block md:col-span-4"><span class="block text-[10px] text-slate-600 mb-0.5">Instrucciones para quienes responden</span>
              <textarea id="sv-desc" rows="2" [class]="inputCls" [value]="f.description" (input)="setForm('description', $any($event.target).value)"></textarea></label>
          </div>

          @switch (f.kind) {
            @case ('RCSA') {
              <div>
                <div class="flex items-center justify-between mb-1"><span class="text-[11px] font-semibold text-slate-800">Procesos (una encuesta por proceso, para su dueño)</span>
                  <button type="button" (click)="selectAll(rcsaOptions())" class="text-[10px] text-emerald-700 hover:underline cursor-pointer">Seleccionar los que tienen riesgos o controles</button></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-72 overflow-y-auto border border-slate-200 rounded-lg p-2">
                  @for (o of rcsaOptions(); track o.id) {
                    <label class="flex items-center gap-2 text-[11px] px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" class="rounded text-emerald-600" [checked]="f.scope.includes(o.id)" (change)="toggleScope(o.id)" />
                      <span class="flex-1 min-w-0 truncate">{{ o.label }}</span><span class="text-slate-500 shrink-0">{{ o.hint }}</span></label>
                  }
                </div>
              </div>
            }
            @case ('BIA') {
              <div>
                <div class="flex items-center justify-between mb-1"><span class="text-[11px] font-semibold text-slate-800">Procesos del BIA (una encuesta por proceso, para su dueño)</span>
                  <button type="button" (click)="selectAll(biaOptions())" class="text-[10px] text-emerald-700 hover:underline cursor-pointer">Seleccionar todos</button></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-72 overflow-y-auto border border-slate-200 rounded-lg p-2">
                  @for (o of biaOptions(); track o.id) {
                    <label class="flex items-center gap-2 text-[11px] px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" class="rounded text-emerald-600" [checked]="f.scope.includes(o.id)" (change)="toggleScope(o.id)" />
                      <span class="flex-1 min-w-0 truncate">{{ o.label }}</span><span class="text-slate-500 shrink-0">{{ o.hint }}</span></label>
                  }
                </div>
              </div>
            }
            @case ('Cumplimiento') {
              <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Norma *</span>
                  <select id="sv-norm" [class]="inputCls" (change)="setNorm($any($event.target).value)">
                    <option value="" [selected]="!f.normId">Elija una norma</option>
                    @for (n of comp.sortedNorms(); track n.id) { <option [value]="n.id" [selected]="n.id === f.normId">{{ n.code }} · {{ n.title }}</option> }
                  </select></label>
                <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Responde *</span>
                  <input id="sv-respondent" [class]="inputCls" list="sv-people-form" [value]="f.respondent" (input)="setForm('respondent', $any($event.target).value)" /></label>
                <label class="flex items-end gap-2 text-[11px] pb-1.5 cursor-pointer"><input type="checkbox" class="rounded text-emerald-600" [checked]="f.onlyGaps" (change)="setOnlyGaps($any($event.target).checked)" />Solo requisitos sin evaluar o con brecha</label>
                @if (f.normId) { <p class="md:col-span-3 text-[11px] text-slate-600">{{ f.scope.length }} requisitos en el cuestionario.</p> }
              </div>
            }
            @case ('Personalizada') {
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Preguntas * (una por línea; "*" al inicio = obligatoria; tipo después de "|")</span>
                  <textarea id="sv-questions" rows="7" [class]="inputCls + ' font-mono'" [value]="f.questions" (input)="setForm('questions', $any($event.target).value)"
                    placeholder="*¿Conoce el procedimiento de reporte de incidentes? | si-no&#10;¿Qué tan preparado está su equipo para una contingencia? | escala-5&#10;Comentarios"></textarea>
                  <span class="block text-[10px] text-slate-500 mt-0.5">Tipos: {{ customTypes }}</span></label>
                <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Enviar a * (una persona por línea)</span>
                  <textarea id="sv-people" rows="7" [class]="inputCls" [value]="f.people" (input)="setForm('people', $any($event.target).value)"></textarea>
                  <button type="button" (click)="setForm('people', people().join('\n'))" class="text-[10px] text-emerald-700 hover:underline cursor-pointer mt-0.5">Agregar a todos los usuarios activos</button></label>
                @if (customParsed().errors.length) { <ul class="md:col-span-2 text-[11px] text-rose-700 list-disc pl-4">@for (e of customParsed().errors; track e) { <li>{{ e }}</li> }</ul> }
              </div>
            }
          }
          <datalist id="sv-people-form">@for (u of people(); track u) { <option [value]="u"></option> }</datalist>
          @if (formError()) { <p class="text-[11px] text-rose-700" role="alert">{{ formError() }}</p> }
        </div>
        <div class="px-4 py-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button type="button" (click)="creating.set(false)" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
          <button type="button" (click)="saveCampaign(false)" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Guardar borrador</button>
          <button type="button" (click)="saveCampaign(true)" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">send</mat-icon>Guardar y lanzar</button>
        </div>
      </div>
    </ng-template>
  `,
})
export class SurveysPanel {
  readonly sv = inject(SurveyService);
  readonly rs = inject(RiskDataService);
  readonly cat = inject(CatalogService);
  readonly res = inject(ResilienceService);
  readonly comp = inject(ComplianceService);
  readonly actionPlans = inject(ActionPlanService);
  readonly notify = output<string>();

  readonly inputCls = INPUT;
  readonly kinds = SURVEY_KINDS;
  readonly priorities: ActionPlanPriority[] = ['Alta', 'Media', 'Baja'];
  readonly customTypes = CUSTOM_ITEM_TYPES.map(t => t.id).join(', ');
  readonly yesNo = [{ value: 'Sí', label: 'Sí' }, { value: 'No', label: 'No' }];
  readonly yesPartialNo = [{ value: 'Sí', label: 'Sí' }, { value: 'Parcial', label: 'Parcial' }, { value: 'No', label: 'No' }];
  readonly scale5 = [1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) }));

  readonly view = signal<View>(this.sv.mine().some(r => this.sv.isOpen(r)) || !this.sv.canManage() ? 'mias' : 'campanas');
  readonly answerId = signal<string | null>(null);
  readonly draft = signal<Record<string, SurveyAnswer>>({});
  readonly answerError = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly reviewId = signal<string | null>(null);
  readonly reviewNote = signal('');
  readonly confirm = signal<'' | 'close' | 'delete'>('');
  readonly reassigning = signal<string | null>(null);
  readonly reassignTo = signal('');
  readonly planFor = signal<PlanForm | null>(null);
  readonly creating = signal(false);
  readonly formError = signal('');
  readonly form = signal<NewCampaign>(this.emptyForm('RCSA'));

  constructor() {
    // Encuesta pedida desde un aviso: se responde (si es propia y abierta) o se revisa (quien administra).
    effect(() => {
      const req = this.sv.openRequest();
      if (!req) return;
      untracked(() => {
        this.sv.openRequest.set(null);
        const r = this.sv.responses().find(x => x.id === req.id);
        if (!r) return;
        if (this.sv.isMine(r) && this.sv.isOpen(r)) { this.openAnswer(r); return; }
        if (this.sv.canManage()) {
          this.view.set('campanas');
          this.selectedId.set(r.campaignId);
          if (r.status === 'Enviada' || r.status === 'Revisada') this.openReview(r);
          return;
        }
        this.openAnswer(r);
      });
    });
    // Si la encuesta abierta cambia (otro dispositivo o recarga), el borrador local se conserva.
    effect(() => {
      const id = this.answerId();
      if (!id) return;
      untracked(() => { if (!this.sv.responses().some(r => r.id === id)) this.answerId.set(null); });
    });
  }

  readonly answering = computed(() => (this.answerId() ? this.sv.responses().find(r => r.id === this.answerId()) ?? null : null));
  readonly reviewing = computed(() => (this.reviewId() ? this.sv.responses().find(r => r.id === this.reviewId()) ?? null : null));
  readonly selectedCampaign = computed(() => (this.selectedId() ? this.sv.campaign(this.selectedId()!) ?? null : null));
  readonly people = computed(() => [...new Set(this.rs.userProfiles().filter(u => u.active !== false).map(u => u.name))].sort((a, b) => a.localeCompare(b, 'es')));

  readonly rcsaOptions = computed(() => this.cat.processes().filter(p => p.active !== false).map(p => {
    const risks = this.rs.risks().filter(r => r.process === p.name && r.status !== 'Cerrado').length;
    const controls = this.rs.controls().filter(c => c.process === p.name).length;
    return { id: p.name, label: `${p.code} ${p.name}`, hint: `${risks} riesgos · ${controls} controles · ${p.owner || 'sin dueño'}`, useful: risks + controls > 0 };
  }));

  readonly biaOptions = computed(() => this.res.biaProcesses().map(b => ({ id: b.id, label: b.name, hint: `RTO ${b.rtoHours} h · ${b.owner || 'sin dueño'}`, useful: true })));
  readonly customParsed = computed(() => parseCustomItems(this.form().questions));

  // ---------------------------------------------------------------------------
  // Utilidades de presentación
  // ---------------------------------------------------------------------------

  kindLabel(k?: SurveyKind) {
    return SURVEY_KINDS.find(x => x.id === k)?.label ?? k ?? '';
  }

  isOpenResponse(r: SurveyResponse) {
    return this.sv.isOpen(r);
  }

  canAnswer(r: SurveyResponse) {
    return this.sv.isOpen(r) && this.sv.isMine(r) && this.sv.campaign(r.campaignId)?.status === 'En curso';
  }

  statusLabel(r: SurveyResponse) {
    return this.sv.isOverdue(r) ? `Vencida · ${r.status}` : r.status;
  }

  statusClass(r: SurveyResponse) {
    if (this.sv.isOverdue(r)) return 'bg-rose-100 text-rose-800';
    switch (r.status) {
      case 'Pendiente': return 'bg-slate-100 text-slate-700';
      case 'En progreso': return 'bg-sky-100 text-sky-800';
      case 'Devuelta': return 'bg-amber-100 text-amber-800';
      case 'Enviada': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-emerald-100 text-emerald-800';
    }
  }

  campaignClass(c: SurveyCampaign) {
    return c.status === 'En curso' ? 'bg-sky-100 text-sky-800' : c.status === 'Borrador' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800';
  }

  groups(r: SurveyResponse): ItemGroup[] {
    const out: ItemGroup[] = [];
    for (const it of r.items) {
      const g = out.find(x => x.section === it.section);
      if (g) g.items.push(it); else out.push({ section: it.section, items: [it] });
    }
    return out;
  }

  scaleOpts(kind: 'likelihood' | 'impact') {
    return this.cat.riskScale()[kind].map(l => ({ value: l.level, label: `${l.level} ${l.name}`, title: l.criteria }));
  }

  optionsOf(it: SurveyItem) {
    return (it.options ?? []).map(o => ({ value: o, label: o }));
  }

  /** Respuesta mostrada: el borrador si es la encuesta que se responde; si no, la guardada. */
  answerOf(r: SurveyResponse, id: string): SurveyAnswer | undefined {
    return this.answerId() === r.id ? this.draft()[id] : r.answers[id];
  }

  answeredCount(r: SurveyResponse) {
    const a = this.answerId() === r.id ? this.draft() : r.answers;
    return r.items.filter(i => isAnswered(a[i.id])).length;
  }

  currentLabel(it: SurveyItem) {
    if (it.type === 'probabilidad') return `${it.current} ${this.cat.likelihoodName(Number(it.current))}`;
    if (it.type === 'impacto') return `${it.current} ${this.cat.impactName(Number(it.current))}`;
    return String(it.current ?? '—');
  }

  isAnsweredItem(r: SurveyResponse, it: SurveyItem) {
    return isAnswered(r.answers[it.id]);
  }

  answerLabel(r: SurveyResponse, it: SurveyItem) {
    const v = r.answers[it.id];
    if (!isAnswered(v)) return 'Sin respuesta';
    if (it.type === 'probabilidad') return `${v} ${this.cat.likelihoodName(Number(v))}`;
    if (it.type === 'impacto') return `${v} ${this.cat.impactName(Number(v))}`;
    if (it.type === 'horas') return `${v} h`;
    return String(v);
  }

  changed(r: SurveyResponse, it: SurveyItem) {
    const v = r.answers[it.id];
    return isAnswered(v) && it.current !== undefined && it.type !== 'texto' && String(v) !== String(it.current);
  }

  questionCount(p: { items: SurveyItem[] }[]) {
    return p.reduce((s, x) => s + x.items.length, 0);
  }

  unassignedCount(p: { respondent: string }[]) {
    return p.filter(x => !x.respondent.trim() || x.respondent === 'Sin asignar').length;
  }

  linkedPlans(r: SurveyResponse, f: SurveyFinding) {
    const all = this.actionPlans.plans();
    return all.filter(p => p.description.includes(`(${r.subject})`) && (p.sourceId === f.ref?.id || p.sourceId === `${r.id}::${f.itemId}`) && p.status !== 'Cancelado');
  }

  // ---------------------------------------------------------------------------
  // Responder
  // ---------------------------------------------------------------------------

  setView(v: View) {
    this.view.set(v);
    this.answerId.set(null);
    this.reviewId.set(null);
    this.creating.set(false);
  }

  openAnswer(r: SurveyResponse) {
    this.answerError.set('');
    this.draft.set({ ...r.answers });
    this.answerId.set(r.id);
    this.view.set('mias');
  }

  openAnswerFromCampaign(r: SurveyResponse) {
    this.openAnswer(r);
  }

  closeAnswer() {
    this.answerId.set(null);
  }

  setAnswer(id: string, v: SurveyAnswer) {
    this.draft.update(d => ({ ...d, [id]: v }));
  }

  async saveAnswers(r: SurveyResponse, submit: boolean) {
    this.answerError.set('');
    try {
      await this.sv.saveAnswers(r.id, this.draft(), submit);
      this.notify.emit(submit ? 'Respuestas enviadas. Gracias.' : 'Avance guardado.');
      if (submit) this.answerId.set(null);
    } catch (err) {
      this.answerError.set((err as Error).message);
    }
  }

  // ---------------------------------------------------------------------------
  // Campañas
  // ---------------------------------------------------------------------------

  private emptyForm(kind: SurveyKind): NewCampaign {
    const due = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
    return { kind, title: '', description: '', dueDate: due, scope: [], normId: '', respondent: '', onlyGaps: true, questions: '', people: '' };
  }

  startCampaign() {
    this.formError.set('');
    this.form.set(this.emptyForm('RCSA'));
    this.creating.set(true);
    this.view.set('campanas');
    this.selectedId.set(null);
    this.reviewId.set(null);
  }

  editCampaign(c: SurveyCampaign) {
    this.formError.set('');
    this.form.set({
      ...this.emptyForm(c.kind), id: c.id, title: c.title, description: c.description, dueDate: c.dueDate, scope: [...c.scope],
      normId: c.normId ?? '', respondent: c.respondent ?? '', onlyGaps: false,
      questions: (c.customItems ?? []).map(i => `${i.required ? '*' : ''}${i.label} | ${i.type}`).join('\n'),
      people: c.kind === 'Personalizada' ? c.scope.join('\n') : '',
    });
    this.creating.set(true);
  }

  setForm<K extends keyof NewCampaign>(k: K, v: NewCampaign[K]) {
    this.form.update(f => ({ ...f, [k]: v }));
  }

  setKind(k: SurveyKind) {
    this.form.update(f => ({ ...this.emptyForm(k), title: f.title, description: f.description, dueDate: f.dueDate }));
  }

  toggleScope(id: string) {
    this.form.update(f => ({ ...f, scope: f.scope.includes(id) ? f.scope.filter(x => x !== id) : [...f.scope, id] }));
  }

  selectAll(opts: { id: string; useful: boolean }[]) {
    this.form.update(f => ({ ...f, scope: opts.filter(o => o.useful).map(o => o.id) }));
  }

  private complianceScope(normId: string, onlyGaps: boolean) {
    return this.comp.sorted().filter(r => r.chapter === normId && (!onlyGaps || ['Sin evaluar', 'No cumple', 'Cumple parcialmente'].includes(r.status))).map(r => r.id);
  }

  setNorm(normId: string) {
    const n = this.comp.norm(normId);
    this.form.update(f => ({ ...f, normId, respondent: f.respondent || n?.owner || '', scope: this.complianceScope(normId, f.onlyGaps), title: f.title || (n ? `Autoevaluación ${n.code}` : '') }));
  }

  setOnlyGaps(v: boolean) {
    this.form.update(f => ({ ...f, onlyGaps: v, scope: f.normId ? this.complianceScope(f.normId, v) : f.scope }));
  }

  async saveCampaign(launch: boolean) {
    const f = this.form();
    this.formError.set('');
    try {
      let customItems: SurveyItem[] | undefined;
      let scope = f.scope;
      if (f.kind === 'Personalizada') {
        const parsed = this.customParsed();
        if (parsed.errors.length) throw new Error(parsed.errors[0]);
        customItems = parsed.items;
        scope = [...new Set(f.people.split('\n').map(s => s.trim()).filter(Boolean))];
      }
      const draft: CampaignDraft = {
        id: f.id, title: f.title, kind: f.kind, description: f.description, dueDate: f.dueDate, scope,
        normId: f.kind === 'Cumplimiento' ? f.normId : undefined, respondent: f.kind === 'Cumplimiento' ? f.respondent.trim() : undefined, customItems,
      };
      if (f.dueDate && f.dueDate < todayIso()) throw new Error('El plazo debe ser una fecha futura.');
      const c = await this.sv.saveCampaign(draft);
      if (launch) {
        const n = await this.sv.launch(c.id);
        this.notify.emit(`${c.code} lanzada: ${n} encuestas enviadas.`);
      } else {
        this.notify.emit(`${c.code} guardada como borrador.`);
      }
      this.creating.set(false);
      this.selectedId.set(c.id);
    } catch (err) {
      this.formError.set((err as Error).message);
    }
  }

  private async run(task: Promise<unknown>, ok: string) {
    try {
      await task;
      this.notify.emit(ok);
      return true;
    } catch (err) {
      this.notify.emit((err as Error).message);
      return false;
    }
  }

  async launch(c: SurveyCampaign) {
    try {
      const n = await this.sv.launch(c.id);
      this.notify.emit(`${c.code} lanzada: ${n} encuestas enviadas.`);
    } catch (err) {
      this.notify.emit((err as Error).message);
    }
  }

  async closeCampaign(c: SurveyCampaign) {
    if (await this.run(this.sv.close(c.id), `${c.code} cerrada.`)) this.confirm.set('');
  }

  async removeCampaign(c: SurveyCampaign) {
    if (await this.run(this.sv.removeCampaign(c.id), `${c.code} eliminada.`)) { this.confirm.set(''); this.selectedId.set(null); }
  }

  async reassign(r: SurveyResponse) {
    if (await this.run(this.sv.reassign(r.id, this.reassignTo()), `Encuesta de ${r.subject} asignada a ${this.reassignTo().trim()}.`)) this.reassigning.set(null);
  }

  exportCampaign(c: SurveyCampaign) {
    if (!this.rs.requirePermission(['canExportReports'], 'exportar reportes')) return;
    const rows: (string | number | undefined)[][] = [
      [`${c.code} ${c.title}`, this.kindLabel(c.kind), `Plazo ${c.dueDate}`, `Generado ${new Date().toISOString().slice(0, 16)}`],
      [],
      ['Proceso o tema', 'Responde', 'Estado', 'Sección', 'Pregunta', 'Respuesta', 'Vigente', 'Enviada', 'Revisada por'],
      ...this.sv.responsesOf(c.id).flatMap(r => r.items.map(it => [r.subject, r.respondent, r.status, it.section, it.label,
        isAnswered(r.answers[it.id]) ? String(r.answers[it.id]) : '', it.current !== undefined ? String(it.current) : '', r.submittedAt?.slice(0, 10) ?? '', r.reviewedBy ?? ''])),
    ];
    downloadCsv(`Autoevaluacion_${c.code}_${todayIso()}.csv`, rows);
  }

  // ---------------------------------------------------------------------------
  // Revisión
  // ---------------------------------------------------------------------------

  openReview(r: SurveyResponse) {
    this.reviewNote.set('');
    this.planFor.set(null);
    this.reviewId.set(r.id);
  }

  async apply(r: SurveyResponse, f: SurveyFinding) {
    await this.run(this.sv.apply(r.id, f), `Aplicado: ${f.section}.`);
  }

  startPlan(r: SurveyResponse, f: SurveyFinding) {
    const due = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    const title = f.ref?.kind === 'control' ? 'Restablecer la ejecución del control y documentar su evidencia'
      : f.ref?.kind === 'requirement' ? 'Cerrar la brecha del requisito' : f.itemId === 'general:incidents' ? 'Registrar y analizar los incidentes no reportados'
      : f.itemId === 'general:new-risks' ? 'Evaluar e incorporar los riesgos nuevos a la matriz' : '';
    this.planFor.set({ key: r.id + f.itemId, title, owner: r.respondent === 'Sin asignar' ? '' : r.respondent, dueDate: due, priority: f.kind === 'brecha' ? 'Alta' : 'Media' });
  }

  setPlan<K extends keyof PlanForm>(k: K, v: PlanForm[K]) {
    this.planFor.update(p => (p ? { ...p, [k]: v } : p));
  }

  async createPlan(r: SurveyResponse, f: SurveyFinding) {
    const p = this.planFor();
    if (!p) return;
    try {
      const plan = await this.sv.createPlan(r.id, f, p);
      this.planFor.set(null);
      this.notify.emit(`${plan.code} creado.`);
    } catch (err) {
      this.notify.emit((err as Error).message);
    }
  }

  async returnResponse(r: SurveyResponse) {
    if (await this.run(this.sv.returnResponse(r.id, this.reviewNote()), `Encuesta devuelta a ${r.respondent}.`)) this.reviewId.set(null);
  }

  async markReviewed(r: SurveyResponse) {
    if (await this.run(this.sv.markReviewed(r.id, this.reviewNote()), `Encuesta de ${r.subject} revisada.`)) this.reviewNote.set('');
  }
}
