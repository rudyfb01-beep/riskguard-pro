import { describe, expect, it } from 'vitest';
import { ActionPlan } from '../models/action-plan.model';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../models/notification.model';
import { ApprovalRequest } from '../models/approval.model';
import { changeNotifications, deepLink, notificationEmail, scheduledNotifications, ScheduleData } from './notifications';

const users = [
  { name: 'Dra. Elena Vasconcelos', email: 'elena@x.cl', roleId: 'role-riesgo-op', permissions: { canManageActionPlans: true, canEditRisks: true } },
  { name: 'Sr. Patricio Rojas', email: 'patricio@x.cl', roleId: 'role-gerencia-general', permissions: { canManageActionPlans: true } },
  { name: 'Ing. Carlos Mendoza', email: 'Carlos@x.cl', roleId: 'role-ops', permissions: {} },
  { name: 'Ex Empleado', email: 'ex@x.cl', roleId: 'role-ops', permissions: { canManageActionPlans: true }, active: false },
];

const plan = (over: Partial<ActionPlan> = {}): ActionPlan => ({
  id: 'p1', code: 'PA-2026-001', title: 'Doble firma', description: '', sourceType: 'Control', sourceLabel: 'C-1', owner: 'Carlos Mendoza',
  priority: 'Alta', dueDate: '2026-11-10', originalDueDate: '2026-11-10', status: 'En curso', progressPct: 40, tasks: [], updates: [],
  reschedules: [], createdBy: 'Dra. Elena Vasconcelos', createdAt: '2026-10-01T00:00:00Z', ...over,
});

const ctx = { actorName: 'Dra. Elena Vasconcelos', users, now: '2026-11-05T12:00:00Z' };
const empty: ScheduleData = { users, actionPlans: [], surveyCampaigns: [], surveyResponses: [], approvals: [], continuityPlans: [], vulnerabilities: [], risks: [], providers: [], documents: [] };

describe('avisos por cambios', () => {
  it('asignar un plan avisa al responsable (por nombre, sin tratamiento) y no a quien lo hizo', () => {
    const n = changeNotifications('action-plans', null, plan(), ctx);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ recipient: 'carlos@x.cl', category: 'Planes de acción', entityId: 'p1' });
    expect(changeNotifications('action-plans', null, plan({ owner: 'Elena Vasconcelos' }), ctx)).toHaveLength(0);
  });

  it('enviar a verificación avisa a quienes administran planes (activos, excepto el responsable)', () => {
    const n = changeNotifications('action-plans', plan(), plan({ status: 'Por verificar', closure: { submittedAt: 'x', submittedBy: 'Carlos', evidence: 'Acta' } }),
      { ...ctx, actorName: 'Carlos Mendoza' });
    expect(n.map(x => x.recipient).sort()).toEqual(['elena@x.cl', 'patricio@x.cl']);
  });

  it('una solicitud nueva avisa al cargo del primer nivel', () => {
    const r: ApprovalRequest = {
      id: 'a1', code: 'SA-2026-001', kind: 'plan-continuidad', targetEntity: 'plans', targetId: 'bcp', targetLabel: 'BCP-01', justification: 'Nueva versión',
      payload: {}, requestedBy: 'Dra. Elena Vasconcelos', requestedAt: ctx.now, steps: [{ roleId: 'role-gerencia-general', roleTitle: 'Gerente General' }],
      currentStep: 0, status: 'Pendiente',
    };
    const n = changeNotifications('approvals', null, r, ctx);
    expect(n.map(x => [x.recipient, x.severity])).toEqual([['patricio@x.cl', 'urgente']]);
    const done = { ...r, status: 'Aprobada' as const, steps: [{ ...r.steps[0], decision: 'Aprobada' as const, decidedBy: 'Sr. Patricio Rojas' }] };
    expect(changeNotifications('approvals', r, done, { ...ctx, actorName: 'Sr. Patricio Rojas' })[0]).toMatchObject({ recipient: 'elena@x.cl', title: expect.stringContaining('aprobada') });
  });
});

describe('avisos por plazos', () => {
  it('por vencer, vencido y escalado; la clave no cambia mientras el plazo sea el mismo', () => {
    const today = '2026-11-05';
    const due = scheduledNotifications({ ...empty, actionPlans: [plan()] }, DEFAULT_NOTIFICATION_SETTINGS, today);
    expect(due.map(n => n.title)).toEqual(['PA-2026-001 vence en 5 días']);
    const late = scheduledNotifications({ ...empty, actionPlans: [plan({ dueDate: '2026-10-01' })] }, DEFAULT_NOTIFICATION_SETTINGS, today);
    expect(late.map(n => n.recipient).sort()).toEqual(['carlos@x.cl', 'elena@x.cl', 'patricio@x.cl']);
    expect(late.find(n => n.recipient === 'carlos@x.cl')!.dedupeKey).toBe('plan-overdue:p1:2026-10-01|carlos@x.cl');
    expect(scheduledNotifications({ ...empty, actionPlans: [plan({ status: 'Por verificar', dueDate: '2026-10-01' })] }, DEFAULT_NOTIFICATION_SETTINGS, today)).toEqual([]);
  });
});

describe('correo', () => {
  it('enlace directo al registro y contenido escapado', () => {
    expect(deepLink('https://grc.coop.cl/', { tab: 'aprobaciones', entityType: 'approvals', entityId: 'a 1' })).toBe('https://grc.coop.cl/?tab=aprobaciones&ref=approvals%3Aa+1');
    const mail = notificationEmail({
      id: 'n', recipient: 'a@x', recipientName: 'Ana', category: 'Aprobaciones', severity: 'urgente', title: 'Aprobar <BCP>', body: 'x', dedupeKey: 'k', createdAt: '',
    }, 'RiskGuard Pro', 'https://grc.coop.cl');
    expect(mail.subject).toBe('[Urgente] Aprobar <BCP> · RiskGuard Pro');
    expect(mail.html).toContain('Aprobar &lt;BCP&gt;');
  });
});
