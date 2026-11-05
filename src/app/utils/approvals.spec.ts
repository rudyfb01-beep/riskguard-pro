import { describe, expect, it } from 'vitest';
import { ApprovalRequest, DEFAULT_APPROVAL_MATRIX } from '../models/approval.model';
import {
  applyApprovalEffect, approvalRoleIds, buildSteps, canDecide, checkApprovalChange, decide, eligibleApprovers, nextApprovalCode, normalizeMatrix,
} from './approvals';

const roles = [
  { id: 'role-riesgo-op', title: 'Jefe de Riesgo Operacional' },
  { id: 'role-gerencia-general', title: 'Gerente General' },
  { id: 'role-comite-riesgos', title: 'Comité de Riesgos' },
  { id: 'role-ciso', title: 'CISO' },
];
const ciso = { name: 'Ing. Alejandro Vega', roleId: 'role-ciso', permissions: { canManageInfoSecurity: true } };
const elena = { name: 'Dra. Elena Vasconcelos', roleId: 'role-riesgo-op', permissions: { canEditRisks: true, canManageActionPlans: true } };
const patricio = { name: 'Sr. Patricio Rojas', roleId: 'role-gerencia-general', permissions: {} };
const carlos = { name: 'Ing. Carlos Mendoza', roleId: 'role-ops', permissions: {} };
const ctx = { matrix: DEFAULT_APPROVAL_MATRIX };

const vulnRequest = (over: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 'a1', code: 'SA-2026-001', kind: 'aceptacion-vulnerabilidad', targetEntity: 'vulnerabilities', targetId: 'v1', targetLabel: 'VUL-1 TLS',
  justification: 'Sistema en retiro; WAF compensa', payload: { reviewDate: '2027-01-31' }, requestedBy: ciso.name, requestedAt: '2026-11-01T10:00:00Z',
  steps: buildSteps(approvalRoleIds('aceptacion-vulnerabilidad', DEFAULT_APPROVAL_MATRIX), roles), currentStep: 0, status: 'Pendiente', ...over,
});

describe('flujos de aprobación', () => {
  it('niveles según la matriz; fuera de tolerancia suma el Comité', () => {
    expect(approvalRoleIds('aceptacion-riesgo', DEFAULT_APPROVAL_MATRIX, 'Sobre el apetito')).toEqual(['role-gerencia-general']);
    expect(approvalRoleIds('aceptacion-riesgo', DEFAULT_APPROVAL_MATRIX, 'Fuera de tolerancia')).toEqual(['role-gerencia-general', 'role-comite-riesgos']);
    expect(normalizeMatrix({ steps: { 'plan-continuidad': ['role-consejo'] } }).steps['plan-continuidad']).toEqual(['role-consejo']);
    expect(normalizeMatrix(null).steps['informe-auditoria']).toEqual(DEFAULT_APPROVAL_MATRIX.steps['informe-auditoria']);
    expect(nextApprovalCode([{ code: 'SA-2026-009' }], 2026)).toBe('SA-2026-010');
  });

  it('crear: permiso del tipo, a nombre propio y niveles de la matriz vigente', () => {
    expect(checkApprovalChange(null, vulnRequest(), ciso, ctx)).toBeNull();
    expect(checkApprovalChange(null, vulnRequest({ requestedBy: carlos.name }), carlos, ctx)).toContain('no puede solicitar');
    expect(checkApprovalChange(null, vulnRequest({ steps: buildSteps(['role-ciso'], roles) }), ciso, ctx)).toContain('matriz');
    // El responsable de un plan puede pedir su reprogramación.
    const resched = vulnRequest({ kind: 'reprogramacion-plan', targetEntity: 'action-plans', requestedBy: carlos.name, steps: buildSteps(['role-riesgo-op'], roles) });
    expect(checkApprovalChange(null, resched, carlos, { ...ctx, targetOwner: 'Carlos Mendoza' })).toBeNull();
    expect(checkApprovalChange(null, resched, carlos, { ...ctx, targetOwner: 'Otra Persona' })).toContain('no puede solicitar');
  });

  it('decidir: solo el cargo del nivel vigente, nunca quien solicitó, y avanza al siguiente nivel', () => {
    const r = vulnRequest();
    expect(canDecide(patricio, r)).toBe(false);        // el nivel 1 es Riesgo Operacional
    expect(canDecide(elena, r)).toBe(true);
    const step1 = decide(r, elena, 'Aprobada', '', '2026-11-02T10:00:00Z');
    expect(step1).toMatchObject({ status: 'Pendiente', currentStep: 1 });
    expect(checkApprovalChange(r, step1, elena, ctx)).toBeNull();
    expect(checkApprovalChange(r, step1, patricio, ctx)).toContain('Jefe de Riesgo Operacional');
    // Saltarse un nivel o cambiar el estado sin decidir no pasa.
    expect(checkApprovalChange(r, { ...r, status: 'Aprobada' }, elena, ctx)).not.toBeNull();
    const done = decide(step1, patricio, 'Aprobada', 'Ok', '2026-11-03T10:00:00Z');
    expect(done.status).toBe('Aprobada');
    expect(checkApprovalChange(step1, done, patricio, ctx)).toBeNull();
    // Quien solicita no aprueba aunque tenga el cargo.
    const own = vulnRequest({ requestedBy: elena.name });
    expect(canDecide(elena, own)).toBe(false);
    expect(eligibleApprovers(own, [{ ...elena, email: 'e@x' }, { ...patricio, email: 'p@x' }])).toEqual([]);
  });

  it('rechazar exige motivo; anular solo quien solicitó', () => {
    const r = vulnRequest();
    expect(checkApprovalChange(r, decide(r, elena, 'Rechazada', '', 'x'), elena, ctx)).toContain('motivo');
    expect(checkApprovalChange(r, decide(r, elena, 'Rechazada', 'Falta plan', 'x'), elena, ctx)).toBeNull();
    expect(checkApprovalChange(r, { ...r, status: 'Anulada' }, elena, ctx)).toContain('Solo quien solicitó');
    expect(checkApprovalChange(r, { ...r, status: 'Anulada' }, ciso, ctx)).toBeNull();
    expect(checkApprovalChange(r, { ...r, justification: 'otra' }, ciso, ctx)).toContain('no se pueden cambiar');
  });

  it('al aprobarse aplica el cambio al registro de origen', () => {
    const done: ApprovalRequest = {
      ...vulnRequest(), status: 'Aprobada', closedAt: '2026-11-03T10:00:00Z',
      steps: vulnRequest().steps.map((s, i) => ({ ...s, decision: 'Aprobada', decidedBy: i ? patricio.name : elena.name })),
    };
    expect(applyApprovalEffect(done, { id: 'v1', status: 'Abierta' })).toMatchObject({
      status: 'Riesgo aceptado', acceptance: { approvedBy: `${elena.name} / ${patricio.name}`, approvedDate: '2026-11-03', reviewDate: '2027-01-31' },
    });
    const plan = { id: 'p', dueDate: '2026-11-10', reschedules: [] };
    const resched = { ...done, kind: 'reprogramacion-plan' as const, payload: { newDueDate: '2026-12-15', currentDueDate: '2026-11-10' } };
    const moved = applyApprovalEffect(resched, plan);
    expect(moved.dueDate).toBe('2026-12-15');
    expect(moved.reschedules[0]).toMatchObject({ from: '2026-11-10', to: '2026-12-15', by: ciso.name });
    expect(applyApprovalEffect({ ...done, status: 'Pendiente' }, plan)).toBeNull();
    expect(applyApprovalEffect({ ...done, kind: 'plan-continuidad', payload: { version: '3.0' } }, { status: 'Borrador', version: '2.1' }))
      .toMatchObject({ status: 'Vigente', version: '3.0', approvalDate: '2026-11-03' });
  });
});

describe('comparación de solicitudes guardadas', () => {
  it('el orden de las claves (JSONB) no cuenta como cambio', () => {
    const r = vulnRequest();
    const fromDb = JSON.parse(JSON.stringify({ ...r, payload: { reviewDate: '2027-01-31' }, steps: r.steps.map(s => ({ roleTitle: s.roleTitle, roleId: s.roleId })) }));
    const next = decide(r, elena, 'Aprobada', '', '2026-11-02T10:00:00Z');
    expect(checkApprovalChange(fromDb, next, elena, ctx)).toBeNull();
  });
});
