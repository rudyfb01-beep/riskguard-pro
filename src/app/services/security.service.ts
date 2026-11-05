import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { ResilienceService } from './resilience.service';
import {
  ASSESSMENT_DOMAINS,
  AssessmentStatus,
  InformationAsset,
  SecurityAlert,
  SecurityAssessmentItem,
  VulnSeverity,
  Vulnerability,
} from '../models/security.model';
import { BASE_ASSESSMENT_ITEMS, DEMO_ASSESSMENT, DEMO_ASSETS, DEMO_SECURITY_TESTS, DEMO_VULNERABILITIES } from '../data/security-seed';
import { SecurityTest, SecurityTestType } from '../models/compliance.model';

const DAY = 86_400_000;
const toDate = (s: string) => new Date(s + 'T00:00:00');
const addDays = (s: string, d: number) => new Date(toDate(s).getTime() + d * DAY).toISOString().slice(0, 10);

/** Evidencia calculada desde los demás módulos para un requisito de la autoevaluación. */
export interface AutoEvidence {
  text: string;
  suggested?: AssessmentStatus;
}

/**
 * Seguridad de la información: inventario de activos, vulnerabilidades y la
 * autoevaluación del marco de seguridad y ciberseguridad.
 */
@Injectable({ providedIn: 'root' })
export class SecurityService {
  private readonly rs = inject(RiskDataService);
  private readonly res = inject(ResilienceService);

  readonly assets = signal<InformationAsset[]>(structuredClone(DEMO_ASSETS));
  readonly vulnerabilities = signal<Vulnerability[]>(structuredClone(DEMO_VULNERABILITIES));
  /** Ítems de la autoevaluación con planes de acción abiertos (lo mantiene ActionPlanService). */
  readonly itemsWithOpenPlans = signal<ReadonlySet<string>>(new Set());
  readonly assessment = signal<SecurityAssessmentItem[]>(
    BASE_ASSESSMENT_ITEMS.map(i => ({ ...i, ...(DEMO_ASSESSMENT[i.code] ?? {}) }))
  );

  readonly today = signal(new Date().toISOString().slice(0, 10));

  // ---------------------------------------------------------------------------
  // Pruebas de seguridad (RAN 20-10 4.1 y 4.2)
  // ---------------------------------------------------------------------------

  readonly securityTests = signal<SecurityTest[]>(structuredClone(DEMO_SECURITY_TESTS));

  /** Última prueba de alguno de los tipos indicados (o null). */
  lastTest(...types: SecurityTestType[]): SecurityTest | null {
    return [...this.securityTests()].filter(t => types.includes(t.type)).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  }

  /** true si la fecha está dentro de los últimos `days` días. */
  within(date: string | undefined, days: number): boolean {
    return !!date && date >= addDays(this.today(), -days);
  }

  async saveSecurityTest(t: SecurityTest) {
    this.rs.ensure(['canManageInfoSecurity'], 'registrar pruebas de seguridad');
    if (!t.date || !t.scope.trim()) throw new Error('Ingresa fecha y alcance de la prueba.');
    const prev = this.securityTests().find(x => x.id === t.id);
    const clean = { ...t, scope: t.scope.trim() };
    this.securityTests.update(list => (prev ? list.map(x => (x.id === t.id ? clean : x)) : [clean, ...list]));
    await this.rs.appendAuditLog('AUTOEVALUACIÓN_SEGURIDAD', 'Seguridad', t.id,
      `${prev ? 'Prueba de seguridad actualizada' : 'Prueba de seguridad registrada'}: ${t.type} del ${t.date} (${t.result}).${t.reportedToBoardDate ? ` Informada al Consejo el ${t.reportedToBoardDate}.` : ''}`);
  }

  async deleteSecurityTest(id: string) {
    this.rs.ensure(['canManageInfoSecurity'], 'eliminar pruebas de seguridad');
    const t = this.securityTests().find(x => x.id === id);
    if (!t) return;
    this.securityTests.update(list => list.filter(x => x.id !== id));
    await this.rs.appendAuditLog('AUTOEVALUACIÓN_SEGURIDAD', 'Seguridad', id, `Prueba de seguridad eliminada: ${t.type} del ${t.date}.`);
  }

  // ---------------------------------------------------------------------------
  // Activos
  // ---------------------------------------------------------------------------

  assetById(id: string) {
    return this.assets().find(a => a.id === id);
  }

  /** Criticidad del activo: la mayor valoración de confidencialidad, integridad o disponibilidad. */
  assetCriticality(a: InformationAsset): 'Crítico' | 'Alto' | 'Medio' | 'Bajo' {
    const max = Math.max(a.cia.confidentiality, a.cia.integrity, a.cia.availability);
    return max >= 4 ? 'Crítico' : max === 3 ? 'Alto' : max === 2 ? 'Medio' : 'Bajo';
  }

  assetVulnerabilities(assetId: string) {
    return this.vulnerabilities().filter(v => v.assetId === assetId);
  }

  assetIncidents(assetId: string) {
    return this.rs.flaws().filter(f => f.affectedAssetIds?.includes(assetId));
  }

  isAssetStale(a: InformationAsset): boolean {
    return addDays(a.lastReviewDate, 365) < this.today();
  }

  /** El activo está alojado en un proveedor que guarda datos fuera de Chile. */
  isDataAbroad(a: InformationAsset): boolean {
    const p = a.providerId ? this.res.providerById(a.providerId) : undefined;
    return !!p && p.dataLocation === 'Extranjero';
  }

  nextAssetCode(): string {
    const max = this.assets().reduce((m, a) => Math.max(m, Number(a.code.replace(/\D/g, '')) || 0), 0);
    return `AST-${String(max + 1).padStart(3, '0')}`;
  }

  async saveAsset(a: InformationAsset) {
    const exists = this.assets().some(x => x.id === a.id);
    this.assets.update(list => (exists ? list.map(x => (x.id === a.id ? { ...a } : x)) : [...list, { ...a }]));
    await this.rs.appendAuditLog(exists ? 'MODIFICACIÓN_ACTIVO_INFORMACION' : 'ALTA_ACTIVO_INFORMACION', 'Seguridad', a.code,
      `${exists ? 'Actualización' : 'Alta'} del activo "${a.name}" (${a.classification}, C${a.cia.confidentiality}/I${a.cia.integrity}/D${a.cia.availability}).`);
  }

  // ---------------------------------------------------------------------------
  // Vulnerabilidades
  // ---------------------------------------------------------------------------

  isVulnOpen(v: Vulnerability): boolean {
    return v.status === 'Abierta' || v.status === 'En remediación';
  }

  isVulnOverdue(v: Vulnerability): boolean {
    return this.isVulnOpen(v) && v.dueDate < this.today();
  }

  daysToDue(v: Vulnerability): number {
    return Math.round((toDate(v.dueDate).getTime() - toDate(this.today()).getTime()) / DAY);
  }

  dueDateFor(severity: VulnSeverity, detectedDate: string): string {
    return addDays(detectedDate, this.rs.catalog.params().vulnSlaDays[severity]);
  }

  nextVulnCode(): string {
    const max = this.vulnerabilities().reduce((m, v) => Math.max(m, Number(v.code.replace(/\D/g, '')) || 0), 0);
    return `VUL-${String(max + 1).padStart(3, '0')}`;
  }

  async saveVulnerability(v: Vulnerability) {
    const prev = this.vulnerabilities().find(x => x.id === v.id);
    const closing = (v.status === 'Mitigada' || v.status === 'Cerrada') && !v.closedDate;
    const item: Vulnerability = { ...v, closedDate: closing ? this.today() : v.closedDate };
    if (v.status !== 'Riesgo aceptado') delete item.acceptance;
    this.vulnerabilities.update(list => (prev ? list.map(x => (x.id === v.id ? item : x)) : [...list, item]));
    const asset = this.assetById(v.assetId);
    await this.rs.appendAuditLog(prev ? 'ACTUALIZACIÓN_VULNERABILIDAD' : 'REGISTRO_VULNERABILIDAD', 'Seguridad', v.code,
      prev
        ? `Vulnerabilidad "${v.title}": ${prev.status} → ${v.status}.${v.status === 'Riesgo aceptado' && v.acceptance ? ` Aceptada por ${v.acceptance.approvedBy}.` : ''}`
        : `Registro de vulnerabilidad ${v.severity} "${v.title}" en ${asset?.name ?? v.assetId}. Plazo: ${v.dueDate}.`);
  }

  // ---------------------------------------------------------------------------
  // Autoevaluación
  // ---------------------------------------------------------------------------

  async saveAssessmentItem(item: SecurityAssessmentItem) {
    const updated: SecurityAssessmentItem = { ...item, assessedBy: this.rs.currentProfile().name, assessedDate: this.today() };
    this.assessment.update(list => list.map(x => (x.id === item.id ? updated : x)));
    await this.rs.appendAuditLog('AUTOEVALUACIÓN_SEGURIDAD', 'Seguridad', item.code,
      `Autoevaluación ${item.code}: ${item.status}.${item.actionPlan ? ` Plan: ${item.actionPlan}` : ''}`);
  }

  /** Código sugerido para un requisito nuevo del dominio (prefijo de 3 letras + correlativo). */
  nextRequirementCode(domain: string): string {
    const prefix = domain.normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'REQ';
    const max = this.assessment().filter(i => i.code.startsWith(prefix + '-'))
      .reduce((m, i) => Math.max(m, Number(i.code.split('-')[1]) || 0), 0);
    return `${prefix}-${String(max + 1).padStart(2, '0')}`;
  }

  /** Crea o modifica la definición de un requisito (no su evaluación). */
  async saveRequirement(item: SecurityAssessmentItem) {
    this.rs.ensure(['canManageInfoSecurity'], 'modificar la lista de verificación de seguridad');
    const code = item.code.trim().toUpperCase();
    if (!code || !item.requirement.trim()) throw new Error('Ingresa código y requisito.');
    if (this.assessment().some(x => x.id !== item.id && x.code.toUpperCase() === code)) throw new Error(`El código ${code} ya existe.`);
    const prev = this.assessment().find(x => x.id === item.id);
    const clean = { ...item, code, requirement: item.requirement.trim(), guidance: item.guidance.trim() };
    this.assessment.update(list => (prev ? list.map(x => (x.id === item.id ? clean : x)) : [...list, clean]));
    await this.rs.appendAuditLog('AUTOEVALUACIÓN_SEGURIDAD', 'Seguridad', code,
      prev ? `Requisito ${code} modificado: "${clean.requirement.slice(0, 120)}".` : `Requisito agregado a la lista de seguridad: ${code} (${clean.domain}) "${clean.requirement.slice(0, 120)}".`);
  }

  async deleteRequirement(id: string) {
    this.rs.ensure(['canManageInfoSecurity'], 'modificar la lista de verificación de seguridad');
    const item = this.assessment().find(x => x.id === id);
    if (!item) return;
    this.assessment.update(list => list.filter(x => x.id !== id));
    await this.rs.appendAuditLog('AUTOEVALUACIÓN_SEGURIDAD', 'Seguridad', item.code, `Requisito eliminado de la lista de seguridad: ${item.code} "${item.requirement.slice(0, 120)}".`);
  }

  /** Puntaje: Cumple = 1, Parcial = 0,5, No cumple = 0; "No aplica" y "Sin evaluar" se excluyen. */
  private score(items: SecurityAssessmentItem[]) {
    const rated = items.filter(i => i.status === 'Cumple' || i.status === 'Cumple parcialmente' || i.status === 'No cumple');
    const pts = rated.reduce((s, i) => s + (i.status === 'Cumple' ? 1 : i.status === 'Cumple parcialmente' ? 0.5 : 0), 0);
    return { rated: rated.length, pct: rated.length ? Math.round((pts / rated.length) * 100) : null as number | null };
  }

  readonly assessmentByDomain = computed(() =>
    ASSESSMENT_DOMAINS.map(domain => {
      const items = this.assessment().filter(i => i.domain === domain);
      return { domain, items, total: items.length, ...this.score(items) };
    })
  );

  readonly assessmentSummary = computed(() => {
    const items = this.assessment();
    return {
      total: items.length,
      pending: items.filter(i => i.status === 'Sin evaluar').length,
      gaps: items.filter(i => i.status === 'No cumple' || i.status === 'Cumple parcialmente').length,
      ...this.score(items),
    };
  });

  /** Evidencia obtenida automáticamente de los datos del sistema. */
  autoEvidence(code: string): AutoEvidence | null {
    const today = this.today();
    const yearAgo = addDays(today, -365);
    switch (code) {
      case 'RIE-01': {
        const assets = this.assets();
        const noOwner = assets.filter(a => !a.owner || !a.custodian).length;
        const stale = assets.filter(a => this.isAssetStale(a)).length;
        return {
          text: `${assets.length} activos inventariados · ${noOwner} sin dueño o custodio · ${stale} sin revisión en 12 meses.`,
          suggested: assets.length === 0 ? 'No cumple' : noOwner + stale === 0 ? 'Cumple' : 'Cumple parcialmente',
        };
      }
      case 'RIE-03': {
        const personal = this.assets().filter(a => a.handlesPersonalData);
        const abroad = personal.filter(a => this.isDataAbroad(a)).length;
        return { text: `${personal.length} activos con datos personales · ${abroad} alojados en el extranjero.` };
      }
      case 'CTL-02': {
        const open = this.vulnerabilities().filter(v => this.isVulnOpen(v));
        const overdue = open.filter(v => this.isVulnOverdue(v)).length;
        const crit = open.filter(v => v.severity === 'Crítica').length;
        return {
          text: `${open.length} vulnerabilidades abiertas · ${overdue} fuera de plazo · ${crit} críticas.`,
          suggested: overdue === 0 && crit === 0 ? 'Cumple' : overdue > 0 ? 'Cumple parcialmente' : undefined,
        };
      }
      case 'CIB-01': {
        const now = Date.now();
        const s = this.rs.regulatorySummary(now);
        return { text: `Reportes regulatorios: ${s.onTimePct === null ? 'sin envíos registrados' : s.onTimePct + '% enviados dentro de plazo'} · ${s.overdue} hitos vencidos.` };
      }
      case 'CIB-02': {
        const pentests = this.vulnerabilities().filter(v => v.source === 'Prueba de intrusión' && v.detectedDate >= yearAgo);
        return {
          text: pentests.length ? `Hallazgos de prueba de intrusión registrados en los últimos 12 meses: ${pentests.length}.` : 'No hay hallazgos de pruebas de intrusión en los últimos 12 meses.',
          suggested: pentests.length ? undefined : 'No cumple',
        };
      }
      case 'TER-01': {
        const crit = this.res.providers().filter(p => p.status !== 'En término' && (p.criticality === 'Crítico' || p.criticality === 'Alto'));
        const missing = crit.filter(p => !p.clauses['confidentiality'] || !p.clauses['incidentNotification'] || !p.clauses['auditRights']).length;
        return {
          text: `${crit.length} proveedores críticos o altos · ${missing} sin cláusulas de confidencialidad, notificación de incidentes o auditoría.`,
          suggested: crit.length ? (missing === 0 ? 'Cumple' : 'Cumple parcialmente') : undefined,
        };
      }
      case 'TER-02': {
        const crit = this.res.providers().filter(p => p.status !== 'En término' && (p.criticality === 'Crítico' || p.criticality === 'Alto'));
        const overdue = crit.filter(p => { const d = this.res.nextAssessmentDue(p); return !d || d < new Date(); }).length;
        return { text: `${crit.length} proveedores críticos o altos · ${overdue} con evaluación vencida o pendiente.`, suggested: crit.length ? (overdue === 0 ? 'Cumple' : 'Cumple parcialmente') : undefined };
      }
      case 'CON-01': {
        const drp = this.res.plans().filter(p => p.type === 'Recuperación ante Desastres (DRP)');
        const tested = drp.filter(p => this.res.testsForPlan(p.id).some(t => t.date >= yearAgo));
        return {
          text: drp.length ? `${tested.length} de ${drp.length} planes DRP probados en los últimos 12 meses.` : 'No hay planes DRP registrados.',
          suggested: drp.length === 0 ? 'No cumple' : tested.length === drp.length ? 'Cumple' : 'Cumple parcialmente',
        };
      }
      case 'CON-02': {
        const gaps = this.res.continuityAlerts().filter(a => a.type === 'Proveedor no cubre RTO' || a.type === 'RTO no logrado en prueba').length;
        return { text: `${this.res.biaProcesses().length} procesos con RTO/RPO en el BIA · ${gaps} brechas de recuperación detectadas.`, suggested: gaps ? 'Cumple parcialmente' : undefined };
      }
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Alertas e indicadores
  // ---------------------------------------------------------------------------

  readonly alerts = computed<SecurityAlert[]>(() => {
    const out: SecurityAlert[] = [];
    const today = this.today();
    for (const v of this.vulnerabilities()) {
      const asset = this.assetById(v.assetId)?.name ?? v.assetId;
      if (this.isVulnOverdue(v)) {
        out.push({ refId: v.id, type: 'Vulnerabilidad vencida', severity: v.severity === 'Crítica' || v.severity === 'Alta' ? 'Alta' : 'Media', detail: `${v.code} "${v.title}" (${asset}) debía resolverse el ${v.dueDate}.` });
      } else if (this.isVulnOpen(v) && v.severity === 'Crítica') {
        out.push({ refId: v.id, type: 'Vulnerabilidad crítica abierta', severity: 'Alta', detail: `${v.code} "${v.title}" en ${asset}; plazo ${v.dueDate}.` });
      }
      if (v.status === 'Riesgo aceptado' && v.acceptance && v.acceptance.reviewDate < today) {
        out.push({ refId: v.id, type: 'Riesgo aceptado por revisar', severity: 'Media', detail: `${v.code}: la aceptación de ${v.acceptance.approvedBy} debía revisarse el ${v.acceptance.reviewDate}.` });
      }
    }
    for (const a of this.assets()) {
      const crit = this.assetCriticality(a);
      if (this.isAssetStale(a)) out.push({ refId: a.id, type: 'Activo sin revisión', severity: crit === 'Crítico' ? 'Media' : 'Baja', detail: `${a.code} "${a.name}" sin revisión desde ${a.lastReviewDate}.` });
      if (a.handlesPersonalData && this.isDataAbroad(a)) {
        const p = this.res.providerById(a.providerId!);
        out.push({ refId: a.id, type: 'Datos personales en el extranjero', severity: 'Media', detail: `${a.code} "${a.name}" guarda datos personales con ${p?.name} en ${p?.dataCountry || 'el extranjero'}.` });
      }
      if ((crit === 'Crítico' || crit === 'Alto') && !a.custodian.trim()) out.push({ refId: a.id, type: 'Activo crítico sin custodio', severity: 'Media', detail: `${a.code} "${a.name}" no tiene custodio técnico asignado.` });
    }
    for (const i of this.assessment()) {
      if ((i.status === 'No cumple' || i.status === 'Cumple parcialmente') && !i.actionPlan.trim() && !this.itemsWithOpenPlans().has(i.id)) {
        out.push({ refId: i.id, type: 'Brecha sin plan de acción', severity: i.status === 'No cumple' ? 'Alta' : 'Media', detail: `${i.code} "${i.requirement}" está en "${i.status}" sin plan de acción.` });
      }
    }
    const order = { Alta: 0, Media: 1, Baja: 2 };
    return out.sort((a, b) => order[a.severity] - order[b.severity]);
  });

  readonly kpis = computed(() => {
    const open = this.vulnerabilities().filter(v => this.isVulnOpen(v));
    return {
      assets: this.assets().length,
      criticalAssets: this.assets().filter(a => this.assetCriticality(a) === 'Crítico').length,
      personalData: this.assets().filter(a => a.handlesPersonalData).length,
      openVulns: open.length,
      overdueVulns: open.filter(v => this.isVulnOverdue(v)).length,
      criticalVulns: open.filter(v => v.severity === 'Crítica').length,
      compliancePct: this.assessmentSummary().pct,
      highAlerts: this.alerts().filter(a => a.severity === 'Alta').length,
    };
  });

  newId(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}`;
  }
}
