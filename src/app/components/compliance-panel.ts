import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PermissionDeniedError, RiskDataService } from '../services/risk-data.service';
import { ComplianceService } from '../services/compliance.service';
import { COMPLIANCE_STATUSES, ComplianceRequirement, ComplianceStatus, RanChapter } from '../models/compliance.model';
import { downloadCsv } from '../utils/csv';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';

const MODULE_LABELS: Record<string, string> = {
  'proveedores': 'Proveedores', 'continuidad': 'Continuidad', 'seguridad-informacion': 'Seguridad de la Información',
  'reportes-regulatorios': 'Reporte CMF / ANCI', 'incidentes-perdidas': 'Incidentes y Pérdidas', 'auditorias': 'Auditorías',
  'reportes-pdf': 'Reportes', 'matriz-riesgos': 'Matriz de riesgos', 'cumplimiento-ran': 'Evidencia documental',
};

/** Matriz de cumplimiento de las RAN 20-7, 20-8, 20-9 y 20-10. */
@Component({
  selector: 'app-compliance-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg"><mat-icon class="text-lg">policy</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Cumplimiento RAN 20-7, 20-8, 20-9 y 20-10</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Requisitos por numeral de los capítulos de la RAN que aplican a la cooperativa vía el Capítulo CAC-3 (el "Directorio"
            corresponde al Consejo de Administración). Cada requisito indica qué módulo lo soporta, la evidencia calculada con los
            datos del sistema y la evaluación de Cumplimiento.
          </p>
        </div>
        <button type="button" (click)="exportCsv()" [class.perm-locked]="!rs.canAny('canExportReports')"
          class="px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0">
          <mat-icon class="text-sm text-emerald-600">download</mat-icon>Exportar matriz
        </button>
      </div>

      <div class="p-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex items-start gap-2">
        <mat-icon class="text-sm text-amber-600 shrink-0">info</mat-icon>
        <span>Los requisitos están resumidos del texto de cada capítulo y deben validarse contra la versión vigente publicada por la CMF.
          La RAN 20-7 tiene una actualización en consulta (abril de 2026) que agregaría el archivo I28 de servicios externalizados, semestral para cooperativas.</span>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        @for (c of comp.byChapter(); track c.id) {
          <button type="button" (click)="chapter.set(chapter() === c.id ? '' : c.id)"
            class="text-left bg-white p-3.5 rounded-xl border cursor-pointer"
            [class]="chapter() === c.id ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'">
            <span class="text-[11px] font-bold text-slate-900 block">RAN {{ c.id }}</span>
            <span class="text-[10px] text-slate-500 block truncate">{{ c.title }}</span>
            <span class="text-2xl font-bold font-mono" [class]="pctClass(c.pct)">{{ c.pct === null ? '—' : c.pct + '%' }}</span>
            <span class="block text-[10px] text-slate-500">{{ c.rated }} de {{ c.total }} evaluados · {{ c.gaps }} brechas@if (c.overdue) { · <strong class="text-rose-700">{{ c.overdue }} revisiones vencidas</strong> }</span>
          </button>
        }
      </div>

      @if (!canManage()) {
        <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 flex items-start gap-2">
          <mat-icon class="text-sm text-slate-500 shrink-0">lock</mat-icon>
          <span>Vista de consulta: evaluar requisitos requiere el permiso de reportes regulatorios (CMF/ANCI).</span>
        </div>
      }

      <div class="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
        <input type="search" placeholder="Buscar requisito o numeral..." [value]="search()" (input)="search.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-3 py-1.5 w-64" />
        <select [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-2 py-1.5">
          <option value="">Todos los estados</option>
          <option value="brechas">Solo brechas</option>
          <option value="sugerencia">Con sugerencia distinta</option>
          <option value="vencidas">Revisión vencida</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
        <span class="text-[11px] text-slate-500 ml-auto">{{ filtered().length }} de {{ comp.requirements().length }}</span>
      </div>

      @for (c of comp.chapters; track c.id) {
        @let items = itemsOf(c.id);
        @if (items.length) {
          <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>RAN {{ c.id }} · {{ c.title }}</span><span class="font-normal text-[10px] text-slate-500">{{ c.source }}</span>
            </div>
            <div class="divide-y divide-slate-100">
              @for (i of items; track i.id) {
                @let auto = comp.autoCheck(i.autoCheck);
                <div class="px-4 py-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-xs font-semibold text-slate-900"><span class="font-mono text-[10px] text-slate-400 mr-1.5">{{ i.numeral }}</span>{{ i.title }}</div>
                      <div class="text-[11px] text-slate-600 mt-0.5">{{ i.requirement }}</div>
                      <div class="flex flex-wrap items-center gap-2 mt-1.5 text-[10px]">
                        @if (i.module) {
                          <button type="button" (click)="openModule.emit(i.module)" class="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer flex items-center gap-0.5"><mat-icon class="text-[12px] w-3 h-3">open_in_new</mat-icon>{{ moduleLabel(i.module) }}</button>
                        }
                        <span class="text-slate-500">{{ i.frequency }}</span>
                        @if (i.lastReviewDate) {
                          <span [class]="comp.isReviewOverdue(i) ? 'text-rose-700 font-bold' : 'text-slate-400'">Revisado {{ i.lastReviewDate }}@if (comp.nextReview(i)) { · próxima {{ comp.nextReview(i) }} }</span>
                        }
                      </div>
                      @if (auto) {
                        <div class="mt-1.5 text-[11px] text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 inline-flex items-start gap-1">
                          <mat-icon class="text-[14px] w-3.5 h-3.5 text-indigo-500 shrink-0">insights</mat-icon>
                          <span>{{ auto.text }}@if (auto.suggested && auto.suggested !== i.status) { <strong> Sugerido: {{ auto.suggested }}.</strong> }</span>
                        </div>
                      }
                      @if (editing()?.id !== i.id && (i.evidence || i.actionPlan)) {
                        <div class="mt-1.5 text-[11px] text-slate-600 space-y-0.5">
                          @if (i.evidence) { <div><strong>Evidencia:</strong> {{ i.evidence }}</div> }
                          @if (i.actionPlan) { <div><strong>Plan de acción:</strong> {{ i.actionPlan }}@if (i.dueDate) { <span class="font-mono"> (hasta {{ i.dueDate }})</span> }@if (i.owner) { · {{ i.owner }} }</div> }
                        </div>
                      }
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" [class]="statusClass(i.status)">{{ i.status }}</span>
                      @if (canManage() && editing()?.id !== i.id) {
                        <button type="button" (click)="edit(i, auto?.suggested)" class="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">Evaluar</button>
                      }
                    </div>
                  </div>
                  @if (editing(); as e) {
                    @if (e.id === i.id) {
                      <div class="mt-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 grid grid-cols-1 md:grid-cols-4 gap-2.5">
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Estado</span>
                          <select [class]="inputCls" (change)="set('status', $any($event.target).value)">@for (s of statuses; track s) { <option [value]="s" [selected]="s === e.status">{{ s }}</option> }</select></label>
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Responsable</span><input [class]="inputCls" [value]="e.owner" (input)="set('owner', $any($event.target).value)" /></label>
                        <label class="block md:col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Evidencia (documento, acta, sesión del Consejo, enlace)</span><input [class]="inputCls" [value]="e.evidence" (input)="set('evidence', $any($event.target).value)" /></label>
                        <label class="block md:col-span-3"><span class="block text-[10px] text-slate-600 mb-0.5">Plan de acción</span><input [class]="inputCls" [value]="e.actionPlan" (input)="set('actionPlan', $any($event.target).value)" /></label>
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Plazo</span><input type="date" [class]="inputCls" [value]="e.dueDate ?? ''" (input)="set('dueDate', $any($event.target).value || undefined)" /></label>
                        <div class="md:col-span-4 flex justify-end gap-2">
                          <button type="button" (click)="editing.set(null)" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
                          <button type="button" (click)="save()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer">Guardar evaluación</button>
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
    </div>
  `,
})
export class CompliancePanel {
  readonly rs = inject(RiskDataService);
  readonly comp = inject(ComplianceService);
  readonly notify = output<string>();
  readonly openModule = output<string>();

  readonly inputCls = INPUT;
  readonly statuses = COMPLIANCE_STATUSES;
  readonly canManage = computed(() => this.rs.hasPermission('canManageRegulatoryReports'));

  readonly chapter = signal<RanChapter | ''>('');
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly editing = signal<ComplianceRequirement | null>(null);

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const st = this.statusFilter();
    const ch = this.chapter();
    return this.comp.sorted().filter(r => {
      if (ch && r.chapter !== ch) return false;
      if (q && !`${r.numeral} ${r.title} ${r.requirement} ${r.evidence}`.toLowerCase().includes(q)) return false;
      if (st === 'brechas') return r.status === 'No cumple' || r.status === 'Cumple parcialmente';
      if (st === 'vencidas') return this.comp.isReviewOverdue(r);
      if (st === 'sugerencia') { const a = this.comp.autoCheck(r.autoCheck); return !!a?.suggested && a.suggested !== r.status; }
      return !st || r.status === st;
    });
  });

  itemsOf(chapter: RanChapter) {
    return this.filtered().filter(r => r.chapter === chapter);
  }

  moduleLabel(m: string) {
    return MODULE_LABELS[m] ?? m;
  }

  pctClass(p: number | null) {
    return p === null ? 'text-slate-400' : p >= 85 ? 'text-emerald-700' : p >= 60 ? 'text-amber-700' : 'text-rose-700';
  }

  statusClass(s: ComplianceStatus) {
    switch (s) {
      case 'Cumple': return 'bg-emerald-100 text-emerald-800';
      case 'Cumple parcialmente': return 'bg-amber-100 text-amber-800';
      case 'No cumple': return 'bg-rose-100 text-rose-800';
      case 'No aplica': return 'bg-slate-100 text-slate-500';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  edit(i: ComplianceRequirement, suggested?: ComplianceStatus) {
    this.editing.set({ ...i, status: i.status === 'Sin evaluar' && suggested ? suggested : i.status });
  }

  set<K extends keyof ComplianceRequirement>(k: K, v: ComplianceRequirement[K]) {
    this.editing.update(e => (e ? { ...e, [k]: v } : e));
  }

  async save() {
    const e = this.editing();
    if (!e) return;
    try {
      await this.comp.evaluate(e);
      this.editing.set(null);
      this.notify.emit(`RAN ${e.chapter} ${e.numeral}: ${e.status}.`);
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) this.notify.emit((err as Error).message);
    }
  }

  exportCsv() {
    if (!this.rs.requirePermission(['canExportReports'], 'exportar reportes')) return;
    const rows: (string | number | undefined)[][] = [
      ['Matriz de cumplimiento RAN 20-7, 20-8, 20-9 y 20-10', `Generado ${new Date().toISOString().slice(0, 16)}`, this.rs.currentProfile().name],
      [],
      ['Capítulo', 'Numeral', 'Requisito', 'Detalle', 'Módulo', 'Frecuencia', 'Evidencia automática', 'Estado sugerido', 'Estado',
        'Evidencia', 'Responsable', 'Plan de acción', 'Plazo', 'Última revisión', 'Revisado por', 'Próxima revisión'],
      ...this.comp.sorted().map(r => {
        const a = this.comp.autoCheck(r.autoCheck);
        return [`RAN ${r.chapter}`, r.numeral, r.title, r.requirement, r.module ? this.moduleLabel(r.module) : '', r.frequency,
          a?.text ?? '', a?.suggested ?? '', r.status, r.evidence, r.owner, r.actionPlan, r.dueDate ?? '', r.lastReviewDate ?? '',
          r.reviewedBy ?? '', this.comp.nextReview(r) ?? ''];
      }),
    ];
    downloadCsv(`Cumplimiento_RAN_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
}
