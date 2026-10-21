import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService, formatMinutes } from '../services/risk-data.service';
import { MilestoneStatus, OperationalFlaw, RegulatoryMilestoneTemplate } from '../models/risk.model';

type Unit = 'min' | 'h' | 'd';
interface EditableMilestone extends RegulatoryMilestoneTemplate { amount: number; unit: Unit; }

/**
 * Seguimiento de reportes de incidentes a la CMF y a la ANCI: plazos desde la
 * toma de conocimiento, registro de envíos con folio, actualizaciones y cierre.
 */
@Component({
  selector: 'app-regulatory-reporting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-4">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-rose-100 text-rose-800 rounded-lg"><mat-icon class="text-lg">gavel</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Reporte Regulatorio de Incidentes</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Plazos de aviso a la CMF (incidentes operacionales) y a la ANCI (ciberincidentes, Ley 21.663),
            contados desde que la administración toma conocimiento del incidente.
          </p>
        </div>
        <button type="button" (click)="showConfig.set(!showConfig())"
          class="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 flex items-center gap-1.5 shrink-0 cursor-pointer">
          <mat-icon class="text-sm">tune</mat-icon>
          <span>{{ showConfig() ? 'Ocultar plazos' : 'Configurar plazos' }}</span>
        </button>
      </div>

      <div class="p-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex items-start gap-2">
        <mat-icon class="text-sm text-amber-600 shrink-0">info</mat-icon>
        <span>
          Los plazos por defecto son <strong>referenciales</strong> (CMF: aviso inicial 30 min; ANCI: alerta temprana 3 h,
          segundo informe 72 h, informe final 15 días). Valídelos con Cumplimiento contra el texto vigente de la RAN CACs y la
          Ley 21.663 y ajústelos en "Configurar plazos".
        </span>
      </div>

      <!-- Configuración de plazos -->
      @if (showConfig()) {
        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h2 class="text-sm font-bold text-slate-900">Plazos de reporte (desde la toma de conocimiento)</h2>
            @if (!canManage()) {
              <span class="text-[11px] text-slate-500">Solo lectura: requiere permiso "Reporte Regulatorio CMF / ANCI".</span>
            }
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="text-[11px] text-slate-500 border-b border-slate-200">
                <tr>
                  <th class="text-left py-2 pr-3">Autoridad</th>
                  <th class="text-left py-2 pr-3">Hito</th>
                  <th class="text-left py-2 pr-3">Plazo</th>
                  <th class="text-center py-2">Activo</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (m of draftMilestones(); track m.id; let i = $index) {
                  <tr>
                    <td class="py-2 pr-3"><span class="px-2 py-0.5 rounded font-bold text-[10px]" [class]="authorityClass(m.authority)">{{ m.authority }}</span></td>
                    <td class="py-2 pr-3 text-slate-800 font-medium">{{ m.name }}</td>
                    <td class="py-2 pr-3">
                      <div class="flex items-center gap-1.5">
                        <input type="number" min="1" [value]="m.amount" [disabled]="!canManage()"
                          (input)="patchDraft(i, { amount: +$any($event.target).value })"
                          class="w-20 text-xs rounded-lg border border-slate-300 px-2 py-1 font-mono disabled:bg-slate-100" />
                        <select [value]="m.unit" [disabled]="!canManage()"
                          (change)="patchDraft(i, { unit: $any($event.target).value })"
                          class="text-xs rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-100">
                          <option value="min">minutos</option>
                          <option value="h">horas</option>
                          <option value="d">días corridos</option>
                        </select>
                      </div>
                    </td>
                    <td class="py-2 text-center">
                      <input type="checkbox" [checked]="m.enabled" [disabled]="!canManage()"
                        (change)="patchDraft(i, { enabled: $any($event.target).checked })" class="rounded text-emerald-600" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (canManage()) {
            <div class="flex justify-end gap-2">
              <button type="button" (click)="resetDraft()" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Descartar</button>
              <button type="button" (click)="saveConfig()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 cursor-pointer">Guardar plazos</button>
            </div>
          }
        </div>
      }

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200">
          <span class="text-[11px] font-semibold text-slate-500 block">Reportes abiertos</span>
          <span class="text-2xl font-bold font-mono text-slate-900">{{ summary().open }}</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30">
          <span class="text-[11px] font-semibold text-amber-800 block">Hitos pendientes</span>
          <span class="text-2xl font-bold font-mono text-amber-900">{{ summary().pending }}</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30">
          <span class="text-[11px] font-semibold text-rose-800 block">Hitos vencidos sin enviar</span>
          <span class="text-2xl font-bold font-mono text-rose-700">{{ summary().overdue }}</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30">
          <span class="text-[11px] font-semibold text-emerald-800 block">Envíos dentro de plazo</span>
          <span class="text-2xl font-bold font-mono text-emerald-700">{{ summary().onTimePct === null ? '—' : summary().onTimePct + '%' }}</span>
        </div>
      </div>

      <!-- Iniciar reporte -->
      @if (canStart() && candidates().length > 0) {
        <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-end gap-3">
          <div class="flex-1 min-w-0">
            <label for="start-incident" class="block text-[11px] font-semibold text-slate-600 mb-1">Iniciar reporte para un incidente registrado</label>
            <select id="start-incident" [value]="startIncidentId()" (change)="startIncidentId.set($any($event.target).value)"
              class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2">
              <option value="">— Seleccionar incidente —</option>
              @for (f of candidates(); track f.id) {
                <option [value]="f.id">[{{ f.severity }}] {{ f.title }}</option>
              }
            </select>
          </div>
          <div>
            <label for="start-awareness" class="block text-[11px] font-semibold text-slate-600 mb-1">Toma de conocimiento</label>
            <input id="start-awareness" type="datetime-local" [value]="startAwareness()" (input)="startAwareness.set($any($event.target).value)"
              class="text-xs rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div class="flex items-center gap-3 text-xs pb-2">
            <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" [checked]="startCMF()" (change)="startCMF.set($any($event.target).checked)" class="rounded text-rose-600" /> CMF</label>
            <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" [checked]="startANCI()" (change)="startANCI.set($any($event.target).checked)" class="rounded text-rose-600" /> ANCI</label>
          </div>
          <button type="button" (click)="startReport()" [disabled]="!startIncidentId() || (!startCMF() && !startANCI())"
            class="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            <mat-icon class="text-sm">timer</mat-icon><span>Iniciar conteo</span>
          </button>
        </div>
      }

      <!-- Reportes -->
      @if (rs.regulatoryIncidents().length === 0) {
        <div class="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
          No hay incidentes con reporte regulatorio en curso.
        </div>
      }

      <div class="space-y-4">
        @for (f of rs.regulatoryIncidents(); track f.id) {
          @let r = f.regulatoryReport!;
          <div class="bg-white rounded-2xl border shadow-2xs overflow-hidden"
            [class]="r.status === 'Cerrado' ? 'border-slate-200 opacity-90' : hasOverdue(f) ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'">

            <div class="px-5 py-3.5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2"
              [class]="r.status === 'Cerrado' ? 'bg-slate-50' : 'bg-white'">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-mono text-[11px] text-slate-500 font-bold">{{ f.id }}</span>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border" [class]="severityClass(f.severity)">{{ f.severity }}</span>
                  @if (r.reportableToCMF) { <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" [class]="authorityClass('CMF')">CMF</span> }
                  @if (r.reportableToANCI) { <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" [class]="authorityClass('ANCI')">ANCI</span> }
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    [class]="r.status === 'Cerrado' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'">{{ r.status }}</span>
                </div>
                <h3 class="font-bold text-sm text-slate-900 mt-1 leading-snug">{{ f.title }}</h3>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  Toma de conocimiento: <strong class="text-slate-700">{{ r.awarenessAt | date:'dd-MM-yyyy HH:mm' }}</strong>
                  · Proceso: {{ f.process }}
                  @if (r.closedAt) { · Cerrado: {{ r.closedAt | date:'dd-MM-yyyy HH:mm' }} }
                </p>
              </div>
              @if (r.status === 'Abierto' && canManage()) {
                <button type="button" (click)="close(f)"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1 shrink-0 cursor-pointer">
                  <mat-icon class="text-sm">task_alt</mat-icon><span>Cerrar reporte</span>
                </button>
              }
            </div>

            <!-- Hitos -->
            <div class="px-5 py-3 overflow-x-auto">
              <table class="w-full text-xs min-w-[640px]">
                <thead class="text-[10px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th class="text-left py-1.5 pr-3">Hito</th>
                    <th class="text-left py-1.5 pr-3">Vence</th>
                    <th class="text-left py-1.5 pr-3">Estado</th>
                    <th class="text-left py-1.5">Envío</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (m of rs.milestonesFor(r); track m.id) {
                    @let st = status(f, m);
                    @let sub = submission(f, m.id);
                    <tr>
                      <td class="py-2 pr-3">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold mr-1" [class]="authorityClass(m.authority)">{{ m.authority }}</span>
                        <span class="font-medium text-slate-800">{{ m.name }}</span>
                        <span class="text-slate-400 text-[10px] ml-1">({{ fmt(m.deadlineMinutes) }})</span>
                      </td>
                      <td class="py-2 pr-3 font-mono text-slate-700 whitespace-nowrap">{{ rs.milestoneDeadline(r, m) | date:'dd-MM HH:mm' }}</td>
                      <td class="py-2 pr-3 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1" [class]="statusClass(st)">
                          @if (st === 'Pendiente') { <mat-icon class="text-[12px] w-3 h-3">timer</mat-icon> }
                          {{ st }}
                        </span>
                        @if (!sub && r.status === 'Abierto') {
                          <span class="ml-1.5 font-mono text-[11px] font-bold" [class]="st === 'Vencido' ? 'text-rose-700' : remainingMs(f, m) < 10 * 60_000 ? 'text-amber-700' : 'text-slate-600'">
                            {{ st === 'Vencido' ? 'hace ' + countdown(-remainingMs(f, m)) : countdown(remainingMs(f, m)) }}
                          </span>
                        }
                      </td>
                      <td class="py-2">
                        @if (sub) {
                          <span class="text-[11px] text-slate-600">
                            {{ sub.submittedAt | date:'dd-MM HH:mm' }} · {{ sub.submittedBy }}
                            @if (sub.folio) { · <span class="font-mono text-slate-800">{{ sub.folio }}</span> }
                          </span>
                        } @else if (r.status === 'Abierto' && canManage()) {
                          <div class="flex items-center gap-1.5">
                            <input type="text" placeholder="Folio / N° de ingreso" [value]="folios()[f.id + ':' + m.id] || ''"
                              (input)="setFolio(f.id, m.id, $any($event.target).value)"
                              class="w-40 text-xs rounded-lg border border-slate-300 px-2 py-1" />
                            <button type="button" (click)="submit(f, m)"
                              class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 whitespace-nowrap cursor-pointer">
                              Registrar envío
                            </button>
                          </div>
                        } @else {
                          <span class="text-[11px] text-slate-400">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Actualizaciones -->
            <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
              <span class="text-[11px] font-bold text-slate-700">Bitácora de actualizaciones al regulador</span>
              @if (r.updates.length === 0) {
                <p class="text-[11px] text-slate-400">Sin actualizaciones registradas.</p>
              }
              <ul class="space-y-1">
                @for (u of r.updates; track u.at) {
                  <li class="text-[11px] text-slate-700">
                    <span class="font-mono text-slate-500">{{ u.at | date:'dd-MM HH:mm' }}</span> · <strong>{{ u.by }}</strong>: {{ u.note }}
                  </li>
                }
              </ul>
              @if (r.status === 'Abierto' && canStart()) {
                <div class="flex items-center gap-1.5 pt-1">
                  <input type="text" placeholder="Nueva actualización (estado, causa, medidas adoptadas...)" [value]="notes()[f.id] || ''"
                    (input)="setNote(f.id, $any($event.target).value)" (keyup.enter)="addNote(f)"
                    class="flex-1 text-xs rounded-lg border border-slate-300 px-2.5 py-1.5" />
                  <button type="button" (click)="addNote(f)" [disabled]="!(notes()[f.id] || '').trim()"
                    class="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 cursor-pointer">Agregar</button>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class RegulatoryReporting {
  readonly rs = inject(RiskDataService);
  readonly notify = output<string>();

  /** Reloj para los cronómetros (solo avanza en el navegador). */
  readonly now = signal(Date.now());

  readonly showConfig = signal(false);
  readonly draftMilestones = signal<EditableMilestone[]>([]);

  readonly startIncidentId = signal('');
  readonly startAwareness = signal(toLocalInput(new Date().toISOString()));
  readonly startCMF = signal(true);
  readonly startANCI = signal(false);

  readonly folios = signal<Record<string, string>>({});
  readonly notes = signal<Record<string, string>>({});

  readonly summary = computed(() => this.rs.regulatorySummary(this.now()));
  readonly candidates = computed(() => this.rs.flaws().filter(f => !f.regulatoryReport));
  readonly canManage = computed(() => !!this.rs.currentProfile().permissions.canManageRegulatoryReports);
  readonly canStart = computed(() => {
    const p = this.rs.currentProfile().permissions;
    return !!p.canManageRegulatoryReports || p.canReportFlaws;
  });

  constructor() {
    this.resetDraft();
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.now.set(Date.now());
      const id = setInterval(() => this.now.set(Date.now()), 1000);
      destroyRef.onDestroy(() => clearInterval(id));
    });
  }

  fmt(min: number) { return formatMinutes(min); }

  status(f: OperationalFlaw, m: RegulatoryMilestoneTemplate): MilestoneStatus {
    return this.rs.milestoneStatus(f.regulatoryReport!, m, this.now());
  }

  submission(f: OperationalFlaw, milestoneId: string) {
    return f.regulatoryReport!.submissions.find(s => s.milestoneId === milestoneId);
  }

  remainingMs(f: OperationalFlaw, m: RegulatoryMilestoneTemplate): number {
    return this.rs.milestoneDeadline(f.regulatoryReport!, m).getTime() - this.now();
  }

  hasOverdue(f: OperationalFlaw): boolean {
    const r = f.regulatoryReport!;
    return r.status === 'Abierto' && this.rs.milestonesFor(r).some(m => this.status(f, m) === 'Vencido');
  }

  countdown(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  setFolio(flawId: string, milestoneId: string, value: string) {
    this.folios.update(f => ({ ...f, [`${flawId}:${milestoneId}`]: value }));
  }

  setNote(flawId: string, value: string) {
    this.notes.update(n => ({ ...n, [flawId]: value }));
  }

  async submit(f: OperationalFlaw, m: RegulatoryMilestoneTemplate) {
    const folio = this.folios()[`${f.id}:${m.id}`] || '';
    await this.rs.registerRegulatorySubmission(f.id, m.id, folio);
    const st = this.status(this.rs.flaws().find(x => x.id === f.id)!, m);
    this.notify.emit(`${m.name} registrado (${st}). Quedó en la bitácora inalterable.`);
  }

  async addNote(f: OperationalFlaw) {
    const note = (this.notes()[f.id] || '').trim();
    if (!note) return;
    await this.rs.addRegulatoryUpdate(f.id, note);
    this.setNote(f.id, '');
  }

  async close(f: OperationalFlaw) {
    await this.rs.closeRegulatoryReport(f.id);
    this.notify.emit(`Reporte regulatorio de ${f.id} cerrado.`);
  }

  async startReport() {
    const id = this.startIncidentId();
    if (!id) return;
    await this.rs.startRegulatoryReport(id, {
      awarenessAt: new Date(this.startAwareness()).toISOString(),
      cmf: this.startCMF(),
      anci: this.startANCI(),
    });
    this.startIncidentId.set('');
    this.notify.emit('Conteo de plazos regulatorios iniciado.');
  }

  // ---- Configuración de plazos ----
  resetDraft() {
    this.draftMilestones.set(this.rs.regulatoryMilestones().map(m => {
      const unit: Unit = m.deadlineMinutes % 1440 === 0 ? 'd' : m.deadlineMinutes % 60 === 0 ? 'h' : 'min';
      const amount = unit === 'd' ? m.deadlineMinutes / 1440 : unit === 'h' ? m.deadlineMinutes / 60 : m.deadlineMinutes;
      return { ...m, amount, unit };
    }));
  }

  patchDraft(index: number, patch: Partial<EditableMilestone>) {
    this.draftMilestones.update(list => list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  async saveConfig() {
    const factor: Record<Unit, number> = { min: 1, h: 60, d: 1440 };
    const list = this.draftMilestones().map(({ amount, unit, ...m }) => ({
      ...m,
      deadlineMinutes: Math.max(1, (amount || 0) * factor[unit]),
    }));
    await this.rs.updateRegulatoryMilestones(list);
    this.resetDraft();
    this.notify.emit('Plazos regulatorios actualizados.');
  }

  // ---- Estilos ----
  authorityClass(a: 'CMF' | 'ANCI') {
    return a === 'CMF' ? 'bg-indigo-100 text-indigo-800' : 'bg-cyan-100 text-cyan-800';
  }

  statusClass(st: MilestoneStatus) {
    switch (st) {
      case 'Enviado a tiempo': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Enviado fuera de plazo': return 'bg-orange-50 text-orange-800 border-orange-200';
      case 'Vencido': return 'bg-rose-100 text-rose-800 border-rose-300';
      default: return 'bg-amber-50 text-amber-800 border-amber-200';
    }
  }

  severityClass(s: string) {
    switch (s) {
      case 'Crítica': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Alta': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Media': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  }
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
