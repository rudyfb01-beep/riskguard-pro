import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ActionPlanService } from '../services/action-plan.service';
import { RiskDataService } from '../services/risk-data.service';
import { ACTION_PLAN_PRIORITIES, ActionPlan, ActionPlanPriority, ActionPlanSource } from '../models/action-plan.model';
import { planStatusClass } from '../utils/action-plans';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500';

const plusDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Planes de acción vinculados a un registro (riesgo, control, hallazgo, requisito…), con
 * creación rápida. Al hacer clic en un plan se abre en la pestaña Planes de Acción.
 */
@Component({
  selector: 'app-linked-plans',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="rounded-xl border border-slate-200 bg-white">
      <div class="px-3 py-2 flex items-center justify-between gap-2 border-b border-slate-100">
        <span class="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
          <mat-icon class="text-[16px] w-4 h-4 text-emerald-700">assignment_turned_in</mat-icon>
          Planes de acción
          @if (linked().length) {
            <span class="font-normal text-slate-500">· {{ openCount() }} {{ openCount() === 1 ? 'abierto' : 'abiertos' }}@if (overdueCount()) { · <strong class="text-rose-700">{{ overdueCount() }} {{ overdueCount() === 1 ? 'vencido' : 'vencidos' }}</strong> }</span>
          }
        </span>
        @if (canCreate() && !creating()) {
          <button type="button" (click)="startCreate()" class="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer flex items-center gap-0.5">
            <mat-icon class="text-[14px] w-3.5 h-3.5">add</mat-icon>Crear plan
          </button>
        }
      </div>

      @if (linked().length) {
        <ul class="divide-y divide-slate-100">
          @for (p of linked(); track p.id) {
            <li>
              <button type="button" (click)="plans.open(p.id)" class="w-full text-left px-3 py-2 hover:bg-slate-50 cursor-pointer flex items-center gap-2.5" [title]="'Abrir ' + p.code + ' en Planes de Acción'">
                <span class="font-mono text-[10px] text-slate-500 w-[74px] shrink-0">{{ p.code }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-[11px] font-semibold text-slate-900 truncate">{{ p.title }}</span>
                  <span class="block text-[10px] text-slate-500 truncate">{{ p.owner }} · plazo <span [class.text-rose-700]="plans.isOverdue(p)" [class.font-bold]="plans.isOverdue(p)">{{ p.dueDate }}</span>@if (p.reschedules.length) { · reprogramado }</span>
                </span>
                <span class="w-16 shrink-0 hidden sm:block" [attr.aria-label]="'Avance ' + p.progressPct + ' %'">
                  <span class="block h-1.5 rounded-full bg-slate-100 overflow-hidden"><span class="block h-full rounded-full bg-emerald-600" [style.width.%]="p.status === 'Cerrado' ? 100 : p.progressPct"></span></span>
                  <span class="block text-[9px] text-slate-500 text-right tabular-nums">{{ p.status === 'Cerrado' ? 100 : p.progressPct }} %</span>
                </span>
                <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0" [class]="statusClass(p)">{{ plans.isOverdue(p) ? 'Vencido' : p.status }}</span>
              </button>
            </li>
          }
        </ul>
      } @else if (!creating()) {
        <p class="px-3 py-2 text-[11px] text-slate-500">{{ emptyText() }}</p>
      }

      @if (creating()) {
        <div class="p-3 border-t border-slate-100 bg-emerald-50/40 grid grid-cols-1 sm:grid-cols-4 gap-2">
          <label class="block sm:col-span-4"><span class="block text-[10px] text-slate-600 mb-0.5">Qué se hará *</span>
            <input [id]="uid + '-title'" [class]="inputCls" [value]="title()" (input)="title.set($any($event.target).value)" placeholder="Acción concreta y verificable" /></label>
          <label class="block sm:col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Responsable *</span>
            <input [id]="uid + '-owner'" [class]="inputCls" [attr.list]="uid + '-people'" [value]="owner()" (input)="owner.set($any($event.target).value)" />
            <datalist [id]="uid + '-people'">@for (u of people(); track u) { <option [value]="u"></option> }</datalist></label>
          <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Plazo *</span>
            <input [id]="uid + '-due'" type="date" [class]="inputCls" [value]="due()" (input)="due.set($any($event.target).value)" /></label>
          <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Prioridad</span>
            <select [id]="uid + '-prio'" [class]="inputCls" (change)="priority.set($any($event.target).value)">
              @for (pr of priorities; track pr) { <option [value]="pr" [selected]="pr === priority()">{{ pr }}</option> }
            </select></label>
          <label class="block sm:col-span-4"><span class="block text-[10px] text-slate-600 mb-0.5">Tareas (opcional, una por línea)</span>
            <textarea [id]="uid + '-tasks'" rows="2" [class]="inputCls" [value]="tasks()" (input)="tasks.set($any($event.target).value)"></textarea></label>
          @if (error()) { <p class="sm:col-span-4 text-[11px] text-rose-700" role="alert">{{ error() }}</p> }
          <div class="sm:col-span-4 flex justify-end gap-2">
            <button type="button" (click)="creating.set(false)" class="px-3 py-1.5 text-[11px] rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
            <button type="button" (click)="create()" [disabled]="busy()" class="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer disabled:opacity-60">Crear plan</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class LinkedPlans {
  readonly plans = inject(ActionPlanService);
  private readonly rs = inject(RiskDataService);

  readonly sourceType = input.required<ActionPlanSource>();
  readonly sourceId = input<string | undefined>(undefined);
  readonly sourceLabel = input.required<string>();
  readonly process = input<string | undefined>(undefined);
  readonly defaultTitle = input('');
  readonly defaultOwner = input('');
  readonly defaultDueDate = input('');
  readonly defaultPriority = input<ActionPlanPriority>('Media');
  readonly emptyText = input('Sin planes de acción.');

  readonly uid = `lp-${Math.random().toString(36).slice(2, 8)}`;
  readonly inputCls = INPUT;
  readonly priorities = ACTION_PLAN_PRIORITIES;

  readonly linked = computed(() => this.plans.forSource(this.sourceType(), this.sourceId()));
  readonly openCount = computed(() => this.linked().filter(p => ['Pendiente', 'En curso', 'Por verificar'].includes(p.status)).length);
  readonly overdueCount = computed(() => this.linked().filter(p => this.plans.isOverdue(p)).length);
  readonly canCreate = computed(() => !!this.sourceId() && this.plans.canCreateFrom(this.sourceType()));
  readonly people = computed(() => [...new Set(this.rs.userProfiles().filter(u => u.active !== false).map(u => u.name))].sort((a, b) => a.localeCompare(b, 'es')));

  readonly creating = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly title = signal('');
  readonly owner = signal('');
  readonly due = signal('');
  readonly priority = signal<ActionPlanPriority>('Media');
  readonly tasks = signal('');

  statusClass(p: ActionPlan) {
    return planStatusClass(p, this.plans.isOverdue(p));
  }

  startCreate() {
    this.error.set('');
    this.title.set(this.defaultTitle());
    this.owner.set(this.defaultOwner());
    this.due.set(this.defaultDueDate() && this.defaultDueDate() >= new Date().toISOString().slice(0, 10) ? this.defaultDueDate() : plusDays(60));
    this.priority.set(this.defaultPriority());
    this.tasks.set('');
    this.creating.set(true);
  }

  async create() {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.plans.create({
        title: this.title(), owner: this.owner(), dueDate: this.due(), priority: this.priority(), sourceType: this.sourceType(),
        sourceId: this.sourceId(), sourceLabel: this.sourceLabel(), process: this.process(), tasks: this.tasks().split('\n'),
      });
      this.creating.set(false);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}

/** Chips compactos con los planes de un registro (para listas); cada chip abre el plan. */
@Component({
  selector: 'app-plan-chips',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    @if (linked().length) {
      <span class="inline-flex flex-wrap items-center gap-1">
        <span class="text-[10px] text-slate-500">Planes:</span>
        @for (p of linked(); track p.id) {
          <button type="button" (click)="$event.stopPropagation(); plans.open(p.id)" class="text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer hover:ring-1 hover:ring-slate-300"
            [class]="statusClass(p)" [title]="p.title + ' · ' + p.owner + ' · plazo ' + p.dueDate + ' · ' + p.status">{{ p.code }} · {{ plans.isOverdue(p) ? 'vencido' : p.status.toLowerCase() }}</button>
        }
      </span>
    }
  `,
})
export class PlanChips {
  readonly plans = inject(ActionPlanService);
  readonly sourceType = input.required<ActionPlanSource>();
  readonly sourceId = input<string | undefined>(undefined);
  /** Solo planes abiertos (por defecto se muestran todos menos los cancelados). */
  readonly onlyOpen = input(false);

  readonly linked = computed(() => this.plans.forSource(this.sourceType(), this.sourceId())
    .filter(p => p.status !== 'Cancelado' && (!this.onlyOpen() || ['Pendiente', 'En curso', 'Por verificar'].includes(p.status))));

  statusClass(p: ActionPlan) {
    return planStatusClass(p, this.plans.isOverdue(p));
  }
}
