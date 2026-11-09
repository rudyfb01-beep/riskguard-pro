import { CrisisService } from './crisis.service';
import { committeeGaps } from '../utils/crisis';
import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { DocumentService } from './document.service';
import { ResilienceService } from './resilience.service';
import { SecurityService } from './security.service';
import { BASE_NORMS, BASE_REQUIREMENTS } from '../data/compliance-seed';
import {
  CLOUD_DUE_DILIGENCE, ComplianceAutoResult, ComplianceNorm, ComplianceRequirement, ComplianceStatus, ControlCoverage,
  MIN_SCENARIOS, NormVersion,
} from '../models/compliance.model';
import { RegulatoryMilestoneTemplate } from '../models/risk.model';
import { ServiceProvider } from '../models/resilience.model';
import {
  ParsedRequirementRow, complianceScore, controlCoverage, isGap, needsVersionReview, normId, requirementId,
} from '../utils/compliance';

const DAY = 86_400_000;

/** Permisos que permiten mantener normas y evaluar requisitos (el segundo, por compatibilidad). */
export const COMPLIANCE_PERMS = ['canManageCompliance', 'canManageRegulatoryReports'] as const;

/**
 * Cumplimiento normativo multinorma: biblioteca de normas con versiones, requisitos por norma
 * vinculados a controles, verificaciones automáticas con los datos de los módulos, brechas y
 * vencimiento de las revisiones periódicas.
 */
@Injectable({ providedIn: 'root' })
export class ComplianceService {
  private readonly rs = inject(RiskDataService);
  private readonly docs = inject(DocumentService);
  private readonly res = inject(ResilienceService);
  private readonly sec = inject(SecurityService);
  private readonly crisis = inject(CrisisService);

  readonly norms = signal<ComplianceNorm[]>(structuredClone(BASE_NORMS));
  readonly requirements = signal<ComplianceRequirement[]>(structuredClone(BASE_REQUIREMENTS));

  /** Orden de la matriz base; los requisitos agregados después van al final, por numeral. */
  private readonly order = new Map(BASE_REQUIREMENTS.map((r, i) => [r.id, i]));
  readonly sorted = computed(() => [...this.requirements()].sort((a, b) =>
    (this.order.get(a.id) ?? 9999) - (this.order.get(b.id) ?? 9999)
    || a.numeral.localeCompare(b.numeral, 'es', { numeric: true }) || a.title.localeCompare(b.title, 'es')));
  readonly sortedNorms = computed(() => [...this.norms()].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code, 'es', { numeric: true })));
  private readonly normById = computed(() => new Map(this.norms().map(n => [n.id, n])));

  norm(id: string): ComplianceNorm | undefined {
    return this.normById().get(id);
  }

  normLabel(id: string): string {
    return this.norm(id)?.code ?? id;
  }

  canManage(): boolean {
    return this.rs.canAny(...COMPLIANCE_PERMS);
  }

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
        const gaps = committeeGaps(this.crisis.committee());
        const drills = this.crisis.coverage().filter(c => c.current).length;
        const parts = [
          ok ? 'Existe un plan de gestión de crisis vigente' : 'No hay un plan de gestión de crisis vigente',
          gaps.length ? `Comité de Crisis incompleto (${gaps.join(', ')})` : `Comité de Crisis definido (${this.crisis.committee().members.length} integrantes)`,
          `${drills} de ${this.crisis.coverage().length} escenarios ejercitados en los últimos 12 meses`,
        ];
        return { text: `${parts.join('. ')}.`, suggested: ok && !gaps.length ? 'Cumple' : ok || !gaps.length ? 'Cumple parcialmente' : 'No cumple' };
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

      // ----- Ley 21.719 (datos personales)
      case 'p21719.inventory': {
        const personal = this.sec.assets().filter(a => a.handlesPersonalData);
        if (!personal.length) return { text: 'Ningún activo de información está marcado con datos personales: revise el inventario.', suggested: 'No cumple' };
        return this.ratio(personal.filter(a => this.within(a.lastReviewDate, 365)).length, personal.length, 'activos con datos personales revisados en los últimos 12 meses');
      }
      case 'p21719.processors': {
        const member = providers.filter(p => p.handlesMemberData);
        return this.ratio(member.filter(p => p.clauses['confidentiality'] && p.clauses['secureDeletion']).length, member.length,
          'proveedores con datos de socios cuyo contrato incluye confidencialidad y eliminación segura al término');
      }
      case 'p21719.transfers': {
        const abroad = providers.filter(p => p.handlesMemberData && p.dataLocation === 'Extranjero');
        return this.ratio(abroad.filter(p => !!p.ran207?.cloudDueDiligence['legalReport']).length, abroad.length,
          'proveedores que tratan datos de socios en el extranjero con informe legal de privacidad de la jurisdicción');
      }

      // ----- Ley 21.663 (ciberseguridad, ANCI)
      case 'p21663.earlyAlert':
        return this.anciRatio(['anci-alerta-temprana'], 'alertas tempranas a la ANCI enviadas dentro de plazo');
      case 'p21663.followUp':
        return this.anciRatio(['anci-segundo-informe', 'anci-informe-final'], 'informes de seguimiento y finales a la ANCI enviados dentro de plazo');
      case 'p21663.dual': {
        const both = this.rs.flaws().filter(f => f.regulatoryReport?.reportableToCMF && f.regulatoryReport.reportableToANCI);
        const ok = both.filter(f => {
          const ids = new Set(f.regulatoryReport!.submissions.map(s => s.milestoneId));
          return ids.has('cmf-aviso-inicial') && ids.has('anci-alerta-temprana');
        });
        return this.ratio(ok.length, both.length, 'incidentes reportables a la CMF y a la ANCI con el primer aviso enviado a ambas');
      }
    }
    return null;
  }

  /** Envíos a la ANCI dentro de plazo, entre los hitos ya vencidos o enviados. */
  private anciRatio(milestoneIds: string[], label: string): ComplianceAutoResult {
    const now = Date.now();
    let ok = 0, total = 0;
    for (const f of this.rs.flaws()) {
      const r = f.regulatoryReport;
      if (!r?.reportableToANCI) continue;
      for (const m of this.rs.milestonesFor(r).filter((x: RegulatoryMilestoneTemplate) => milestoneIds.includes(x.id))) {
        const st = this.rs.milestoneStatus(r, m, now);
        if (st === 'Pendiente') continue;
        total++;
        if (st === 'Enviado a tiempo') ok++;
      }
    }
    return this.ratio(ok, total, label);
  }

  // ---------------------------------------------------------------------------
  // Cobertura por controles y revisión por cambio de versión
  // ---------------------------------------------------------------------------

  coverage(r: ComplianceRequirement): ControlCoverage | null {
    return controlCoverage(r.controlIds, this.rs.controls());
  }

  needsVersionReview(r: ComplianceRequirement): boolean {
    return needsVersionReview(r, this.norm(r.chapter));
  }

  /** Documentos (políticas, manuales) que respaldan el requisito y su estado. */
  documentCoverage(r: ComplianceRequirement): { text: string; suggested: ComplianceStatus } | null {
    const docs = this.docs.forRequirement(r.id);
    if (!docs.length) return null;
    const parts = docs.map(d => {
      const v = this.docs.current(d);
      const st = this.docs.status(d);
      const ack = v ? this.docs.acks(d) : null;
      return { d, v, st, text: `${d.code} ${v ? `v${v.version}` : 'sin versión aprobada'} (${st.toLowerCase()}${ack && ack.total ? `, lectura ${ack.pct} %` : ''})` };
    });
    const ok = parts.filter(p => p.st === 'Vigente');
    const suggested: ComplianceStatus = ok.length === parts.length ? 'Cumple' : parts.some(p => p.v) ? 'Cumple parcialmente' : 'No cumple';
    return { text: `Documentos: ${parts.map(p => p.text).join('; ')}.`, suggested };
  }

  /** Estado sugerido: verificación automática; si no hay, controles vinculados; si no, documentos. */
  suggestedStatus(r: ComplianceRequirement): ComplianceStatus | undefined {
    return this.autoCheck(r.autoCheck)?.suggested ?? this.coverage(r)?.suggested ?? this.documentCoverage(r)?.suggested;
  }

  // ---------------------------------------------------------------------------
  // Resúmenes
  // ---------------------------------------------------------------------------

  private stats(items: ComplianceRequirement[]) {
    const s = complianceScore(items);
    return {
      total: items.length, pct: s.pct, rated: s.rated,
      gaps: items.filter(isGap).length,
      unevaluated: items.filter(i => i.status === 'Sin evaluar').length,
      overdue: items.filter(i => this.isReviewOverdue(i)).length,
      versionReview: items.filter(i => this.needsVersionReview(i)).length,
      withoutControls: items.filter(i => i.status !== 'No aplica' && !(i.controlIds?.length) && !i.autoCheck).length,
    };
  }

  readonly byNorm = computed(() => {
    const all = this.sorted();
    return this.sortedNorms().map(n => ({ norm: n, items: all.filter(r => r.chapter === n.id), ...this.stats(all.filter(r => r.chapter === n.id)) }));
  });

  /** Requisitos cuya norma ya no existe (no deberían quedar; se muestran para no perderlos). */
  readonly orphans = computed(() => this.sorted().filter(r => !this.norm(r.chapter)));

  /** Resumen general: solo cuentan las normas que aplican (o están por determinar). */
  readonly summary = computed(() => {
    const applicable = new Set(this.norms().filter(n => n.applicability !== 'No aplica' && n.status !== 'Derogada').map(n => n.id));
    return { ...this.stats(this.requirements().filter(r => applicable.has(r.chapter))), norms: applicable.size };
  });

  // ---------------------------------------------------------------------------
  // Evaluación
  // ---------------------------------------------------------------------------

  private ensure(action: string) {
    this.rs.ensure([...COMPLIANCE_PERMS], action);
  }

  async evaluate(item: ComplianceRequirement) {
    this.ensure('evaluar el cumplimiento normativo');
    const norm = this.norm(item.chapter);
    const updated: ComplianceRequirement = {
      ...item, lastReviewDate: this.today(), reviewedBy: this.rs.currentProfile().name, normVersion: norm?.version ?? item.normVersion,
    };
    this.requirements.update(list => list.map(x => (x.id === item.id ? updated : x)));
    const label = `${this.normLabel(item.chapter)} ${item.numeral}`.trim();
    const controls = item.controlIds?.length ? ` Controles: ${item.controlIds.map(id => this.rs.controls().find(c => c.id === id)?.code ?? id).join(', ')}.` : '';
    await this.rs.appendAuditLog('EVALUACIÓN_CUMPLIMIENTO', 'Cumplimiento', label,
      `Cumplimiento ${label} "${item.title}": ${item.status}.${item.actionPlan ? ` Plan: ${item.actionPlan}` : ''}${controls}`);
  }

  // ---------------------------------------------------------------------------
  // Biblioteca normativa
  // ---------------------------------------------------------------------------

  /** Crea o actualiza una norma (sin cambiar su versión; para eso, `registerVersion`). */
  async saveNorm(data: Omit<ComplianceNorm, 'id' | 'versions' | 'order'> & { id?: string }): Promise<ComplianceNorm> {
    this.ensure('mantener la biblioteca normativa');
    const code = data.code.trim();
    const title = data.title.trim();
    if (!code || !title) throw new Error('La norma necesita código y título.');
    const prev = data.id ? this.norm(data.id) : undefined;
    if (this.norms().some(n => n.id !== data.id && n.code.trim().toLowerCase() === code.toLowerCase())) {
      throw new Error(`Ya existe una norma con el código "${code}".`);
    }
    const me = this.rs.currentProfile().name;
    const norm: ComplianceNorm = prev
      ? { ...prev, ...data, code, title, id: prev.id, version: prev.version, versions: prev.versions, order: prev.order }
      : {
        ...data, code, title, id: normId(code, new Set(this.norms().map(n => n.id))),
        version: data.version.trim() || '1', order: Math.max(0, ...this.norms().map(n => n.order)) + 10,
        versions: [{ version: data.version.trim() || '1', date: data.effectiveDate || this.today(), summary: 'Norma incorporada a la biblioteca.', registeredBy: me, registeredAt: new Date().toISOString() }],
      };
    this.norms.update(list => (prev ? list.map(n => (n.id === norm.id ? norm : n)) : [...list, norm]));
    await this.rs.appendAuditLog('MANTENEDOR_NORMA', 'Cumplimiento', norm.code,
      prev ? `Norma actualizada: ${norm.code} "${norm.title}" (${norm.status}; ${norm.applicability}).`
        : `Norma incorporada: ${norm.code} "${norm.title}" (versión ${norm.version}).`);
    return norm;
  }

  /**
   * Registra una versión nueva de la norma. Los requisitos evaluados con la versión anterior
   * quedan marcados para revisión hasta que se vuelvan a evaluar.
   */
  async registerVersion(id: string, v: { version: string; date: string; summary: string }) {
    this.ensure('registrar versiones de normas');
    const norm = this.norm(id);
    if (!norm) throw new Error('Norma no encontrada.');
    const version = v.version.trim();
    if (!version) throw new Error('Indique la versión.');
    if (norm.versions.some(x => x.version.toLowerCase() === version.toLowerCase())) throw new Error(`La versión "${version}" ya está registrada.`);
    const entry: NormVersion = { version, date: v.date || this.today(), summary: v.summary.trim(), registeredBy: this.rs.currentProfile().name, registeredAt: new Date().toISOString() };
    this.norms.update(list => list.map(n => (n.id === id ? { ...n, version, versions: [...n.versions, entry] } : n)));
    const affected = this.requirements().filter(r => r.chapter === id && this.needsVersionReview(r)).length;
    await this.rs.appendAuditLog('VERSIÓN_NORMA', 'Cumplimiento', norm.code,
      `${norm.code}: versión ${norm.version} → ${version} (${entry.date}). ${entry.summary}${affected ? ` ${affected === 1 ? '1 requisito evaluado queda' : `${affected} requisitos evaluados quedan`} por revisar.` : ''}`);
    return affected;
  }

  /** Elimina una norma y sus requisitos. */
  async deleteNorm(id: string) {
    this.ensure('eliminar normas');
    const norm = this.norm(id);
    if (!norm) return;
    const n = this.requirements().filter(r => r.chapter === id).length;
    this.requirements.update(list => list.filter(r => r.chapter !== id));
    this.norms.update(list => list.filter(x => x.id !== id));
    await this.rs.appendAuditLog('MANTENEDOR_NORMA', 'Cumplimiento', norm.code, `Norma eliminada: ${norm.code} "${norm.title}" con ${n} requisitos.`);
  }

  // ---------------------------------------------------------------------------
  // Requisitos
  // ---------------------------------------------------------------------------

  async saveRequirement(data: Pick<ComplianceRequirement, 'chapter' | 'numeral' | 'title' | 'requirement' | 'frequency' | 'module'> & { id?: string; owner?: string }) {
    this.ensure('mantener requisitos normativos');
    const norm = this.norm(data.chapter);
    if (!norm) throw new Error('Seleccione la norma del requisito.');
    const title = data.title.trim();
    if (!title) throw new Error('El requisito necesita un título.');
    const prev = data.id ? this.requirements().find(r => r.id === data.id) : undefined;
    const req: ComplianceRequirement = prev
      ? { ...prev, numeral: data.numeral.trim(), title, requirement: data.requirement.trim() || title, frequency: data.frequency, module: data.module || undefined }
      : {
        id: requirementId(norm.id, title, new Set(this.requirements().map(r => r.id))), chapter: norm.id,
        numeral: data.numeral.trim(), title, requirement: data.requirement.trim() || title, module: data.module || undefined,
        frequency: data.frequency, status: 'Sin evaluar', evidence: '', owner: data.owner?.trim() ?? '', actionPlan: '', controlIds: [],
      };
    this.requirements.update(list => (prev ? list.map(r => (r.id === req.id ? req : r)) : [...list, req]));
    await this.rs.appendAuditLog('MANTENEDOR_REQUISITO', 'Cumplimiento', `${norm.code} ${req.numeral}`.trim(),
      `${prev ? 'Requisito modificado' : 'Requisito agregado'}: ${norm.code} ${req.numeral} "${req.title}".`);
    return req;
  }

  async deleteRequirement(id: string) {
    this.ensure('eliminar requisitos normativos');
    const req = this.requirements().find(r => r.id === id);
    if (!req) return;
    this.requirements.update(list => list.filter(r => r.id !== id));
    await this.rs.appendAuditLog('MANTENEDOR_REQUISITO', 'Cumplimiento', `${this.normLabel(req.chapter)} ${req.numeral}`.trim(),
      `Requisito eliminado: ${this.normLabel(req.chapter)} ${req.numeral} "${req.title}".`);
  }

  /** Agrega a la norma los requisitos leídos de un Excel o CSV. Omite los que repiten numeral y título. */
  async importRequirements(chapter: string, rows: ParsedRequirementRow[]): Promise<{ added: number; skipped: number }> {
    this.ensure('importar requisitos normativos');
    const norm = this.norm(chapter);
    if (!norm) throw new Error('Norma no encontrada.');
    const key = (numeral: string, title: string) => `${numeral.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
    const existing = new Set(this.requirements().filter(r => r.chapter === chapter).map(r => key(r.numeral, r.title)));
    const taken = new Set(this.requirements().map(r => r.id));
    const fresh: ComplianceRequirement[] = [];
    for (const row of rows) {
      const k = key(row.numeral, row.title);
      if (existing.has(k)) continue;
      existing.add(k);
      const id = requirementId(chapter, row.title, taken);
      taken.add(id);
      fresh.push({
        id, chapter, numeral: row.numeral, title: row.title, requirement: row.requirement, frequency: row.frequency,
        status: 'Sin evaluar', evidence: '', owner: row.owner, actionPlan: '', controlIds: [],
      });
    }
    if (fresh.length) {
      this.requirements.update(list => [...list, ...fresh]);
      await this.rs.appendAuditLog('IMPORTACIÓN_REQUISITOS', 'Cumplimiento', norm.code,
        `${fresh.length} requisitos importados a ${norm.code}${rows.length - fresh.length ? ` (${rows.length - fresh.length} repetidos omitidos)` : ''}.`);
    }
    return { added: fresh.length, skipped: rows.length - fresh.length };
  }

  /** Requisitos que un control ayuda a cumplir (para mostrarlo desde la matriz de controles). */
  requirementsForControl(controlId: string): ComplianceRequirement[] {
    return this.sorted().filter(r => r.controlIds?.includes(controlId));
  }
}
