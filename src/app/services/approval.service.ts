import { Injectable, WritableSignal, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { SecurityService } from './security.service';
import { ResilienceService } from './resilience.service';
import { ActionPlanService } from './action-plan.service';
import { CatalogService } from './catalog.service';
import {
  APPROVAL_KINDS, ApprovalKind, ApprovalPayload, ApprovalRequest, ApprovalTargetEntity, DEFAULT_APPROVAL_MATRIX,
} from '../models/approval.model';
import {
  applyApprovalEffect, approvalRoleIds, approvalSummary, buildSteps, canDecide, canRequest, checkApprovalChange, decide, eligibleApprovers,
  isRequester, nextApprovalCode, normalizeMatrix, targetPrecondition,
} from '../utils/approvals';

interface Identified { id: string }

/** Registro de origen de una solicitud nueva. */
export interface ApprovalTarget {
  id: string;
  label: string;
  /** Responsable (para que el dueño de un plan pida reprogramarlo). */
  owner?: string;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/**
 * Flujos de aprobación: solicitudes con niveles por cargo (matriz configurable en Mantenedores).
 * Al aprobarse el último nivel el cambio se aplica al registro de origen; con base de datos lo
 * aplica el servidor en la misma transacción y aquí solo se refleja.
 */
@Injectable({ providedIn: 'root' })
export class ApprovalService {
  private readonly rs = inject(RiskDataService);
  private readonly sec = inject(SecurityService);
  private readonly res = inject(ResilienceService);
  private readonly plans = inject(ActionPlanService);
  private readonly cat = inject(CatalogService);

  readonly approvals = signal<ApprovalRequest[]>(this.demoRequests());
  readonly matrixRaw = signal<unknown>(structuredClone(DEFAULT_APPROVAL_MATRIX));
  readonly matrix = computed(() => normalizeMatrix(this.matrixRaw()));

  /**
   * Lo registra PersistenceService: deja como guardado un registro que el servidor ya actualizó
   * al aprobar (así no se reenvía con los permisos de quien aprueba).
   */
  markSaved: (entity: string, obj: Identified) => void = () => undefined;

  /** Pedido de abrir una solicitud (desde avisos o desde los módulos). */
  readonly openRequest = signal<{ id: string; at: number } | null>(null);

  open(id: string) {
    this.openRequest.set({ id, at: Date.now() });
  }

  private me() {
    return this.rs.currentProfile();
  }

  readonly sorted = computed(() => [...this.approvals()].sort((a, b) =>
    Number(b.status === 'Pendiente') - Number(a.status === 'Pendiente') || b.requestedAt.localeCompare(a.requestedAt)));

  /** Solicitudes que la persona puede resolver ahora. */
  readonly pendingForMe = computed(() => this.sorted().filter(r => canDecide(this.me(), r)));
  readonly mine = computed(() => this.sorted().filter(r => isRequester(this.me(), r)));
  readonly pending = computed(() => this.sorted().filter(r => r.status === 'Pendiente'));
  readonly pendingCount = computed(() => this.pending().length);

  canDecide(r: ApprovalRequest): boolean {
    return canDecide(this.me(), r);
  }

  isMine(r: ApprovalRequest): boolean {
    return isRequester(this.me(), r);
  }

  canRequest(kind: ApprovalKind, owner?: string): boolean {
    return canRequest(this.me(), kind, owner);
  }

  get(id: string) {
    return this.approvals().find(r => r.id === id);
  }

  forTarget(entity: ApprovalTargetEntity, id: string | undefined): ApprovalRequest[] {
    if (!id) return [];
    return this.sorted().filter(r => r.targetEntity === entity && r.targetId === id);
  }

  pendingFor(kind: ApprovalKind, id: string | undefined): ApprovalRequest | undefined {
    return id ? this.approvals().find(r => r.kind === kind && r.targetId === id && r.status === 'Pendiente') : undefined;
  }

  /** Cargos que aprobarían una solicitud nueva (para mostrarlos antes de enviarla). */
  previewSteps(kind: ApprovalKind, appetite?: string) {
    const steps = buildSteps(approvalRoleIds(kind, this.matrix(), appetite), this.rs.organizationalRoles());
    const req = { steps, currentStep: 0, requestedBy: this.me().name };
    return steps.map((s, i) => ({ ...s, people: eligibleApprovers(req, this.rs.userProfiles(), i).map(u => u.name) }));
  }

  approversOf(r: ApprovalRequest, step = r.currentStep): string[] {
    return eligibleApprovers(r, this.rs.userProfiles(), step).map(u => u.name);
  }

  summary(r: ApprovalRequest) {
    return approvalSummary(r);
  }

  /** Estado del riesgo frente al apetito (para la aceptación). */
  appetiteOf(riskId: string): string | undefined {
    const r = this.rs.risks().find(x => x.id === riskId);
    return r ? this.cat.appetiteStatus(r.residualScore, r.category) : undefined;
  }

  // ---------------------------------------------------------------------------

  private fail(message: string): never {
    this.rs.permissionNotice.set({ message, at: Date.now() });
    throw new Error(message);
  }

  private targetSignal(entity: ApprovalTargetEntity): WritableSignal<Identified[]> {
    const map: Record<ApprovalTargetEntity, WritableSignal<Identified[]>> = {
      risks: this.rs.risks as unknown as WritableSignal<Identified[]>,
      vulnerabilities: this.sec.vulnerabilities as unknown as WritableSignal<Identified[]>,
      plans: this.res.plans as unknown as WritableSignal<Identified[]>,
      audits: this.rs.audits as unknown as WritableSignal<Identified[]>,
      'action-plans': this.plans.plans as unknown as WritableSignal<Identified[]>,
    };
    return map[entity];
  }

  private commit(prev: ApprovalRequest | null, next: ApprovalRequest, targetOwner?: string) {
    const err = checkApprovalChange(prev, next, this.me(), { matrix: this.matrix(), targetOwner, isAdmin: !!this.me().permissions.canManageRoles });
    if (err) this.fail(err);
    this.approvals.update(list => (prev ? list.map(r => (r.id === next.id ? next : r)) : [...list, next]));
  }

  private log(action: 'SOLICITUD_APROBACION' | 'DECISIÓN_APROBACION' | 'ANULACIÓN_APROBACION', r: ApprovalRequest, details: string) {
    return this.rs.appendAuditLog(action, 'Aprobación', r.code, `${r.code} · ${APPROVAL_KINDS[r.kind].short}: ${approvalSummary(r)}. ${details}`);
  }

  async request(kind: ApprovalKind, target: ApprovalTarget, justification: string, payload: ApprovalPayload = {}): Promise<ApprovalRequest> {
    const info = APPROVAL_KINDS[kind];
    if (!justification.trim()) this.fail('Indique la justificación.');
    const record = this.targetSignal(info.entity)().find(x => x.id === target.id);
    const appetite = kind === 'aceptacion-riesgo' ? this.appetiteOf(target.id) : undefined;
    const pre = targetPrecondition(kind, record, payload, appetite);
    if (pre) this.fail(pre);
    const dup = this.pendingFor(kind, target.id);
    if (dup) this.fail(`Ya hay una solicitud pendiente para este registro (${dup.code}).`);
    const steps = buildSteps(approvalRoleIds(kind, this.matrix(), appetite), this.rs.organizationalRoles());
    const code = nextApprovalCode(this.approvals());
    const req: ApprovalRequest = {
      id: `sa-${code.toLowerCase()}-${Math.random().toString(36).slice(2, 6)}`, code, kind, targetEntity: info.entity, targetId: target.id,
      targetLabel: target.label.slice(0, 300), justification: justification.trim(), payload: { ...payload, ...(appetite ? { appetite } : {}) },
      requestedBy: this.me().name, requestedAt: new Date().toISOString(), steps, currentStep: 0, status: 'Pendiente',
    };
    if (!steps.length) this.fail('No hay cargos aprobadores configurados para este tipo de solicitud (Mantenedores → Aprobaciones).');
    if (!eligibleApprovers(req, this.rs.userProfiles()).length) {
      this.fail(`No hay otra persona activa con el cargo ${steps[0].roleTitle} para aprobar. Revise la matriz de aprobación.`);
    }
    this.commit(null, req, target.owner);
    await this.log('SOLICITUD_APROBACION', req, `Solicitado por ${req.requestedBy}. Aprueba: ${steps.map(s => s.roleTitle).join(' → ')}. Justificación: ${req.justification}`);
    return req;
  }

  async decide(id: string, decision: 'Aprobada' | 'Rechazada', comment: string): Promise<ApprovalRequest> {
    const prev = this.get(id) ?? this.fail('Solicitud no encontrada.');
    if (decision === 'Rechazada' && !comment.trim()) this.fail('Indique el motivo del rechazo.');
    const next = decide(prev, this.me(), decision, comment, new Date().toISOString());
    this.commit(prev, next);
    const step = prev.steps[prev.currentStep];
    if (next.status === 'Aprobada') this.applyLocal(next);
    await this.log('DECISIÓN_APROBACION', next,
      `Nivel ${prev.currentStep + 1}/${prev.steps.length} (${step.roleTitle}) ${decision.toLowerCase()} por ${this.me().name}${comment.trim() ? `: ${comment.trim()}` : ''}.` +
      (next.status === 'Aprobada' ? ` ${APPROVAL_KINDS[next.kind].effect}` : next.status === 'Pendiente' ? ` Pasa a ${next.steps[next.currentStep].roleTitle}.` : ''));
    return next;
  }

  async cancel(id: string, reason: string) {
    const prev = this.get(id) ?? this.fail('Solicitud no encontrada.');
    const next: ApprovalRequest = { ...prev, status: 'Anulada', closedAt: new Date().toISOString(), cancelReason: reason.trim() || undefined };
    this.commit(prev, next);
    await this.log('ANULACIÓN_APROBACION', next, `Anulada por ${this.me().name}.${reason.trim() ? ` ${reason.trim()}` : ''}`);
  }

  /** Refleja el cambio aprobado en el registro de origen (el servidor ya lo guardó). */
  private applyLocal(r: ApprovalRequest) {
    const sig = this.targetSignal(r.targetEntity);
    const target = sig().find(x => x.id === r.targetId);
    const updated = applyApprovalEffect(r, target) as Identified | null;
    if (!updated) return;
    sig.update(list => list.map(x => (x.id === updated.id ? updated : x)));
    this.markSaved(r.targetEntity, updated);
  }

  /** Solicitudes de ejemplo (solo en modo demostración; con base de datos las carga el servidor). */
  private demoRequests(): ApprovalRequest[] {
    const roles = this.rs.organizationalRoles();
    return [
      {
        id: 'sa-demo-1', code: 'SA-2026-001', kind: 'plan-continuidad', targetEntity: 'plans', targetId: 'pln-2',
        targetLabel: 'DRP-01 Recuperación del centro de datos y core financiero',
        justification: 'Versión 2.5: incorpora el sitio alterno en la nube y el RTO de 4 h del core acordado con el proveedor.',
        payload: { version: '2.5', nextReviewDate: '2027-11-30' }, requestedBy: 'Ing. Alejandro Vega', requestedAt: daysAgo(4),
        steps: buildSteps(['role-gerencia-general'], roles), currentStep: 0, status: 'Pendiente',
      },
      {
        id: 'sa-demo-2', code: 'SA-2026-002', kind: 'aceptacion-vulnerabilidad', targetEntity: 'vulnerabilities', targetId: 'vul-1',
        targetLabel: 'VUL-001 Protocolos TLS 1.0/1.1 habilitados en el portal de socios',
        justification: 'El portal antiguo se retira en enero; mientras tanto el WAF bloquea TLS 1.0 para socios y queda solo para la integración del banco corresponsal.',
        payload: { reviewDate: '2027-01-31' }, requestedBy: 'Ing. Alejandro Vega', requestedAt: daysAgo(1),
        steps: buildSteps(DEFAULT_APPROVAL_MATRIX.steps['aceptacion-vulnerabilidad'], roles), currentStep: 0, status: 'Pendiente',
      },
    ];
  }
}
