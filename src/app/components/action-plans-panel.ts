import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApprovalBox } from './approval-box';
import { EvidenceFiles } from './evidence-files';
import { EvidenceService } from '../services/evidence.service';
import { ApprovalService } from '../services/approval.service';
import { ActionPlanService, SOURCE_TABS } from '../services/action-plan.service';
import { RiskDataService } from '../services/risk-data.service';
import {
  ACTION_PLAN_PRIORITIES, ACTION_PLAN_SOURCES, ACTION_PLAN_STATUSES, ActionPlan, ActionPlanPriority, ActionPlanSource,
} from '../models/action-plan.model';
import { isOpenPlan, planStatusClass, todayIso } from '../utils/action-plans';
import { downloadCsv } from '../utils/csv';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500';

type View = 'todos' | 'mios' | 'verificar';
type Quick = '' | 'abiertos' | 'vencidos' | 'pronto' | 'reprogramados' | 'cerrados' | 'sin-asignar';
type Panel = '' | 'avance' | 'verificacion' | 'cierre' | 'rechazo' | 'reprogramar' | 'editar' | 'cancelar' | 'eliminar';

interface FormState { text: string; pct: number; date: string }
interface EditState { title: string; description: string; owner: string; priority: ActionPlanPriority }
interface NewState { title: string; sourceType: ActionPlanSource; sourceLabel: string; owner: string; dueDate: string; process: string; priority: ActionPlanPriority; tasks: string }

interface TimelineItem { at: string; by: string; kind: string; text: string; tone: string }

/** Planes de acción de todos los módulos: seguimiento, reprogramación y cierre verificado. */
@Component({
  selector: 'app-action-plans-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, ApprovalBox, EvidenceFiles],
  template: `
    <div class="space-y-4">
      <!-- Encabezado -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg"><mat-icon class="text-lg">assignment_turned_in</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Planes de acción</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Todos los planes que nacen de riesgos, controles, hallazgos de auditoría, requisitos normativos, seguridad, continuidad,
            proveedores e incidentes. El responsable informa avances y entrega la evidencia; el cierre lo verifica otra persona.
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          @if (plans.canManage()) {
            <button type="button" (click)="startNew()" class="px-3.5 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-xl flex items-center gap-1.5 cursor-pointer">
              <mat-icon class="text-sm">add_task</mat-icon>Nuevo plan
            </button>
          }
          <button type="button" (click)="exportCsv()" [class.perm-hidden]="!rs.canAny('canExportReports')"
            class="px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 cursor-pointer">
            <mat-icon class="text-sm text-emerald-600">download</mat-icon>Exportar
          </button>
        </div>
      </div>

      <!-- Indicadores -->
      @let k = plans.kpis();
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        @for (t of tiles(); track t.id) {
          <button type="button" (click)="setQuick(t.id)" class="text-left bg-white p-3 rounded-xl border cursor-pointer"
            [class]="quick() === t.id ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'">
            <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{{ t.label }}</span>
            <span class="text-2xl font-bold font-mono tabular-nums" [class]="t.value ? t.tone : 'text-slate-400'">{{ t.value }}</span>
            <span class="block text-[10px] text-slate-500">{{ t.hint }}</span>
          </button>
        }
      </div>

      <!-- Vistas y filtros -->
      <div class="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
        <div class="flex rounded-lg border border-slate-300 overflow-hidden text-xs" role="tablist" aria-label="Vista">
          <button type="button" role="tab" [attr.aria-selected]="view() === 'todos'" (click)="view.set('todos')" class="px-3 py-1.5 cursor-pointer" [class]="view() === 'todos' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'">Todos</button>
          <button type="button" role="tab" [attr.aria-selected]="view() === 'mios'" (click)="view.set('mios')" class="px-3 py-1.5 cursor-pointer border-l border-slate-300" [class]="view() === 'mios' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'">Mis planes ({{ k.mine }})</button>
          <button type="button" role="tab" [attr.aria-selected]="view() === 'verificar'" (click)="view.set('verificar')" class="px-3 py-1.5 cursor-pointer border-l border-slate-300" [class]="view() === 'verificar' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'">Por verificar ({{ k.toVerify }})</button>
        </div>
        <input id="ap-search" type="search" placeholder="Buscar código, plan, origen o responsable..." [value]="search()" (input)="search.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-3 py-1.5 w-60" />
        <select id="ap-source" [value]="source()" (change)="source.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-2 py-1.5" aria-label="Origen">
          <option value="">Todos los orígenes</option>
          @for (s of bySource(); track s.source) { <option [value]="s.source">{{ s.source }} ({{ s.open }})</option> }
        </select>
        <select id="ap-status" [value]="status()" (change)="status.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-2 py-1.5" aria-label="Estado">
          <option value="">Abiertos y cerrados</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <select id="ap-priority" [value]="priorityFilter()" (change)="priorityFilter.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-2 py-1.5" aria-label="Prioridad">
          <option value="">Toda prioridad</option>
          @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
        </select>
        @if (hasFilters()) { <button type="button" (click)="clearFilters()" class="text-[11px] text-emerald-700 hover:underline cursor-pointer">Quitar filtros</button> }
        <span class="text-[11px] text-slate-500 ml-auto">{{ filtered().length }} de {{ plans.plans().length }}</span>
      </div>

      @if (creating()) {
        <div class="bg-white rounded-2xl border border-emerald-300 p-4 grid grid-cols-1 md:grid-cols-6 gap-2.5">
          <h2 class="md:col-span-6 text-xs font-bold text-slate-900">Nuevo plan de acción</h2>
          <label class="block md:col-span-4"><span class="block text-[10px] text-slate-600 mb-0.5">Qué se hará *</span>
            <input id="ap-new-title" [class]="inputCls" [value]="nf().title" (input)="setNew('title', $any($event.target).value)" /></label>
          <label class="block md:col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Origen</span>
            <select id="ap-new-source" [class]="inputCls" (change)="setNew('sourceType', $any($event.target).value)">
              @for (s of sources; track s) { <option [value]="s" [selected]="s === nf().sourceType">{{ s }}</option> }
            </select></label>
          <label class="block md:col-span-3"><span class="block text-[10px] text-slate-600 mb-0.5">Referencia del origen *</span>
            <input id="ap-new-ref" [class]="inputCls" [value]="nf().sourceLabel" (input)="setNew('sourceLabel', $any($event.target).value)" placeholder="Acuerdo del Comité de Riesgos N° ..., informe externo, etc." /></label>
          <label class="block md:col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Responsable *</span>
            <input id="ap-new-owner" [class]="inputCls" list="ap-people" [value]="nf().owner" (input)="setNew('owner', $any($event.target).value)" /></label>
          <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Plazo *</span>
            <input id="ap-new-due" type="date" [class]="inputCls" [value]="nf().dueDate" (input)="setNew('dueDate', $any($event.target).value)" /></label>
          <label class="block md:col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Proceso</span>
            <select id="ap-new-process" [class]="inputCls" (change)="setNew('process', $any($event.target).value)">
              <option value="">Sin proceso</option>
              @for (p of rs.catalog.processOptions(nf().process); track p) { <option [value]="p" [selected]="p === nf().process">{{ p }}</option> }
            </select></label>
          <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Prioridad</span>
            <select id="ap-new-priority" [class]="inputCls" (change)="setNew('priority', $any($event.target).value)">
              @for (p of priorities; track p) { <option [value]="p" [selected]="p === nf().priority">{{ p }}</option> }
            </select></label>
          <label class="block md:col-span-3"><span class="block text-[10px] text-slate-600 mb-0.5">Tareas (una por línea)</span>
            <textarea id="ap-new-tasks" rows="2" [class]="inputCls" [value]="nf().tasks" (input)="setNew('tasks', $any($event.target).value)"></textarea></label>
          @if (formError()) { <p class="md:col-span-6 text-[11px] text-rose-700" role="alert">{{ formError() }}</p> }
          <div class="md:col-span-6 flex justify-end gap-2">
            <button type="button" (click)="creating.set(false)" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
            <button type="button" (click)="createNew()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer">Crear plan</button>
          </div>
        </div>
      }
      <datalist id="ap-people">@for (u of people(); track u) { <option [value]="u"></option> }</datalist>

      <div class="grid grid-cols-1 xl:grid-cols-5 gap-4 items-start">
        <!-- Lista -->
        <div class="xl:col-span-3 bg-white rounded-2xl border border-slate-200 overflow-hidden min-w-0">
          <div class="hidden md:grid grid-cols-[84px_1fr_140px_96px_92px] gap-3 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Código</span><span>Plan y origen</span><span>Responsable</span><span>Plazo</span><span class="text-right">Estado</span>
          </div>
          <ul class="divide-y divide-slate-100">
            @for (p of filtered(); track p.id) {
              <li>
                <button type="button" (click)="select(p.id)" class="w-full text-left px-4 py-2.5 cursor-pointer grid grid-cols-[1fr_auto] md:grid-cols-[84px_1fr_140px_96px_92px] gap-x-3 gap-y-1 items-center"
                  [class]="selectedId() === p.id ? 'bg-emerald-50' : 'hover:bg-slate-50'">
                  <span class="font-mono text-[10px] text-slate-500 hidden md:block">{{ p.code }}</span>
                  <span class="min-w-0">
                    <span class="block text-xs font-semibold text-slate-900 truncate"><span class="md:hidden font-mono text-[10px] text-slate-500 mr-1">{{ p.code }}</span>{{ p.title }}</span>
                    <span class="flex items-center gap-1.5 text-[10px] text-slate-500 min-w-0">
                      <span class="px-1.5 py-px rounded bg-slate-100 text-slate-700 shrink-0">{{ p.sourceType }}</span>
                      <span class="truncate">{{ p.sourceLabel }}</span>
                    </span>
                    <span class="mt-1 flex items-center gap-1.5">
                      <span class="block h-1 w-24 rounded-full bg-slate-100 overflow-hidden"><span class="block h-full rounded-full" [class]="p.status === 'Cerrado' ? 'bg-emerald-600' : 'bg-sky-600'" [style.width.%]="p.status === 'Cerrado' ? 100 : p.progressPct"></span></span>
                      <span class="text-[9px] text-slate-500 tabular-nums whitespace-nowrap">{{ p.status === 'Cerrado' ? 100 : p.progressPct }} %</span>
                      @if (p.priority === 'Alta' && isOpen(p)) { <span class="text-[9px] font-bold text-rose-700 whitespace-nowrap">PRIORIDAD ALTA</span> }
                    </span>
                  </span>
                  <span class="text-[11px] text-slate-700 truncate hidden md:block" [class.text-rose-700]="unassigned(p)">{{ p.owner }}</span>
                  <span class="text-[11px] tabular-nums hidden md:block" [class]="dueClass(p)">{{ p.dueDate }}<span class="block text-[9px]">{{ dueHint(p) }}</span></span>
                  <span class="text-right"><span class="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" [class]="statusClass(p)">{{ statusLabel(p) }}</span>
                    <span class="md:hidden block text-[10px] mt-0.5" [class]="dueClass(p)">{{ p.dueDate }}</span></span>
                </button>
              </li>
            } @empty {
              <li class="px-4 py-8 text-center text-xs text-slate-500">
                @if (view() === 'mios') { No tienes planes asignados con estos filtros. }
                @else if (plans.plans().length) { Ningún plan coincide con los filtros. }
                @else { Aún no hay planes de acción. Créalos desde una brecha en cualquier módulo (un requisito que no se cumple, un hallazgo, un control deficiente) o con "Nuevo plan". }
              </li>
            }
          </ul>
        </div>

        <!-- Detalle -->
        <div class="xl:col-span-2 min-w-0 xl:sticky xl:top-4">
          @if (selected(); as p) {
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div class="px-4 py-3 border-b border-slate-100 space-y-1.5">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <span class="font-mono text-[10px] text-slate-500">{{ p.code }} · creado por {{ p.createdBy }} el {{ p.createdAt | date: 'dd-MM-yyyy' }}</span>
                    <h2 class="text-sm font-bold text-slate-900">{{ p.title }}</h2>
                  </div>
                  <button type="button" (click)="selectedId.set(null)" class="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0" aria-label="Cerrar detalle"><mat-icon class="text-[18px] w-[18px] h-[18px]">close</mat-icon></button>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" [class]="statusClass(p)">{{ statusLabel(p) }}</span>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" [class]="p.priority === 'Alta' ? 'bg-rose-50 text-rose-800 border border-rose-200' : p.priority === 'Media' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-50 text-slate-600 border border-slate-200'">Prioridad {{ p.priority }}</span>
                  @if (plans.isOwner(p)) { <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">Eres el responsable</span> }
                </div>
                @if (p.description) { <p class="text-[11px] text-slate-600">{{ p.description }}</p> }
                <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-600">
                  <div><dt class="text-[10px] text-slate-400">Responsable</dt><dd class="font-semibold text-slate-800">{{ p.owner }}</dd></div>
                  <div><dt class="text-[10px] text-slate-400">Plazo</dt><dd class="font-semibold tabular-nums" [class]="dueClass(p)">{{ p.dueDate }} <span class="font-normal">({{ dueHint(p) || 'cerrado' }})</span></dd></div>
                  <div><dt class="text-[10px] text-slate-400">Plazo comprometido</dt><dd class="tabular-nums">{{ p.originalDueDate }}@if (p.reschedules.length) { · {{ p.reschedules.length }} {{ p.reschedules.length === 1 ? 'reprogramación' : 'reprogramaciones' }} }</dd></div>
                  <div><dt class="text-[10px] text-slate-400">Proceso</dt><dd>{{ p.process || '—' }}</dd></div>
                  <div class="col-span-2"><dt class="text-[10px] text-slate-400">Origen</dt>
                    <dd class="flex items-start gap-1.5"><span class="px-1.5 py-px rounded bg-slate-100 text-slate-700 shrink-0">{{ p.sourceType }}</span><span class="min-w-0">{{ p.sourceLabel }}</span>
                      @if (sourceTab(p)) { <button type="button" (click)="openModule.emit(sourceTab(p)!)" class="text-emerald-700 hover:underline cursor-pointer shrink-0">Ir al módulo</button> }</dd></div>
                  @if (findingStatus(p); as fs) { <div class="col-span-2"><dt class="text-[10px] text-slate-400">Estado del hallazgo</dt><dd>{{ fs }}</dd></div> }
                </dl>
                <div>
                  <div class="flex justify-between text-[10px] text-slate-500"><span>Avance</span><span class="tabular-nums">{{ p.status === 'Cerrado' ? 100 : p.progressPct }} %</span></div>
                  <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full" [class]="p.status === 'Cerrado' ? 'bg-emerald-600' : 'bg-sky-600'" [style.width.%]="p.status === 'Cerrado' ? 100 : p.progressPct"></div></div>
                </div>
              </div>

              <!-- Tareas -->
              <div class="px-4 py-3 border-b border-slate-100">
                <h3 class="text-[11px] font-bold text-slate-800 mb-1.5">Tareas@if (p.tasks.length) { <span class="font-normal text-slate-500"> · {{ doneTasks(p) }} de {{ p.tasks.length }}</span> }</h3>
                @if (p.tasks.length) {
                  <ul class="space-y-1">
                    @for (t of p.tasks; track t.id) {
                      <li class="flex items-start gap-2 text-[11px]">
                        <input type="checkbox" [id]="'ap-task-' + t.id" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" [checked]="t.done" [disabled]="!plans.canUpdate(p)" (change)="run(plans.toggleTask(p.id, t.id))" />
                        <label [for]="'ap-task-' + t.id" class="flex-1 min-w-0" [class.line-through]="t.done" [class.text-slate-400]="t.done">{{ t.text }}@if (t.done && t.doneBy) { <span class="block text-[9px] text-slate-400 no-underline">{{ t.doneBy }} · {{ t.doneAt | date: 'dd-MM-yyyy' }}</span> }</label>
                        @if (plans.canUpdate(p)) { <button type="button" (click)="run(plans.removeTask(p.id, t.id))" class="text-slate-300 hover:text-rose-600 cursor-pointer" [attr.aria-label]="'Eliminar tarea ' + t.text"><mat-icon class="text-[14px] w-3.5 h-3.5">close</mat-icon></button> }
                      </li>
                    }
                  </ul>
                } @else { <p class="text-[11px] text-slate-500">Sin tareas: el avance se informa en porcentaje.</p> }
                @if (plans.canUpdate(p)) {
                  <div class="flex gap-1.5 mt-2">
                    <input id="ap-new-task" [class]="inputCls" placeholder="Agregar tarea..." [value]="newTask()" (input)="newTask.set($any($event.target).value)" (keydown.enter)="addTask(p)" />
                    <button type="button" (click)="addTask(p)" class="px-2.5 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer" aria-label="Agregar tarea"><mat-icon class="text-sm">add</mat-icon></button>
                  </div>
                }
              </div>

              <!-- Evidencias (archivos) -->
              <div class="px-4 py-3 border-b border-slate-100">
                <app-evidence-files entity="action-plans" [entityId]="p.id" [label]="p.code" [parent]="p" title="Evidencias del plan"
                  [emptyText]="openPlan(p) ? 'Adjunte actas, informes o capturas que respalden el avance y el cierre.' : 'Sin archivos.'" />
              </div>

              <!-- Acciones -->
              @if (isOpen(p)) {
                <div class="px-4 py-3 border-b border-slate-100 space-y-2">
                  <div class="flex flex-wrap gap-1.5">
                    @if (plans.canUpdate(p) && p.status !== 'Por verificar') {
                      <button type="button" (click)="openPanel('avance', p)" [class]="actionBtn(panel() === 'avance')"><mat-icon class="text-sm">trending_up</mat-icon>Registrar avance</button>
                      <button type="button" (click)="openPanel('verificacion', p)" [class]="actionBtn(panel() === 'verificacion')"><mat-icon class="text-sm">task_alt</mat-icon>Enviar a verificación</button>
                    }
                    @if (plans.canVerify(p)) {
                      <button type="button" (click)="openPanel('cierre', p)" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1 cursor-pointer bg-emerald-700 text-white hover:bg-emerald-600"><mat-icon class="text-sm">verified</mat-icon>Verificar cierre</button>
                      <button type="button" (click)="openPanel('rechazo', p)" [class]="actionBtn(panel() === 'rechazo')"><mat-icon class="text-sm">undo</mat-icon>Rechazar</button>
                    }
                    @if (p.status === 'Por verificar' && plans.canManage() && plans.isOwner(p)) {
                      <span class="text-[10px] text-slate-500 self-center">El cierre lo verifica otra persona con permiso de planes.</span>
                    }
                    @if (plans.canManage()) {
                      <button type="button" (click)="openPanel('reprogramar', p)" [class]="actionBtn(panel() === 'reprogramar')"><mat-icon class="text-sm">event_repeat</mat-icon>Reprogramar</button>
                      <button type="button" (click)="openPanel('editar', p)" [class]="actionBtn(panel() === 'editar')"><mat-icon class="text-sm">edit</mat-icon>Editar</button>
                      <button type="button" (click)="openPanel('cancelar', p)" [class]="actionBtn(panel() === 'cancelar')"><mat-icon class="text-sm">block</mat-icon>Cancelar</button>
                    }
                  </div>
                  @if (!plans.canUpdate(p) && !plans.canManage()) {
                    <p class="text-[10px] text-slate-500">Solo el responsable ({{ p.owner }}) o quien administra planes puede registrar avances.</p>
                  }
                  @if (p.status !== 'Por verificar' && ((plans.isOwner(p) && !plans.canManage()) || approvals.forTarget('action-plans', p.id).length)) {
                    <app-approval-box kind="reprogramacion-plan" [targetId]="p.id" [targetLabel]="p.code + ' ' + p.title" [owner]="p.owner"
                      title="Reprogramación" requestLabel="Solicitar más plazo" [defaults]="{ currentDueDate: p.dueDate }"
                      [hint]="plans.isOwner(p) && !plans.canManage() ? 'Si no alcanza el plazo, pida la reprogramación: la aprueba quien administra planes.' : ''"
                      (notify)="notify.emit($event)" />
                  }

                  @switch (panel()) {
                    @case ('avance') {
                      <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Qué se avanzó *</span>
                          <textarea id="ap-upd-text" rows="2" [class]="inputCls" [value]="form().text" (input)="setForm('text', $any($event.target).value)"></textarea></label>
                        <label class="block"><span class="flex justify-between text-[10px] text-slate-600 mb-0.5"><span>Avance total</span><span class="tabular-nums font-semibold">{{ form().pct }} %</span></span>
                          <input id="ap-upd-pct" type="range" min="0" max="100" step="5" class="w-full accent-emerald-700" [value]="form().pct" (input)="setForm('pct', +$any($event.target).value)" /></label>
                        <ng-container *ngTemplateOutlet="formActions; context: { label: 'Guardar avance', action: 'avance' }" />
                      </div>
                    }
                    @case ('verificacion') {
                      <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Evidencia de cierre * (descripción; adjunte los archivos en "Evidencias del plan")</span>
                          <textarea id="ap-ver-evidence" rows="2" [class]="inputCls" [value]="form().text" (input)="setForm('text', $any($event.target).value)"></textarea></label>
                        <p class="text-[10px] text-slate-500">El plan queda "Por verificar" con avance 100 %. Lo cierra una persona distinta del responsable.</p>
                        <ng-container *ngTemplateOutlet="formActions; context: { label: 'Enviar a verificación', action: 'verificacion' }" />
                      </div>
                    }
                    @case ('cierre') {
                      <div class="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 space-y-2">
                        <p class="text-[11px] text-slate-700"><strong>Evidencia entregada por {{ p.closure?.submittedBy }}:</strong> {{ p.closure?.evidence }}</p>
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Observación (opcional)</span>
                          <input id="ap-close-note" [class]="inputCls" [value]="form().text" (input)="setForm('text', $any($event.target).value)" /></label>
                        @if (plans.findingOf(p)) { <p class="text-[10px] text-slate-600">Si tu cargo registra auditorías y no quedan otros planes abiertos, el hallazgo se cierra también.</p> }
                        <ng-container *ngTemplateOutlet="formActions; context: { label: 'Confirmar cierre', action: 'cierre' }" />
                      </div>
                    }
                    @case ('rechazo') {
                      <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                        <p class="text-[11px] text-slate-700"><strong>Evidencia:</strong> {{ p.closure?.evidence }}</p>
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Qué falta para aprobar el cierre *</span>
                          <textarea id="ap-rej-note" rows="2" [class]="inputCls" [value]="form().text" (input)="setForm('text', $any($event.target).value)"></textarea></label>
                        <ng-container *ngTemplateOutlet="formActions; context: { label: 'Devolver al responsable', action: 'rechazo' }" />
                      </div>
                    }
                    @case ('reprogramar') {
                      <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-3 gap-2">
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Nuevo plazo *</span>
                          <input id="ap-res-date" type="date" [class]="inputCls" [value]="form().date" (input)="setForm('date', $any($event.target).value)" /></label>
                        <label class="block col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Motivo *</span>
                          <input id="ap-res-reason" [class]="inputCls" [value]="form().text" (input)="setForm('text', $any($event.target).value)" placeholder="Dependencia de proveedor, cambio de alcance..." /></label>
                        <p class="col-span-3 text-[10px] text-slate-500">El plazo comprometido ({{ p.originalDueDate }}) se conserva para medir el cumplimiento a tiempo.</p>
                        <div class="col-span-3"><ng-container *ngTemplateOutlet="formActions; context: { label: 'Reprogramar', action: 'reprogramar' }" /></div>
                      </div>
                    }
                    @case ('editar') {
                      <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2">
                        <label class="block col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Título *</span>
                          <input id="ap-ed-title" [class]="inputCls" [value]="edit().title" (input)="setEdit('title', $any($event.target).value)" /></label>
                        <label class="block col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Descripción</span>
                          <textarea id="ap-ed-desc" rows="2" [class]="inputCls" [value]="edit().description" (input)="setEdit('description', $any($event.target).value)"></textarea></label>
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Responsable *</span>
                          <input id="ap-ed-owner" [class]="inputCls" list="ap-people" [value]="edit().owner" (input)="setEdit('owner', $any($event.target).value)" /></label>
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Prioridad</span>
                          <select id="ap-ed-priority" [class]="inputCls" (change)="setEdit('priority', $any($event.target).value)">
                            @for (pr of priorities; track pr) { <option [value]="pr" [selected]="pr === edit().priority">{{ pr }}</option> }
                          </select></label>
                        <div class="col-span-2"><ng-container *ngTemplateOutlet="formActions; context: { label: 'Guardar cambios', action: 'editar' }" /></div>
                      </div>
                    }
                    @case ('cancelar') {
                      <div class="p-2.5 rounded-lg bg-rose-50 border border-rose-200 space-y-2">
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Motivo de la cancelación *</span>
                          <input id="ap-can-reason" [class]="inputCls" [value]="form().text" (input)="setForm('text', $any($event.target).value)" placeholder="La brecha se resolvió por otra vía, el riesgo se aceptó formalmente..." /></label>
                        <ng-container *ngTemplateOutlet="formActions; context: { label: 'Cancelar el plan', action: 'cancelar' }" />
                      </div>
                    }
                  }
                </div>
              } @else {
                <div class="px-4 py-3 border-b border-slate-100 text-[11px] text-slate-600 space-y-1">
                  @if (p.status === 'Cerrado') {
                    <p><strong class="text-emerald-800">Cerrado el {{ p.closedAt }}</strong>@if (p.closedAt && p.closedAt > p.originalDueDate) { <span class="text-rose-700"> (después del plazo comprometido {{ p.originalDueDate }})</span> } @else { <span> (dentro del plazo comprometido)</span> }</p>
                    <p><strong>Evidencia:</strong> {{ p.closure?.evidence }} · entregada por {{ p.closure?.submittedBy }}</p>
                    <p><strong>Verificado por:</strong> {{ p.closure?.verifiedBy }}@if (p.closure?.note) { · {{ p.closure?.note }} }</p>
                  } @else {
                    <p><strong class="text-slate-800">Cancelado el {{ p.closedAt }}:</strong> {{ p.cancelReason }}</p>
                  }
                  @if (plans.canManage()) {
                    @if (panel() === 'eliminar') {
                      <div class="flex items-center gap-2 pt-1"><span class="text-rose-800">¿Eliminar el plan? La bitácora conserva su historial.</span>
                        <button type="button" (click)="panel.set('')" class="px-2 py-1 text-[11px] rounded-lg bg-white border border-slate-300 cursor-pointer">No</button>
                        <button type="button" (click)="removePlan(p)" class="px-2 py-1 text-[11px] font-semibold rounded-lg bg-rose-700 text-white cursor-pointer">Eliminar</button></div>
                    } @else {
                      <button type="button" (click)="panel.set('eliminar')" class="text-[11px] text-rose-700 hover:underline cursor-pointer">Eliminar plan</button>
                    }
                  }
                </div>
              }

              <!-- Historial -->
              <div class="px-4 py-3">
                <h3 class="text-[11px] font-bold text-slate-800 mb-1.5">Seguimiento</h3>
                <ol class="space-y-2">
                  @for (e of timeline(p); track $index) {
                    <li class="text-[11px] flex gap-2">
                      <span class="mt-1 w-2 h-2 rounded-full shrink-0" [class]="e.tone"></span>
                      <span class="min-w-0"><strong class="text-slate-800">{{ e.kind }}</strong><span class="text-slate-700 ml-1">{{ e.text }}</span>
                        <span class="block text-[10px] text-slate-400">{{ e.by }} · {{ e.at | date: 'dd-MM-yyyy HH:mm' }}</span></span>
                    </li>
                  }
                </ol>
              </div>
            </div>
          } @else {
            <div class="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
              Selecciona un plan para ver sus tareas, avances y registrar su cierre.
              @if (bySource().length) {
                <div class="mt-4 text-left">
                  <h3 class="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Planes abiertos por origen</h3>
                  <ul class="space-y-1">
                    @for (s of bySource(); track s.source) {
                      <li><button type="button" (click)="source.set(s.source)" class="w-full flex items-center justify-between text-[11px] px-2 py-1 rounded hover:bg-slate-50 cursor-pointer">
                        <span class="text-slate-700">{{ s.source }}</span>
                        <span class="tabular-nums text-slate-600">{{ s.open }} abiertos@if (s.overdue) { · <strong class="text-rose-700">{{ s.overdue }} vencidos</strong> }</span></button></li>
                    }
                  </ul>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </div>

    <ng-template #formActions let-label="label" let-action="action">
      @if (formError()) { <p class="text-[11px] text-rose-700 mb-1" role="alert">{{ formError() }}</p> }
      <div class="flex justify-end gap-2">
        <button type="button" (click)="panel.set('')" class="px-3 py-1.5 text-[11px] rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Volver</button>
        <button type="button" (click)="submit(action)" class="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer">{{ label }}</button>
      </div>
    </ng-template>
  `,
})
export class ActionPlansPanel {
  readonly plans = inject(ActionPlanService);
  readonly approvals = inject(ApprovalService);
  readonly evidence = inject(EvidenceService);
  openPlan(p: ActionPlan) { return p.status === 'Pendiente' || p.status === 'En curso'; }
  readonly rs = inject(RiskDataService);
  readonly notify = output<string>();
  readonly openModule = output<string>();

  readonly inputCls = INPUT;
  readonly statuses = ACTION_PLAN_STATUSES;
  readonly priorities = ACTION_PLAN_PRIORITIES;
  readonly sources = ACTION_PLAN_SOURCES;

  readonly view = signal<View>('todos');
  readonly quick = signal<Quick>('abiertos');
  readonly search = signal('');
  readonly source = signal('');
  readonly status = signal('');
  readonly priorityFilter = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly panel = signal<Panel>('');
  readonly form = signal<FormState>({ text: '', pct: 0, date: '' });
  readonly edit = signal<EditState>({ title: '', description: '', owner: '', priority: 'Media' });
  readonly formError = signal('');
  readonly newTask = signal('');
  readonly creating = signal(false);
  readonly nf = signal<NewState>({ title: '', sourceType: 'Otro', sourceLabel: '', owner: '', dueDate: '', process: '', priority: 'Media', tasks: '' });

  constructor() {
    // Un plan pedido desde otro módulo se abre seleccionado y sin filtros que lo oculten.
    effect(() => {
      const req = this.plans.openRequest();
      if (!req) return;
      untracked(() => {
        this.clearFilters();
        this.quick.set('');
        this.view.set('todos');
        this.select(req.id);
        this.plans.openRequest.set(null);
      });
    });
  }

  readonly people = computed(() => [...new Set(this.rs.userProfiles().filter(u => u.active !== false).map(u => u.name))].sort((a, b) => a.localeCompare(b, 'es')));
  readonly selected = computed(() => (this.selectedId() ? this.plans.get(this.selectedId()!) ?? null : null));

  readonly tiles = computed(() => {
    const k = this.plans.kpis();
    return [
      { id: 'abiertos' as Quick, label: 'Abiertos', value: k.open, hint: `${k.unassigned} sin responsable`, tone: 'text-slate-800' },
      { id: 'vencidos' as Quick, label: 'Vencidos', value: k.overdue, hint: 'plazo cumplido sin entregar', tone: 'text-rose-700' },
      { id: 'pronto' as Quick, label: 'Vencen en 15 días', value: k.dueSoon, hint: 'pendientes o en curso', tone: 'text-amber-700' },
      { id: '' as Quick, label: 'Por verificar', value: k.toVerify, hint: 'esperan cierre', tone: 'text-amber-700' },
      { id: 'reprogramados' as Quick, label: 'Reprogramados', value: k.rescheduled, hint: 'abiertos con plazo movido', tone: 'text-slate-800' },
      { id: 'cerrados' as Quick, label: `Cerrados ${todayIso().slice(0, 4)}`, value: k.closedYear, hint: k.onTimePct === null ? 'sin cierres este año' : `${k.onTimePct} % dentro del plazo comprometido`, tone: 'text-emerald-700' },
    ];
  });

  readonly bySource = computed(() => {
    const map = new Map<ActionPlanSource, { open: number; overdue: number }>();
    for (const p of this.plans.plans()) {
      const e = map.get(p.sourceType) ?? { open: 0, overdue: 0 };
      if (isOpenPlan(p)) e.open++;
      if (this.plans.isOverdue(p)) e.overdue++;
      map.set(p.sourceType, e);
    }
    return ACTION_PLAN_SOURCES.filter(s => map.has(s)).map(s => ({ source: s, ...map.get(s)! }));
  });

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const view = this.view();
    const quick = this.quick();
    const today = todayIso();
    return this.plans.sorted().filter(p => {
      if (view === 'mios' && !this.plans.isOwner(p)) return false;
      if (view === 'verificar' && p.status !== 'Por verificar') return false;
      if (this.source() && p.sourceType !== this.source()) return false;
      if (this.status() && p.status !== this.status()) return false;
      if (this.priorityFilter() && p.priority !== this.priorityFilter()) return false;
      if (q && !`${p.code} ${p.title} ${p.sourceLabel} ${p.owner} ${p.process ?? ''}`.toLowerCase().includes(q)) return false;
      switch (quick) {
        case 'abiertos': return isOpenPlan(p);
        case 'vencidos': return this.plans.isOverdue(p);
        case 'pronto': return isOpenPlan(p) && p.status !== 'Por verificar' && !this.plans.isOverdue(p) && this.plans.daysToDue(p) <= 15;
        case 'reprogramados': return isOpenPlan(p) && p.reschedules.length > 0;
        case 'cerrados': return p.status === 'Cerrado' && !!p.closedAt?.startsWith(today.slice(0, 4));
        case 'sin-asignar': return isOpenPlan(p) && this.unassigned(p);
        default: return true;
      }
    });
  });

  readonly hasFilters = computed(() => !!(this.search() || this.source() || this.status() || this.priorityFilter() || this.quick()));

  setQuick(q: Quick) {
    if (q === '') { this.view.set('verificar'); this.quick.set(''); return; }
    this.view.set('todos');
    this.quick.set(this.quick() === q ? '' : q);
  }

  clearFilters() {
    this.search.set('');
    this.source.set('');
    this.status.set('');
    this.priorityFilter.set('');
    this.quick.set('');
  }

  isOpen(p: ActionPlan) {
    return isOpenPlan(p);
  }

  unassigned(p: ActionPlan) {
    return !p.owner.trim() || p.owner === 'Sin asignar';
  }

  statusClass(p: ActionPlan) {
    return planStatusClass(p, this.plans.isOverdue(p));
  }

  statusLabel(p: ActionPlan) {
    return this.plans.isOverdue(p) ? `Vencido · ${p.status}` : p.status;
  }

  dueClass(p: ActionPlan) {
    if (!isOpenPlan(p) || p.status === 'Por verificar') return 'text-slate-500';
    if (this.plans.isOverdue(p)) return 'text-rose-700 font-semibold';
    return this.plans.daysToDue(p) <= 15 ? 'text-amber-700' : 'text-slate-700';
  }

  dueHint(p: ActionPlan) {
    if (!isOpenPlan(p)) return '';
    if (p.status === 'Por verificar') return 'entregado';
    const d = this.plans.daysToDue(p);
    return d < 0 ? `vencido hace ${-d} ${d === -1 ? 'día' : 'días'}` : d === 0 ? 'vence hoy' : `en ${d} ${d === 1 ? 'día' : 'días'}`;
  }

  sourceTab(p: ActionPlan) {
    return SOURCE_TABS[p.sourceType];
  }

  findingStatus(p: ActionPlan) {
    const ref = this.plans.findingOf(p);
    return ref ? `${ref.finding.status} (${ref.audit.code})` : null;
  }

  doneTasks(p: ActionPlan) {
    return p.tasks.filter(t => t.done).length;
  }

  actionBtn(active: boolean) {
    return `px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border flex items-center gap-1 cursor-pointer ${active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`;
  }

  timeline(p: ActionPlan): TimelineItem[] {
    const items: TimelineItem[] = [{ at: p.createdAt, by: p.createdBy, kind: 'Creado', text: `Plazo ${p.originalDueDate}, responsable ${p.owner}.`, tone: 'bg-slate-400' }];
    for (const u of p.updates) items.push({ at: u.at, by: u.by, kind: `Avance ${u.progressPct} %`, text: u.text, tone: 'bg-sky-500' });
    for (const r of p.reschedules) items.push({ at: r.at, by: r.by, kind: 'Reprogramado', text: `${r.from} → ${r.to}: ${r.reason}`, tone: 'bg-amber-500' });
    for (const r of p.rejections ?? []) {
      items.push({ at: r.submittedAt, by: r.submittedBy, kind: 'Enviado a verificación', text: r.evidence, tone: 'bg-amber-500' });
      items.push({ at: r.verifiedAt ?? r.submittedAt, by: r.verifiedBy ?? '', kind: 'Cierre rechazado', text: r.note ?? '', tone: 'bg-rose-500' });
    }
    if (p.closure) {
      items.push({ at: p.closure.submittedAt, by: p.closure.submittedBy, kind: 'Enviado a verificación', text: p.closure.evidence, tone: 'bg-amber-500' });
      if (p.closure.verifiedAt && p.status === 'Cerrado') items.push({ at: p.closure.verifiedAt, by: p.closure.verifiedBy ?? '', kind: 'Cierre verificado', text: p.closure.note ?? '', tone: 'bg-emerald-600' });
    }
    if (p.status === 'Cancelado') items.push({ at: (p.closedAt ?? '') + 'T12:00:00', by: '', kind: 'Cancelado', text: p.cancelReason ?? '', tone: 'bg-slate-500' });
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }

  // ---------------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------------

  select(id: string) {
    this.selectedId.set(id);
    this.panel.set('');
    this.formError.set('');
  }

  openPanel(panel: Panel, p: ActionPlan) {
    this.formError.set('');
    if (this.panel() === panel) { this.panel.set(''); return; }
    this.form.set({ text: '', pct: p.progressPct, date: p.dueDate });
    if (panel === 'editar') this.edit.set({ title: p.title, description: p.description, owner: p.owner, priority: p.priority });
    this.panel.set(panel);
  }

  setForm<K extends keyof FormState>(k: K, v: FormState[K]) {
    this.form.update(f => ({ ...f, [k]: v }));
  }

  setEdit<K extends keyof EditState>(k: K, v: EditState[K]) {
    this.edit.update(f => ({ ...f, [k]: v }));
  }

  async run(task: Promise<unknown>) {
    try {
      await task;
    } catch (err) {
      this.notify.emit((err as Error).message);
    }
  }

  async addTask(p: ActionPlan) {
    const t = this.newTask().trim();
    if (!t) return;
    await this.run(this.plans.addTask(p.id, t));
    this.newTask.set('');
  }

  async submit(action: Panel) {
    const p = this.selected();
    if (!p) return;
    const f = this.form();
    this.formError.set('');
    try {
      switch (action) {
        case 'avance': await this.plans.addUpdate(p.id, f.text, f.pct); this.notify.emit(`${p.code}: avance registrado (${f.pct} %).`); break;
        case 'verificacion':
          {
            const files = this.evidence.forEntity('action-plans', p.id);
            if (!f.text.trim() && !files.length) throw new Error('Describa la evidencia de cierre o adjunte al menos un archivo.');
            const text = [f.text.trim(), files.length ? `Archivos: ${files.map(x => x.fileName).join(', ')}` : ''].filter(Boolean).join(' · ');
            await this.plans.submitForVerification(p.id, text);
          } this.notify.emit(`${p.code} enviado a verificación.`); break;
        case 'cierre': {
          const r = await this.plans.verify(p.id, f.text);
          this.notify.emit(`${p.code} cerrado.${r.findingClosed ? ' El hallazgo de auditoría también quedó cerrado.' : ''}`); break;
        }
        case 'rechazo': await this.plans.reject(p.id, f.text); this.notify.emit(`${p.code} devuelto al responsable.`); break;
        case 'reprogramar': await this.plans.reschedule(p.id, f.date, f.text); this.notify.emit(`${p.code}: nuevo plazo ${f.date}.`); break;
        case 'editar': { const e = this.edit(); await this.plans.edit(p.id, { ...e, process: p.process }); this.notify.emit(`${p.code} actualizado.`); break; }
        case 'cancelar':
          if (!f.text.trim()) throw new Error('Indique el motivo de la cancelación.');
          await this.plans.cancel(p.id, f.text); this.notify.emit(`${p.code} cancelado.`); break;
      }
      this.panel.set('');
    } catch (err) {
      this.formError.set((err as Error).message);
    }
  }

  async removePlan(p: ActionPlan) {
    try {
      await this.plans.remove(p.id);
      this.selectedId.set(null);
      this.panel.set('');
      this.notify.emit(`${p.code} eliminado.`);
    } catch (err) {
      this.notify.emit((err as Error).message);
    }
  }

  startNew() {
    this.formError.set('');
    this.nf.set({ title: '', sourceType: 'Otro', sourceLabel: '', owner: '', dueDate: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10), process: '', priority: 'Media', tasks: '' });
    this.creating.set(true);
  }

  setNew<K extends keyof NewState>(k: K, v: NewState[K]) {
    this.nf.update(f => ({ ...f, [k]: v }));
  }

  async createNew() {
    const f = this.nf();
    this.formError.set('');
    try {
      if (!f.sourceLabel.trim()) throw new Error('Indique de dónde nace el plan (referencia del origen).');
      const p = await this.plans.create({ ...f, sourceLabel: f.sourceLabel.trim(), process: f.process || undefined, tasks: f.tasks.split('\n') });
      this.creating.set(false);
      this.select(p.id);
      this.notify.emit(`${p.code} creado.`);
    } catch (err) {
      this.formError.set((err as Error).message);
    }
  }

  exportCsv() {
    if (!this.rs.requirePermission(['canExportReports'], 'exportar reportes')) return;
    const rows: (string | number | undefined)[][] = [
      ['Planes de acción', `Generado ${new Date().toISOString().slice(0, 16)}`, this.rs.currentProfile().name],
      [],
      ['Código', 'Plan', 'Origen', 'Referencia', 'Proceso', 'Responsable', 'Prioridad', 'Estado', 'Vencido', 'Avance %', 'Plazo', 'Plazo comprometido',
        'Reprogramaciones', 'Tareas hechas', 'Tareas', 'Evidencia de cierre', 'Verificado por', 'Fecha de cierre', 'Motivo de cancelación', 'Creado por', 'Creado'],
      ...this.filtered().map(p => [p.code, p.title, p.sourceType, p.sourceLabel, p.process ?? '', p.owner, p.priority, p.status, this.plans.isOverdue(p) ? 'Sí' : 'No',
        p.status === 'Cerrado' ? 100 : p.progressPct, p.dueDate, p.originalDueDate, p.reschedules.length, this.doneTasks(p), p.tasks.length,
        p.closure?.evidence ?? '', p.closure?.verifiedBy ?? '', p.closedAt ?? '', p.cancelReason ?? '', p.createdBy, p.createdAt.slice(0, 10)]),
    ];
    downloadCsv(`Planes_de_accion_${todayIso()}.csv`, rows);
  }
}
