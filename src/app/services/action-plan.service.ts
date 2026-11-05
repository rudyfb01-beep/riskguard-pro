import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { ComplianceService } from './compliance.service';
import { SecurityService } from './security.service';
import { ResilienceService } from './resilience.service';
import {
  ActionPlan, ActionPlanDraft, ActionPlanPriority, ActionPlanSource, ActionPlanStatus,
} from '../models/action-plan.model';
import { AuditLogEntry, Risk } from '../models/risk.model';
import {
  canManagePlans, checkPlanChange, daysToDue, isOpenPlan, isOverduePlan, isPlanOwner, nextPlanCode, plansFromExisting,
  progressFromTasks, riskTreatment, SOURCE_PERMISSIONS, todayIso,
} from '../utils/action-plans';

/** Pestaña de la aplicación donde vive cada origen. */
export const SOURCE_TABS: Record<ActionPlanSource, string | undefined> = {
  'Riesgo': 'matriz-riesgos', 'Control': 'controles', 'Auditoría': 'auditorias', 'Cumplimiento': 'cumplimiento-ran',
  'Autoevaluación de seguridad': 'seguridad-informacion', 'Continuidad': 'continuidad', 'Proveedor': 'proveedores',
  'Incidente': 'incidentes-perdidas', 'Otro': undefined,
};

/**
 * Planes de acción: un registro único para las brechas de todos los módulos, con flujo
 * Pendiente → En curso → Por verificar → Cerrado. El responsable informa avances y envía a
 * verificación; quien administra planes (y no es el responsable) verifica el cierre.
 */
@Injectable({ providedIn: 'root' })
export class ActionPlanService {
  private readonly rs = inject(RiskDataService);
  private readonly comp = inject(ComplianceService);
  private readonly sec = inject(SecurityService);
  private readonly res = inject(ResilienceService);

  /** En modo demostración parte con los planes que ya traen los datos de ejemplo; con base de datos, los carga el servidor. */
  readonly plans = signal<ActionPlan[]>(plansFromExisting({
    risks: this.rs.risks(), audits: this.rs.audits(), compliance: this.comp.requirements(), normLabel: id => this.comp.normLabel(id),
    assessment: this.sec.assessment(), continuityTests: this.res.tests(), at: new Date().toISOString(), by: 'RiskGuard (datos de ejemplo)',
  }).plans);

  constructor() {
    this.rs.riskTreatmentFn = r => riskTreatment(r, this.plans());
    // La autoevaluación de seguridad deja de alertar "brecha sin plan" cuando hay un plan abierto.
    effect(() => {
      const ids = new Set(this.plans().filter(p => p.sourceType === 'Autoevaluación de seguridad' && isOpenPlan(p) && p.sourceId).map(p => p.sourceId!));
      this.sec.itemsWithOpenPlans.set(ids);
    });
  }

  readonly sorted = computed(() => [...this.plans()].sort((a, b) =>
    Number(isOpenPlan(b)) - Number(isOpenPlan(a)) || a.dueDate.localeCompare(b.dueDate) || a.code.localeCompare(b.code)));

  private actor() {
    return this.rs.currentProfile();
  }

  canManage(): boolean {
    return canManagePlans(this.actor());
  }

  /** Puede crear planes desde este origen (administra planes o tiene el permiso del módulo). */
  canCreateFrom(source: ActionPlanSource): boolean {
    return this.canManage() || this.rs.canAny(...SOURCE_PERMISSIONS[source]);
  }

  isOwner(p: ActionPlan): boolean {
    return isPlanOwner(this.actor(), p);
  }

  /** Puede registrar avances (responsable o administrador) en un plan abierto. */
  canUpdate(p: ActionPlan): boolean {
    return isOpenPlan(p) && (this.canManage() || this.isOwner(p));
  }

  canVerify(p: ActionPlan): boolean {
    return p.status === 'Por verificar' && this.canManage() && !this.isOwner(p);
  }

  forSource(type: ActionPlanSource, id: string | undefined): ActionPlan[] {
    if (!id) return [];
    return this.sorted().filter(p => p.sourceType === type && p.sourceId === id);
  }

  openForSource(type: ActionPlanSource, id: string | undefined): ActionPlan[] {
    return this.forSource(type, id).filter(isOpenPlan);
  }

  get(id: string): ActionPlan | undefined {
    return this.plans().find(p => p.id === id);
  }

  isOverdue(p: ActionPlan) {
    return isOverduePlan(p);
  }

  daysToDue(p: ActionPlan) {
    return daysToDue(p);
  }

  /** Tratamiento del riesgo calculado de sus planes (para tableros y reportes). */
  riskTreatment(r: Risk) {
    return riskTreatment(r, this.plans());
  }

  readonly mine = computed(() => this.sorted().filter(p => this.isOwner(p)));

  readonly kpis = computed(() => {
    const all = this.plans();
    const open = all.filter(isOpenPlan);
    const today = todayIso();
    const closed = all.filter(p => p.status === 'Cerrado');
    const year = today.slice(0, 4);
    const closedYear = closed.filter(p => p.closedAt?.startsWith(year));
    const onTime = closedYear.filter(p => !!p.closedAt && p.closedAt <= p.originalDueDate).length;
    return {
      total: all.length,
      open: open.length,
      overdue: open.filter(p => isOverduePlan(p, today)).length,
      dueSoon: open.filter(p => !isOverduePlan(p, today) && p.status !== 'Por verificar' && daysToDue(p, today) <= 15).length,
      toVerify: open.filter(p => p.status === 'Por verificar').length,
      rescheduled: open.filter(p => p.reschedules.length > 0).length,
      unassigned: open.filter(p => !p.owner.trim() || p.owner === 'Sin asignar').length,
      closedYear: closedYear.length,
      onTimePct: closedYear.length ? Math.round((onTime / closedYear.length) * 100) : null,
      mine: this.mine().filter(isOpenPlan).length,
      myOverdue: this.mine().filter(p => isOverduePlan(p, today)).length,
    };
  });

  // ---------------------------------------------------------------------------
  // Cambios (todos pasan por las mismas reglas que valida el servidor)
  // ---------------------------------------------------------------------------

  private commit(prev: ActionPlan | null, next: ActionPlan) {
    const err = checkPlanChange(prev, next, this.actor());
    if (err) {
      this.rs.permissionNotice.set({ message: err, at: Date.now() });
      throw new Error(err);
    }
    this.plans.update(list => (prev ? list.map(p => (p.id === next.id ? next : p)) : [...list, next]));
  }

  private log(action: AuditLogEntry['action'], p: ActionPlan, details: string) {
    return this.rs.appendAuditLog(action, 'Plan de Acción', p.code, `${p.code} "${p.title}" (${p.sourceType}: ${p.sourceLabel}). ${details}`);
  }

  private now() {
    return new Date().toISOString();
  }

  async create(d: ActionPlanDraft): Promise<ActionPlan> {
    const me = this.actor().name;
    const code = nextPlanCode(this.plans());
    const tasks = (d.tasks ?? []).map(t => t.trim()).filter(Boolean).map((text, i) => ({ id: `t${Date.now().toString(36)}${i}`, text, done: false }));
    const plan: ActionPlan = {
      id: `pa-${code.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`, code, title: d.title.trim(), description: d.description?.trim() ?? '',
      sourceType: d.sourceType, sourceId: d.sourceId, sourceLabel: d.sourceLabel.slice(0, 250), process: d.process, owner: d.owner.trim(),
      priority: d.priority ?? 'Media', startDate: todayIso(), dueDate: d.dueDate, originalDueDate: d.dueDate, status: 'Pendiente', progressPct: 0,
      tasks, updates: [], reschedules: [], createdBy: me, createdAt: this.now(),
    };
    this.commit(null, plan);
    await this.log('ALTA_PLAN_ACCION', plan, `Responsable: ${plan.owner}; plazo ${plan.dueDate}; prioridad ${plan.priority}.`);
    return plan;
  }

  private require(id: string): ActionPlan {
    const p = this.get(id);
    if (!p) throw new Error('Plan de acción no encontrado.');
    return p;
  }

  /** Registra un avance (texto y porcentaje). Un plan Pendiente pasa a En curso. */
  async addUpdate(id: string, text: string, progressPct: number) {
    const p = this.require(id);
    const pct = Math.max(0, Math.min(100, Math.round(progressPct)));
    if (!text.trim()) throw new Error('Describa el avance.');
    const next: ActionPlan = {
      ...p, progressPct: pct, status: p.status === 'Pendiente' ? 'En curso' : p.status,
      updates: [...p.updates, { at: this.now(), by: this.actor().name, text: text.trim(), progressPct: pct }],
    };
    this.commit(p, next);
    await this.log('AVANCE_PLAN_ACCION', next, `Avance ${p.progressPct} % → ${pct} %: ${text.trim()}`);
  }

  async toggleTask(id: string, taskId: string) {
    const p = this.require(id);
    const tasks = p.tasks.map(t => (t.id === taskId ? (t.done ? { id: t.id, text: t.text, done: false } : { ...t, done: true, doneAt: this.now(), doneBy: this.actor().name }) : t));
    const next: ActionPlan = { ...p, tasks, progressPct: progressFromTasks(tasks, p.progressPct), status: p.status === 'Pendiente' ? 'En curso' : p.status };
    this.commit(p, next);
    const t = tasks.find(x => x.id === taskId);
    await this.log('AVANCE_PLAN_ACCION', next, `Tarea ${t?.done ? 'completada' : 'reabierta'}: "${t?.text}". Avance ${next.progressPct} %.`);
  }

  async addTask(id: string, text: string) {
    const p = this.require(id);
    if (!text.trim()) return;
    const tasks = [...p.tasks, { id: `t${Date.now().toString(36)}`, text: text.trim(), done: false }];
    const next: ActionPlan = { ...p, tasks, progressPct: progressFromTasks(tasks, p.progressPct) };
    this.commit(p, next);
    await this.log('MODIFICACIÓN_PLAN_ACCION', next, `Tarea agregada: "${text.trim()}".`);
  }

  async removeTask(id: string, taskId: string) {
    const p = this.require(id);
    const t = p.tasks.find(x => x.id === taskId);
    const tasks = p.tasks.filter(x => x.id !== taskId);
    const next: ActionPlan = { ...p, tasks, progressPct: progressFromTasks(tasks, p.progressPct) };
    this.commit(p, next);
    await this.log('MODIFICACIÓN_PLAN_ACCION', next, `Tarea eliminada: "${t?.text}".`);
  }

  async submitForVerification(id: string, evidence: string) {
    const p = this.require(id);
    const next: ActionPlan = {
      ...p, status: 'Por verificar', progressPct: 100,
      closure: { submittedAt: this.now(), submittedBy: this.actor().name, evidence: evidence.trim() },
    };
    this.commit(p, next);
    await this.log('ENVÍO_VERIFICACIÓN_PLAN_ACCION', next, `Enviado a verificación. Evidencia: ${evidence.trim()}`);
  }

  /** Verifica y cierra. Si el plan viene de un hallazgo de auditoría y el cargo puede, cierra también el hallazgo. */
  async verify(id: string, note: string): Promise<{ findingClosed: boolean }> {
    const p = this.require(id);
    const me = this.actor().name;
    const next: ActionPlan = {
      ...p, status: 'Cerrado', closedAt: todayIso(),
      closure: { ...p.closure!, verifiedAt: this.now(), verifiedBy: me, note: note.trim() || undefined },
    };
    this.commit(p, next);
    await this.log('CIERRE_PLAN_ACCION', next, `Cierre verificado por ${me}.${note.trim() ? ` ${note.trim()}` : ''}${next.closedAt! > p.originalDueDate ? ` Cerrado después del plazo comprometido (${p.originalDueDate}).` : ''}`);
    return { findingClosed: await this.closeFindingIfDone(next) };
  }

  async reject(id: string, note: string) {
    const p = this.require(id);
    if (!note.trim()) throw new Error('Indique qué falta para aprobar el cierre.');
    const rejected = { ...p.closure!, verifiedAt: this.now(), verifiedBy: this.actor().name, note: note.trim() };
    const next: ActionPlan = { ...p, status: 'En curso', closure: undefined, rejections: [...(p.rejections ?? []), rejected] };
    this.commit(p, next);
    await this.log('RECHAZO_PLAN_ACCION', next, `Cierre rechazado: ${note.trim()}`);
  }

  async reschedule(id: string, to: string, reason: string) {
    const p = this.require(id);
    if (!to) throw new Error('Indique el nuevo plazo.');
    if (!reason.trim()) throw new Error('Indique el motivo de la reprogramación.');
    if (to === p.dueDate) throw new Error('El nuevo plazo es igual al actual.');
    const next: ActionPlan = { ...p, dueDate: to, reschedules: [...p.reschedules, { at: this.now(), by: this.actor().name, from: p.dueDate, to, reason: reason.trim() }] };
    this.commit(p, next);
    await this.log('REPROGRAMACIÓN_PLAN_ACCION', next, `Plazo ${p.dueDate} → ${to} (reprogramación N° ${next.reschedules.length}): ${reason.trim()}`);
  }

  async cancel(id: string, reason: string) {
    const p = this.require(id);
    const next: ActionPlan = { ...p, status: 'Cancelado', cancelReason: reason.trim(), closedAt: todayIso() };
    this.commit(p, next);
    await this.log('CANCELACIÓN_PLAN_ACCION', next, `Cancelado: ${reason.trim()}`);
  }

  async edit(id: string, changes: { title: string; description: string; owner: string; priority: ActionPlanPriority; process?: string }) {
    const p = this.require(id);
    const next: ActionPlan = { ...p, title: changes.title.trim(), description: changes.description.trim(), owner: changes.owner.trim(), priority: changes.priority, process: changes.process || undefined };
    this.commit(p, next);
    const diff = [
      p.owner !== next.owner ? `responsable ${p.owner} → ${next.owner}` : '',
      p.priority !== next.priority ? `prioridad ${p.priority} → ${next.priority}` : '',
      p.title !== next.title ? 'título' : '', p.description !== next.description ? 'descripción' : '',
    ].filter(Boolean).join('; ');
    if (diff) await this.log('MODIFICACIÓN_PLAN_ACCION', next, `Cambios: ${diff}.`);
  }

  async remove(id: string) {
    const p = this.require(id);
    if (!this.canManage()) {
      const message = 'Solo quien administra planes de acción puede eliminarlos.';
      this.rs.permissionNotice.set({ message, at: Date.now() });
      throw new Error(message);
    }
    this.plans.update(list => list.filter(x => x.id !== id));
    await this.log('MODIFICACIÓN_PLAN_ACCION', p, 'Plan eliminado.');
  }

  /** Hallazgo de auditoría del plan: "<id auditoría>::<id hallazgo>". */
  findingOf(p: ActionPlan) {
    if (p.sourceType !== 'Auditoría' || !p.sourceId?.includes('::')) return null;
    const [auditId, findingId] = p.sourceId.split('::');
    const audit = this.rs.audits().find(a => a.id === auditId);
    const finding = audit?.findings.find(f => f.id === findingId);
    return audit && finding ? { audit, finding } : null;
  }

  private async closeFindingIfDone(p: ActionPlan): Promise<boolean> {
    const ref = this.findingOf(p);
    if (!ref || ref.finding.status === 'Cerrado' || !this.rs.hasPermission('canExecuteAudits')) return false;
    // Solo si no quedan otros planes abiertos para el mismo hallazgo.
    if (this.openForSource('Auditoría', p.sourceId).length) return false;
    await this.rs.saveAuditFinding(ref.audit.id, { ...ref.finding, status: 'Cerrado' });
    return true;
  }

  /** Pedido de abrir un plan en la pestaña Planes de Acción (desde cualquier módulo). */
  readonly openRequest = signal<{ id: string; at: number } | null>(null);

  open(id: string) {
    this.openRequest.set({ id, at: Date.now() });
  }

  /** Estados en que un plan sigue abierto, para filtros. */
  readonly openStatuses: ActionPlanStatus[] = ['Pendiente', 'En curso', 'Por verificar'];
}
