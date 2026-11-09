import { describe, expect, it } from 'vitest';
import { CrisisEvent } from '../models/crisis.model';
import { BASE_SCENARIOS, DEMO_COMMITTEE } from '../data/crisis-seed';
import {
  canActOnCrisis, checkCrisisChange, committeeGaps, elapsedHours, nextCrisisCode, normalizeCommittee, scenarioCoverage, tasksFromScenario,
} from './crisis';
import { changeNotifications, scheduledNotifications } from './notifications';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../models/notification.model';

const committee = normalizeCommittee(DEMO_COMMITTEE);
const elena = { name: 'Dra. Elena Vasconcelos', permissions: { canManageContinuity: true } };
const carmen = { name: 'Carmen Soto', permissions: {} };              // integra el comité, sin permisos
const ana = { name: 'Ana Externa', permissions: { canEditRisks: true } }; // no integra el comité

const crisis = (o: Partial<CrisisEvent> = {}): CrisisEvent => ({
  id: 'c1', code: 'CR-2026-003', title: 'Caída del core', mode: 'Real', level: 2, status: 'Activa', declaredAt: '2026-11-06T12:00:00.000Z',
  declaredBy: 'Carmen Soto', affectedProcessIds: [], activatedPlanIds: [], tasks: [], communications: [], createdBy: 'Carmen Soto', createdAt: 'x',
  log: [{ id: 'l1', at: '2026-11-06T12:00:00.000Z', by: 'Carmen Soto', kind: 'Estado', text: 'Declarada' }], ...o,
});

describe('gestión de crisis: reglas', () => {
  it('declaran el comité (incluidos suplentes) y quien administra continuidad', () => {
    expect(canActOnCrisis(carmen, committee)).toBe(true);
    expect(canActOnCrisis(elena, committee)).toBe(true);
    expect(canActOnCrisis(ana, committee)).toBe(false);
    expect(canActOnCrisis({ name: 'Elena Vasconcelos', permissions: {} }, committee)).toBe(true); // sin tratamiento
    expect(checkCrisisChange(null, crisis(), carmen, committee)).toBeNull();
    expect(checkCrisisChange(null, crisis(), ana, committee)).toContain('Comité de Crisis');
  });

  it('la bitácora y las comunicaciones solo crecen y van a nombre de quien guarda', () => {
    const prev = crisis();
    const add = { id: 'l2', at: 'x', by: 'Carmen Soto', kind: 'Decisión' as const, text: 'Activar DRP' };
    expect(checkCrisisChange(prev, { ...prev, log: [...prev.log, add] }, carmen, committee)).toBeNull();
    expect(checkCrisisChange(prev, { ...prev, log: [...prev.log, { ...add, by: 'Otro' }] }, carmen, committee)).toContain('a tu nombre');
    expect(checkCrisisChange(prev, { ...prev, log: [{ ...prev.log[0], text: 'cambiado' }] }, elena, committee)).toContain('No se pueden modificar');
    expect(checkCrisisChange(prev, { ...prev, log: [] }, elena, committee)).toContain('No se pueden modificar');
  });

  it('estados y cierre', () => {
    const prev = crisis();
    expect(checkCrisisChange(prev, { ...prev, status: 'Cerrada' }, carmen, committee)).toContain('resumen');
    const closed = { ...prev, status: 'Cerrada' as const, closedAt: 'y', closingSummary: 'Resuelto' };
    expect(checkCrisisChange(prev, closed, carmen, committee)).toBeNull();
    expect(checkCrisisChange(closed, { ...closed, status: 'Activa' }, elena, committee)).toContain('No se puede pasar');
    expect(checkCrisisChange(closed, { ...closed, title: 'otro' }, elena, committee)).toContain('no se modifica');
    expect(checkCrisisChange(closed, { ...closed, lessons: 'Mejorar árbol de llamadas' }, carmen, committee)).toContain('administra continuidad');
    expect(checkCrisisChange(closed, { ...closed, lessons: 'Mejorar árbol de llamadas' }, elena, committee)).toBeNull();
    expect(checkCrisisChange(prev, { ...prev, mode: 'Simulacro' }, elena, committee)).toContain('real y simulacro');
    expect(checkCrisisChange(prev, { ...prev, declaredAt: '2026-11-06T13:00:00.000Z' }, elena, committee)).toContain('hora de declaración');
    expect(checkCrisisChange(null, crisis({ status: 'Programada', mode: 'Real', plannedDate: '2026-12-01' }), elena, committee)).toContain('simulacros');
  });

  it('códigos, comité incompleto, cobertura de escenarios y tareas', () => {
    expect(nextCrisisCode([{ code: 'CR-2026-002' }, { code: 'CR-2025-009' }], 2026)).toBe('CR-2026-003');
    expect(committeeGaps(committee)).toEqual([]);
    expect(committeeGaps(normalizeCommittee({ members: [{ name: 'Ana', role: 'Miembro', phone: '' }] }))).toEqual(
      ['menos de 3 integrantes', 'sin presidente', 'sin vocero', 'integrantes sin teléfono', 'sin sala alternativa ni virtual']);
    const cov = scenarioCoverage(BASE_SCENARIOS, [
      crisis({ scenarioId: 'esc-01', declaredAt: '2026-05-28T15:00:00Z', status: 'Cerrada' }),
      crisis({ id: 'c2', scenarioId: 'esc-02', declaredAt: '2025-01-10T15:00:00Z', status: 'Cerrada' }),
      crisis({ id: 'c3', scenarioId: 'esc-03', status: 'Programada', declaredAt: undefined, plannedDate: '2026-12-01', mode: 'Simulacro' }),
    ], '2026-11-06');
    expect(cov.find(c => c.scenario.id === 'esc-01')).toMatchObject({ last: '2026-05-28', current: true });
    expect(cov.find(c => c.scenario.id === 'esc-02')).toMatchObject({ current: false });
    expect(cov.find(c => c.scenario.id === 'esc-03')).toMatchObject({ last: undefined, planned: '2026-12-01' });
    let n = 0;
    expect(tasksFromScenario(BASE_SCENARIOS[0], () => `t${++n}`)).toHaveLength(5);
    expect(elapsedHours(crisis({ closedAt: '2026-11-06T14:30:00.000Z' }))).toBe(2.5);
  });
});

describe('gestión de crisis: avisos', () => {
  const users = [
    { name: 'Sr. Patricio Rojas', email: 'patricio@x.cl', permissions: {} },
    { name: 'Dra. Elena Vasconcelos', email: 'elena@x.cl', permissions: { canManageContinuity: true } },
    { name: 'Carmen Soto', email: 'carmen@x.cl', permissions: {} },
  ];
  const ctx = { actorName: 'Carmen Soto', users, committee, now: '2026-11-06T12:00:00Z' };

  it('declarar una crisis real avisa con urgencia al comité (también externos) menos a quien declara', () => {
    const n = changeNotifications('crisis-events', null, crisis(), ctx);
    expect(n.every(x => x.severity === 'urgente' && x.category === 'Continuidad')).toBe(true);
    const to = n.map(x => x.recipient);
    expect(to).toContain('patricio@x.cl');
    expect(to).toContain('alejandro.vega@demo.riskguard.cl'); // integrante sin usuario en esta lista: se usa su correo del comité
    expect(to).not.toContain('carmen@x.cl');
    expect(n[0].title).toBe('Crisis declarada: CR-2026-003 · Crisis');
    expect(changeNotifications('crisis-events', crisis(), crisis({ log: [] }), ctx)).toEqual([]);
  });

  it('simulacro programado: aviso una semana antes', () => {
    const drill = crisis({ status: 'Programada', mode: 'Simulacro', plannedDate: '2026-11-10', declaredAt: undefined });
    const base = { users, actionPlans: [], surveyCampaigns: [], surveyResponses: [], approvals: [], continuityPlans: [], vulnerabilities: [], risks: [], providers: [], documents: [] };
    const out = scheduledNotifications({ ...base, crisisEvents: [drill], committee }, DEFAULT_NOTIFICATION_SETTINGS, '2026-11-06');
    expect(out.some(x => x.title === 'Simulacro CR-2026-003 en 4 días')).toBe(true);
    expect(scheduledNotifications({ ...base, crisisEvents: [drill], committee }, DEFAULT_NOTIFICATION_SETTINGS, '2026-11-01')).toEqual([]);
  });
});
