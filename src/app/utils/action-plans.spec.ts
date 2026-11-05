import { describe, expect, it } from 'vitest';
import { ActionPlan } from '../models/action-plan.model';
import { PeriodicAudit, Risk } from '../models/risk.model';
import { checkPlanChange, isOverduePlan, nextPlanCode, plansFromExisting, progressFromTasks, riskTreatment } from './action-plans';

const plan = (over: Partial<ActionPlan> = {}): ActionPlan => ({
  id: 'p1', code: 'PA-2026-001', title: 'Actualizar política', description: '', sourceType: 'Cumplimiento', sourceId: 'req-1',
  sourceLabel: 'Ley 1 art. 1', owner: 'Ana Pérez', priority: 'Media', dueDate: '2026-12-31', originalDueDate: '2026-12-31',
  status: 'En curso', progressPct: 40, tasks: [], updates: [], reschedules: [], createdBy: 'Jefe', createdAt: '2026-11-01T00:00:00Z', ...over,
});

const manager = { name: 'Elena Riesgo', permissions: { canManageActionPlans: true } };
const owner = { name: 'Ana Pérez', permissions: {} };
const other = { name: 'Juan Otro', permissions: {} };
const compliance = { name: 'Sofía', permissions: { canManageCompliance: true } };

describe('reglas de edición', () => {
  it('crea quien administra planes o tiene el permiso del módulo de origen', () => {
    expect(checkPlanChange(null, plan({ status: 'Pendiente' }), manager)).toBeNull();
    expect(checkPlanChange(null, plan({ status: 'Pendiente' }), compliance)).toBeNull();
    expect(checkPlanChange(null, plan({ status: 'Pendiente', sourceType: 'Auditoría' }), compliance)).toMatch(/permiso/);
    expect(checkPlanChange(null, plan({ status: 'Cerrado' }), manager)).toMatch(/parte como/);
  });

  it('el responsable registra avances y envía a verificación, pero no cambia plazo ni cierra', () => {
    const prev = plan();
    expect(checkPlanChange(prev, { ...prev, progressPct: 60 }, owner)).toBeNull();
    expect(checkPlanChange(prev, { ...prev, dueDate: '2027-03-01' }, owner)).toMatch(/no puede cambiar/);
    expect(checkPlanChange(prev, { ...prev, status: 'Por verificar' }, owner)).toMatch(/evidencia/);
    expect(checkPlanChange(prev, { ...prev, status: 'Por verificar', closure: { submittedAt: 'x', submittedBy: 'Ana Pérez', evidence: 'Acta 5' } }, owner)).toBeNull();
    expect(checkPlanChange(prev, { ...prev, status: 'Cancelado', cancelReason: 'x' }, owner)).toMatch(/no puede cerrar ni cancelar/);
    expect(checkPlanChange(prev, { ...prev, progressPct: 60 }, other)).toMatch(/Solo el responsable/);
  });

  it('el cierre lo verifica alguien distinto del responsable', () => {
    const submitted = plan({ status: 'Por verificar', closure: { submittedAt: 'x', submittedBy: 'Ana Pérez', evidence: 'Acta 5' } });
    const closed = { ...submitted, status: 'Cerrado' as const, closedAt: '2026-12-01' };
    expect(checkPlanChange(submitted, closed, manager)).toBeNull();
    expect(checkPlanChange(submitted, closed, { ...owner, permissions: { canManageActionPlans: true } })).toMatch(/distinta del responsable/);
    expect(checkPlanChange(plan(), { ...plan(), status: 'Cerrado' }, manager)).toMatch(/Por verificar/);
  });

  it('valida los campos mínimos', () => {
    expect(checkPlanChange(null, plan({ title: ' ' }), manager)).toMatch(/título/);
    expect(checkPlanChange(null, plan({ owner: '' }), manager)).toMatch(/responsable/);
    expect(checkPlanChange(plan(), { ...plan(), status: 'Cancelado' }, manager)).toMatch(/motivo/);
  });
});

describe('responsable', () => {
  it('reconoce al responsable sin tratamiento ni acentos', () => {
    expect(checkPlanChange(plan({ owner: 'Carlos Mendoza' }), plan({ owner: 'Carlos Mendoza', progressPct: 70 }), { name: 'Ing. Carlos Mendoza', permissions: {} })).toBeNull();
    expect(checkPlanChange(plan({ owner: 'sofia valenzuela' }), plan({ owner: 'sofia valenzuela', progressPct: 70 }), { name: 'Dra. Sofía Valenzuela', permissions: {} })).toBeNull();
  });
});

describe('cálculos', () => {
  it('código correlativo por año', () => {
    expect(nextPlanCode([], 2026)).toBe('PA-2026-001');
    expect(nextPlanCode([{ code: 'PA-2026-009' }, { code: 'PA-2025-120' }], 2026)).toBe('PA-2026-010');
  });

  it('vencido solo si sigue pendiente o en curso', () => {
    expect(isOverduePlan(plan({ dueDate: '2026-01-01' }), '2026-02-01')).toBe(true);
    expect(isOverduePlan(plan({ dueDate: '2026-01-01', status: 'Por verificar' }), '2026-02-01')).toBe(false);
    expect(isOverduePlan(plan({ dueDate: '2026-03-01' }), '2026-02-01')).toBe(false);
  });

  it('avance desde tareas', () => {
    expect(progressFromTasks([{ id: 'a', text: 'a', done: true }, { id: 'b', text: 'b', done: false }], 10)).toBe(50);
    expect(progressFromTasks([], 30)).toBe(30);
  });

  it('el tratamiento del riesgo se calcula de sus planes', () => {
    const risk = { id: 'r1', mitigationPlan: { id: 'm', title: 'Viejo', owner: 'x', dueDate: '2026-01-01', budgetUSD: 5, progressPct: 10, status: 'En Progreso', actions: [] } } as unknown as Risk;
    expect(riskTreatment(risk, [])).toBe(risk.mitigationPlan);
    const t = riskTreatment(risk, [
      plan({ sourceType: 'Riesgo', sourceId: 'r1', status: 'Cerrado' }),
      plan({ id: 'p2', code: 'PA-2026-002', title: 'Nuevo', sourceType: 'Riesgo', sourceId: 'r1', progressPct: 0, dueDate: '2027-01-31', status: 'Pendiente' }),
    ]);
    expect(t).toMatchObject({ title: 'Nuevo', progressPct: 50, dueDate: '2027-01-31', status: 'En Progreso', budgetUSD: 5 });
  });
});

describe('planes desde lo registrado', () => {
  it('convierte mitigaciones, hallazgos, requisitos y pruebas', () => {
    const risks = [{ id: 'r1', code: 'R-1', title: 'Fraude', process: 'Pagos', responsible: 'Ana', residualLevel: 'Alto', inherentLevel: 'Crítico',
      mitigationPlan: { id: 'm', title: 'Doble firma', owner: 'Ana', dueDate: '2026-12-01', budgetUSD: 0, progressPct: 30, status: 'En Progreso', actions: ['Política', 'Sistema'] } }] as unknown as Risk[];
    const audits = [{ id: 'a1', code: 'AUD-1', findings: [
      { id: 'f1', type: 'No Conformidad Mayor', description: 'Sin MFA', process: 'TI', correctiveAction: 'Activar MFA', deadline: '2026-12-15', responsible: 'CISO', status: 'En Subsanación' },
      { id: 'f2', type: 'Conforme', description: 'OK', process: 'TI', correctiveAction: '', deadline: '2026-12-15', responsible: '', status: 'Cerrado' },
    ] }] as unknown as PeriodicAudit[];
    const r = plansFromExisting({
      risks, audits, normLabel: () => 'RAN 20-7',
      compliance: [{ id: 'c1', chapter: '20-7', numeral: 'I.1', title: 'Alcance', requirement: '', frequency: 'Anual', status: 'No cumple', evidence: '', owner: 'Sofía', actionPlan: 'Levantar catastro', dueDate: '2026-12-20' }],
      assessment: [], continuityTests: [{ id: 't1', planId: 'pl', date: '2026-10-01', type: 'Simulacro', scenario: 'Caída', result: 'Fallida', findings: 'RTO no logrado', actions: 'Ampliar enlace' }],
      at: '2026-11-05T00:00:00Z', by: 'Migración',
    });
    expect(r.plans.map(p => [p.code, p.sourceType, p.status])).toEqual([
      ['PA-2026-001', 'Riesgo', 'En curso'], ['PA-2026-002', 'Auditoría', 'En curso'], ['PA-2026-003', 'Cumplimiento', 'Pendiente'], ['PA-2026-004', 'Continuidad', 'Pendiente'],
    ]);
    expect(r.plans[0].tasks.map(t => t.text)).toEqual(['Política', 'Sistema']);
    expect(r.plans[1]).toMatchObject({ sourceId: 'a1::f1', priority: 'Alta', owner: 'CISO' });
    expect(r.migratedCompliance).toEqual(['c1']);
  });
});
