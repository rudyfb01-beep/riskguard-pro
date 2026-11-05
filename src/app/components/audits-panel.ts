import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PermissionDeniedError, RiskDataService } from '../services/risk-data.service';
import { AuditFinding, PeriodicAudit } from '../models/risk.model';
import { ActionPlanService } from '../services/action-plan.service';
import { LinkedPlans, PlanChips } from './linked-plans';
import { ApprovalBox } from './approval-box';
import { EvidenceFiles } from './evidence-files';
import { ApprovalService } from '../services/approval.service';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';

const AUDIT_TYPES: PeriodicAudit['type'][] = ['Auditoría Interna', 'Auditoría Regulatoria', 'Auditoría ISO 31000', 'Prueba BCP'];
const AUDIT_STATUSES: PeriodicAudit['status'][] = ['Planificada', 'En Curso', 'Finalizada', 'Aprobada'];
const FINDING_TYPES: AuditFinding['type'][] = ['Conforme', 'Observación', 'No Conformidad Menor', 'No Conformidad Mayor'];
const FINDING_STATUSES: AuditFinding['status'][] = ['Abierto', 'En Subsanación', 'Cerrado'];

/** Plan de auditorías: alta y edición de auditorías y de sus hallazgos. */
@Component({
  selector: 'app-audits-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, LinkedPlans, PlanChips, ApprovalBox, EvidenceFiles],
  template: `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-indigo-100 text-indigo-800 rounded-lg"><mat-icon class="text-lg">fact_check</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Auditorías Periódicas</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Plan anual de auditorías, alcance por proceso, hallazgos y su subsanación. El puntaje de cada auditoría se calcula
            de sus hallazgos (−15 por no conformidad mayor, −8 por menor, −3 por observación).
          </p>
        </div>
        <button type="button" (click)="newAudit()" [class.perm-locked]="!canManage()"
          class="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0">
          <mat-icon class="text-sm">add</mat-icon>Nueva auditoría
        </button>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Auditorías</span><span class="text-2xl font-bold font-mono text-slate-900">{{ kpis().total }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200"><span class="text-[11px] font-semibold text-slate-500 block">Planificadas</span><span class="text-2xl font-bold font-mono text-slate-900">{{ kpis().planned }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-sky-200 bg-sky-50/30"><span class="text-[11px] font-semibold text-sky-800 block">En curso</span><span class="text-2xl font-bold font-mono text-sky-800">{{ kpis().inProgress }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30"><span class="text-[11px] font-semibold text-emerald-800 block">Cumplimiento global</span><span class="text-2xl font-bold font-mono text-emerald-700">{{ rs.globalAuditScore() ?? '—' }}@if (rs.globalAuditScore() !== null) {<span class="text-sm">%</span>}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30"><span class="text-[11px] font-semibold text-amber-800 block">Hallazgos abiertos</span><span class="text-2xl font-bold font-mono text-amber-900">{{ kpis().openFindings }}</span></div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-300"><span class="text-[11px] font-semibold text-rose-800 block">Hallazgos vencidos</span><span class="text-2xl font-bold font-mono text-rose-700">{{ kpis().overdue }}</span></div>
      </div>

      <div class="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
        <input type="search" placeholder="Buscar auditoría..." [value]="search()" (input)="search.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-3 py-1.5 w-60" />
        <select [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-2 py-1.5">
          <option value="">Todos los estados</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <span class="text-[11px] text-slate-500 ml-auto">{{ filtered().length }} de {{ rs.audits().length }}</span>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        @for (audit of filtered(); track audit.id) {
          <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div class="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-mono text-[11px] font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{{ audit.code }}</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold" [class]="statusClass(audit.status)">{{ audit.status }}</span>
                  <span class="text-[10px] text-slate-500">{{ audit.type }}</span>
                </div>
                <h3 class="text-sm font-bold text-slate-900 mt-1">{{ audit.title }}</h3>
                <div class="text-[11px] text-slate-500 mt-0.5">Auditor líder: {{ audit.leadAuditor }} · {{ audit.period }} · {{ audit.executionDate }}</div>
              </div>
              <div class="text-right shrink-0">
                <span class="font-mono text-lg font-bold" [class]="audit.complianceScore >= 85 ? 'text-emerald-700' : audit.complianceScore >= 70 ? 'text-amber-700' : 'text-rose-700'">{{ audit.complianceScore }}%</span>
                <span class="block text-[10px] text-slate-500">Cumplimiento</span>
              </div>
            </div>

            <div class="text-xs">
              <span class="font-semibold text-slate-700 block mb-1">Alcance</span>
              <div class="flex flex-wrap gap-1.5">
                @for (sc of audit.scope; track sc) { <span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px]">{{ sc }}</span> }
                @empty { <span class="text-[11px] text-slate-400">Sin procesos definidos.</span> }
              </div>
            </div>

            <div class="space-y-2 pt-2 border-t border-slate-100">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-slate-900">Hallazgos ({{ audit.findings.length }})</span>
                <button type="button" (click)="newFinding(audit)" [class.perm-locked]="!canManage()" class="text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer flex items-center gap-0.5"><mat-icon class="text-sm">add</mat-icon>Agregar hallazgo</button>
              </div>
              @for (f of audit.findings; track f.id) {
                <button type="button" (click)="editFinding(audit, f)" class="w-full text-left p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs space-y-1 cursor-pointer">
                  <div class="flex items-center justify-between gap-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase" [class]="findingClass(f.type)">{{ f.type }}</span>
                    <span class="text-[10px]" [class]="isOverdue(f) ? 'text-rose-700 font-bold' : 'text-slate-500'">{{ f.status }} · plazo {{ f.deadline }}{{ isOverdue(f) ? ' (vencido)' : '' }}</span>
                  </div>
                  <div class="font-medium text-slate-800">{{ f.description }}</div>
                  <div class="text-[11px] text-slate-600"><strong>Acción:</strong> {{ f.correctiveAction }} · <strong>Resp.:</strong> {{ f.responsible }} · {{ f.process }}</div>
                </button>
                @if (f.type !== 'Conforme') { <div class="-mt-1 pl-2.5"><app-plan-chips sourceType="Auditoría" [sourceId]="audit.id + '::' + f.id" /></div> }
              } @empty {
                <p class="text-[11px] text-slate-400">Sin hallazgos registrados.</p>
              }
            </div>

            <div class="pt-2 border-t border-slate-100">
              <app-evidence-files entity="audits" [entityId]="audit.id" context="informe" [label]="audit.code" [parent]="audit"
                title="Informe y papeles de trabajo" emptyText="Sin archivos: adjunte el programa, los papeles de trabajo y el informe." />
            </div>

            @if (audit.status === 'Finalizada' || approvals.forTarget('audits', audit.id).length) {
              <app-approval-box kind="informe-auditoria" [targetId]="audit.id" [targetLabel]="audit.code + ' ' + audit.title"
                title="Aprobación del informe" requestLabel="Enviar informe a aprobación"
                [hint]="audit.status === 'Finalizada' ? 'La auditoría está finalizada: envíe el informe a aprobación para cerrarla como Aprobada.' : ''"
                (notify)="notify.emit($event)" />
            }

            <div class="flex justify-end">
              <button type="button" (click)="editAudit(audit)" class="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">{{ canManage() ? 'Editar auditoría' : 'Ver detalle' }}</button>
            </div>
          </div>
        } @empty {
          <div class="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            No hay auditorías registradas.
            @if (canManage()) { <button type="button" (click)="newAudit()" class="ml-1 font-semibold text-indigo-700 hover:underline cursor-pointer">Planificar la primera</button> }
          </div>
        }
      </div>
    </div>

    <!-- Modal auditoría -->
    @if (auditDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl my-6 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2"><mat-icon class="text-indigo-700">fact_check</mat-icon>{{ isNew() ? 'Nueva auditoría' : d.code }}</h2>
            <button type="button" (click)="auditDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <fieldset class="p-6 grid grid-cols-1 sm:grid-cols-3 gap-3 max-h-[70vh] overflow-y-auto" [disabled]="!canManage()">
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Código</span><input [class]="inputCls" [value]="d.code" (input)="setAudit('code', $any($event.target).value)" /></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Título *</span><input [class]="inputCls" [value]="d.title" (input)="setAudit('title', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Tipo</span>
              <select [class]="inputCls" (change)="setAudit('type', $any($event.target).value)">@for (t of types; track t) { <option [value]="t" [selected]="t === d.type">{{ t }}</option> }</select></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Período *</span><input [class]="inputCls" placeholder="Ej. 2026-S2" [value]="d.period" (input)="setAudit('period', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Fecha de ejecución *</span><input type="date" [class]="inputCls" [value]="d.executionDate" (input)="setAudit('executionDate', $any($event.target).value)" /></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Auditor líder *</span><input [class]="inputCls" list="audit-people" [value]="d.leadAuditor" (input)="setAudit('leadAuditor', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Estado</span>
              <select [class]="inputCls" (change)="setAudit('status', $any($event.target).value)">@for (s of statuses; track s) {
                <option [value]="s" [selected]="s === d.status" [disabled]="s === 'Aprobada' && !wasApproved(d)">{{ s }}{{ s === 'Aprobada' && !wasApproved(d) ? ' (requiere aprobación)' : '' }}</option> }</select></label>
            <div class="sm:col-span-3">
              <span class="block text-[11px] font-medium text-slate-600 mb-1">Alcance: procesos auditados</span>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2 rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
                @for (p of scopeOptions(d); track p) {
                  <label class="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" class="rounded" [checked]="d.scope.includes(p)" (change)="toggleScope(p, $any($event.target).checked)" />{{ p }}</label>
                }
              </div>
            </div>
            <datalist id="audit-people">@for (u of rs.userProfiles(); track u.id) { <option [value]="u.name"></option> }</datalist>
          </fieldset>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
            @if (!isNew() && canManage()) {
              <button type="button" (click)="removeAudit(d)" class="px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">delete</mat-icon>Eliminar</button>
            }
            <span class="text-[11px] text-rose-700 flex-1">{{ formError() }}</span>
            <button type="button" (click)="auditDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
            @if (canManage()) {
              <button type="button" (click)="saveAudit()" class="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-lg cursor-pointer">Guardar auditoría</button>
            }
          </div>
        </div>
      </div>
    }

    <!-- Modal hallazgo -->
    @if (findingDraft(); as f) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl my-6 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2"><mat-icon class="text-indigo-700">rule</mat-icon>{{ findingIsNew() ? 'Nuevo hallazgo' : 'Hallazgo' }} · {{ findingAudit()?.code }}</h2>
            <button type="button" (click)="findingDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <fieldset class="p-6 grid grid-cols-1 sm:grid-cols-3 gap-3" [disabled]="!canManage()">
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Tipo</span>
              <select [class]="inputCls" (change)="setFinding('type', $any($event.target).value)">@for (t of findingTypes; track t) { <option [value]="t" [selected]="t === f.type">{{ t }}</option> }</select></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Proceso</span>
              <select [class]="inputCls" (change)="setFinding('process', $any($event.target).value)">@for (p of rs.catalog.processOptions(f.process); track p) { <option [value]="p" [selected]="p === f.process">{{ p }}</option> }</select></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Riesgo asociado</span>
              <select [class]="inputCls" (change)="setFinding('associatedRiskCode', $any($event.target).value || undefined)">
                <option value="" [selected]="!f.associatedRiskCode">—</option>
                @for (r of rs.risks(); track r.id) { <option [value]="r.code" [selected]="r.code === f.associatedRiskCode">{{ r.code }} · {{ r.title | slice:0:40 }}</option> }
              </select></label>
            <label class="block sm:col-span-3"><span class="block text-[11px] font-medium text-slate-600 mb-1">Descripción *</span><textarea rows="2" [class]="inputCls" [value]="f.description" (input)="setFinding('description', $any($event.target).value)"></textarea></label>
            <label class="block sm:col-span-3"><span class="block text-[11px] font-medium text-slate-600 mb-1">Acción correctiva *</span><textarea rows="2" [class]="inputCls" [value]="f.correctiveAction" (input)="setFinding('correctiveAction', $any($event.target).value)"></textarea></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Responsable *</span><input [class]="inputCls" list="audit-people-f" [value]="f.responsible" (input)="setFinding('responsible', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Plazo *</span><input type="date" [class]="inputCls" [value]="f.deadline" (input)="setFinding('deadline', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Estado</span>
              <select [class]="inputCls" (change)="setFinding('status', $any($event.target).value)">@for (s of findingStatuses; track s) { <option [value]="s" [selected]="s === f.status">{{ s }}</option> }</select></label>
            <datalist id="audit-people-f">@for (u of rs.userProfiles(); track u.id) { <option [value]="u.name"></option> }</datalist>
          </fieldset>
          @if (!findingIsNew() && findingAudit(); as fa) {
            <div class="px-6 pb-4">
              <app-evidence-files entity="audits" [entityId]="fa.id" [context]="f.id" [label]="fa.code" [parent]="fa"
                title="Evidencia del hallazgo" emptyText="Sin archivos." />
            </div>
          }
          @if (f.type !== 'Conforme') {
            <div class="px-6 pb-4">
              @if (findingIsNew()) {
                <p class="text-[11px] text-slate-500">Al guardar se crea un plan de acción con la acción correctiva, el responsable y el plazo, para seguir su avance y verificar el cierre.</p>
              } @else {
                <app-linked-plans sourceType="Auditoría" [sourceId]="findingAuditId() + '::' + f.id" [sourceLabel]="(findingAudit()?.code ?? '') + ' · ' + f.type + ': ' + f.description"
                  [process]="f.process" [defaultTitle]="f.correctiveAction" [defaultOwner]="f.responsible" [defaultDueDate]="f.deadline"
                  [defaultPriority]="f.type === 'No Conformidad Mayor' ? 'Alta' : f.type === 'No Conformidad Menor' ? 'Media' : 'Baja'"
                  emptyText="El hallazgo no tiene plan de acción." />
              }
            </div>
          }
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
            @if (!findingIsNew() && canManage()) {
              <button type="button" (click)="removeFinding()" class="px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">delete</mat-icon>Eliminar</button>
            }
            <span class="text-[11px] text-rose-700 flex-1">{{ formError() }}</span>
            <button type="button" (click)="findingDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
            @if (canManage()) {
              <button type="button" (click)="saveFinding()" class="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-lg cursor-pointer">Guardar hallazgo</button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class AuditsPanel {
  readonly rs = inject(RiskDataService);
  readonly actionPlans = inject(ActionPlanService);
  readonly notify = output<string>();
  readonly approvals = inject(ApprovalService);

  readonly inputCls = INPUT;
  readonly types = AUDIT_TYPES;
  readonly statuses = AUDIT_STATUSES;
  readonly findingTypes = FINDING_TYPES;
  readonly findingStatuses = FINDING_STATUSES;

  readonly canManage = computed(() => this.rs.hasPermission('canExecuteAudits'));
  readonly today = new Date().toISOString().slice(0, 10);

  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const st = this.statusFilter();
    return [...this.rs.audits()]
      .filter(a => !st || a.status === st)
      .filter(a => !q || `${a.code} ${a.title} ${a.leadAuditor} ${a.scope.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => b.executionDate.localeCompare(a.executionDate));
  });

  readonly kpis = computed(() => {
    const list = this.rs.audits();
    const findings = list.flatMap(a => a.findings);
    return {
      total: list.length,
      planned: list.filter(a => a.status === 'Planificada').length,
      inProgress: list.filter(a => a.status === 'En Curso').length,
      openFindings: findings.filter(f => f.status !== 'Cerrado' && f.type !== 'Conforme').length,
      overdue: findings.filter(f => this.isOverdue(f)).length,
    };
  });

  readonly auditDraft = signal<PeriodicAudit | null>(null);
  readonly isNew = signal(false);
  readonly formError = signal('');

  readonly findingDraft = signal<AuditFinding | null>(null);
  readonly findingAuditId = signal<string | null>(null);
  readonly findingIsNew = signal(false);
  readonly findingAudit = computed(() => this.rs.audits().find(a => a.id === this.findingAuditId()));

  isOverdue(f: AuditFinding): boolean {
    return f.status !== 'Cerrado' && f.type !== 'Conforme' && !!f.deadline && f.deadline < this.today;
  }

  statusClass(s: PeriodicAudit['status']) {
    return s === 'Aprobada' ? 'bg-emerald-100 text-emerald-800' : s === 'Finalizada' ? 'bg-teal-100 text-teal-800'
      : s === 'En Curso' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700';
  }

  findingClass(t: AuditFinding['type']) {
    return t === 'Conforme' ? 'bg-emerald-100 text-emerald-800' : t === 'Observación' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800';
  }

  scopeOptions(d: PeriodicAudit): string[] {
    const names = this.rs.catalog.processNames();
    return [...names, ...d.scope.filter(s => !names.includes(s))];
  }

  private gate(): boolean {
    return this.rs.requirePermission(['canExecuteAudits'], 'registrar o editar auditorías');
  }

  private async run(fn: () => Promise<void>, ok: string, close: () => void) {
    this.formError.set('');
    try {
      await fn();
      this.notify.emit(ok);
      close();
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) this.formError.set((err as Error).message);
    }
  }

  // --- Auditorías
  newAudit() {
    if (!this.gate()) return;
    const y = new Date().getFullYear();
    const sem = new Date().getMonth() < 6 ? 'S1' : 'S2';
    this.isNew.set(true);
    this.formError.set('');
    this.auditDraft.set({
      id: `aud-${Date.now().toString(36)}`, code: this.rs.nextAuditCode(), title: '', type: 'Auditoría Interna',
      period: `${y}-${sem}`, leadAuditor: this.rs.currentProfile().name, scope: [], executionDate: this.today,
      status: 'Planificada', complianceScore: 100, findings: [],
    });
  }

  editAudit(a: PeriodicAudit) {
    this.isNew.set(false);
    this.formError.set('');
    this.auditDraft.set({ ...a, scope: [...a.scope] });
  }

  setAudit<K extends keyof PeriodicAudit>(k: K, v: PeriodicAudit[K]) {
    this.auditDraft.update(d => (d ? { ...d, [k]: v } : d));
  }

  toggleScope(p: string, on: boolean) {
    this.auditDraft.update(d => (d ? { ...d, scope: on ? [...d.scope, p] : d.scope.filter(s => s !== p) } : d));
  }

  /** La auditoría guardada ya está aprobada (el estado Aprobada solo se obtiene por aprobación). */
  wasApproved(d: PeriodicAudit) {
    return this.rs.audits().find(a => a.id === d.id)?.status === 'Aprobada';
  }

  saveAudit() {
    const d = this.auditDraft();
    if (!d) return;
    if (d.status === 'Aprobada' && !this.wasApproved(d)) {
      this.formError.set('Deje la auditoría Finalizada y envíe el informe a aprobación.');
      return;
    }
    if (!d.title.trim() || !d.period.trim() || !d.leadAuditor.trim() || !d.executionDate) {
      this.formError.set('Completa título, período, auditor líder y fecha.');
      return;
    }
    const code = d.code.trim().toUpperCase();
    if (this.rs.audits().some(a => a.id !== d.id && a.code.toUpperCase() === code)) {
      this.formError.set(`El código ${code} ya existe.`);
      return;
    }
    // Conserva los hallazgos vigentes (pudieron cambiar mientras el formulario estaba abierto).
    const current = this.rs.audits().find(a => a.id === d.id);
    const audit = { ...d, code, title: d.title.trim(), findings: current?.findings ?? d.findings };
    void this.run(() => this.rs.saveAudit(audit), `Auditoría ${code} guardada.`, () => this.auditDraft.set(null));
  }

  removeAudit(d: PeriodicAudit) {
    void this.run(() => this.rs.deleteAudit(d.id), `Auditoría ${d.code} eliminada.`, () => this.auditDraft.set(null));
  }

  // --- Hallazgos
  newFinding(a: PeriodicAudit) {
    if (!this.gate()) return;
    const deadline = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    this.findingAuditId.set(a.id);
    this.findingIsNew.set(true);
    this.formError.set('');
    this.findingDraft.set({
      id: `fnd-${Date.now().toString(36)}`, type: 'Observación', description: '', process: a.scope[0] ?? this.rs.catalog.processNames()[0] ?? '',
      correctiveAction: '', deadline, responsible: '', status: 'Abierto',
    });
  }

  editFinding(a: PeriodicAudit, f: AuditFinding) {
    this.findingAuditId.set(a.id);
    this.findingIsNew.set(false);
    this.formError.set('');
    this.findingDraft.set({ ...f });
  }

  setFinding<K extends keyof AuditFinding>(k: K, v: AuditFinding[K]) {
    this.findingDraft.update(f => (f ? { ...f, [k]: v } : f));
  }

  saveFinding() {
    const f = this.findingDraft();
    const auditId = this.findingAuditId();
    if (!f || !auditId) return;
    if (!f.description.trim() || !f.correctiveAction.trim() || !f.responsible.trim() || !f.deadline || !f.process) {
      this.formError.set('Completa descripción, acción correctiva, responsable, plazo y proceso.');
      return;
    }
    const isNew = this.findingIsNew();
    const clean = { ...f, description: f.description.trim(), correctiveAction: f.correctiveAction.trim(), responsible: f.responsible.trim() };
    const audit = this.findingAudit();
    void this.run(async () => {
      await this.rs.saveAuditFinding(auditId, clean);
      // Un hallazgo nuevo con acción correctiva nace con su plan de acción.
      if (isNew && clean.type !== 'Conforme' && clean.status !== 'Cerrado') {
        await this.actionPlans.create({
          title: clean.correctiveAction, description: clean.description, sourceType: 'Auditoría', sourceId: `${auditId}::${clean.id}`,
          sourceLabel: `${audit?.code ?? ''} · ${clean.type}: ${clean.description}`, process: clean.process, owner: clean.responsible,
          dueDate: clean.deadline, priority: clean.type === 'No Conformidad Mayor' ? 'Alta' : clean.type === 'No Conformidad Menor' ? 'Media' : 'Baja',
        });
      }
    }, isNew && clean.type !== 'Conforme' && clean.status !== 'Cerrado' ? 'Hallazgo guardado con su plan de acción.' : 'Hallazgo guardado.', () => this.findingDraft.set(null));
  }

  removeFinding() {
    const f = this.findingDraft();
    const auditId = this.findingAuditId();
    if (!f || !auditId) return;
    void this.run(() => this.rs.deleteAuditFinding(auditId, f.id), 'Hallazgo eliminado.', () => this.findingDraft.set(null));
  }
}
