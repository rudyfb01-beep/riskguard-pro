import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { EvidenceFiles } from './evidence-files';
import { ApprovalService } from '../services/approval.service';
import { RiskDataService } from '../services/risk-data.service';
import { APPROVAL_KIND_LIST, APPROVAL_KINDS, ApprovalKind, ApprovalRequest, ApprovalStatus } from '../models/approval.model';
import { downloadCsv } from '../utils/csv';
import { todayIso } from '../utils/action-plans';
import { daysBetween } from '../utils/notifications';
import { lastActivity } from '../utils/approvals';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500';
type View = 'por-resolver' | 'mias' | 'todas';

@Component({
  selector: 'app-approvals-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, EvidenceFiles],
  template: `
    <section class="space-y-5">
      <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0"><mat-icon>approval</mat-icon></div>
          <div class="flex-1 min-w-0">
            <h2 class="text-lg font-bold text-slate-900">Aprobaciones</h2>
            <p class="text-xs text-slate-600 mt-1 max-w-3xl">
              Solicitudes que requieren la aprobación de otro cargo antes de aplicarse: aceptación de riesgos sobre el apetito y de vulnerabilidades,
              planes de continuidad, informes de auditoría y reprogramación de planes de acción. Los niveles se configuran en Mantenedores; quien
              solicita no puede aprobar, y al aprobarse el último nivel el cambio se aplica al registro y queda en la bitácora.
            </p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
        @for (k of kpiTiles(); track k.label) {
          <button type="button" (click)="k.view && setView(k.view)" class="text-left bg-white rounded-xl border p-3 transition-colors"
            [class]="k.view && view() === k.view ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'" [class.cursor-pointer]="!!k.view">
            <div class="text-[10px] font-bold uppercase tracking-wide text-slate-500">{{ k.label }}</div>
            <div class="text-2xl font-bold mt-1" [class]="k.tone">{{ k.value }}</div>
            <div class="text-[11px] text-slate-500">{{ k.hint }}</div>
          </button>
        }
      </div>

      <div class="bg-white rounded-2xl border border-slate-200 shadow-2xs">
        @if (selected(); as r) {
          <div class="p-5 space-y-4">
            <div class="flex items-start gap-3 flex-wrap">
              <button type="button" (click)="selectedId.set(null)" class="text-[11px] text-emerald-700 hover:underline cursor-pointer flex items-center gap-0.5"><mat-icon class="text-[14px] w-3.5 h-3.5">arrow_back</mat-icon>Solicitudes</button>
              <span class="flex-1"></span>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold" [class]="statusClass(r.status)">{{ r.status }}</span>
            </div>
            <div>
              <div class="text-[11px] font-mono text-slate-500">{{ r.code }} · {{ kindInfo(r.kind).label }}</div>
              <h3 class="text-base font-bold text-slate-900 mt-0.5">{{ r.targetLabel }}</h3>
              <p class="text-xs text-slate-600 mt-1">{{ svc.summary(r) }}.</p>
              <button type="button" (click)="goTo.emit(kindInfo(r.kind).tab)" class="mt-1 text-[11px] text-emerald-700 hover:underline cursor-pointer flex items-center gap-1">
                <mat-icon class="text-sm">open_in_new</mat-icon>Ver el registro en {{ moduleName(r.kind) }}</button>
            </div>
            <div class="grid md:grid-cols-2 gap-4 text-xs">
              <div class="rounded-xl border border-slate-200 p-3">
                <div class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Justificación</div>
                <p class="text-slate-800 whitespace-pre-line">{{ r.justification }}</p>
                <div class="mt-2 text-slate-500">Solicitado por <strong class="text-slate-700">{{ r.requestedBy }}</strong> el {{ r.requestedAt.slice(0, 16).replace('T', ' ') }}</div>
                @if (r.status === 'Aprobada') { <div class="mt-2 text-emerald-800 bg-emerald-50 rounded-lg p-2">{{ kindInfo(r.kind).effect }}</div> }
                @if (r.status === 'Anulada') { <div class="mt-2 text-slate-600">Anulada{{ r.cancelReason ? ': ' + r.cancelReason : '' }}.</div> }
              </div>
              <div class="rounded-xl border border-slate-200 p-3">
                <div class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">Niveles de aprobación</div>
                <ol class="space-y-2">
                  @for (s of r.steps; track $index) {
                    <li class="flex items-start gap-2">
                      <span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        [class]="s.decision === 'Aprobada' ? 'bg-emerald-600 text-white' : s.decision === 'Rechazada' ? 'bg-rose-600 text-white' : ($index === r.currentStep && r.status === 'Pendiente' ? 'bg-amber-400 text-slate-900' : 'bg-slate-200 text-slate-600')">
                        @if (s.decision === 'Aprobada') { ✓ } @else if (s.decision === 'Rechazada') { ✕ } @else { {{ $index + 1 }} }
                      </span>
                      <div class="min-w-0">
                        <div class="font-semibold text-slate-800">{{ s.roleTitle }}</div>
                        @if (s.decision) {
                          <div class="text-slate-600">{{ s.decision }} por {{ s.decidedBy }} · {{ s.decidedAt?.slice(0, 16)?.replace('T', ' ') }}</div>
                          @if (s.comment) { <div class="text-slate-700 italic">"{{ s.comment }}"</div> }
                        } @else if ($index === r.currentStep && r.status === 'Pendiente') {
                          <div class="text-amber-800">Pendiente{{ svc.approversOf(r).length ? ' · ' + svc.approversOf(r).join(', ') : ' · nadie más tiene este cargo' }}</div>
                        } @else {
                          <div class="text-slate-400">—</div>
                        }
                      </div>
                    </li>
                  }
                </ol>
              </div>
            </div>

            <div class="grid md:grid-cols-2 gap-4">
              <div class="rounded-xl border border-slate-200 p-3">
                <app-evidence-files entity="approvals" [entityId]="r.id" [label]="r.code" [parent]="r" title="Respaldos de la solicitud"
                  [emptyText]="r.status === 'Pendiente' ? 'Quien solicita o quien aprueba puede adjuntar respaldos.' : 'Sin respaldos.'" />
              </div>
              <div class="rounded-xl border border-slate-200 p-3">
                <app-evidence-files [entity]="r.targetEntity" [entityId]="r.targetId" [label]="r.targetLabel" [readonly]="true"
                  [title]="'Evidencias del registro (' + moduleName(r.kind) + ')'" emptyText="El registro no tiene archivos adjuntos." />
              </div>
            </div>

            @if (svc.canDecide(r)) {
              <div class="rounded-xl border-2 border-amber-300 bg-amber-50/60 p-3 space-y-2">
                <div class="text-xs font-bold text-amber-900">Su decisión como {{ r.steps[r.currentStep].roleTitle }}</div>
                <textarea rows="2" [class]="inputCls" [value]="comment()" (input)="comment.set($any($event.target).value)" placeholder="Comentario (obligatorio para rechazar)"></textarea>
                @if (error()) { <p class="text-xs text-rose-700" role="alert">{{ error() }}</p> }
                <div class="flex gap-2 justify-end">
                  <button type="button" (click)="decide(r, 'Rechazada')" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-rose-300 text-rose-700 font-semibold hover:bg-rose-50 cursor-pointer">Rechazar</button>
                  <button type="button" (click)="decide(r, 'Aprobada')" class="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">check</mat-icon>Aprobar</button>
                </div>
              </div>
            } @else if (r.status === 'Pendiente' && svc.isMine(r)) {
              <div class="rounded-xl border border-slate-200 p-3 space-y-2">
                <div class="text-xs text-slate-600">Usted solicitó esta aprobación; la resuelve {{ r.steps[r.currentStep].roleTitle }}.</div>
                @if (confirmCancel()) {
                  <input type="text" [class]="inputCls" [value]="comment()" (input)="comment.set($any($event.target).value)" placeholder="Motivo de la anulación (opcional)" />
                  <div class="flex gap-2 justify-end">
                    <button type="button" (click)="confirmCancel.set(false)" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white cursor-pointer">Volver</button>
                    <button type="button" (click)="cancel(r)" class="px-3 py-1.5 text-xs rounded-lg bg-rose-600 text-white font-semibold cursor-pointer">Anular solicitud</button>
                  </div>
                } @else {
                  <button type="button" (click)="confirmCancel.set(true)" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Anular</button>
                }
              </div>
            }
          </div>
        } @else {
          <div class="p-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
            @for (v of views; track v.id) {
              <button type="button" (click)="setView(v.id)" class="px-3 py-1.5 text-xs rounded-lg font-semibold cursor-pointer"
                [class]="view() === v.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'">{{ v.label }}</button>
            }
            <span class="flex-1"></span>
            <select [class]="selectCls" [value]="kindFilter()" (change)="kindFilter.set($any($event.target).value)" aria-label="Tipo">
              <option value="">Todos los tipos</option>
              @for (k of kindList; track k) { <option [value]="k">{{ kindInfo(k).short }}</option> }
            </select>
            @if (view() === 'todas') {
              <select [class]="selectCls" [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)" aria-label="Estado">
                <option value="">Todos los estados</option>
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            }
            <button type="button" (click)="export()" class="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">download</mat-icon>Exportar</button>
          </div>
          @if (list().length === 0) {
            <div class="p-8 text-center text-xs text-slate-500">
              {{ view() === 'por-resolver' ? 'No tiene solicitudes por resolver.' : view() === 'mias' ? 'No ha enviado solicitudes.' : 'No hay solicitudes.' }}
            </div>
          } @else {
            <ul class="divide-y divide-slate-100">
              @for (r of list(); track r.id) {
                <li>
                  <button type="button" (click)="select(r.id)" class="w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer flex flex-wrap items-center gap-3">
                    <mat-icon class="text-lg text-slate-500">{{ kindInfo(r.kind).icon }}</mat-icon>
                    <div class="flex-1 min-w-[220px]">
                      <div class="text-[11px] text-slate-500"><span class="font-mono">{{ r.code }}</span> · {{ kindInfo(r.kind).short }} · {{ r.requestedBy }}</div>
                      <div class="text-sm font-semibold text-slate-900">{{ r.targetLabel }}</div>
                    </div>
                    <div class="text-[11px] text-slate-600 text-right">
                      @if (r.status === 'Pendiente') {
                        Nivel {{ r.currentStep + 1 }}/{{ r.steps.length }} · {{ r.steps[r.currentStep].roleTitle }}
                        <div [class]="idle(r) >= 3 ? 'text-rose-700 font-semibold' : 'text-slate-500'">{{ idle(r) === 0 ? 'hoy' : 'hace ' + idle(r) + ' día' + (idle(r) === 1 ? '' : 's') }}</div>
                      } @else {
                        {{ r.closedAt?.slice(0, 10) }}
                      }
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold" [class]="statusClass(r.status)">{{ r.status }}</span>
                  </button>
                </li>
              }
            </ul>
          }
        }
      </div>
    </section>
  `,
})
export class ApprovalsPanel {
  readonly svc = inject(ApprovalService);
  private readonly rs = inject(RiskDataService);

  readonly notify = output<string>();
  readonly goTo = output<string>();

  readonly inputCls = INPUT;
  readonly selectCls = INPUT.replace('w-full ', '');
  readonly kindList = APPROVAL_KIND_LIST;
  readonly statuses: ApprovalStatus[] = ['Pendiente', 'Aprobada', 'Rechazada', 'Anulada'];
  readonly views: { id: View; label: string }[] = [
    { id: 'por-resolver', label: 'Por resolver' }, { id: 'mias', label: 'Mis solicitudes' }, { id: 'todas', label: 'Todas' },
  ];

  readonly view = signal<View>(this.svc.pendingForMe().length ? 'por-resolver' : 'todas');
  readonly kindFilter = signal<ApprovalKind | ''>('');
  readonly statusFilter = signal<ApprovalStatus | ''>('');
  readonly selectedId = signal<string | null>(null);
  readonly comment = signal('');
  readonly error = signal('');
  readonly confirmCancel = signal(false);

  constructor() {
    effect(() => {
      const req = this.svc.openRequest();
      if (!req) return;
      untracked(() => {
        this.svc.openRequest.set(null);
        this.select(req.id);
      });
    });
  }

  readonly selected = computed(() => (this.selectedId() ? this.svc.get(this.selectedId()!) ?? null : null));

  readonly list = computed(() => {
    const base = this.view() === 'por-resolver' ? this.svc.pendingForMe() : this.view() === 'mias' ? this.svc.mine() : this.svc.sorted();
    const k = this.kindFilter();
    const s = this.statusFilter();
    return base.filter(r => (!k || r.kind === k) && (this.view() !== 'todas' || !s || r.status === s));
  });

  readonly kpiTiles = computed(() => {
    const all = this.svc.approvals();
    const year = String(new Date().getFullYear());
    const closed = all.filter(r => r.closedAt?.startsWith(year) && (r.status === 'Aprobada' || r.status === 'Rechazada'));
    const avg = closed.length ? Math.round(closed.reduce((s, r) => s + Math.max(0, daysBetween(r.requestedAt, r.closedAt!)), 0) / closed.length) : null;
    const stale = all.filter(r => r.status === 'Pendiente' && this.idle(r) >= 3).length;
    return [
      { label: 'Por resolver', value: this.svc.pendingForMe().length, hint: 'esperan su decisión', tone: this.svc.pendingForMe().length ? 'text-amber-600' : 'text-slate-400', view: 'por-resolver' as View },
      { label: 'Mis solicitudes', value: this.svc.mine().filter(r => r.status === 'Pendiente').length, hint: 'pendientes enviadas por usted', tone: 'text-slate-900', view: 'mias' as View },
      { label: 'Pendientes', value: all.filter(r => r.status === 'Pendiente').length, hint: `${stale} sin movimiento hace 3+ días`, tone: stale ? 'text-rose-600' : 'text-slate-900', view: 'todas' as View },
      { label: `Resueltas ${year}`, value: closed.length, hint: `${closed.filter(r => r.status === 'Rechazada').length} rechazadas`, tone: 'text-emerald-700', view: null },
      { label: 'Tiempo de respuesta', value: avg === null ? '—' : `${avg} d`, hint: 'promedio de las resueltas', tone: 'text-slate-900', view: null },
    ];
  });

  setView(v: View) {
    this.view.set(v);
    this.selectedId.set(null);
  }

  select(id: string) {
    this.comment.set('');
    this.error.set('');
    this.confirmCancel.set(false);
    this.selectedId.set(id);
  }

  idle(r: ApprovalRequest) {
    return Math.max(0, daysBetween(lastActivity(r), todayIso()));
  }

  kindInfo(k: ApprovalKind) {
    return APPROVAL_KINDS[k];
  }

  moduleName(k: ApprovalKind) {
    return ({
      'matriz-riesgos': 'Matriz de riesgos', 'seguridad-informacion': 'Seguridad de la información', continuidad: 'Continuidad',
      auditorias: 'Auditorías', 'planes-accion': 'Planes de acción', documentos: 'Gestión documental',
    } as Record<string, string>)[APPROVAL_KINDS[k].tab] ?? APPROVAL_KINDS[k].tab;
  }

  statusClass(s: ApprovalStatus) {
    return s === 'Pendiente' ? 'bg-amber-100 text-amber-800' : s === 'Aprobada' ? 'bg-emerald-100 text-emerald-800'
      : s === 'Rechazada' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-600';
  }

  async decide(r: ApprovalRequest, d: 'Aprobada' | 'Rechazada') {
    this.error.set('');
    try {
      const next = await this.svc.decide(r.id, d, this.comment());
      this.comment.set('');
      this.notify.emit(next.status === 'Aprobada' ? `${r.code} aprobada. ${APPROVAL_KINDS[r.kind].effect}`
        : next.status === 'Rechazada' ? `${r.code} rechazada.` : `${r.code}: nivel aprobado, pasa a ${next.steps[next.currentStep].roleTitle}.`);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  async cancel(r: ApprovalRequest) {
    try {
      await this.svc.cancel(r.id, this.comment());
      this.confirmCancel.set(false);
      this.notify.emit(`${r.code} anulada.`);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  export() {
    if (!this.rs.requirePermission(['canExportReports'], 'exportar reportes')) return;
    const rows: (string | number | undefined)[][] = [
      ['Código', 'Tipo', 'Registro', 'Solicitado por', 'Fecha', 'Justificación', 'Estado', 'Niveles', 'Decisiones', 'Cierre'],
      ...this.list().map(r => [r.code, APPROVAL_KINDS[r.kind].short, r.targetLabel, r.requestedBy, r.requestedAt.slice(0, 10), r.justification, r.status,
        r.steps.map(s => s.roleTitle).join(' → '), r.steps.filter(s => s.decision).map(s => `${s.roleTitle}: ${s.decision} (${s.decidedBy})${s.comment ? ` "${s.comment}"` : ''}`).join(' | '),
        r.closedAt?.slice(0, 10) ?? '']),
    ];
    downloadCsv(`Aprobaciones_${todayIso()}.csv`, rows);
  }
}
