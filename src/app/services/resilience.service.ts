import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import {
  BiaProcess,
  CONTRACT_CLAUSES,
  ContinuityAlert,
  ContinuityPlan,
  ContinuityTest,
  ProviderAlert,
  ProviderCriticality,
  ServiceProvider,
} from '../models/resilience.model';
import { SEED_BIA, SEED_PLANS, SEED_PROVIDERS, SEED_TESTS } from '../data/resilience-seed';

/** Meses entre evaluaciones según criticidad del proveedor. */
/** Valores por defecto; los vigentes están en Mantenedores → Parámetros generales. */
export const ASSESSMENT_FREQUENCY_MONTHS: Record<ProviderCriticality, number> = {
  'Crítico': 12,
  'Alto': 12,
  'Medio': 24,
  'Bajo': 36,
};

/** Días de anticipación para alertar el vencimiento de un contrato. */
export const CONTRACT_EXPIRY_WARNING_DAYS = 90;

const DAY = 86_400_000;

function addMonths(date: string, months: number): Date {
  const d = new Date(date + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

/**
 * Gestión de terceros (externalización de servicios) y continuidad del negocio
 * (BIA, planes y pruebas). Las acciones quedan en la bitácora inalterable.
 */
@Injectable({ providedIn: 'root' })
export class ResilienceService {
  private readonly rs = inject(RiskDataService);

  readonly providers = signal<ServiceProvider[]>(SEED_PROVIDERS.map(p => ({ ...p, clauses: { ...p.clauses } })));
  readonly biaProcesses = signal<BiaProcess[]>(SEED_BIA.map(b => ({ ...b, impact: { ...b.impact } })));
  readonly plans = signal<ContinuityPlan[]>(SEED_PLANS.map(p => ({ ...p })));
  readonly tests = signal<ContinuityTest[]>(SEED_TESTS.map(t => ({ ...t })));

  /** Fecha de referencia para alertas (se puede fijar en pruebas). */
  readonly today = signal<Date>(new Date());

  // ---------------------------------------------------------------------------
  // Proveedores
  // ---------------------------------------------------------------------------

  providerById(id: string): ServiceProvider | undefined {
    return this.providers().find(p => p.id === id);
  }

  missingClauses(p: ServiceProvider): string[] {
    return CONTRACT_CLAUSES.filter(c => !p.clauses[c.key]).map(c => c.label);
  }

  nextAssessmentDue(p: ServiceProvider): Date | null {
    return p.lastAssessmentDate ? addMonths(p.lastAssessmentDate, this.rs.catalog.params().providerAssessmentMonths[p.criticality]) : null;
  }

  daysToContractEnd(p: ServiceProvider): number {
    return daysBetween(this.today(), new Date(p.contractEnd + 'T00:00:00'));
  }

  /** Procesos del BIA que dependen del proveedor. */
  dependentProcesses(providerId: string): BiaProcess[] {
    return this.biaProcesses().filter(b => b.providerIds.includes(providerId));
  }

  /** Incidentes registrados que involucran al proveedor. */
  providerIncidents(providerId: string) {
    return this.rs.flaws().filter(f => f.providerId === providerId);
  }

  readonly providerAlerts = computed<ProviderAlert[]>(() => {
    const alerts: ProviderAlert[] = [];
    const today = this.today();
    for (const p of this.providers()) {
      const days = this.daysToContractEnd(p);
      if (days < 0) {
        if (p.status !== 'En término') {
          alerts.push({ providerId: p.id, type: 'Contrato vencido', severity: 'Alta', detail: `Contrato vencido hace ${-days} días.` });
        }
      } else if (days <= this.rs.catalog.params().contractExpiryWarningDays) {
        alerts.push({ providerId: p.id, type: 'Contrato por vencer', severity: days <= 30 ? 'Alta' : 'Media', detail: `Contrato vence en ${days} días (${p.contractEnd}).` });
      }
      if (p.status === 'En término') continue;

      const due = this.nextAssessmentDue(p);
      if (!due) {
        alerts.push({ providerId: p.id, type: 'Sin evaluación', severity: p.criticality === 'Crítico' || p.criticality === 'Alto' ? 'Alta' : 'Media', detail: 'No registra evaluación de riesgo del proveedor.' });
      } else if (due < today) {
        alerts.push({ providerId: p.id, type: 'Evaluación vencida', severity: p.criticality === 'Crítico' ? 'Alta' : 'Media', detail: `Evaluación debía renovarse el ${due.toISOString().slice(0, 10)}.` });
      }
      if (!p.hasExitPlan && (p.criticality === 'Crítico' || p.criticality === 'Alto')) {
        alerts.push({ providerId: p.id, type: 'Sin plan de salida', severity: 'Alta', detail: `Proveedor ${p.criticality.toLowerCase()} sin plan de salida documentado.` });
      }
      const missing = this.missingClauses(p);
      if (missing.length > 0) {
        alerts.push({ providerId: p.id, type: 'Cláusulas faltantes', severity: missing.some(m => m.includes('regulador')) ? 'Alta' : 'Media', detail: `Falta: ${missing.join('; ')}.` });
      }
      if (p.dataLocation === 'Extranjero' && p.handlesMemberData) {
        alerts.push({ providerId: p.id, type: 'Datos en el extranjero', severity: 'Media', detail: `Procesa datos de socios en ${p.dataCountry || 'el extranjero'}: requiere evaluación reforzada.` });
      }
      for (const b of this.dependentProcesses(p.id)) {
        if (p.committedRtoHours !== undefined && p.committedRtoHours > b.rtoHours) {
          alerts.push({ providerId: p.id, type: 'RTO insuficiente', severity: 'Alta', detail: `RTO comprometido ${p.committedRtoHours} h > RTO requerido ${b.rtoHours} h por "${b.name}".` });
        }
      }
    }
    const order = { Alta: 0, Media: 1, Baja: 2 };
    return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  });

  readonly providerKpis = computed(() => {
    const list = this.providers().filter(p => p.status !== 'En término');
    const alerts = this.providerAlerts();
    return {
      active: list.length,
      critical: list.filter(p => p.criticality === 'Crítico').length,
      cloud: list.filter(p => p.isCloud).length,
      abroad: list.filter(p => p.dataLocation === 'Extranjero').length,
      highAlerts: alerts.filter(a => a.severity === 'Alta').length,
      annualCostUSD: list.reduce((s, p) => s + p.annualCostUSD, 0),
    };
  });

  async saveProvider(data: ServiceProvider) {
    const exists = this.providers().some(p => p.id === data.id);
    if (exists) {
      this.providers.update(list => list.map(p => (p.id === data.id ? { ...data } : p)));
    } else {
      this.providers.update(list => [...list, { ...data }]);
    }
    await this.rs.appendAuditLog(
      exists ? 'MODIFICACIÓN_PROVEEDOR' : 'ALTA_PROVEEDOR',
      'Proveedor',
      data.code,
      `${exists ? 'Actualización' : 'Alta'} de proveedor "${data.name}" (${data.category}, criticidad ${data.criticality}).`
    );
  }

  async recordAssessment(providerId: string, score: number, date: string) {
    const p = this.providerById(providerId);
    if (!p) return;
    const s = Math.max(0, Math.min(100, Math.round(score)));
    this.providers.update(list => list.map(x => (x.id === providerId ? { ...x, assessmentScore: s, lastAssessmentDate: date } : x)));
    await this.rs.appendAuditLog('EVALUACIÓN_PROVEEDOR', 'Proveedor', p.code, `Evaluación de riesgo de "${p.name}": ${s}/100 (${date}).`);
  }

  nextProviderCode(): string {
    const max = this.providers().reduce((m, p) => Math.max(m, Number(p.code.replace(/\D/g, '')) || 0), 0);
    return `PRV-${String(max + 1).padStart(3, '0')}`;
  }

  // ---------------------------------------------------------------------------
  // Continuidad del negocio
  // ---------------------------------------------------------------------------

  /** Nivel de criticidad del proceso según el mayor impacto del BIA. */
  biaCriticality(b: BiaProcess): 'Crítico' | 'Alto' | 'Medio' | 'Bajo' {
    const max = Math.max(b.impact.financial, b.impact.members, b.impact.regulatory, b.impact.reputational);
    return max >= 4 ? 'Crítico' : max === 3 ? 'Alto' : max === 2 ? 'Medio' : 'Bajo';
  }

  plansForProcess(processId: string): ContinuityPlan[] {
    return this.plans().filter(p => p.processIds.includes(processId));
  }

  testsForPlan(planId: string): ContinuityTest[] {
    return this.tests().filter(t => t.planId === planId).sort((a, b) => b.date.localeCompare(a.date));
  }

  lastTest(planId: string): ContinuityTest | undefined {
    return this.testsForPlan(planId)[0];
  }

  readonly continuityAlerts = computed<ContinuityAlert[]>(() => {
    const alerts: ContinuityAlert[] = [];
    const today = this.today();
    for (const b of this.biaProcesses()) {
      if (b.rtoHours > b.mtpdHours) {
        alerts.push({ refId: b.id, type: 'RTO mayor que MTPD', severity: 'Alta', detail: `"${b.name}": RTO ${b.rtoHours} h supera el MTPD de ${b.mtpdHours} h.` });
      }
      if (this.plansForProcess(b.id).length === 0) {
        alerts.push({ refId: b.id, type: 'Proceso sin plan', severity: this.biaCriticality(b) === 'Crítico' || this.biaCriticality(b) === 'Alto' ? 'Alta' : 'Media', detail: `"${b.name}" no está cubierto por ningún plan.` });
      }
      if (addMonths(b.lastReviewDate, 12) < today) {
        alerts.push({ refId: b.id, type: 'BIA desactualizado', severity: 'Media', detail: `BIA de "${b.name}" sin revisión desde ${b.lastReviewDate}.` });
      }
      for (const pid of b.providerIds) {
        const p = this.providerById(pid);
        if (p?.committedRtoHours !== undefined && p.committedRtoHours > b.rtoHours) {
          alerts.push({ refId: b.id, type: 'Proveedor no cubre RTO', severity: 'Alta', detail: `"${b.name}" requiere RTO ${b.rtoHours} h, pero ${p.name} compromete ${p.committedRtoHours} h.` });
        }
      }
    }
    for (const plan of this.plans()) {
      if (new Date(plan.nextReviewDate + 'T00:00:00') < today) {
        alerts.push({ refId: plan.id, type: 'Plan con revisión vencida', severity: 'Alta', detail: `${plan.code} debía revisarse el ${plan.nextReviewDate}.` });
      }
      const last = this.lastTest(plan.id);
      if (!last || addMonths(last.date, 12) < today) {
        alerts.push({ refId: plan.id, type: 'Plan sin prueba en 12 meses', severity: 'Media', detail: `${plan.code} ${last ? `se probó por última vez el ${last.date}` : 'no registra pruebas'}.` });
      }
    }
    for (const t of this.tests()) {
      const proc = t.processId ? this.biaProcesses().find(b => b.id === t.processId) : undefined;
      if (proc && t.achievedRtoHours !== undefined && t.achievedRtoHours > proc.rtoHours) {
        const plan = this.plans().find(p => p.id === t.planId);
        alerts.push({ refId: t.id, type: 'RTO no logrado en prueba', severity: 'Alta', detail: `Prueba ${t.date} (${plan?.code}): "${proc.name}" se recuperó en ${t.achievedRtoHours} h vs RTO ${proc.rtoHours} h.` });
      }
    }
    const order = { Alta: 0, Media: 1, Baja: 2 };
    return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  });

  readonly continuityKpis = computed(() => {
    const procs = this.biaProcesses();
    const covered = procs.filter(b => this.plansForProcess(b.id).length > 0).length;
    const yearAgo = new Date(this.today().getTime() - 365 * DAY).toISOString().slice(0, 10);
    const tested = this.plans().filter(p => this.testsForPlan(p.id).some(t => t.date >= yearAgo)).length;
    return {
      processes: procs.length,
      critical: procs.filter(b => this.biaCriticality(b) === 'Crítico').length,
      coveragePct: procs.length ? Math.round((covered / procs.length) * 100) : 0,
      plans: this.plans().length,
      testedPct: this.plans().length ? Math.round((tested / this.plans().length) * 100) : 0,
      highAlerts: this.continuityAlerts().filter(a => a.severity === 'Alta').length,
    };
  });

  async saveBiaProcess(data: BiaProcess) {
    if (data.rtoHours > data.mtpdHours) throw new Error('El RTO no puede superar el MTPD.');
    const exists = this.biaProcesses().some(b => b.id === data.id);
    this.biaProcesses.update(list => (exists ? list.map(b => (b.id === data.id ? { ...data } : b)) : [...list, { ...data }]));
    await this.rs.appendAuditLog('ACTUALIZACIÓN_BIA', 'Continuidad', data.id,
      `${exists ? 'Actualización' : 'Alta'} de BIA "${data.name}": MTPD ${data.mtpdHours} h, RTO ${data.rtoHours} h, RPO ${data.rpoHours} h.`);
  }

  async savePlan(data: ContinuityPlan) {
    const exists = this.plans().some(p => p.id === data.id);
    this.plans.update(list => (exists ? list.map(p => (p.id === data.id ? { ...data } : p)) : [...list, { ...data }]));
    await this.rs.appendAuditLog(exists ? 'MODIFICACIÓN_PLAN_CONTINUIDAD' : 'ALTA_PLAN_CONTINUIDAD', 'Continuidad', data.code,
      `${exists ? 'Actualización' : 'Alta'} del plan ${data.code} "${data.name}" v${data.version} (${data.status}).`);
  }

  async registerTest(data: ContinuityTest) {
    this.tests.update(list => [...list, { ...data }]);
    const plan = this.plans().find(p => p.id === data.planId);
    await this.rs.appendAuditLog('PRUEBA_CONTINUIDAD', 'Continuidad', plan?.code || data.planId,
      `Prueba "${data.type}" del ${data.date}: ${data.result}.${data.achievedRtoHours !== undefined ? ` RTO logrado ${data.achievedRtoHours} h.` : ''}`);
  }

  newId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}`;
  }
}
