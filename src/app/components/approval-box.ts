import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApprovalService } from '../services/approval.service';
import { APPROVAL_KINDS, ApprovalKind, ApprovalPayload, ApprovalRequest } from '../models/approval.model';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500';

interface Form { justification: string; reviewDate: string; version: string; nextReviewDate: string; newDueDate: string; effectiveDate: string }

/**
 * Estado de aprobación de un registro y formulario para solicitarla. Se usa en riesgos,
 * vulnerabilidades, planes de continuidad, auditorías y planes de acción.
 */
@Component({
  selector: 'app-approval-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs space-y-2">
      <div class="flex items-center gap-2 flex-wrap">
        <mat-icon class="text-base text-amber-600">approval</mat-icon>
        <span class="font-bold text-slate-800">{{ title() || info().label }}</span>
        @if (pending(); as p) {
          <span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">En aprobación · {{ p.code }}</span>
        } @else if (last(); as l) {
          <span class="px-2 py-0.5 rounded-full font-semibold" [class]="statusClass(l)">{{ l.status }} · {{ l.code }}</span>
        }
        <span class="flex-1"></span>
        @if (!pending() && !formOpen() && canRequest()) {
          <button type="button" (click)="openForm()" class="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 cursor-pointer flex items-center gap-1">
            <mat-icon class="text-sm">send</mat-icon>{{ requestLabel() || 'Solicitar aprobación' }}
          </button>
        }
      </div>

      @if (hint() && !pending() && !formOpen()) {
        <p class="text-slate-600">{{ hint() }}</p>
      }

      @if (pending(); as p) {
        <div class="text-slate-700">
          Nivel {{ p.currentStep + 1 }} de {{ p.steps.length }}: <strong>{{ p.steps[p.currentStep].roleTitle }}</strong>
          @if (approvers(p).length) { ({{ approvers(p).join(', ') }}) }
          · solicitado por {{ p.requestedBy }} el {{ p.requestedAt.slice(0, 10) }}
        </div>
        <div class="flex gap-2">
          <button type="button" (click)="openRequest(p)" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">
            {{ svc.canDecide(p) ? 'Resolver' : 'Ver solicitud' }}
          </button>
        </div>
      } @else if (last(); as l) {
        <div class="text-slate-600">
          {{ svc.summary(l) }}.
          @if (l.status === 'Rechazada') { Rechazada por {{ l.steps[l.currentStep].decidedBy }}: {{ l.steps[l.currentStep].comment }} }
          @if (l.status === 'Aprobada') { Aprobada por {{ approvedBy(l) }} el {{ l.closedAt?.slice(0, 10) }}. }
          <button type="button" (click)="openRequest(l)" class="text-emerald-700 hover:underline cursor-pointer">Ver</button>
        </div>
      }

      @if (formOpen()) {
        <div class="space-y-2 pt-1">
          <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Justificación *</span>
            <textarea rows="2" [class]="inputCls" [value]="form().justification" (input)="set('justification', $any($event.target).value)"
              [placeholder]="placeholder()"></textarea></label>
          <div class="grid sm:grid-cols-2 gap-2">
            @if (kind() === 'aceptacion-riesgo' || kind() === 'aceptacion-vulnerabilidad') {
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Aceptado hasta (revisión) *</span>
                <input type="date" [class]="inputCls" [value]="form().reviewDate" (input)="set('reviewDate', $any($event.target).value)" /></label>
            }
            @if (kind() === 'plan-continuidad') {
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Versión a aprobar</span>
                <input type="text" [class]="inputCls" [value]="form().version" (input)="set('version', $any($event.target).value)" /></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Próxima revisión</span>
                <input type="date" [class]="inputCls" [value]="form().nextReviewDate" (input)="set('nextReviewDate', $any($event.target).value)" /></label>
            }
            @if (kind() === 'documento') {
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Entrada en vigencia (opcional; por defecto, al aprobarse)</span>
                <input type="date" [class]="inputCls" [value]="form().effectiveDate" (input)="set('effectiveDate', $any($event.target).value)" /></label>
            }
            @if (kind() === 'reprogramacion-plan') {
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Nuevo plazo *</span>
                <input type="date" [class]="inputCls" [value]="form().newDueDate" (input)="set('newDueDate', $any($event.target).value)" /></label>
            }
          </div>
          <div class="rounded-lg bg-white border border-slate-200 p-2">
            <div class="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Aprobarán, en orden</div>
            <ol class="space-y-0.5">
              @for (s of preview(); track $index) {
                <li class="flex items-center gap-1.5">
                  <span class="w-4 h-4 rounded-full bg-slate-200 text-[10px] font-bold flex items-center justify-center">{{ $index + 1 }}</span>
                  <strong>{{ s.roleTitle }}</strong>
                  @if (s.people.length) { <span class="text-slate-500">{{ s.people.join(', ') }}</span> }
                  @else { <span class="text-rose-700">sin personas activas con este cargo</span> }
                </li>
              }
            </ol>
          </div>
          @if (error()) { <p class="text-rose-700" role="alert">{{ error() }}</p> }
          <div class="flex gap-2 justify-end">
            <button type="button" (click)="formOpen.set(false)" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Cancelar</button>
            <button type="button" (click)="submit()" [disabled]="busy()" class="px-3 py-1 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-50 cursor-pointer">Enviar a aprobación</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ApprovalBox {
  readonly svc = inject(ApprovalService);

  readonly kind = input.required<ApprovalKind>();
  readonly targetId = input.required<string>();
  readonly targetLabel = input.required<string>();
  readonly owner = input<string | undefined>(undefined);
  readonly title = input('');
  readonly hint = input('');
  readonly requestLabel = input('');
  /** Valores iniciales del formulario (versión, próxima revisión, plazo actual). */
  readonly defaults = input<ApprovalPayload>({});

  readonly notify = output<string>();

  readonly inputCls = INPUT;
  readonly formOpen = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = signal<Form>({ justification: '', reviewDate: '', version: '', nextReviewDate: '', newDueDate: '', effectiveDate: '' });

  readonly info = computed(() => APPROVAL_KINDS[this.kind()]);
  readonly history = computed(() => this.svc.forTarget(this.info().entity, this.targetId()).filter(r => r.kind === this.kind()));
  readonly pending = computed(() => this.history().find(r => r.status === 'Pendiente') ?? null);
  readonly last = computed(() => this.history().find(r => r.status !== 'Pendiente' && r.status !== 'Anulada') ?? null);
  readonly canRequest = computed(() => this.svc.canRequest(this.kind(), this.owner()));
  readonly preview = computed(() => this.svc.previewSteps(this.kind(), this.kind() === 'aceptacion-riesgo' ? this.svc.appetiteOf(this.targetId()) : undefined, this.defaults().docType));

  readonly placeholder = computed(() => ({
    'aceptacion-riesgo': 'Por qué se acepta el riesgo residual sobre el apetito y qué controles compensan',
    'aceptacion-vulnerabilidad': 'Por qué no se remedia ahora y qué controles compensatorios hay',
    'plan-continuidad': 'Qué cambia en esta versión del plan',
    'informe-auditoria': 'Resumen del informe y de las observaciones principales',
    'reprogramacion-plan': 'Por qué se necesita más plazo',
    documento: 'Qué cambia en esta versión y por qué',
  } as Record<ApprovalKind, string>)[this.kind()]);

  approvers(r: ApprovalRequest) {
    return this.svc.approversOf(r);
  }

  approvedBy(r: ApprovalRequest) {
    return r.steps.map(s => s.decidedBy).filter(Boolean).join(' / ');
  }

  statusClass(r: ApprovalRequest) {
    return r.status === 'Aprobada' ? 'bg-emerald-100 text-emerald-800' : r.status === 'Rechazada' ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700';
  }

  openForm() {
    const d = this.defaults();
    const inMonths = (m: number) => { const x = new Date(); x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10); };
    this.form.set({
      justification: '', reviewDate: d.reviewDate ?? inMonths(6), version: d.version ?? '', nextReviewDate: d.nextReviewDate ?? inMonths(12),
      newDueDate: d.newDueDate ?? '', effectiveDate: d.effectiveDate ?? '',
    });
    this.error.set('');
    this.formOpen.set(true);
  }

  set(key: keyof Form, value: string) {
    this.form.update(f => ({ ...f, [key]: value }));
  }

  openRequest(r: ApprovalRequest) {
    this.svc.open(r.id);
  }

  async submit() {
    const f = this.form();
    const k = this.kind();
    const payload: ApprovalPayload = {};
    if (k === 'aceptacion-riesgo' || k === 'aceptacion-vulnerabilidad') payload.reviewDate = f.reviewDate;
    if (k === 'plan-continuidad') { payload.version = f.version.trim() || undefined; payload.nextReviewDate = f.nextReviewDate || undefined; }
    if (k === 'reprogramacion-plan') { payload.newDueDate = f.newDueDate; payload.currentDueDate = this.defaults().currentDueDate; }
    if (k === 'aceptacion-riesgo') payload.residualScore = this.defaults().residualScore;
    if (k === 'documento') {
      const d = this.defaults();
      Object.assign(payload, { versionId: d.versionId, version: d.version, docType: d.docType, effectiveDate: f.effectiveDate || undefined });
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.svc.request(k, { id: this.targetId(), label: this.targetLabel(), owner: this.owner() }, f.justification, payload);
      this.formOpen.set(false);
      this.notify.emit(`${r.code} enviada a ${r.steps[0].roleTitle}.`);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
