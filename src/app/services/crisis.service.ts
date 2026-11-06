import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { ResilienceService } from './resilience.service';
import {
  CrisisAudience, CrisisCommittee, CrisisEvent, CrisisLevel, CrisisLogKind, CrisisMode, CrisisScenario,
} from '../models/crisis.model';
import { ContinuityTest } from '../models/resilience.model';
import { DEMO_COMMITTEE, DEMO_CRISIS_EVENTS, DEMO_SCENARIOS } from '../data/crisis-seed';
import {
  canActOnCrisis, canManageCrisis, checkCrisisChange, isOpen, levelName, nextCrisisCode, normalizeCommittee, scenarioCoverage, tasksFromScenario,
} from '../utils/crisis';
import { todayIso } from '../utils/action-plans';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export interface DeclareInput {
  title: string;
  mode: CrisisMode;
  level: CrisisLevel;
  scenarioId?: string;
  flawId?: string;
  affectedProcessIds: string[];
  activatedPlanIds: string[];
  situation: string;
}

/**
 * Gestión de crisis: escenarios, Comité de Crisis, crisis declaradas y simulacros.
 * Las reglas (quién puede registrar, bitácora que solo crece, estados) están en utils/crisis
 * y las aplica también el servidor.
 */
@Injectable({ providedIn: 'root' })
export class CrisisService {
  private readonly rs = inject(RiskDataService);
  private readonly res = inject(ResilienceService);

  readonly scenarios = signal<CrisisScenario[]>(clone(DEMO_SCENARIOS));
  readonly events = signal<CrisisEvent[]>(clone(DEMO_CRISIS_EVENTS));
  readonly committeeRaw = signal<unknown>(clone(DEMO_COMMITTEE));
  readonly committee = computed<CrisisCommittee>(() => normalizeCommittee(this.committeeRaw()));

  private seq = 0;
  private id(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${(++this.seq).toString(36)}`; }
  private me() { return this.rs.currentProfile(); }

  readonly canManage = computed(() => canManageCrisis(this.me()));
  /** Puede declarar crisis y registrar en ellas (administra continuidad o integra el comité). */
  readonly canAct = computed(() => canActOnCrisis(this.me(), this.committee()));

  readonly open = computed(() => this.events().filter(isOpen).sort((a, b) => b.level - a.level || (a.declaredAt ?? '').localeCompare(b.declaredAt ?? '')));
  readonly realOpen = computed(() => this.open().filter(e => e.mode === 'Real'));
  readonly upcoming = computed(() => this.events().filter(e => e.status === 'Programada').sort((a, b) => (a.plannedDate ?? '').localeCompare(b.plannedDate ?? '')));
  readonly history = computed(() => this.events().filter(e => !isOpen(e) && e.status !== 'Programada')
    .sort((a, b) => (b.declaredAt ?? b.createdAt).localeCompare(a.declaredAt ?? a.createdAt)));
  readonly coverage = computed(() => scenarioCoverage(this.scenarios(), this.events(), todayIso()));

  scenarioById(id: string | undefined) { return id ? this.scenarios().find(s => s.id === id) : undefined; }
  byId(id: string) { return this.events().find(e => e.id === id); }

  // ---------------------------------------------------------------------------
  // Escenarios y comité (administración de continuidad)
  // ---------------------------------------------------------------------------

  async saveScenario(s: CrisisScenario) {
    this.rs.ensure(['canManageContinuity'], 'administrar escenarios de crisis');
    if (!s.name.trim()) throw new Error('El escenario necesita un nombre.');
    if (this.scenarios().some(x => x.id !== s.id && x.code.toUpperCase() === s.code.toUpperCase())) throw new Error(`El código ${s.code} ya existe.`);
    const exists = this.scenarios().some(x => x.id === s.id);
    const clean: CrisisScenario = { ...s, initialActions: s.initialActions.map(a => a.trim()).filter(Boolean) };
    this.scenarios.update(list => (exists ? list.map(x => (x.id === s.id ? clean : x)) : [...list, clean]));
    await this.log(clean.code, `${exists ? 'Actualización' : 'Alta'} del escenario de crisis ${clean.code} "${clean.name}".`);
  }

  async saveCommittee(c: CrisisCommittee) {
    this.rs.ensure(['canManageContinuity'], 'definir el Comité de Crisis');
    this.committeeRaw.set(normalizeCommittee(c));
    await this.log('COMITÉ', `Comité de Crisis actualizado: ${c.members.length} integrante(s).`);
  }

  newScenario(): CrisisScenario {
    const max = this.scenarios().reduce((m, s) => Math.max(m, Number(s.code.replace(/\D/g, '')) || 0), 0);
    return {
      id: this.id('esc'), code: `ESC-${String(max + 1).padStart(2, '0')}`, name: '', category: 'Otro', description: '', likelihood: 2, impact: 3,
      activationCriteria: '', initialActions: [], communications: '', affectedProcessIds: [], planIds: [], owner: this.me().name,
      lastReviewDate: todayIso(), active: true,
    };
  }

  // ---------------------------------------------------------------------------
  // Crisis y simulacros
  // ---------------------------------------------------------------------------

  /** Valida y aplica el cambio (las mismas reglas que el servidor). */
  private commit(prev: CrisisEvent | null, next: CrisisEvent) {
    const err = checkCrisisChange(prev, next, this.me(), this.committee());
    if (err) throw new Error(err);
    this.events.update(list => (prev ? list.map(e => (e.id === next.id ? next : e)) : [...list, next]));
  }

  private entry(kind: CrisisLogKind, text: string) {
    return { id: this.id('log'), at: new Date().toISOString(), by: this.me().name, kind, text };
  }

  async declare(input: DeclareInput): Promise<CrisisEvent> {
    const now = new Date().toISOString();
    const scenario = this.scenarioById(input.scenarioId);
    const e: CrisisEvent = {
      id: this.id('cri'), code: nextCrisisCode(this.events(), new Date().getFullYear()), title: input.title.trim(), mode: input.mode, level: input.level,
      status: 'Activa', scenarioId: input.scenarioId, flawId: input.flawId, declaredAt: now, declaredBy: this.me().name,
      affectedProcessIds: input.affectedProcessIds, activatedPlanIds: input.activatedPlanIds,
      log: [
        this.entry('Estado', `${input.mode === 'Simulacro' ? 'Simulacro iniciado' : 'Crisis declarada'} (nivel ${input.level} · ${levelName(input.level)}).`),
        ...(input.situation.trim() ? [this.entry('Situación', input.situation.trim())] : []),
      ],
      tasks: tasksFromScenario(scenario, () => this.id('tsk')), communications: [], createdBy: this.me().name, createdAt: now,
    };
    this.commit(null, e);
    await this.log(e.code, `${e.mode === 'Simulacro' ? 'Simulacro iniciado' : 'Crisis declarada'} ${e.code} "${e.title}" (nivel ${e.level} · ${levelName(e.level)}).`);
    return e;
  }

  async scheduleDrill(input: { title: string; scenarioId?: string; plannedDate: string; level: CrisisLevel; affectedProcessIds: string[]; activatedPlanIds: string[] }) {
    if (!input.plannedDate) throw new Error('Indica la fecha del simulacro.');
    const e: CrisisEvent = {
      id: this.id('cri'), code: nextCrisisCode(this.events(), Number(input.plannedDate.slice(0, 4))), title: input.title.trim(), mode: 'Simulacro',
      level: input.level, status: 'Programada', scenarioId: input.scenarioId, plannedDate: input.plannedDate,
      affectedProcessIds: input.affectedProcessIds, activatedPlanIds: input.activatedPlanIds, log: [], tasks: [], communications: [],
      createdBy: this.me().name, createdAt: new Date().toISOString(),
    };
    this.commit(null, e);
    await this.log(e.code, `Simulacro ${e.code} programado para el ${e.plannedDate}: "${e.title}".`);
    return e;
  }

  async startDrill(id: string) {
    const prev = this.byId(id);
    if (!prev) return;
    const next: CrisisEvent = {
      ...prev, status: 'Activa', declaredAt: new Date().toISOString(), declaredBy: this.me().name,
      tasks: prev.tasks.length ? prev.tasks : tasksFromScenario(this.scenarioById(prev.scenarioId), () => this.id('tsk')),
      log: [...prev.log, this.entry('Estado', `Simulacro iniciado (nivel ${prev.level} · ${levelName(prev.level)}).`)],
    };
    this.commit(prev, next);
    await this.log(next.code, `Simulacro iniciado ${next.code} "${next.title}".`);
  }

  async cancelDrill(id: string, reason: string) {
    const prev = this.byId(id);
    if (!prev) return;
    this.commit(prev, { ...prev, status: 'Cancelada', closingSummary: reason.trim() || 'Cancelado.' });
    await this.log(prev.code, `Simulacro ${prev.code} cancelado.${reason.trim() ? ` ${reason.trim()}` : ''}`);
  }

  async addLog(id: string, kind: CrisisLogKind, text: string) {
    const prev = this.byId(id);
    if (!prev || !text.trim()) return;
    this.commit(prev, { ...prev, log: [...prev.log, this.entry(kind, text.trim())] });
  }

  async addCommunication(id: string, audience: CrisisAudience, channel: string, summary: string) {
    const prev = this.byId(id);
    if (!prev || !summary.trim()) return;
    const c = { id: this.id('com'), at: new Date().toISOString(), by: this.me().name, audience, channel: channel.trim(), summary: summary.trim() };
    this.commit(prev, { ...prev, communications: [...prev.communications, c] });
  }

  async addTask(id: string, text: string, owner: string) {
    const prev = this.byId(id);
    if (!prev || !text.trim()) return;
    this.commit(prev, { ...prev, tasks: [...prev.tasks, { id: this.id('tsk'), text: text.trim(), owner: owner.trim(), done: false }] });
  }

  async toggleTask(id: string, taskId: string) {
    const prev = this.byId(id);
    if (!prev) return;
    const t = prev.tasks.find(x => x.id === taskId);
    if (!t) return;
    const done = !t.done;
    this.commit(prev, {
      ...prev,
      tasks: prev.tasks.map(x => (x.id === taskId ? { ...x, done, doneAt: done ? new Date().toISOString() : undefined, doneBy: done ? this.me().name : undefined } : x)),
      log: done ? [...prev.log, this.entry('Acción', `Tarea cumplida: ${t.text}`)] : prev.log,
    });
  }

  async setLevel(id: string, level: CrisisLevel) {
    const prev = this.byId(id);
    if (!prev || prev.level === level) return;
    this.commit(prev, { ...prev, level, log: [...prev.log, this.entry('Estado', `Nivel ${prev.level} → ${level} (${levelName(level)}).`)] });
  }

  async stabilize(id: string, note: string) {
    const prev = this.byId(id);
    if (!prev) return;
    this.commit(prev, { ...prev, status: 'Estabilizada', stabilizedAt: new Date().toISOString(), log: [...prev.log, this.entry('Estado', `Estabilizada.${note.trim() ? ` ${note.trim()}` : ''}`)] });
    await this.log(prev.code, `${prev.code} estabilizada.`);
  }

  async reactivate(id: string, note: string) {
    const prev = this.byId(id);
    if (!prev) return;
    this.commit(prev, { ...prev, status: 'Activa', log: [...prev.log, this.entry('Estado', `Se reactiva.${note.trim() ? ` ${note.trim()}` : ''}`)] });
  }

  async close(id: string, summary: string, lessons: string) {
    const prev = this.byId(id);
    if (!prev) return;
    const now = new Date().toISOString();
    this.commit(prev, {
      ...prev, status: 'Cerrada', closedAt: now, closedBy: this.me().name, closingSummary: summary.trim(), lessons: lessons.trim() || prev.lessons,
      log: [...prev.log, this.entry('Estado', `${prev.mode === 'Simulacro' ? 'Simulacro' : 'Crisis'} cerrada.`)],
    });
    await this.log(prev.code, `${prev.mode === 'Simulacro' ? 'Simulacro' : 'Crisis'} ${prev.code} cerrada: ${summary.trim()}`);
  }

  async saveLessons(id: string, lessons: string) {
    const prev = this.byId(id);
    if (!prev) return;
    this.commit(prev, { ...prev, lessons: lessons.trim() });
  }

  /** Un simulacro cerrado se registra como prueba de continuidad del primer plan activado. */
  async registerAsTest(id: string, result: ContinuityTest['result'], achievedRtoHours?: number) {
    const prev = this.byId(id);
    if (!prev || prev.mode !== 'Simulacro' || prev.status !== 'Cerrada' || prev.testId) return;
    this.rs.ensure(['canManageContinuity'], 'registrar pruebas de continuidad');
    const planId = prev.activatedPlanIds[0];
    if (!planId) throw new Error('El simulacro no tiene planes activados.');
    const scenario = this.scenarioById(prev.scenarioId);
    const test: ContinuityTest = {
      id: this.id('tst'), planId, date: (prev.declaredAt ?? prev.createdAt).slice(0, 10), type: 'Simulacro',
      scenario: `${prev.code} · ${scenario?.name ?? prev.title}`, processId: prev.affectedProcessIds[0], achievedRtoHours, result,
      findings: prev.closingSummary ?? '', actions: prev.lessons ?? '',
      ran209: { scenario: scenario?.category, siteUnavailability: scenario?.category === 'Imposibilidad de acceder a instalaciones físicas', priorRiskAnalysis: true },
    };
    await this.res.registerTest(test);
    this.commit(prev, { ...prev, testId: test.id });
  }

  private async log(code: string, details: string) {
    await this.rs.appendAuditLog('GESTIÓN_CRISIS', 'Continuidad', code, details);
  }
}
