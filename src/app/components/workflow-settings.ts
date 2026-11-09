import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ApprovalService } from '../services/approval.service';
import { NotificationService } from '../services/notification.service';
import { RiskDataService } from '../services/risk-data.service';
import { APPROVAL_KIND_LIST, APPROVAL_KINDS, ApprovalKind, ApprovalMatrix } from '../models/approval.model';
import { AppNotification, NotificationSettings } from '../models/notification.model';
import { normalizeMatrix } from '../utils/approvals';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';

/** Mantenedores → Aprobaciones y avisos. */
@Component({
  selector: 'app-workflow-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      <fieldset class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" [disabled]="!canManage()">
        <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-amber-600">approval</mat-icon> Matriz de aprobación</h2>
        <p class="text-[11px] text-slate-600">Cargos que aprueban cada tipo de solicitud, en orden. Quien solicita nunca aprueba su propia solicitud; si es la única persona con el cargo de un nivel, la solicitud no se puede enviar.</p>
        @for (k of kinds; track k) {
          <div class="p-3 rounded-xl border border-slate-200 space-y-1.5">
            <div class="flex items-center gap-2">
              <mat-icon class="text-base text-slate-500">{{ info(k).icon }}</mat-icon>
              <span class="text-xs font-semibold text-slate-800 flex-1">{{ info(k).label }}</span>
              @if (matrix().steps[k].length < 5) {
                <button type="button" (click)="addStep(k)" [class.perm-hidden]="!canManage()" class="text-[11px] text-emerald-700 hover:underline cursor-pointer flex items-center gap-0.5"><mat-icon class="text-sm">add</mat-icon>Nivel</button>
              }
            </div>
            @for (roleId of matrix().steps[k]; track $index; let i = $index) {
              <div class="flex items-center gap-2">
                <span class="w-5 h-5 rounded-full bg-slate-200 text-[10px] font-bold flex items-center justify-center shrink-0">{{ i + 1 }}</span>
                <select [class]="inputCls" (change)="setStep(k, i, $any($event.target).value)" [attr.aria-label]="info(k).short + ' nivel ' + (i + 1)">
                  @for (r of roles(); track r.id) { <option [value]="r.id" [selected]="r.id === roleId">{{ r.title }}</option> }
                </select>
                <span class="text-[10px] text-slate-500 whitespace-nowrap w-16 text-right">{{ peopleWith(roleId) }} pers.</span>
                <button type="button" (click)="removeStep(k, i)" [class.perm-hidden]="!canManage()" [disabled]="matrix().steps[k].length <= 1" class="p-1 rounded hover:bg-slate-100 disabled:opacity-30 cursor-pointer" aria-label="Quitar nivel"><mat-icon class="text-base text-slate-500">close</mat-icon></button>
              </div>
            }
          </div>
        }
        <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Nivel adicional si el riesgo queda fuera de la tolerancia</span>
          <select [class]="inputCls" (change)="setTolerance($any($event.target).value)">
            <option value="" [selected]="!matrix().outOfToleranceRoleId">Ninguno</option>
            @for (r of roles(); track r.id) { <option [value]="r.id" [selected]="r.id === matrix().outOfToleranceRoleId">{{ r.title }}</option> }
          </select></label>
        <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Nivel adicional para políticas, manuales y reglamentos (aprobación del Consejo)</span>
          <select [class]="inputCls" (change)="setBoard($any($event.target).value)">
            <option value="" [selected]="!matrix().boardRoleId">Ninguno</option>
            @for (r of roles(); track r.id) { <option [value]="r.id" [selected]="r.id === matrix().boardRoleId">{{ r.title }}</option> }
          </select></label>
        <div class="flex justify-end gap-2">
          <button type="button" (click)="resetMatrix()" [class.perm-hidden]="!canManage()" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Descartar</button>
          <button type="button" (click)="saveMatrix()" [class.perm-hidden]="!canManage()" [disabled]="!matrixDirty()" class="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-40 cursor-pointer">Guardar matriz</button>
        </div>
      </fieldset>

      <div class="space-y-4">
        <fieldset class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" [disabled]="!canManage()">
          <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-emerald-600">notifications</mat-icon> Avisos y correo</h2>
          <p class="text-[11px] text-slate-600">Cada persona recibe en la campana sus asignaciones, aprobaciones pendientes, plazos por vencer o vencidos e incidentes críticos, y por correo según su preferencia (al momento o resumen diario).</p>
          <label class="flex items-center gap-2 text-xs"><input type="checkbox" class="accent-emerald-600" [checked]="ns().emailEnabled" (change)="setNs('emailEnabled', $any($event.target).checked)" /> Enviar avisos por correo</label>
          <div class="grid grid-cols-2 gap-3">
            @for (f of numberFields; track f.key) {
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">{{ f.label }}</span>
                <input type="number" [min]="f.min" [max]="f.max" [class]="inputCls" [value]="ns()[f.key]" (input)="setNs(f.key, +$any($event.target).value)" /></label>
            }
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" (click)="resetNs()" [class.perm-hidden]="!canManage()" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Descartar</button>
            <button type="button" (click)="saveNs()" [class.perm-hidden]="!canManage()" [disabled]="!nsDirty()" class="px-3 py-1.5 text-xs rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-500 disabled:opacity-40 cursor-pointer">Guardar</button>
          </div>
        </fieldset>

        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5 flex-1"><mat-icon class="text-base text-indigo-600">outbox</mat-icon> Registro de envíos</h2>
            <button type="button" (click)="test()" [disabled]="busy()" class="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">mail</mat-icon>Correo de prueba</button>
            <button type="button" (click)="run()" [class.perm-hidden]="!canManage()" [disabled]="busy() || !canManage()" class="px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">update</mat-icon>Revisar plazos ahora</button>
          </div>
          @if (mailConfigured() === false) {
            <p class="text-[11px] p-2 rounded-lg bg-amber-50 text-amber-900">
              El servidor no tiene SMTP configurado: los avisos quedan en la campana y los correos figuran como omitidos. Vea la guía de instalación (Google Workspace).
            </p>
          }
          @if (message()) { <p class="text-[11px] text-slate-700" role="status">{{ message() }}</p> }
          <div class="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-100 rounded-lg">
            <table class="w-full text-[11px]">
              <thead class="bg-slate-50 text-slate-500 sticky top-0"><tr>
                <th class="text-left px-2 py-1.5">Fecha</th><th class="text-left px-2 py-1.5">Para</th><th class="text-left px-2 py-1.5">Aviso</th><th class="text-left px-2 py-1.5">Correo</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-100">
                @for (n of outbox(); track n.id) {
                  <tr>
                    <td class="px-2 py-1.5 whitespace-nowrap text-slate-500">{{ n.createdAt.slice(0, 16).replace('T', ' ') }}</td>
                    <td class="px-2 py-1.5">{{ n.recipientName || n.recipient }}</td>
                    <td class="px-2 py-1.5"><span class="text-slate-500">{{ n.category }} ·</span> {{ n.title }}</td>
                    <td class="px-2 py-1.5 whitespace-nowrap" [title]="n.emailError ?? ''">
                      <span class="px-1.5 py-0.5 rounded font-semibold" [class]="emailClass(n)">{{ n.emailStatus }}</span>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="px-2 py-6 text-center text-slate-500">Sin avisos todavía.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class WorkflowSettings {
  readonly approvals = inject(ApprovalService);
  readonly svc = inject(NotificationService);
  private readonly rs = inject(RiskDataService);
  readonly notify = output<string>();

  readonly inputCls = INPUT;
  readonly kinds = APPROVAL_KIND_LIST;
  readonly roles = computed(() => this.rs.organizationalRoles());
  readonly canManage = computed(() => this.rs.hasPermission('canManageCatalogs'));

  readonly matrix = signal<ApprovalMatrix>(structuredClone(this.approvals.matrix()));
  readonly matrixDirty = computed(() => JSON.stringify(this.matrix()) !== JSON.stringify(this.approvals.matrix()));
  readonly ns = signal<NotificationSettings>({ ...this.svc.settings() });
  readonly nsDirty = computed(() => JSON.stringify(this.ns()) !== JSON.stringify(this.svc.settings()));

  readonly outbox = signal<AppNotification[]>([]);
  readonly mailConfigured = signal<boolean | null>(null);
  readonly message = signal('');
  readonly busy = signal(false);

  readonly numberFields: { key: Exclude<keyof NotificationSettings, 'emailEnabled'>; label: string; min: number; max: number }[] = [
    { key: 'digestHour', label: 'Hora del resumen diario (0–23)', min: 0, max: 23 },
    { key: 'planDueDays', label: 'Avisar planes que vencen en (días)', min: 0, max: 60 },
    { key: 'surveyDueDays', label: 'Avisar autoevaluaciones que vencen en (días)', min: 0, max: 30 },
    { key: 'approvalReminderDays', label: 'Recordar aprobaciones sin resolver cada (días)', min: 0, max: 30 },
    { key: 'escalationDays', label: 'Escalar planes vencidos hace (días)', min: 1, max: 180 },
    { key: 'contractNoticeDays', label: 'Avisar contratos que vencen en (días)', min: 0, max: 365 },
  ];

  constructor() {
    void this.loadOutbox();
  }

  info(k: ApprovalKind) {
    return APPROVAL_KINDS[k];
  }

  peopleWith(roleId: string) {
    return this.rs.userProfiles().filter(u => u.active !== false && u.roleId === roleId).length;
  }

  setStep(k: ApprovalKind, i: number, roleId: string) {
    this.matrix.update(m => ({ ...m, steps: { ...m.steps, [k]: m.steps[k].map((r, j) => (j === i ? roleId : r)) } }));
  }

  addStep(k: ApprovalKind) {
    const fallback = this.roles().find(r => !this.matrix().steps[k].includes(r.id))?.id ?? this.roles()[0]?.id ?? '';
    this.matrix.update(m => ({ ...m, steps: { ...m.steps, [k]: [...m.steps[k], fallback] } }));
  }

  removeStep(k: ApprovalKind, i: number) {
    this.matrix.update(m => ({ ...m, steps: { ...m.steps, [k]: m.steps[k].filter((_, j) => j !== i) } }));
  }

  setTolerance(roleId: string) {
    this.matrix.update(m => ({ ...m, outOfToleranceRoleId: roleId }));
  }

  setBoard(roleId: string) {
    this.matrix.update(m => ({ ...m, boardRoleId: roleId }));
  }

  resetMatrix() {
    this.matrix.set(structuredClone(this.approvals.matrix()));
  }

  async saveMatrix() {
    if (!this.rs.requirePermission(['canManageCatalogs'], 'configurar la matriz de aprobación')) return;
    const m = normalizeMatrix(this.matrix());
    const before = this.approvals.matrix();
    this.approvals.matrixRaw.set(m);
    const changes = this.kinds.filter(k => JSON.stringify(before.steps[k]) !== JSON.stringify(m.steps[k]))
      .map(k => `${APPROVAL_KINDS[k].short}: ${m.steps[k].map(id => this.roles().find(r => r.id === id)?.title ?? id).join(' → ')}`);
    await this.rs.appendAuditLog('CONFIGURACIÓN_APROBACIONES', 'Mantenedor', 'MATRIZ-APROBACION',
      `Matriz de aprobación actualizada. ${changes.join('; ') || 'Nivel por tolerancia actualizado.'}`);
    this.notify.emit('Matriz de aprobación guardada. Rige para las solicitudes nuevas.');
  }

  setNs<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    this.ns.update(s => ({ ...s, [key]: value }));
  }

  resetNs() {
    this.ns.set({ ...this.svc.settings() });
  }

  async saveNs() {
    if (!this.rs.requirePermission(['canManageCatalogs'], 'configurar los avisos')) return;
    this.svc.settingsRaw.set({ ...this.ns() });
    await this.rs.appendAuditLog('CONFIGURACIÓN_NOTIFICACIONES', 'Mantenedor', 'AVISOS',
      `Avisos: correo ${this.ns().emailEnabled ? 'activo' : 'desactivado'}, resumen a las ${this.ns().digestHour} h, planes ${this.ns().planDueDays} d, autoevaluaciones ${this.ns().surveyDueDays} d, recordatorio de aprobaciones cada ${this.ns().approvalReminderDays} d, escalamiento ${this.ns().escalationDays} d, contratos ${this.ns().contractNoticeDays} d.`);
    this.ns.set({ ...this.svc.settings() });
    this.notify.emit('Parámetros de avisos guardados.');
  }

  async loadOutbox() {
    try {
      const data = await this.svc.outbox();
      this.outbox.set(data.items);
      this.mailConfigured.set(data.mailConfigured);
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }

  async test() {
    this.busy.set(true);
    try {
      this.message.set(await this.svc.sendTest());
    } catch (e) {
      this.message.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async run() {
    this.busy.set(true);
    try {
      const n = await this.svc.runNow();
      this.message.set(n ? `${n} aviso(s) nuevo(s) por plazos.` : 'Revisión hecha: no hay avisos nuevos por plazos.');
      await this.loadOutbox();
    } catch (e) {
      this.message.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  emailClass(n: AppNotification) {
    return n.emailStatus === 'enviado' ? 'bg-emerald-100 text-emerald-800' : n.emailStatus === 'error' ? 'bg-rose-100 text-rose-800'
      : n.emailStatus === 'pendiente' || n.emailStatus === 'resumen' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600';
  }
}
