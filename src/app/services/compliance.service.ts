import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { ResilienceService } from './resilience.service';
import { SecurityService } from './security.service';
import { RAN_REQUIREMENTS } from '../data/compliance-seed';
import {
  CLOUD_DUE_DILIGENCE, ComplianceAutoResult, ComplianceRequirement, MIN_SCENARIOS, RAN_CHAPTERS, RanChapter,
} from '../models/compliance.model';
import { ServiceProvider } from '../models/resilience.model';

const DAY = 86_400_000;

/**
 * Cumplimiento de las RAN 20-7, 20-8, 20-9 y 20-10: matriz de requisitos, verificaciones
 * automáticas con los datos de los módulos y vencimiento de las revisiones periódicas.
 */
@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private readonly rs = inject(RiskDataService);
  private readonly res = inject(ResilienceService);
  private readonly sec = inject(SecurityService);

  readonly requirements = signal<ComplianceRequirement[]>(structuredClone(RAN_REQUIREMENTS));

  /** Orden de la norma (el de la matriz base); los requisitos agregados después van al final. */
  private readonly order = new Map(RAN_REQUIREMENTS.map((r, i) => [r.id, i]));
  readonly sorted = computed(() => [...this.requirements()].sort((a, b) =>
    (this.order.get(a.id) ?? 9999) - (this.order.get(b.id) ?? 9999) || a.numeral.localeCompare(b.numeral)));
  readonly chapters = RAN_CHAPTERS;

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private within(date: string | undefined, days: number): boolean {
    return !!date && date >= new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  }

  /** Fecha en que vence la próxima revisión según la frecuencia (null si no aplica). */
  nextReview(r: ComplianceRequirement): string | null {
    if (!r.lastReviewDate) return null;
    const months = r.frequency === 'Anual' ? 12 : r.frequency === 'Semestral' ? 6 : r.frequency === 'Permanente' ? 12 : null;
    if (!months) return null;
    const d = new Date(r.lastReviewDate + 'T00:00:00');
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }

  isReviewOverdue(r: ComplianceRequirement): boolean {
    const next = this.nextReview(r);
    return !!next && next < this.today();
  }

  // ---------------------------------------------------------------------------
  // Verificaciones automáticas
  // ---------------------------------------------------------------------------

  private activeProviders(): ServiceProvider[] {
    return this.res.providers().filter(p => p.status !== 'En término');
  }

  private criticalProviders(): ServiceProvider[] {
    return this.activeProviders().filter(p => p.criticality === 'Crítico' || (p.ran207?.significance.length ?? 0) > 0);
  }

  private ratio(ok: number, total: number, label: string): ComplianceAutoResult {
    if (total === 0) return { text: `Sin ${label} que evaluar.`, suggested: 'No aplica' };
    return {
      text: `${ok} de ${total} ${label}.`,
      suggested: ok === total ? 'Cumple' : ok === 0 ? 'No cumple' : 'Cumple parcialmente',
    };
  }

  /** Evidencia calculada con los datos del sistema (null si el requisito se evalúa solo manualmente). */
  autoCheck(key: string | undefined): ComplianceAutoResult | null {
    if (!key) return null;
    const providers = this.activeProviders();
    const critical = this.criticalProviders();
    const bia = this.res.biaProcesses();
    const criticalBia = bia.filter(b => ['Crítico', 'Alto'].includes(this.res.biaCriticality(b)));
    const plans = this.res.plans();
    const tests = this.res.tests();
    const reportable = this.rs.flaws().filter(f => f.regulatoryReport?.reportableToCMF);
    const cyber = this.rs.flaws().filter(f => f.cyber?.isCyber);
    const now = Date.now();

    switch (key) {
      // ----- RAN 20-7
      case 'p7.concentration': {
        const total = providers.reduce((s, p) => s + p.annualCostUSD, 0);
        const top = [...providers].sort((a, b) => b.annualCostUSD - a.annualCostUSD)[0];
        const share = total > 0 && top ? Math.round((top.annualCostUSD / total) * 100) : 0;
        const noExit = critical.filter(p => !p.hasExitPlan).length;
        return {
          text: `${critical.length} servicios críticos en ${providers.length} proveedores activos. Mayor concentración: ${top?.name ?? '—'} (${share}% del costo). Críticos sin plan de salida: ${noExit}.`,
          suggested: noExit > 0 ? 'Cumple parcialmente' : 'Cumple',
        };
      }
      case 'p7.significance':
        return this.ratio(providers.filter(p => !!p.ran207).length, providers.length, 'proveedores con antecedentes RAN 20-7 registrados (criterios de criticidad, sitios)');
      case 'p7.assessments': {
        const alerts = this.res.providerAlerts().filter(a => a.type === 'Sin evaluación' || a.type === 'Evaluación vencida');
        return { text: `${alerts.length} proveedores sin evaluación o con evaluación vencida.`, suggested: alerts.length === 0 ? 'Cumple' : 'Cumple parcialmente' };
      }
      case 'p7.register':
        return { text: `Catastro con ${providers.length} servicios activos (${critical.length} críticos o estratégicos), exportable desde Proveedores.`, suggested: providers.length ? 'Cumple' : 'No cumple' };
      case 'p7.providerAudit':
        return this.ratio(critical.filter(p => this.within(p.ran207?.lastAuditDate, 365)).length, critical.length, 'proveedores críticos con auditoría o revisión independiente en los últimos 12 meses');
      case 'p7.subcontractors': {
        const sub = providers.filter(p => p.usesSubcontractors);
        return this.ratio(sub.filter(p => (p.ran207?.subcontractors.length ?? 0) > 0 && p.ran207!.subcontractors.every(s => s.meetsConditions)).length, sub.length, 'proveedores que subcontratan con subcontratistas identificados y conformes');
      }
      case 'p7.sites':
        return this.ratio(critical.filter(p => !!p.ran207?.primarySite.trim()).length, critical.length, 'servicios críticos con sitio de procesamiento identificado');
      case 'p7.clauses':
        return this.ratio(critical.filter(p => this.res.missingClauses(p).length === 0).length, critical.length, 'contratos críticos con todas las cláusulas mínimas');
      case 'p7.providerContinuity':
        return this.ratio(critical.filter(p => this.within(p.ran207?.providerContinuityTestDate, 365)).length, critical.length, 'proveedores críticos con plan de continuidad probado en los últimos 12 meses');
      case 'p7.exit':
        return this.ratio(critical.filter(p => p.hasExitPlan).length, critical.length, 'servicios críticos con plan de salida');
      case 'p7.providerSecurity':
        return this.ratio(critical.filter(p => this.within(p.ran207?.providerSecurityTestDate, 365)).length, critical.length, 'proveedores críticos con pruebas de vulnerabilidades o penetración en los últimos 12 meses');
      case 'p7.countryRisk': {
        const risky = providers.filter(p => p.ran207 && !p.ran207.investmentGradeCountry);
        return this.ratio(risky.filter(p => !!p.ran207!.countryRiskAnalysis.trim()).length, risky.length, 'proveedores en países sin grado de inversión con análisis documentado');
      }
      case 'p7.regulatorAccess':
        return this.ratio(providers.filter(p => p.clauses['regulatorAccess']).length, providers.length, 'contratos con acceso de la CMF');
      case 'p7.abroad': {
        const abroad = critical.filter(p => p.dataLocation === 'Extranjero');
        const ok = abroad.filter(p => p.ran207 && (p.ran207.contingencyInChile || (!!p.ran207.boardWaiverDate && this.within(p.ran207.independentReportDate, 365))));
        return this.ratio(ok.length, abroad.length, 'servicios críticos procesados en el exterior con sitio de contingencia en Chile o dispensa del Consejo con informe independiente vigente');
      }
      case 'p7.cloud': {
        const cloud = critical.filter(p => p.isCloud);
        return this.ratio(cloud.filter(p => CLOUD_DUE_DILIGENCE.every(c => p.ran207?.cloudDueDiligence[c.key])).length, cloud.length, 'servicios críticos en la nube con debida diligencia reforzada completa (a–g)');
      }

      // ----- RAN 20-8
      case 'p8.reported': {
        const s = this.rs.regulatorySummary(now);
        return {
          text: `${reportable.length} incidentes reportables a la CMF · ${s.open} abiertos · ${s.overdue} hitos vencidos · ${s.onTimePct === null ? 'sin envíos' : s.onTimePct + '% de envíos a tiempo'}.`,
          suggested: s.overdue > 0 ? 'Cumple parcialmente' : reportable.length ? 'Cumple' : undefined,
        };
      }
      case 'p8.initial': {
        let ok = 0, total = 0;
        for (const f of reportable) {
          const r = f.regulatoryReport!;
          const m = this.rs.milestonesFor(r).find(x => x.id === 'cmf-aviso-inicial');
          if (!m) continue;
          const st = this.rs.milestoneStatus(r, m, now);
          if (st === 'Pendiente') continue;
          total++;
          if (st === 'Enviado a tiempo') ok++;
        }
        return this.ratio(ok, total, 'reportes iniciales enviados dentro de 30 minutos');
      }
      case 'p8.closing': {
        const closed = reportable.filter(f => f.regulatoryReport!.status === 'Cerrado');
        return this.ratio(closed.filter(f => f.regulatoryReport!.submissions.some(s => s.milestoneId === 'cmf-reporte-cierre')).length, closed.length, 'incidentes cerrados con reporte de cierre enviado');
      }
      case 'p8.clientNotice': {
        const affecting = reportable.filter(f => {
          const d = f.regulatoryReport!.details;
          return (d?.estimatedAffectedMembers ?? 0) > 0 || (d?.customerType && d.customerType !== 'N/A');
        });
        return this.ratio(affecting.filter(f => !!f.regulatoryReport!.details?.memberNoticeAt).length, affecting.length, 'incidentes con socios afectados que registran comunicación a los socios');
      }
      case 'p8.industryAlert':
        return this.ratio(cyber.filter(f => !!f.cyber!.industryAlertAt).length, cyber.length, 'incidentes de ciberseguridad con alerta enviada a la industria');
      case 'p8.providerIncidents': {
        const prov = reportable.filter(f => !!f.providerId);
        return { text: `${prov.length} incidentes reportables asociados a proveedores (siguen el flujo de la RAN 20-8).`, suggested: 'Cumple' };
      }

      // ----- RAN 20-9
      case 'p9.crisisPlan': {
        const ok = plans.some(p => p.type === 'Gestión de Crisis' && p.status === 'Vigente');
        return { text: ok ? 'Existe un plan de gestión de crisis vigente.' : 'No hay un plan de gestión de crisis vigente.', suggested: ok ? 'Cumple' : 'No cumple' };
      }
      case 'p9.commsPlan': {
        const ok = plans.some(p => p.type === 'Comunicaciones de Crisis' && p.status === 'Vigente');
        return { text: ok ? 'Existe un plan de comunicaciones de crisis vigente.' : 'No hay un plan de comunicaciones de crisis vigente.', suggested: ok ? 'Cumple' : 'No cumple' };
      }
      case 'p9.bia':
        return this.ratio(criticalBia.filter(b => this.within(b.lastReviewDate, 365)).length, criticalBia.length, 'procesos críticos o altos con BIA revisado en los últimos 12 meses');
      case 'p9.rtoApproved':
        return this.ratio(criticalBia.filter(b => this.within(b.ran209?.rtoApprovedDate, 365)).length, criticalBia.length, 'procesos críticos o altos con RTO aprobado por el Consejo en los últimos 12 meses');
      case 'p9.ria':
        return this.ratio(criticalBia.filter(b => this.within(b.ran209?.riaDate, 365)).length, criticalBia.length, 'procesos críticos o altos con análisis de riesgos (RIA) en los últimos 12 meses');
      case 'p9.scenarios': {
        const covered = MIN_SCENARIOS.filter(s => plans.some(p => p.status === 'Vigente' && p.ran209?.scenarios.includes(s)));
        const missing = MIN_SCENARIOS.filter(s => !covered.includes(s));
        return {
          text: `${covered.length} de 5 escenarios mínimos cubiertos por planes vigentes.${missing.length ? ` Faltan: ${missing.join('; ')}.` : ''}`,
          suggested: missing.length === 0 ? 'Cumple' : covered.length ? 'Cumple parcialmente' : 'No cumple',
        };
      }
      case 'p9.plans': {
        const today = this.today();
        const vigentes = plans.filter(p => p.status === 'Vigente');
        const ok = vigentes.filter(p => p.nextReviewDate >= today && p.ran209?.returnToNormal);
        return this.ratio(ok.length, vigentes.length, 'planes vigentes al día y con procedimiento de retorno a la normalidad');
      }
      case 'p9.testsScenarios': {
        const tested = MIN_SCENARIOS.filter(s => tests.some(t => t.ran209?.scenario === s && this.within(t.date, 365)));
        const missing = MIN_SCENARIOS.filter(s => !tested.includes(s));
        return {
          text: `${tested.length} de 5 escenarios probados en los últimos 12 meses.${missing.length ? ` Sin prueba: ${missing.join('; ')}.` : ''}`,
          suggested: missing.length === 0 ? 'Cumple' : tested.length ? 'Cumple parcialmente' : 'No cumple',
        };
      }
      case 'p9.siteTest': {
        const t = tests.filter(x => x.ran209?.siteUnavailability && this.within(x.date, 365)).sort((a, b) => b.date.localeCompare(a.date))[0];
        return t
          ? { text: `Última simulación de indisponibilidad de sitio: ${t.date} (${t.ran209?.processingMode ?? 'modalidad no indicada'}, ${t.result}).`, suggested: t.ran209?.processingMode === 'Online y batch' && t.ran209.priorRiskAnalysis ? 'Cumple' : 'Cumple parcialmente' }
          : { text: 'Sin simulación de indisponibilidad del sitio de procesamiento en los últimos 12 meses.', suggested: 'No cumple' };
      }
      case 'p9.incidents':
        return { text: `${this.rs.flaws().length} incidentes registrados en el módulo de Incidentes y Pérdidas.`, suggested: 'Cumple' };

      // ----- RAN 20-10
      case 'p10.riskProcess': {
        const assets = this.sec.assets();
        return this.ratio(assets.filter(a => this.within(a.lastReviewDate, 365)).length, assets.length, 'activos de información revisados en los últimos 12 meses');
      }
      case 'p10.assets': {
        const assets = this.sec.assets();
        const crit = assets.filter(a => ['Crítico', 'Alto'].includes(this.sec.assetCriticality(a))).length;
        return { text: `${assets.length} activos inventariados con valoración de confidencialidad, integridad y disponibilidad (${crit} críticos).`, suggested: assets.length ? 'Cumple' : 'No cumple' };
      }
      case 'p10.vulns': {
        const open = this.sec.vulnerabilities().filter(v => v.status === 'Abierta' || v.status === 'En remediación');
        const overdue = open.filter(v => this.sec.isVulnOverdue(v)).length;
        return { text: `${open.length} vulnerabilidades abiertas · ${overdue} fuera de plazo.`, suggested: overdue === 0 ? 'Cumple' : 'Cumple parcialmente' };
      }
      case 'p10.pentest': {
        const t = this.sec.lastTest('Prueba de penetración', 'Hacking ético');
        if (!t || !this.within(t.date, 365)) return { text: 'Sin prueba de penetración o hacking ético en los últimos 12 meses.', suggested: 'No cumple' };
        const reported = this.sec.securityTests().some(x => this.within(x.reportedToBoardDate, 183));
        return { text: `Última prueba: ${t.type} del ${t.date} (${t.result}). ${reported ? 'Resultados informados al Consejo en los últimos 6 meses.' : 'Sin informe al Consejo en los últimos 6 meses.'}`, suggested: reported ? 'Cumple' : 'Cumple parcialmente' };
      }
      case 'p10.restoreTest': {
        const t = this.sec.lastTest('Prueba de restauración de respaldos');
        return t && this.within(t.date, 365)
          ? { text: `Última prueba de restauración: ${t.date} (${t.result}).`, suggested: t.result === 'Insatisfactoria' ? 'Cumple parcialmente' : 'Cumple' }
          : { text: 'Sin prueba de restauración de respaldos en los últimos 12 meses.', suggested: 'No cumple' };
      }
      case 'p10.responseTest': {
        const t = this.sec.lastTest('Prueba del plan de respuesta a incidentes', 'Ejercicio de gestión de crisis');
        return t && this.within(t.date, 365)
          ? { text: `Última prueba del plan de respuesta: ${t.date} (${t.result}).`, suggested: 'Cumple' }
          : { text: `Sin prueba del plan de respuesta a incidentes en los últimos 12 meses${t ? ` (última: ${t.date})` : ''}.`, suggested: 'No cumple' };
      }
      case 'p10.forensic': {
        const req = cyber.filter(f => f.cyber!.forensicRequired);
        return this.ratio(req.filter(f => !!f.cyber!.forensicDate).length, req.length, 'ciberincidentes relevantes con análisis forense registrado');
      }
      case 'p10.cyberDb':
        return cyber.length
          ? this.ratio(cyber.filter(f => !!f.cyber!.lessonsLearned.trim()).length, cyber.length, 'incidentes de ciberseguridad con lecciones aprendidas')
          : { text: 'La base de incidentes está habilitada (marque los incidentes de ciberseguridad); aún no hay registros.', suggested: 'Cumple' };
      case 'p10.selfAssessment': {
        const items = this.sec.assessment().filter(i => i.status !== 'No aplica');
        return this.ratio(items.filter(i => this.within(i.assessedDate, 365)).length, items.length, 'requisitos de la autoevaluación de seguridad evaluados en los últimos 12 meses');
      }
      case 'p10.criticalInfra': {
        const n = this.sec.assets().filter(a => a.criticalInfrastructure).length;
        return { text: n ? `${n} activos identificados como infraestructura crítica.` : 'No hay activos marcados como infraestructura crítica.', suggested: n ? 'Cumple' : 'No cumple' };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Resúmenes
  // ---------------------------------------------------------------------------

  private score(items: ComplianceRequirement[]) {
    const rated = items.filter(i => i.status !== 'Sin evaluar' && i.status !== 'No aplica');
    const pts = rated.reduce((s, i) => s + (i.status === 'Cumple' ? 1 : i.status === 'Cumple parcialmente' ? 0.5 : 0), 0);
    return { pct: rated.length ? Math.round((pts / rated.length) * 100) : null, rated: rated.length };
  }

  readonly byChapter = computed(() => this.chapters.map(ch => {
    const items = this.sorted().filter(r => r.chapter === ch.id);
    const s = this.score(items);
    return {
      ...ch, items, total: items.length, pct: s.pct, rated: s.rated,
      gaps: items.filter(i => i.status === 'No cumple' || i.status === 'Cumple parcialmente').length,
      unevaluated: items.filter(i => i.status === 'Sin evaluar').length,
      overdue: items.filter(i => this.isReviewOverdue(i)).length,
    };
  }));

  readonly summary = computed(() => {
    const all = this.requirements();
    const s = this.score(all);
    return {
      total: all.length, pct: s.pct, rated: s.rated,
      gaps: all.filter(i => i.status === 'No cumple' || i.status === 'Cumple parcialmente').length,
      unevaluated: all.filter(i => i.status === 'Sin evaluar').length,
      overdue: all.filter(i => this.isReviewOverdue(i)).length,
    };
  });

  // ---------------------------------------------------------------------------
  // Evaluación
  // ---------------------------------------------------------------------------

  async evaluate(item: ComplianceRequirement) {
    this.rs.ensure(['canManageRegulatoryReports'], 'evaluar el cumplimiento normativo');
    const updated: ComplianceRequirement = { ...item, lastReviewDate: this.today(), reviewedBy: this.rs.currentProfile().name };
    this.requirements.update(list => list.map(x => (x.id === item.id ? updated : x)));
    await this.rs.appendAuditLog('EVALUACIÓN_CUMPLIMIENTO', 'Reporte Regulatorio', `RAN ${item.chapter} ${item.numeral}`,
      `Cumplimiento RAN ${item.chapter} ${item.numeral} "${item.title}": ${item.status}.${item.actionPlan ? ` Plan: ${item.actionPlan}` : ''}`);
  }

  chapterTitle(id: RanChapter): string {
    return this.chapters.find(c => c.id === id)?.title ?? id;
  }
}
