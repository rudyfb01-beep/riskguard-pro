import { createHash } from 'node:crypto';
import { DbClient, getPool } from './db';
import {
  AnomalyAlert,
  AuditFinding,
  AuditLogEntry,
  Control,
  ControlTestExecution,
  KriDefinition,
  OperationalFlaw,
  OrganizationalRole,
  PeriodicAudit,
  RegulatoryMilestoneTemplate,
  RegulatoryReport,
  Risk,
  UserProfile,
} from '../app/models/risk.model';
import { BiaProcess, ContinuityPlan, ContinuityTest, ServiceProvider } from '../app/models/resilience.model';
import { InformationAsset, SecurityAssessmentItem, Vulnerability } from '../app/models/security.model';
import { BusinessProcess, OrgArea } from '../app/models/catalog.model';
import { ComplianceNorm, ComplianceRequirement, SecurityTest } from '../app/models/compliance.model';
import { ActionPlan } from '../app/models/action-plan.model';
import { SurveyCampaign, SurveyResponse } from '../app/models/survey.model';
import { ApprovalRequest } from '../app/models/approval.model';
import { CrisisEvent, CrisisScenario } from '../app/models/crisis.model';
import { EvidenceFile } from '../app/models/evidence.model';
import { ControlledDocument } from '../app/models/document.model';
import { AppNotification, NotificationDraft, NotificationPreference } from '../app/models/notification.model';
import { randomUUID } from 'node:crypto';

/**
 * Repositorio (PostgreSQL o SQLite): convierte los objetos que usa la aplicación en filas
 * de las tablas relacionales (y viceversa). Cada guardado reemplaza el objeto
 * completo, incluidas sus tablas hijas, dentro de una transacción.
 */

type Row = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Entidades que la API permite guardar, en orden de dependencias (claves foráneas). */
export const ENTITY_ORDER = [
  'areas', 'processes', 'roles', 'users', 'controls', 'risks', 'providers', 'regulatory-milestones',
  'flaws', 'alerts', 'audits', 'kris', 'bia', 'plans', 'continuity-tests', 'crisis-scenarios', 'crisis-events',
  'info-assets', 'vulnerabilities', 'security-assessment', 'norms', 'compliance', 'security-tests', 'action-plans', 'survey-campaigns', 'survey-responses', 'documents', 'approvals',
] as const;
export type EntityName = typeof ENTITY_ORDER[number];

export const SETTING_KEYS = ['current_industry', 'global_notification_preferences', 'loss_registration_threshold_usd', 'apr_operational_inputs', 'general_parameters',
  'risk_scale', 'risk_appetite', 'accounting_accounts', 'provider_catalogs', 'approval_matrix', 'notification_settings', 'uf_values', 'crisis_committee'] as const;
export type SettingKey = typeof SETTING_KEYS[number];

export interface BootstrapData {
  areas: OrgArea[];
  processes: BusinessProcess[];
  roles: OrganizationalRole[];
  users: UserProfile[];
  controls: Control[];
  risks: Risk[];
  providers: ServiceProvider[];
  regulatoryMilestones: RegulatoryMilestoneTemplate[];
  flaws: OperationalFlaw[];
  alerts: AnomalyAlert[];
  audits: PeriodicAudit[];
  kris: KriDefinition[];
  bia: BiaProcess[];
  plans: ContinuityPlan[];
  continuityTests: ContinuityTest[];
  infoAssets: InformationAsset[];
  vulnerabilities: Vulnerability[];
  securityAssessment: SecurityAssessmentItem[];
  norms: ComplianceNorm[];
  compliance: ComplianceRequirement[];
  securityTests: SecurityTest[];
  actionPlans: ActionPlan[];
  surveyCampaigns: SurveyCampaign[];
  surveyResponses: SurveyResponse[];
  approvals: ApprovalRequest[];
  documents: ControlledDocument[];
  crisisScenarios: CrisisScenario[];
  crisisEvents: CrisisEvent[];
  /** Metadatos de las evidencias (sin el contenido). */
  evidenceFiles: EvidenceFile[];
  ledger: AuditLogEntry[];
  settings: Partial<Record<SettingKey, unknown>>;
  /** Versión de cada registro (entidad → id → número), para detectar ediciones simultáneas. */
  versions: Record<string, Record<string, number>>;
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

/** null → undefined para respetar los campos opcionales del modelo. */
const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOpt = (v: unknown): string | undefined => (v === null || v === undefined ? undefined : iso(v));
const dateOrNull = (v: string | undefined) => (v ? v : null);
const json = (v: unknown) => JSON.stringify(v ?? null);

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

async function withTransaction<T>(fn: (c: DbClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  if (!pool) throw new Error('Base de datos no configurada');
  return pool.transaction(fn);
}

/** INSERT ... ON CONFLICT (pk) DO UPDATE con todas las columnas indicadas. */
async function upsertRow(c: DbClient, table: string, pk: string, data: Row, touchUpdatedAt = true) {
  const cols = Object.keys(data);
  const params = cols.map((_, i) => `$${i + 1}`);
  const updates = cols.filter(k => k !== pk).map(k => `${k} = EXCLUDED.${k}`);
  if (touchUpdatedAt) updates.push('updated_at = CURRENT_TIMESTAMP');
  await c.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${params.join(', ')})
     ON CONFLICT (${pk}) DO UPDATE SET ${updates.join(', ')}`,
    cols.map(k => data[k])
  );
}

async function insertRow(c: DbClient, table: string, data: Row) {
  const cols = Object.keys(data);
  await c.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    cols.map(k => data[k])
  );
}

// -----------------------------------------------------------------------------
// Carga completa (bootstrap)
// -----------------------------------------------------------------------------

export async function loadAll(): Promise<BootstrapData> {
  const pool = getPool();
  if (!pool) throw new Error('Base de datos no configurada');
  const q = async (sql: string) => (await pool.query(sql)).rows as Row[];

  const [
    roles, users, controls, tests, risks, riskControls, providers, milestones, flaws, regReports, regSubs, regUpdates,
    alerts, audits, findings, kris, bia, biaProviders, plans, planProcesses, ctests, ledger, settings,
    infoAssets, vulns, secItems, areas, processes, compliance, secTests, norms, actionPlans, surveyCampaigns, surveyResponses, approvals, evidenceFiles, documents, versionRows, scenarioRows, crisisRows,
  ] = await Promise.all([
    q('SELECT * FROM organizational_roles ORDER BY created_at, id'),
    q('SELECT * FROM user_profiles ORDER BY created_at, id'),
    q('SELECT * FROM controls ORDER BY code'),
    q('SELECT * FROM control_test_executions ORDER BY test_date DESC, id DESC'),
    q('SELECT * FROM risks ORDER BY code'),
    q('SELECT * FROM risk_controls'),
    q('SELECT * FROM service_providers ORDER BY code'),
    q('SELECT * FROM regulatory_milestone_templates ORDER BY deadline_minutes, id'),
    q('SELECT * FROM operational_flaws ORDER BY reported_at DESC, id'),
    q('SELECT * FROM regulatory_reports'),
    q('SELECT * FROM regulatory_submissions ORDER BY submitted_at'),
    q('SELECT * FROM regulatory_report_updates ORDER BY at, id'),
    q('SELECT * FROM anomaly_alerts ORDER BY triggered_at DESC'),
    q('SELECT * FROM periodic_audits ORDER BY execution_date'),
    q('SELECT * FROM audit_findings ORDER BY created_at, id'),
    q('SELECT * FROM kri_definitions ORDER BY code'),
    q('SELECT * FROM bia_processes ORDER BY id'),
    q('SELECT * FROM bia_process_providers'),
    q('SELECT * FROM continuity_plans ORDER BY code'),
    q('SELECT * FROM continuity_plan_processes'),
    q('SELECT * FROM continuity_tests ORDER BY test_date DESC'),
    q('SELECT * FROM crypto_audit_ledger ORDER BY block_number DESC'),
    q('SELECT * FROM system_settings'),
    q('SELECT * FROM info_assets ORDER BY code'),
    q('SELECT * FROM vulnerabilities ORDER BY code'),
    q('SELECT * FROM security_assessment_items ORDER BY code'),
    q('SELECT * FROM org_areas ORDER BY name'),
    q('SELECT * FROM business_processes ORDER BY code'),
    q('SELECT * FROM compliance_requirements ORDER BY chapter, id'),
    q('SELECT * FROM security_tests ORDER BY test_date DESC'),
    q('SELECT * FROM compliance_norms ORDER BY sort_order, code'),
    q('SELECT * FROM action_plans ORDER BY code'),
    q('SELECT * FROM survey_campaigns ORDER BY code'),
    q('SELECT * FROM survey_responses ORDER BY campaign_id, subject'),
    q('SELECT * FROM approval_requests ORDER BY code'),
    q(`SELECT ${EVIDENCE_COLUMNS} FROM evidence_files ORDER BY uploaded_at`),
    q('SELECT * FROM controlled_documents ORDER BY code'),
    q('SELECT entity, id, version FROM record_versions'),
    q('SELECT * FROM crisis_scenarios ORDER BY code'),
    q('SELECT * FROM crisis_events ORDER BY code'),
  ]);
  const versions: Record<string, Record<string, number>> = {};
  for (const v of versionRows) (versions[v.entity] ??= {})[v.id] = Number(v.version);

  const testsBy = groupBy(tests, 'control_id');
  const rcBy = groupBy(riskControls, 'risk_id');
  const reportBy = new Map(regReports.map(r => [r.flaw_id, r]));
  const subsBy = groupBy(regSubs, 'flaw_id');
  const updBy = groupBy(regUpdates, 'flaw_id');
  const findingsBy = groupBy(findings, 'audit_id');
  const biaProvBy = groupBy(biaProviders, 'bia_process_id');
  const planProcBy = groupBy(planProcesses, 'plan_id');

  return {
    areas: areas.map((r): OrgArea => ({ id: r.id, name: r.name, manager: r.manager ?? '', description: r.description ?? '', active: r.active })),
    processes: processes.map((r): BusinessProcess => ({
      id: r.id, code: r.code, name: r.name, areaId: opt(r.area_id), owner: r.owner ?? '', businessLine: opt(r.business_line),
      criticality: r.criticality, description: r.description ?? '', active: r.active,
    })),
    roles: roles.map(roleFromRow),
    users: users.map(userFromRow),
    controls: controls.map(r => controlFromRow(r, testsBy.get(r.id) ?? [])),
    risks: risks.map(r => riskFromRow(r, (rcBy.get(r.id) ?? []).map(x => x.control_id))),
    providers: providers.map(providerFromRow),
    regulatoryMilestones: milestones.map(m => ({
      id: m.id, authority: m.authority, name: m.name, deadlineMinutes: m.deadline_minutes, enabled: m.enabled,
      basis: m.basis, dueOnClose: m.due_on_close,
    })),
    flaws: flaws.map(r => flawFromRow(r, reportBy.get(r.id), subsBy.get(r.id) ?? [], updBy.get(r.id) ?? [])),
    alerts: alerts.map(alertFromRow),
    audits: audits.map(r => auditFromRow(r, findingsBy.get(r.id) ?? [])),
    kris: kris.map(kriFromRow),
    bia: bia.map(r => biaFromRow(r, (biaProvBy.get(r.id) ?? []).map(x => x.provider_id))),
    plans: plans.map(r => planFromRow(r, (planProcBy.get(r.id) ?? []).map(x => x.bia_process_id))),
    continuityTests: ctests.map(continuityTestFromRow),
    ledger: ledger.map(ledgerFromRow),
    infoAssets: infoAssets.map(assetFromRow),
    vulnerabilities: vulns.map(vulnFromRow),
    securityAssessment: secItems.map(assessmentFromRow),
    compliance: compliance.map((x): ComplianceRequirement => ({
      id: x.id, chapter: x.chapter, numeral: x.numeral, title: x.title, requirement: x.requirement, module: opt(x.module),
      autoCheck: opt(x.auto_check), frequency: x.frequency, status: x.status, evidence: x.evidence ?? '', owner: x.owner ?? '',
      actionPlan: x.action_plan ?? '', dueDate: opt(x.due_date), lastReviewDate: opt(x.last_review_date), reviewedBy: opt(x.reviewed_by),
      controlIds: Array.isArray(x.control_ids) ? x.control_ids : [], normVersion: opt(x.norm_version),
    })),
    actionPlans: actionPlans.map(actionPlanFromRow),
    surveyCampaigns: surveyCampaigns.map(campaignFromRow),
    surveyResponses: surveyResponses.map(responseFromRow),
    approvals: approvals.map(approvalFromRow),
    evidenceFiles: evidenceFiles.map(evidenceFromRow),
    documents: documents.map(documentFromRow),
    crisisScenarios: scenarioRows.map(scenarioFromRow),
    crisisEvents: crisisRows.map(crisisFromRow),
    versions,
    norms: norms.map((x): ComplianceNorm => ({
      id: x.id, code: x.code, title: x.title, kind: x.kind, issuer: x.issuer ?? '', source: x.source ?? '', url: opt(x.url),
      version: x.version, effectiveDate: opt(x.effective_date), status: x.status, applicability: x.applicability,
      applicabilityNote: x.applicability_note ?? '', owner: x.owner ?? '', notes: x.notes ?? '',
      versions: Array.isArray(x.versions) ? x.versions : [], order: Number(x.sort_order ?? 100), referential: x.referential === true,
    })),
    securityTests: secTests.map((x): SecurityTest => ({
      id: x.id, date: x.test_date, type: x.type, scope: x.scope, executedBy: x.executed_by ?? '', result: x.result,
      findings: x.findings ?? '', reportedToBoardDate: opt(x.reported_to_board_date),
    })),
    settings: Object.fromEntries(settings.filter(s => (SETTING_KEYS as readonly string[]).includes(s.key)).map(s => [s.key, s.value])),
  };
}

// -----------------------------------------------------------------------------
// Mapeos fila → objeto
// -----------------------------------------------------------------------------

function roleFromRow(r: Row): OrganizationalRole {
  return { id: r.id, title: r.title, department: r.department, description: r.description, badge: r.badge, isSystemRole: r.is_system_role, permissions: r.permissions };
}

export function userFromRow(r: Row): UserProfile {
  return {
    id: r.id, name: r.name, email: r.email, role: r.role_title, roleId: opt(r.role_id), department: r.department,
    badge: r.badge, isSystemUser: r.is_system_user, permissions: r.permissions, active: r.active ?? true,
    googleLinked: !!r.google_sub,
  };
}

function controlTestFromRow(t: Row): ControlTestExecution {
  return {
    id: t.id, testDate: t.test_date, testedBy: t.tested_by, testerRole: opt(t.tester_role), testMethod: t.test_method,
    sampleSize: opt(t.sample_size), deviationsIdentified: opt(t.deviations_identified), designScore: t.design_score,
    operatingScore: t.operating_score, totalScore: t.total_score, conclusion: t.conclusion, evidenceNotes: t.evidence_notes,
    attachments: t.attachments ?? [], ledgerHash: opt(t.ledger_hash),
  };
}

function controlFromRow(r: Row, tests: Row[]): Control {
  return {
    id: r.id, code: r.code, name: r.name, description: r.description, process: r.process, type: r.type,
    automation: r.automation, frequency: r.frequency, designEffectiveness: r.design_effectiveness,
    operatingEffectiveness: r.operating_effectiveness, totalEffectiveness: r.total_effectiveness, status: r.status,
    owner: r.owner, lastTested: r.last_tested, evidence: r.evidence, attachments: r.attachments ?? [],
    testHistory: tests.map(controlTestFromRow), sampleDetails: opt(r.sample_details), lastTestedBy: opt(r.last_tested_by),
  };
}

function riskFromRow(r: Row, controlIds: string[]): Risk {
  return {
    id: r.id, code: r.code, title: r.title, description: r.description, process: r.process, category: r.category,
    responsible: r.responsible, status: r.status,
    inherentLikelihood: r.inherent_likelihood, inherentImpact: r.inherent_impact, inherentScore: r.inherent_score,
    inherentLevel: r.inherent_level, financialExposureUSD: r.financial_exposure_usd, controlIds,
    residualLikelihood: r.residual_likelihood, residualImpact: r.residual_impact, residualScore: r.residual_score,
    residualLevel: r.residual_level, residualExposureUSD: r.residual_exposure_usd,
    mitigationPlan: r.mitigation_plan, createdAt: r.created_at, lastReviewDate: r.last_review_date,
    acceptance: opt(r.acceptance ?? null),
  };
}

function providerFromRow(r: Row): ServiceProvider {
  return {
    id: r.id, code: r.code, name: r.name, taxId: r.tax_id ?? '', serviceDescription: r.service_description,
    category: r.category, criticality: r.criticality, internalOwner: r.internal_owner ?? '',
    supportedProcesses: r.supported_processes ?? [], status: r.status, isCloud: r.is_cloud, cloudModel: opt(r.cloud_model),
    dataLocation: r.data_location, dataCountry: opt(r.data_country), handlesMemberData: r.handles_member_data,
    usesSubcontractors: r.uses_subcontractors, contractStart: r.contract_start ?? '', contractEnd: r.contract_end,
    annualCostUSD: r.annual_cost_usd, clauses: r.clauses, lastAssessmentDate: opt(r.last_assessment_date),
    assessmentScore: opt(r.assessment_score), hasExitPlan: r.has_exit_plan, exitPlanNotes: opt(r.exit_plan_notes),
    committedRtoHours: opt(r.committed_rto_hours), ran207: opt(r.ran207),
  };
}

function flawFromRow(r: Row, rep: Row | undefined, subs: Row[], upds: Row[]): OperationalFlaw {
  const report: RegulatoryReport | undefined = rep && {
    awarenessAt: iso(rep.awareness_at),
    occurredAt: isoOpt(rep.occurred_at),
    details: opt(rep.details),
    reportableToCMF: rep.reportable_to_cmf,
    reportableToANCI: rep.reportable_to_anci,
    submissions: subs.map(s => ({ milestoneId: s.milestone_id, submittedAt: iso(s.submitted_at), submittedBy: s.submitted_by, folio: opt(s.folio) })),
    updates: upds.map(u => ({ at: iso(u.at), by: u.author, note: u.note })),
    status: rep.status,
    closedAt: isoOpt(rep.closed_at),
  };
  return {
    id: r.id, title: r.title, description: r.description, reportedBy: r.reported_by, process: r.process,
    severity: r.severity, reportedAt: r.reported_at, status: r.status, incidentType: opt(r.incident_type),
    realLossAmountUSD: r.real_loss_amount_usd ?? 0, recoveredAmountUSD: r.recovered_amount_usd ?? 0,
    impactedSystemOrAccount: opt(r.impacted_system_or_account), convertedRiskId: opt(r.converted_risk_id),
    aiSuggestedCategory: opt(r.ai_suggested_category), aiSuggestedControls: opt(r.ai_suggested_controls),
    aiAnalysis: opt(r.ai_analysis),
    businessLine: opt(r.business_line), baselCategory: opt(r.basel_category), baselSubcategory: opt(r.basel_subcategory),
    occurrenceDate: opt(r.occurrence_date), discoveryDate: opt(r.discovery_date), accountingDate: opt(r.accounting_date),
    accountingAccount: opt(r.accounting_account), creditRiskBoundary: r.credit_risk_boundary,
    regulatoryReport: report, providerId: opt(r.provider_id), affectedAssetIds: r.affected_asset_ids ?? [], cyber: opt(r.cyber),
    ufValueClp: r.uf_value_clp === null || r.uf_value_clp === undefined ? undefined : Number(r.uf_value_clp), ufDate: opt(r.uf_date),
  };
}

function alertFromRow(r: Row): AnomalyAlert {
  return {
    id: r.id, code: r.code, title: r.title, description: r.description, kriMetric: r.kri_metric, threshold: r.threshold,
    currentValue: r.current_value, severity: r.severity, process: r.process, triggeredAt: r.triggered_at,
    status: r.status, escalatedTo: r.escalated_to,
  };
}

function auditFromRow(r: Row, findings: Row[]): PeriodicAudit {
  return {
    id: r.id, code: r.code, title: r.title, type: r.type, period: r.period, leadAuditor: r.lead_auditor,
    scope: r.scope ?? [], executionDate: r.execution_date, status: r.status, complianceScore: r.compliance_score,
    findings: findings.map((f): AuditFinding => ({
      id: f.id, type: f.type, description: f.description, process: f.process, associatedRiskCode: opt(f.associated_risk_code),
      correctiveAction: f.corrective_action, deadline: f.deadline, responsible: f.responsible, status: f.status,
    })),
  };
}

function kriFromRow(r: Row): KriDefinition {
  return {
    id: r.id, code: r.code, name: r.name, description: r.description, process: r.process, category: r.category,
    industry: r.industry, unit: r.unit, direction: r.direction, warningThreshold: r.warning_threshold,
    criticalThreshold: r.critical_threshold, currentValue: r.current_value, frequency: r.frequency, status: r.status,
    autoTriggerAlert: r.auto_trigger_alert, responsible: r.responsible, lastUpdated: r.last_updated,
    notificationPreferences: opt(r.notification_preferences),
  };
}

function biaFromRow(r: Row, providerIds: string[]): BiaProcess {
  return {
    id: r.id, name: r.name, owner: r.owner ?? '', businessLine: r.business_line, description: r.description ?? '',
    impact: { financial: r.impact_financial, members: r.impact_members, regulatory: r.impact_regulatory, reputational: r.impact_reputational },
    mtpdHours: r.mtpd_hours, rtoHours: r.rto_hours, rpoHours: r.rpo_hours, systems: r.systems ?? [], providerIds,
    minimumStaff: r.minimum_staff, alternateSite: r.alternate_site ?? '', lastReviewDate: r.last_review_date, ran209: opt(r.ran209),
  };
}

function planFromRow(r: Row, processIds: string[]): ContinuityPlan {
  return {
    id: r.id, code: r.code, name: r.name, type: r.type, processIds, owner: r.owner ?? '', version: r.version,
    approvedBy: r.approved_by ?? '', approvalDate: r.approval_date ?? '', nextReviewDate: r.next_review_date, status: r.status,
    ran209: opt(r.ran209),
  };
}

function continuityTestFromRow(r: Row): ContinuityTest {
  return {
    id: r.id, planId: r.plan_id, date: r.test_date, type: r.type, scenario: r.scenario, processId: opt(r.bia_process_id),
    achievedRtoHours: opt(r.achieved_rto_hours), result: r.result, findings: r.findings ?? '', actions: r.actions ?? '',
    ran209: opt(r.ran209),
  };
}

function assetFromRow(r: Row): InformationAsset {
  return {
    id: r.id, code: r.code, name: r.name, description: r.description ?? '', type: r.type, owner: r.owner,
    custodian: r.custodian ?? '', classification: r.classification,
    cia: { confidentiality: r.confidentiality, integrity: r.integrity, availability: r.availability },
    handlesPersonalData: r.handles_personal_data, location: r.location, providerId: opt(r.provider_id),
    biaProcessIds: r.bia_process_ids ?? [], lastReviewDate: r.last_review_date, criticalInfrastructure: !!r.critical_infrastructure,
  };
}

function vulnFromRow(r: Row): Vulnerability {
  return {
    id: r.id, code: r.code, title: r.title, description: r.description ?? '', assetId: r.asset_id, source: r.source,
    severity: r.severity, cvssScore: opt(r.cvss_score), detectedDate: r.detected_date, dueDate: r.due_date,
    status: r.status, owner: r.owner ?? '', remediation: r.remediation ?? '', closedDate: opt(r.closed_date),
    acceptance: opt(r.acceptance),
  };
}

function actionPlanFromRow(r: Row): ActionPlan {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    id: r.id, code: r.code, title: r.title, description: r.description ?? '', sourceType: r.source_type, sourceId: opt(r.source_id),
    sourceLabel: r.source_label ?? '', process: opt(r.process), owner: r.owner, priority: r.priority, startDate: opt(r.start_date),
    dueDate: r.due_date, originalDueDate: r.original_due_date, status: r.status, progressPct: Number(r.progress_pct ?? 0),
    tasks: arr(r.tasks), updates: arr(r.updates), reschedules: arr(r.reschedules), closure: r.closure ?? undefined, rejections: arr(r.rejections),
    cancelReason: opt(r.cancel_reason), createdBy: r.created_by, createdAt: r.created_at_iso, closedAt: opt(r.closed_at),
  };
}

function campaignFromRow(r: Row): SurveyCampaign {
  return {
    id: r.id, code: r.code, title: r.title, kind: r.kind, description: r.description ?? '', scope: Array.isArray(r.scope) ? r.scope : [],
    normId: opt(r.norm_id), respondent: opt(r.respondent), customItems: r.custom_items ?? undefined, dueDate: r.due_date, status: r.status,
    launchedAt: opt(r.launched_at), closedAt: opt(r.closed_at), createdBy: r.created_by, createdAt: r.created_at_iso,
  };
}

function responseFromRow(r: Row): SurveyResponse {
  return {
    id: r.id, campaignId: r.campaign_id, subject: r.subject, respondent: r.respondent, items: Array.isArray(r.items) ? r.items : [],
    answers: r.answers && typeof r.answers === 'object' ? r.answers : {}, status: r.status, dueDate: r.due_date,
    startedAt: opt(r.started_at), submittedAt: opt(r.submitted_at), returnedNote: opt(r.returned_note), reviewedBy: opt(r.reviewed_by),
    reviewedAt: opt(r.reviewed_at), reviewNote: opt(r.review_note), applied: Array.isArray(r.applied) ? r.applied : [],
  };
}

/** Encuesta guardada y su campaña (para validar los cambios de quien responde). */
export async function getSurveyResponse(id: string): Promise<{ response: SurveyResponse; campaign: SurveyCampaign | null } | null> {
  const r = await getPool()!.query('SELECT * FROM survey_responses WHERE id = $1', [id]);
  if (!r.rows[0]) return null;
  const c = await getPool()!.query('SELECT * FROM survey_campaigns WHERE id = $1', [r.rows[0].campaign_id]);
  return { response: responseFromRow(r.rows[0]), campaign: c.rows[0] ? campaignFromRow(c.rows[0]) : null };
}

function approvalFromRow(r: Row): ApprovalRequest {
  return {
    id: r.id, code: r.code, kind: r.kind, targetEntity: r.target_entity, targetId: r.target_id, targetLabel: r.target_label,
    justification: r.justification, payload: r.payload && typeof r.payload === 'object' ? r.payload : {}, requestedBy: r.requested_by,
    requestedAt: r.requested_at, steps: Array.isArray(r.steps) ? r.steps : [], currentStep: Number(r.current_step ?? 0), status: r.status,
    closedAt: opt(r.closed_at), cancelReason: opt(r.cancel_reason),
  };
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

function documentFromRow(r: Row): ControlledDocument {
  return {
    id: r.id, code: r.code, title: r.title, type: r.doc_type, description: r.description ?? '', owner: r.owner ?? '',
    classification: r.classification, reviewMonths: Number(r.review_months ?? 12), audienceRoleIds: arr(r.audience_role_ids),
    requirementIds: arr(r.requirement_ids), processes: arr(r.processes), versions: arr(r.versions), currentVersionId: opt(r.current_version_id),
    nextReviewDate: r.next_review_date ? String(r.next_review_date instanceof Date ? r.next_review_date.toISOString() : r.next_review_date).slice(0, 10) : undefined,
    acknowledgments: arr(r.acknowledgments), status: r.status, obsoleteReason: opt(r.obsolete_reason), createdBy: r.created_by ?? '', createdAt: r.created_at,
  };
}

const dayStr = (v: unknown): string | undefined => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : undefined);

function scenarioFromRow(r: Row): CrisisScenario {
  return {
    id: r.id, code: r.code, name: r.name, category: r.category, description: r.description ?? '', likelihood: Number(r.likelihood), impact: Number(r.impact),
    activationCriteria: r.activation_criteria ?? '', initialActions: arr(r.initial_actions), communications: r.communications ?? '',
    affectedProcessIds: arr(r.affected_process_ids), planIds: arr(r.plan_ids), owner: r.owner ?? '', lastReviewDate: dayStr(r.last_review_date) ?? '',
    active: r.active !== false && r.active !== 0,
  };
}

function crisisFromRow(r: Row): CrisisEvent {
  return {
    id: r.id, code: r.code, title: r.title, mode: r.mode, level: Number(r.level) as CrisisEvent['level'], status: r.status,
    scenarioId: opt(r.scenario_id), flawId: opt(r.flaw_id), plannedDate: dayStr(r.planned_date), declaredAt: opt(r.declared_at), declaredBy: opt(r.declared_by),
    stabilizedAt: opt(r.stabilized_at), closedAt: opt(r.closed_at), closedBy: opt(r.closed_by),
    affectedProcessIds: arr(r.affected_process_ids), activatedPlanIds: arr(r.activated_plan_ids), log: arr(r.log), tasks: arr(r.tasks),
    communications: arr(r.communications), closingSummary: opt(r.closing_summary), lessons: opt(r.lessons), testId: opt(r.test_id),
    createdBy: r.created_by ?? '', createdAt: r.created_at,
  };
}

export async function getCrisisEvent(id: string): Promise<CrisisEvent | null> {
  const r = await getPool()!.query('SELECT * FROM crisis_events WHERE id = $1', [id]);
  return r.rows[0] ? crisisFromRow(r.rows[0]) : null;
}

export async function getDocument(id: string): Promise<ControlledDocument | null> {
  const r = await getPool()!.query('SELECT * FROM controlled_documents WHERE id = $1', [id]);
  return r.rows[0] ? documentFromRow(r.rows[0]) : null;
}

/** Solicitud de aprobación guardada (para validar decisiones). */
export async function getApproval(id: string): Promise<ApprovalRequest | null> {
  const r = await getPool()!.query('SELECT * FROM approval_requests WHERE id = $1', [id]);
  return r.rows[0] ? approvalFromRow(r.rows[0]) : null;
}

/** Plan de acción guardado (para validar los cambios del responsable). */
export async function getActionPlan(id: string): Promise<ActionPlan | null> {
  const r = await getPool()!.query('SELECT * FROM action_plans WHERE id = $1', [id]);
  return r.rows[0] ? actionPlanFromRow(r.rows[0]) : null;
}

function assessmentFromRow(r: Row): SecurityAssessmentItem {
  return {
    id: r.id, code: r.code, domain: r.domain, requirement: r.requirement, guidance: r.guidance ?? '', status: r.status,
    evidence: r.evidence ?? '', owner: r.owner ?? '', actionPlan: r.action_plan ?? '', dueDate: opt(r.due_date),
    assessedBy: opt(r.assessed_by), assessedDate: opt(r.assessed_date),
  };
}

function ledgerFromRow(r: Row): AuditLogEntry {
  return {
    id: r.id, blockNumber: r.block_number, timestamp: r.timestamp, userName: r.user_name, userRole: r.user_role,
    action: r.action, entityType: r.entity_type, entityCode: r.entity_code, details: r.details, ipAddress: r.ip_address,
    previousHash: r.previous_hash, hash: r.hash,
  };
}

// -----------------------------------------------------------------------------
// Guardado por entidad (objeto completo)
// -----------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const savers: Record<EntityName, (c: DbClient, o: any) => Promise<void>> = {
  async areas(c, o: OrgArea) {
    const prev = await c.query('SELECT name FROM org_areas WHERE id = $1', [o.id]);
    await upsertRow(c, 'org_areas', 'id', {
      id: o.id, name: o.name.trim(), manager: o.manager || null, description: o.description || null, active: o.active !== false,
    });
    const oldName: string | undefined = prev.rows[0]?.name;
    if (oldName && oldName !== o.name.trim()) {
      // Los puestos y usuarios guardan el nombre del área.
      await c.query('UPDATE organizational_roles SET department = $2 WHERE department = $1', [oldName, o.name.trim()]);
      await c.query('UPDATE user_profiles SET department = $2 WHERE department = $1', [oldName, o.name.trim()]);
      await bumpAllVersions(c, 'roles', null);
      await bumpAllVersions(c, 'users', null);
    }
  },

  async processes(c, o: BusinessProcess) {
    const prev = await c.query('SELECT name FROM business_processes WHERE id = $1', [o.id]);
    const name = o.name.trim();
    await upsertRow(c, 'business_processes', 'id', {
      id: o.id, code: o.code, name, area_id: o.areaId || null, owner: o.owner || null, business_line: o.businessLine ?? null,
      criticality: o.criticality, description: o.description || null, active: o.active !== false,
    });
    const oldName: string | undefined = prev.rows[0]?.name;
    if (oldName && oldName !== name) {
      await renameProcessReferences(c, oldName, name);
      for (const e of ['risks', 'controls', 'flaws', 'alerts', 'kris', 'audits', 'providers'] as const) await bumpAllVersions(c, e, null);
    }
  },

  async roles(c, o: OrganizationalRole) {
    await upsertRow(c, 'organizational_roles', 'id', {
      id: o.id, title: o.title, department: o.department, description: o.description ?? '', badge: o.badge,
      is_system_role: !!o.isSystemRole, permissions: json(o.permissions),
    });
  },

  async users(c, o: UserProfile) {
    await upsertRow(c, 'user_profiles', 'id', {
      id: o.id, name: o.name, email: o.email, role_id: o.roleId ?? null, role_title: o.role, department: o.department,
      badge: o.badge, is_system_user: !!o.isSystemUser, permissions: json(o.permissions), active: o.active ?? true,
    });
  },

  async controls(c, o: Control) {
    await upsertRow(c, 'controls', 'id', {
      id: o.id, code: o.code, name: o.name, description: o.description, process: o.process, type: o.type,
      automation: o.automation, frequency: o.frequency, design_effectiveness: o.designEffectiveness,
      operating_effectiveness: o.operatingEffectiveness, total_effectiveness: o.totalEffectiveness, status: o.status,
      owner: o.owner, last_tested: o.lastTested, evidence: o.evidence, sample_details: o.sampleDetails ?? null,
      last_tested_by: o.lastTestedBy ?? null, attachments: json(o.attachments ?? []),
    });
    await c.query('DELETE FROM control_test_executions WHERE control_id = $1', [o.id]);
    for (const t of o.testHistory ?? []) {
      await insertRow(c, 'control_test_executions', {
        id: t.id, control_id: o.id, test_date: t.testDate, tested_by: t.testedBy, tester_role: t.testerRole ?? null,
        test_method: t.testMethod, sample_size: t.sampleSize ?? null, deviations_identified: t.deviationsIdentified ?? 0,
        design_score: t.designScore, operating_score: t.operatingScore, total_score: t.totalScore, conclusion: t.conclusion,
        evidence_notes: t.evidenceNotes, attachments: json(t.attachments ?? []), ledger_hash: t.ledgerHash ?? null,
      });
    }
  },

  async risks(c, o: Risk) {
    await upsertRow(c, 'risks', 'id', {
      id: o.id, code: o.code, title: o.title, description: o.description, process: o.process, category: o.category,
      responsible: o.responsible, status: o.status, inherent_likelihood: o.inherentLikelihood, inherent_impact: o.inherentImpact,
      inherent_score: o.inherentScore, inherent_level: o.inherentLevel, financial_exposure_usd: o.financialExposureUSD,
      residual_likelihood: o.residualLikelihood, residual_impact: o.residualImpact, residual_score: o.residualScore,
      residual_level: o.residualLevel, residual_exposure_usd: o.residualExposureUSD, mitigation_plan: json(o.mitigationPlan),
      created_at: o.createdAt, last_review_date: o.lastReviewDate, acceptance: o.acceptance ? json(o.acceptance) : null,
    });
    await c.query('DELETE FROM risk_controls WHERE risk_id = $1', [o.id]);
    for (const cid of new Set(o.controlIds ?? [])) {
      await insertRow(c, 'risk_controls', { risk_id: o.id, control_id: cid });
    }
  },

  async providers(c, o: ServiceProvider) {
    await upsertRow(c, 'service_providers', 'id', {
      id: o.id, code: o.code, name: o.name, tax_id: o.taxId || null, service_description: o.serviceDescription,
      category: o.category, criticality: o.criticality, internal_owner: o.internalOwner || null,
      supported_processes: o.supportedProcesses ?? [], status: o.status, is_cloud: o.isCloud,
      cloud_model: o.isCloud ? (o.cloudModel ?? null) : null, data_location: o.dataLocation,
      data_country: o.dataLocation === 'Extranjero' ? (o.dataCountry || null) : null,
      handles_member_data: o.handlesMemberData, uses_subcontractors: o.usesSubcontractors,
      contract_start: dateOrNull(o.contractStart), contract_end: o.contractEnd, annual_cost_usd: o.annualCostUSD ?? 0,
      clauses: json(o.clauses), last_assessment_date: dateOrNull(o.lastAssessmentDate), assessment_score: o.assessmentScore ?? null,
      has_exit_plan: o.hasExitPlan, exit_plan_notes: o.exitPlanNotes ?? null, committed_rto_hours: o.committedRtoHours ?? null,
      ran207: o.ran207 ? json(o.ran207) : null,
    });
  },

  async 'regulatory-milestones'(c, o: RegulatoryMilestoneTemplate) {
    await upsertRow(c, 'regulatory_milestone_templates', 'id', {
      id: o.id, authority: o.authority, name: o.name, deadline_minutes: o.deadlineMinutes, enabled: o.enabled,
      basis: o.basis ?? 'conocimiento', due_on_close: !!o.dueOnClose,
    });
  },

  async flaws(c, o: OperationalFlaw) {
    await upsertRow(c, 'operational_flaws', 'id', {
      id: o.id, title: o.title, description: o.description, reported_by: o.reportedBy, process: o.process,
      severity: o.severity, reported_at: o.reportedAt, status: o.status, incident_type: o.incidentType ?? null,
      real_loss_amount_usd: o.realLossAmountUSD ?? 0, recovered_amount_usd: o.recoveredAmountUSD ?? 0,
      impacted_system_or_account: o.impactedSystemOrAccount ?? null, converted_risk_id: o.convertedRiskId ?? null,
      ai_suggested_category: o.aiSuggestedCategory ?? null, ai_suggested_controls: json(o.aiSuggestedControls ?? []),
      ai_analysis: o.aiAnalysis ? json(o.aiAnalysis) : null,
      business_line: o.businessLine ?? null, basel_category: o.baselCategory ?? null, basel_subcategory: o.baselSubcategory ?? null,
      occurrence_date: dateOrNull(o.occurrenceDate), discovery_date: dateOrNull(o.discoveryDate),
      accounting_date: dateOrNull(o.accountingDate), accounting_account: o.accountingAccount ?? null,
      credit_risk_boundary: !!o.creditRiskBoundary, provider_id: o.providerId ?? null,
      affected_asset_ids: o.affectedAssetIds ?? [], cyber: o.cyber ? json(o.cyber) : null,
      uf_value_clp: typeof o.ufValueClp === 'number' && o.ufValueClp > 0 ? o.ufValueClp : null, uf_date: dateOrNull(o.ufDate),
    });
    const r = o.regulatoryReport;
    if (!r) {
      await c.query('DELETE FROM regulatory_reports WHERE flaw_id = $1', [o.id]);
      return;
    }
    await upsertRow(c, 'regulatory_reports', 'flaw_id', {
      flaw_id: o.id, awareness_at: r.awarenessAt, occurred_at: r.occurredAt ?? null, details: r.details ? json(r.details) : null,
      reportable_to_cmf: r.reportableToCMF, reportable_to_anci: r.reportableToANCI,
      status: r.status, closed_at: r.closedAt ?? null,
    }, false);
    await c.query('DELETE FROM regulatory_submissions WHERE flaw_id = $1', [o.id]);
    for (const s of r.submissions) {
      await insertRow(c, 'regulatory_submissions', {
        flaw_id: o.id, milestone_id: s.milestoneId, submitted_at: s.submittedAt, submitted_by: s.submittedBy, folio: s.folio ?? null,
      });
    }
    await c.query('DELETE FROM regulatory_report_updates WHERE flaw_id = $1', [o.id]);
    for (const u of r.updates) {
      await insertRow(c, 'regulatory_report_updates', { flaw_id: o.id, at: u.at, author: u.by, note: u.note });
    }
  },

  async alerts(c, o: AnomalyAlert) {
    await upsertRow(c, 'anomaly_alerts', 'id', {
      id: o.id, code: o.code, title: o.title, description: o.description, kri_metric: o.kriMetric, threshold: o.threshold,
      current_value: o.currentValue, severity: o.severity, process: o.process, triggered_at: o.triggeredAt,
      status: o.status, escalated_to: o.escalatedTo,
    });
  },

  async audits(c, o: PeriodicAudit) {
    await upsertRow(c, 'periodic_audits', 'id', {
      id: o.id, code: o.code, title: o.title, type: o.type, period: o.period, lead_auditor: o.leadAuditor,
      scope: json(o.scope ?? []), execution_date: o.executionDate, status: o.status, compliance_score: o.complianceScore,
    });
    await c.query('DELETE FROM audit_findings WHERE audit_id = $1', [o.id]);
    for (const f of o.findings ?? []) {
      await insertRow(c, 'audit_findings', {
        id: f.id, audit_id: o.id, type: f.type, description: f.description, process: f.process,
        associated_risk_code: f.associatedRiskCode ?? null, corrective_action: f.correctiveAction, deadline: f.deadline,
        responsible: f.responsible, status: f.status,
      });
    }
  },

  async kris(c, o: KriDefinition) {
    await upsertRow(c, 'kri_definitions', 'id', {
      id: o.id, code: o.code, name: o.name, description: o.description, process: o.process, category: o.category,
      industry: o.industry, unit: o.unit, direction: o.direction, warning_threshold: o.warningThreshold,
      critical_threshold: o.criticalThreshold, current_value: o.currentValue, frequency: o.frequency, status: o.status,
      auto_trigger_alert: o.autoTriggerAlert, responsible: o.responsible, last_updated: o.lastUpdated,
      notification_preferences: o.notificationPreferences ? json(o.notificationPreferences) : null,
    });
  },

  async bia(c, o: BiaProcess) {
    await upsertRow(c, 'bia_processes', 'id', {
      id: o.id, name: o.name, owner: o.owner || null, business_line: o.businessLine, description: o.description || null,
      impact_financial: o.impact.financial, impact_members: o.impact.members, impact_regulatory: o.impact.regulatory,
      impact_reputational: o.impact.reputational, mtpd_hours: o.mtpdHours, rto_hours: o.rtoHours, rpo_hours: o.rpoHours,
      systems: o.systems ?? [], minimum_staff: o.minimumStaff ?? 0, alternate_site: o.alternateSite || null,
      last_review_date: o.lastReviewDate, ran209: o.ran209 ? json(o.ran209) : null,
    }, false);
    await c.query('DELETE FROM bia_process_providers WHERE bia_process_id = $1', [o.id]);
    for (const pid of new Set(o.providerIds ?? [])) {
      await insertRow(c, 'bia_process_providers', { bia_process_id: o.id, provider_id: pid });
    }
  },

  async plans(c, o: ContinuityPlan) {
    await upsertRow(c, 'continuity_plans', 'id', {
      id: o.id, code: o.code, name: o.name, type: o.type, owner: o.owner || null, version: o.version,
      approved_by: o.approvedBy || null, approval_date: dateOrNull(o.approvalDate), next_review_date: o.nextReviewDate, status: o.status,
      ran209: o.ran209 ? json(o.ran209) : null,
    }, false);
    await c.query('DELETE FROM continuity_plan_processes WHERE plan_id = $1', [o.id]);
    for (const bid of new Set(o.processIds ?? [])) {
      await insertRow(c, 'continuity_plan_processes', { plan_id: o.id, bia_process_id: bid });
    }
  },

  async 'info-assets'(c, o: InformationAsset) {
    await upsertRow(c, 'info_assets', 'id', {
      id: o.id, code: o.code, name: o.name, description: o.description || null, type: o.type, owner: o.owner,
      custodian: o.custodian || null, classification: o.classification, confidentiality: o.cia.confidentiality,
      integrity: o.cia.integrity, availability: o.cia.availability, handles_personal_data: o.handlesPersonalData,
      location: o.location, provider_id: o.providerId ?? null, bia_process_ids: o.biaProcessIds ?? [],
      last_review_date: o.lastReviewDate, critical_infrastructure: !!o.criticalInfrastructure,
    });
  },

  async vulnerabilities(c, o: Vulnerability) {
    await upsertRow(c, 'vulnerabilities', 'id', {
      id: o.id, code: o.code, title: o.title, description: o.description || null, asset_id: o.assetId, source: o.source,
      severity: o.severity, cvss_score: o.cvssScore ?? null, detected_date: o.detectedDate, due_date: o.dueDate,
      status: o.status, owner: o.owner || null, remediation: o.remediation || null, closed_date: dateOrNull(o.closedDate),
      acceptance: o.status === 'Riesgo aceptado' && o.acceptance ? json(o.acceptance) : null,
    });
  },

  async 'security-assessment'(c, o: SecurityAssessmentItem) {
    await upsertRow(c, 'security_assessment_items', 'id', {
      id: o.id, code: o.code, domain: o.domain, requirement: o.requirement, guidance: o.guidance || null, status: o.status,
      evidence: o.evidence || null, owner: o.owner || null, action_plan: o.actionPlan || null, due_date: dateOrNull(o.dueDate),
      assessed_by: o.assessedBy ?? null, assessed_date: dateOrNull(o.assessedDate),
    });
  },

  async 'continuity-tests'(c, o: ContinuityTest) {
    await upsertRow(c, 'continuity_tests', 'id', {
      id: o.id, plan_id: o.planId, test_date: o.date, type: o.type, scenario: o.scenario, bia_process_id: o.processId ?? null,
      achieved_rto_hours: o.achievedRtoHours ?? null, result: o.result, findings: o.findings || null, actions: o.actions || null,
      ran209: o.ran209 ? json(o.ran209) : null,
    }, false);
  },

  async compliance(c, o: ComplianceRequirement) {
    await upsertRow(c, 'compliance_requirements', 'id', {
      id: o.id, chapter: o.chapter, numeral: o.numeral, title: o.title, requirement: o.requirement, module: o.module ?? null,
      auto_check: o.autoCheck ?? null, frequency: o.frequency, status: o.status, evidence: o.evidence || null, owner: o.owner || null,
      action_plan: o.actionPlan || null, due_date: dateOrNull(o.dueDate), last_review_date: dateOrNull(o.lastReviewDate),
      reviewed_by: o.reviewedBy ?? null, control_ids: json(o.controlIds ?? []), norm_version: o.normVersion ?? null,
    });
  },

  async 'survey-campaigns'(c, o: SurveyCampaign) {
    await upsertRow(c, 'survey_campaigns', 'id', {
      id: o.id, code: o.code, title: o.title, kind: o.kind, description: o.description || null, scope: json(o.scope ?? []),
      norm_id: o.normId ?? null, respondent: o.respondent ?? null, custom_items: o.customItems ? json(o.customItems) : null,
      due_date: o.dueDate, status: o.status, launched_at: o.launchedAt ?? null, closed_at: o.closedAt ?? null,
      created_by: o.createdBy, created_at_iso: o.createdAt,
    });
  },

  async 'survey-responses'(c, o: SurveyResponse) {
    await upsertRow(c, 'survey_responses', 'id', {
      id: o.id, campaign_id: o.campaignId, subject: o.subject, respondent: o.respondent, items: json(o.items ?? []), answers: json(o.answers ?? {}),
      status: o.status, due_date: o.dueDate, started_at: o.startedAt ?? null, submitted_at: o.submittedAt ?? null,
      returned_note: o.returnedNote ?? null, reviewed_by: o.reviewedBy ?? null, reviewed_at: o.reviewedAt ?? null,
      review_note: o.reviewNote ?? null, applied: json(o.applied ?? []),
    });
  },

  async 'action-plans'(c, o: ActionPlan) {
    await upsertRow(c, 'action_plans', 'id', {
      id: o.id, code: o.code, title: o.title, description: o.description || null, source_type: o.sourceType, source_id: o.sourceId ?? null,
      source_label: o.sourceLabel ?? '', process: o.process || null, owner: o.owner, priority: o.priority, start_date: dateOrNull(o.startDate),
      due_date: o.dueDate, original_due_date: o.originalDueDate || o.dueDate, status: o.status, progress_pct: Math.round(o.progressPct ?? 0),
      tasks: json(o.tasks ?? []), updates: json(o.updates ?? []), reschedules: json(o.reschedules ?? []), closure: o.closure ? json(o.closure) : null,
      rejections: json(o.rejections ?? []), cancel_reason: o.cancelReason || null, created_by: o.createdBy, created_at_iso: o.createdAt,
      closed_at: dateOrNull(o.closedAt),
    });
  },

  async documents(c, o: ControlledDocument) {
    await upsertRow(c, 'controlled_documents', 'id', {
      id: o.id, code: o.code, title: o.title.slice(0, 300), doc_type: o.type, description: o.description ?? '', owner: o.owner ?? '',
      classification: o.classification, review_months: o.reviewMonths || 12, audience_role_ids: json(o.audienceRoleIds ?? []),
      requirement_ids: json(o.requirementIds ?? []), processes: json(o.processes ?? []), versions: json(o.versions ?? []),
      current_version_id: o.currentVersionId ?? null, next_review_date: dateOrNull(o.nextReviewDate), acknowledgments: json(o.acknowledgments ?? []),
      status: o.status, obsolete_reason: o.obsoleteReason ?? null, created_by: o.createdBy ?? '', created_at: o.createdAt,
    });
  },

  async 'crisis-scenarios'(c, o: CrisisScenario) {
    await upsertRow(c, 'crisis_scenarios', 'id', {
      id: o.id, code: o.code, name: o.name.slice(0, 255), category: o.category, description: o.description ?? '',
      likelihood: o.likelihood, impact: o.impact, activation_criteria: o.activationCriteria ?? '', initial_actions: json(o.initialActions ?? []),
      communications: o.communications ?? '', affected_process_ids: json(o.affectedProcessIds ?? []), plan_ids: json(o.planIds ?? []),
      owner: o.owner ?? '', last_review_date: dateOrNull(o.lastReviewDate), active: o.active !== false,
    });
  },

  async 'crisis-events'(c, o: CrisisEvent) {
    await upsertRow(c, 'crisis_events', 'id', {
      id: o.id, code: o.code, title: o.title.slice(0, 255), mode: o.mode, level: o.level, status: o.status, scenario_id: o.scenarioId ?? null,
      flaw_id: o.flawId ?? null, planned_date: dateOrNull(o.plannedDate), declared_at: o.declaredAt ?? null, declared_by: o.declaredBy ?? null,
      stabilized_at: o.stabilizedAt ?? null, closed_at: o.closedAt ?? null, closed_by: o.closedBy ?? null,
      affected_process_ids: json(o.affectedProcessIds ?? []), activated_plan_ids: json(o.activatedPlanIds ?? []), log: json(o.log ?? []),
      tasks: json(o.tasks ?? []), communications: json(o.communications ?? []), closing_summary: o.closingSummary ?? null, lessons: o.lessons ?? null,
      test_id: o.testId ?? null, created_by: o.createdBy ?? '', created_at: o.createdAt,
    });
  },

  async approvals(c, o: ApprovalRequest) {
    await upsertRow(c, 'approval_requests', 'id', {
      id: o.id, code: o.code, kind: o.kind, target_entity: o.targetEntity, target_id: o.targetId, target_label: o.targetLabel.slice(0, 300),
      justification: o.justification, payload: json(o.payload ?? {}), requested_by: o.requestedBy, requested_at: o.requestedAt,
      steps: json(o.steps ?? []), current_step: o.currentStep ?? 0, status: o.status, closed_at: o.closedAt ?? null, cancel_reason: o.cancelReason ?? null,
    });
  },

  async norms(c, o: ComplianceNorm) {
    await upsertRow(c, 'compliance_norms', 'id', {
      id: o.id, code: o.code, title: o.title, kind: o.kind, issuer: o.issuer || null, source: o.source || null, url: o.url || null,
      version: o.version, effective_date: dateOrNull(o.effectiveDate), status: o.status, applicability: o.applicability,
      applicability_note: o.applicabilityNote || null, owner: o.owner || null, notes: o.notes || null, versions: json(o.versions ?? []),
      sort_order: Number.isFinite(o.order) ? o.order : 100, referential: o.referential === true,
    });
  },

  async 'security-tests'(c, o: SecurityTest) {
    await upsertRow(c, 'security_tests', 'id', {
      id: o.id, test_date: o.date, type: o.type, scope: o.scope, executed_by: o.executedBy || null, result: o.result,
      findings: o.findings || null, reported_to_board_date: dateOrNull(o.reportedToBoardDate),
    });
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Actualiza el nombre del proceso en todo lo que lo referencia. */
async function renameProcessReferences(c: DbClient, oldName: string, newName: string) {
  for (const table of ['risks', 'controls', 'operational_flaws', 'anomaly_alerts', 'kri_definitions', 'audit_findings']) {
    await c.query(`UPDATE ${table} SET process = $2 WHERE process = $1`, [oldName, newName]);
  }
  // Listas guardadas como arreglo (proveedores) o JSON (alcance de auditorías): se actualizan en el servidor
  // para que funcione igual en PostgreSQL y SQLite.
  const providers = await c.query('SELECT id, supported_processes FROM service_providers');
  for (const r of providers.rows) {
    const list: string[] = r.supported_processes ?? [];
    if (list.includes(oldName)) {
      await c.query('UPDATE service_providers SET supported_processes = $2 WHERE id = $1', [r.id, list.map(x => (x === oldName ? newName : x))]);
    }
  }
  const audits = await c.query('SELECT id, scope FROM periodic_audits');
  for (const r of audits.rows) {
    const list: unknown[] = Array.isArray(r.scope) ? r.scope : [];
    if (list.includes(oldName)) {
      await c.query('UPDATE periodic_audits SET scope = $2 WHERE id = $1', [r.id, json(list.map(x => (x === oldName ? newName : x)))]);
    }
  }
}

/** Cuántos registros usan un proceso o un área (no se permite eliminarlos si están en uso). */
export async function countReferences(entity: 'processes' | 'areas', id: string): Promise<number> {
  const pool = getPool()!;
  if (entity === 'areas') {
    const r = await pool.query(
      `SELECT (SELECT count(*) FROM business_processes WHERE area_id = $1)
            + (SELECT count(*) FROM organizational_roles r JOIN org_areas a ON a.id = $1 WHERE r.department = a.name)
            + (SELECT count(*) FROM user_profiles u JOIN org_areas a ON a.id = $1 WHERE u.department = a.name) AS n`, [id]);
    return Number(r.rows[0].n);
  }
  const p = await pool.query('SELECT name FROM business_processes WHERE id = $1', [id]);
  if (!p.rows.length) return 0;
  const name = p.rows[0].name;
  const r = await pool.query(
    `SELECT (SELECT count(*) FROM risks WHERE process = $1) + (SELECT count(*) FROM controls WHERE process = $1)
          + (SELECT count(*) FROM operational_flaws WHERE process = $1) + (SELECT count(*) FROM kri_definitions WHERE process = $1)
          + (SELECT count(*) FROM anomaly_alerts WHERE process = $1) + (SELECT count(*) FROM audit_findings WHERE process = $1) AS n`, [name]);
  return Number(r.rows[0].n);
}

const TABLE_BY_ENTITY: Record<EntityName, { table: string; pk: string }> = {
  areas: { table: 'org_areas', pk: 'id' },
  processes: { table: 'business_processes', pk: 'id' },
  roles: { table: 'organizational_roles', pk: 'id' },
  users: { table: 'user_profiles', pk: 'id' },
  controls: { table: 'controls', pk: 'id' },
  risks: { table: 'risks', pk: 'id' },
  providers: { table: 'service_providers', pk: 'id' },
  'regulatory-milestones': { table: 'regulatory_milestone_templates', pk: 'id' },
  flaws: { table: 'operational_flaws', pk: 'id' },
  alerts: { table: 'anomaly_alerts', pk: 'id' },
  audits: { table: 'periodic_audits', pk: 'id' },
  kris: { table: 'kri_definitions', pk: 'id' },
  bia: { table: 'bia_processes', pk: 'id' },
  plans: { table: 'continuity_plans', pk: 'id' },
  'continuity-tests': { table: 'continuity_tests', pk: 'id' },
  'crisis-scenarios': { table: 'crisis_scenarios', pk: 'id' },
  'crisis-events': { table: 'crisis_events', pk: 'id' },
  'info-assets': { table: 'info_assets', pk: 'id' },
  vulnerabilities: { table: 'vulnerabilities', pk: 'id' },
  'security-assessment': { table: 'security_assessment_items', pk: 'id' },
  norms: { table: 'compliance_norms', pk: 'id' },
  'action-plans': { table: 'action_plans', pk: 'id' },
  'survey-campaigns': { table: 'survey_campaigns', pk: 'id' },
  'survey-responses': { table: 'survey_responses', pk: 'id' },
  approvals: { table: 'approval_requests', pk: 'id' },
  documents: { table: 'controlled_documents', pk: 'id' },
  compliance: { table: 'compliance_requirements', pk: 'id' },
  'security-tests': { table: 'security_tests', pk: 'id' },
};

export function isEntity(name: string): name is EntityName {
  return (ENTITY_ORDER as readonly string[]).includes(name);
}

// -----------------------------------------------------------------------------
// Versiones de registros (edición simultánea)
// -----------------------------------------------------------------------------

/** Otra persona guardó el registro después de la versión que se editó. */
export class VersionConflictError extends Error {
  constructor(public current: number, public updatedBy: string | null, public updatedAt: string | null) {
    super('Conflicto de versión');
  }
}

/** Sube la versión de un registro y devuelve la nueva. */
async function bumpVersion(c: DbClient, entity: string, id: string, by: string | null): Promise<number> {
  await c.query(
    `INSERT INTO record_versions (entity, id, version, updated_at, updated_by) VALUES ($1, $2, 1, $3, $4)
     ON CONFLICT (entity, id) DO UPDATE SET version = record_versions.version + 1, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    [entity, id, new Date().toISOString(), by]);
  const r = await c.query('SELECT version FROM record_versions WHERE entity = $1 AND id = $2', [entity, id]);
  return Number(r.rows[0]?.version ?? 1);
}

/** Sube la versión de todos los registros de una entidad (cambios masivos hechos en el servidor). */
export async function bumpAllVersions(c: DbClient, entity: EntityName, by: string | null): Promise<void> {
  const { table, pk } = TABLE_BY_ENTITY[entity];
  await c.query(
    `INSERT INTO record_versions (entity, id, version, updated_at, updated_by) SELECT $1, ${pk}, 1, $2, $3 FROM ${table} WHERE TRUE
     ON CONFLICT (entity, id) DO UPDATE SET version = record_versions.version + 1, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
    [entity, new Date().toISOString(), by]);
}

/**
 * Comprueba que nadie haya guardado el registro desde la versión `base` y la reserva
 * (compara y sube en la misma operación, dentro de la transacción). Sin `base` no compara.
 */
async function claimVersion(c: DbClient, entity: string, id: string, base: number | null, by: string | null): Promise<number> {
  if (base === null) return bumpVersion(c, entity, id, by);
  const now = new Date().toISOString();
  const r = base === 0
    ? await c.query(
      `INSERT INTO record_versions (entity, id, version, updated_at, updated_by) VALUES ($1, $2, 1, $3, $4) ON CONFLICT (entity, id) DO NOTHING`,
      [entity, id, now, by])
    : await c.query(
      `UPDATE record_versions SET version = version + 1, updated_at = $4, updated_by = $5 WHERE entity = $1 AND id = $2 AND version = $3`,
      [entity, id, base, now, by]);
  if (!r.rowCount) {
    const cur = await c.query('SELECT version, updated_at, updated_by FROM record_versions WHERE entity = $1 AND id = $2', [entity, id]);
    const row = cur.rows[0];
    throw new VersionConflictError(Number(row?.version ?? 0), row?.updated_by ?? null, row ? isoOpt(row.updated_at) ?? null : null);
  }
  return base + 1;
}

export async function getVersion(entity: string, id: string): Promise<number> {
  const r = await getPool()!.query('SELECT version FROM record_versions WHERE entity = $1 AND id = $2', [entity, id]);
  return Number(r.rows[0]?.version ?? 0);
}

export async function saveEntity<T extends { id: string }>(entity: EntityName, obj: T, client?: DbClient, by: string | null = null): Promise<number> {
  const run = async (c: DbClient) => {
    await savers[entity](c, obj);
    return bumpVersion(c, entity, obj.id, by);
  };
  return client ? run(client) : withTransaction(run);
}

/** Guarda si nadie lo cambió desde `base` (si no, VersionConflictError). Devuelve la nueva versión. */
export async function saveEntityChecked<T extends { id: string }>(entity: EntityName, obj: T, base: number | null, by: string | null): Promise<number> {
  return withTransaction(async c => {
    const v = await claimVersion(c, entity, obj.id, base, by);
    await savers[entity](c, obj);
    return v;
  });
}

export async function entityExists(entity: EntityName, id: string): Promise<boolean> {
  const { table, pk } = TABLE_BY_ENTITY[entity];
  const r = await getPool()!.query(`SELECT 1 AS x FROM ${table} WHERE ${pk} = $1`, [id]);
  return r.rows.length > 0;
}

export async function deleteEntity(entity: EntityName, id: string): Promise<void> {
  const { table, pk } = TABLE_BY_ENTITY[entity];
  await withTransaction(async c => {
    // Una norma se elimina junto con sus requisitos (no hay clave foránea: "chapter" es texto).
    if (entity === 'norms') await c.query('DELETE FROM compliance_requirements WHERE chapter = $1', [id]);
    await c.query('DELETE FROM record_versions WHERE entity = $1 AND id = $2', [entity, id]);
    return c.query(`DELETE FROM ${table} WHERE ${pk} = $1`, [id]);
  });
}

/**
 * Guarda una solicitud de aprobación y, si quedó aprobada, el registro de origen con el
 * cambio ya aplicado, en una sola transacción.
 */
export async function saveApprovalWithEffect(
  req: ApprovalRequest, effect: { entity: EntityName; obj: { id: string } } | null, base: number | null = null, by: string | null = null,
): Promise<{ version: number; effectVersion?: number }> {
  return withTransaction(async c => {
    const version = await claimVersion(c, 'approvals', req.id, base, by);
    await savers.approvals(c, req);
    if (!effect) return { version };
    await savers[effect.entity](c, effect.obj);
    return { version, effectVersion: await bumpVersion(c, effect.entity, effect.obj.id, by) };
  });
}

/**
 * Carga masiva: guarda todos los registros y el bloque de bitácora en una sola transacción
 * (todo o nada). `check` corre dentro de la transacción después de guardar (p. ej. que
 * quede un administrador activo); si devuelve un mensaje, se deshace todo.
 */
export async function saveBulk(
  entity: EntityName, records: { id: string }[], ledger: (created: number, updated: number) => LedgerInput, ip: string,
  check?: (c: DbClient) => Promise<string | null>,
): Promise<{ created: number; updated: number; entry: AuditLogEntry }> {
  const { table, pk } = TABLE_BY_ENTITY[entity];
  const ledgerBy = ledger(0, 0).userName;
  return withTransaction(async c => {
    let created = 0;
    for (const r of records) {
      const exists = await c.query(`SELECT 1 AS x FROM ${table} WHERE ${pk} = $1`, [r.id]);
      if (!exists.rows.length) created++;
      await savers[entity](c, r);
      await bumpVersion(c, entity, r.id, ledgerBy);
    }
    const problem = check ? await check(c) : null;
    if (problem) throw Object.assign(new Error(problem), { status: 409 });
    const entry = await appendLedger(ledger(created, records.length - created), ip, c);
    return { created, updated: records.length - created, entry };
  });
}

export async function saveSetting(key: SettingKey, value: unknown, client?: DbClient): Promise<void> {
  const sql = `INSERT INTO system_settings (key, value) VALUES ($1, $2)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`;
  await (client ?? getPool()!).query(sql, [key, json(value)]);
}

// -----------------------------------------------------------------------------
// Bitácora inalterable: el servidor asigna bloque, hora y hash
// -----------------------------------------------------------------------------

const GENESIS_HASH = '0'.repeat(64);

/** Mismo formato que src/app/utils/crypto-ledger.ts (SHA-256 del payload). */
export function computeLedgerHash(
  blockNumber: number, timestamp: string, user: string, action: string, entityCode: string, details: string, previousHash: string
): string {
  const payload = `${blockNumber}|${timestamp}|${user}|${action}|${entityCode}|${details}|${previousHash}`;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export type LedgerInput = Pick<AuditLogEntry, 'id' | 'userName' | 'userRole' | 'action' | 'entityType' | 'entityCode' | 'details'>;

/**
 * Agrega un bloque encadenado al último bloque de la base. Un bloqueo asesor
 * serializa las escrituras concurrentes para que la cadena no se bifurque.
 * Si el bloque ya existe (reintento), devuelve el existente.
 */
export async function appendLedger(input: LedgerInput, ipAddress: string, client?: DbClient): Promise<AuditLogEntry> {
  const run = async (c: DbClient) => {
    await c.query('SELECT pg_advisory_xact_lock(727002)');
    const existing = await c.query('SELECT * FROM crypto_audit_ledger WHERE id = $1', [input.id]);
    if (existing.rows.length) return ledgerFromRow(existing.rows[0]);
    const last = await c.query('SELECT block_number, hash FROM crypto_audit_ledger ORDER BY block_number DESC LIMIT 1');
    const blockNumber = last.rows.length ? Number(last.rows[0].block_number) + 1 : 1;
    const previousHash = last.rows.length ? last.rows[0].hash : GENESIS_HASH;
    const timestamp = new Date().toISOString();
    const hash = computeLedgerHash(blockNumber, timestamp, input.userName, input.action, input.entityCode, input.details, previousHash);
    const entry: AuditLogEntry = { ...input, blockNumber, timestamp, ipAddress, previousHash, hash };
    await insertRow(c, 'crypto_audit_ledger', {
      id: entry.id, block_number: blockNumber, timestamp, user_name: entry.userName, user_role: entry.userRole,
      action: entry.action, entity_type: entry.entityType, entity_code: entry.entityCode, details: entry.details,
      ip_address: ipAddress, previous_hash: previousHash, hash,
    });
    return entry;
  };
  return client ? run(client) : withTransaction(run);
}

/** Inserta bloques ya formados (solo para cargar datos de ejemplo). */
export async function importLedgerBlock(c: DbClient, e: AuditLogEntry): Promise<void> {
  await c.query(
    `INSERT INTO crypto_audit_ledger (id, block_number, timestamp, user_name, user_role, action, entity_type, entity_code, details, ip_address, previous_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
    [e.id, e.blockNumber, e.timestamp, e.userName, e.userRole, e.action, e.entityType, e.entityCode, e.details, e.ipAddress, e.previousHash, e.hash]
  );
}

export { withTransaction };

// -----------------------------------------------------------------------------
// Cambio de moneda de registro con conversión de montos
// -----------------------------------------------------------------------------

export interface CurrencyConversionResult { from: string; to: string; rate: number; risks: number; flaws: number; providers: number }

/**
 * Convierte todos los montos guardados a la nueva moneda en una sola transacción:
 * exposición de riesgos y presupuesto de sus planes, pérdidas y recuperos, costo de proveedores,
 * umbral de la base de pérdidas y límites de pérdida del apetito. `rate` = pesos por dólar.
 */
export async function convertCurrency(to: 'CLP' | 'USD', rate: number, actor: { name: string; role: string }, ip: string): Promise<CurrencyConversionResult> {
  return withTransaction(async c => {
    await c.query('SELECT pg_advisory_xact_lock(727004)');
    const gp = await c.query(`SELECT value FROM system_settings WHERE key = 'general_parameters'`);
    const params = (gp.rows[0]?.value ?? {}) as Record<string, unknown>;
    const from = params['currency'] === 'CLP' ? 'CLP' : 'USD';
    if (from === to) throw Object.assign(new Error(`Los montos ya están en ${to}.`), { status: 400 });
    const f = to === 'CLP' ? rate : 1 / rate;
    const d = to === 'CLP' ? 0 : 2;

    const conv = (v: unknown) => Number((Number(v ?? 0) * f).toFixed(d));

    const riskRows = (await c.query('SELECT id, financial_exposure_usd, residual_exposure_usd, mitigation_plan FROM risks')).rows;
    for (const r of riskRows) {
      const plan = r.mitigation_plan && typeof r.mitigation_plan === 'object' ? { ...r.mitigation_plan } : r.mitigation_plan;
      if (plan && typeof plan.budgetUSD === 'number') plan.budgetUSD = conv(plan.budgetUSD);
      await c.query('UPDATE risks SET financial_exposure_usd = $2, residual_exposure_usd = $3, mitigation_plan = $4 WHERE id = $1',
        [r.id, conv(r.financial_exposure_usd), conv(r.residual_exposure_usd), json(plan)]);
    }
    const flawRows = (await c.query('SELECT id, real_loss_amount_usd, recovered_amount_usd FROM operational_flaws')).rows;
    for (const r of flawRows) {
      await c.query('UPDATE operational_flaws SET real_loss_amount_usd = $2, recovered_amount_usd = $3 WHERE id = $1',
        [r.id, conv(r.real_loss_amount_usd), conv(r.recovered_amount_usd)]);
    }
    const providerRows = (await c.query('SELECT id, annual_cost_usd FROM service_providers')).rows;
    for (const r of providerRows) {
      await c.query('UPDATE service_providers SET annual_cost_usd = $2 WHERE id = $1', [r.id, conv(r.annual_cost_usd)]);
    }
    const th = await c.query(`SELECT value FROM system_settings WHERE key = 'loss_registration_threshold_usd'`);
    if (typeof th.rows[0]?.value === 'number') await saveSetting('loss_registration_threshold_usd', conv(th.rows[0].value), c);
    const risks = { rowCount: riskRows.length }, flaws = { rowCount: flawRows.length }, providers = { rowCount: providerRows.length };

    const ap = await c.query(`SELECT value FROM system_settings WHERE key = 'risk_appetite'`);
    if (ap.rows[0]?.value && Array.isArray(ap.rows[0].value.limits)) {
      const v = ap.rows[0].value;
      v.limits = v.limits.map((l: { annualLossLimit?: number }) => (typeof l.annualLossLimit === 'number'
        ? { ...l, annualLossLimit: Number((l.annualLossLimit * f).toFixed(d)) } : l));
      await saveSetting('risk_appetite', v, c);
    }
    await saveSetting('general_parameters', { ...params, currency: to }, c);
    for (const e of ['risks', 'flaws', 'providers'] as const) await bumpAllVersions(c, e, actor.name);

    await appendLedger({
      id: `log-currency-${Date.now()}`, userName: actor.name, userRole: actor.role, action: 'CONFIGURACIÓN_PARÁMETROS',
      entityType: 'Mantenedor', entityCode: 'MONEDA',
      details: `Moneda de registro ${from} → ${to} con conversión de montos (tipo de cambio ${rate} CLP/USD): ${risks.rowCount} riesgos, ${flaws.rowCount} incidentes, ${providers.rowCount} proveedores, umbral de pérdidas y límites de apetito.`,
    }, ip, c);
    return { from, to, rate, risks: risks.rowCount ?? 0, flaws: flaws.rowCount ?? 0, providers: providers.rowCount ?? 0 };
  });
}

// -----------------------------------------------------------------------------
// Notificaciones
// -----------------------------------------------------------------------------

function notificationFromRow(r: Row): AppNotification {
  return {
    id: r.id, recipient: r.recipient, recipientName: r.recipient_name ?? '', category: r.category, severity: r.severity, title: r.title,
    body: r.body ?? '', tab: opt(r.tab), entityType: opt(r.entity_type), entityId: opt(r.entity_id), createdAt: r.created_at,
    readAt: opt(r.read_at), emailStatus: r.email_status, emailError: opt(r.email_error), emailSentAt: opt(r.email_sent_at), dedupeKey: r.dedupe_key,
  };
}

/** Inserta avisos nuevos; los que ya existen (misma clave) se ignoran. Devuelve los insertados. */
export async function insertNotifications(drafts: NotificationDraft[], now = new Date().toISOString()): Promise<AppNotification[]> {
  const pool = getPool();
  if (!pool || !drafts.length) return [];
  const created: AppNotification[] = [];
  for (const d of drafts) {
    const n: AppNotification = { ...d, id: `ntf-${randomUUID()}`, createdAt: now, emailStatus: 'pendiente', dedupeKey: d.dedupeKey.slice(0, 400) };
    const r = await pool.query(
      `INSERT INTO notifications (id, recipient, recipient_name, category, severity, title, body, tab, entity_type, entity_id, created_at, email_status, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pendiente', $12)
       ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
      [n.id, n.recipient, n.recipientName, n.category, n.severity, n.title.slice(0, 300), n.body, n.tab ?? null, n.entityType ?? null,
        n.entityId ?? null, n.createdAt, n.dedupeKey]
    );
    if (r.rows.length) created.push(n);
  }
  return created;
}

export async function listNotifications(recipient: string, limit = 100): Promise<{ items: AppNotification[]; unread: number }> {
  const pool = getPool()!;
  const email = recipient.toLowerCase();
  const [items, unread] = await Promise.all([
    pool.query(`SELECT * FROM notifications WHERE recipient = $1 ORDER BY created_at DESC, id DESC LIMIT ${Math.max(1, Math.min(500, limit))}`, [email]),
    pool.query('SELECT count(*) AS n FROM notifications WHERE recipient = $1 AND read_at IS NULL', [email]),
  ]);
  return { items: items.rows.map(notificationFromRow), unread: Number(unread.rows[0]?.n ?? 0) };
}

export async function markNotificationsRead(recipient: string, ids: string[] | 'all', at = new Date().toISOString()): Promise<void> {
  const pool = getPool()!;
  const email = recipient.toLowerCase();
  if (ids === 'all') {
    await pool.query('UPDATE notifications SET read_at = $2 WHERE recipient = $1 AND read_at IS NULL', [email, at]);
    return;
  }
  for (const id of ids.slice(0, 500)) {
    await pool.query('UPDATE notifications SET read_at = $3 WHERE recipient = $1 AND id = $2 AND read_at IS NULL', [email, id, at]);
  }
}

/** Avisos cuyo correo falta enviar (o que van al resumen diario). */
export async function notificationsByEmailStatus(status: 'pendiente' | 'resumen', limit = 500): Promise<AppNotification[]> {
  const r = await getPool()!.query(`SELECT * FROM notifications WHERE email_status = $1 ORDER BY created_at, id LIMIT ${limit}`, [status]);
  return r.rows.map(notificationFromRow);
}

export async function setEmailStatus(ids: string[], status: 'enviado' | 'resumen' | 'omitido' | 'error', error?: string, at = new Date().toISOString()): Promise<void> {
  const pool = getPool()!;
  for (const id of ids) {
    await pool.query('UPDATE notifications SET email_status = $2, email_error = $3, email_sent_at = $4 WHERE id = $1',
      [id, status, error ? error.slice(0, 500) : null, status === 'enviado' ? at : null]);
  }
}

/** Últimos avisos de todas las personas (registro de envíos para administradores). */
export async function notificationOutbox(limit = 200): Promise<AppNotification[]> {
  const r = await getPool()!.query(`SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT ${Math.max(1, Math.min(1000, limit))}`);
  return r.rows.map(notificationFromRow);
}

export async function getNotificationPreferences(): Promise<Map<string, NotificationPreference>> {
  const r = await getPool()!.query('SELECT * FROM notification_preferences');
  return new Map(r.rows.map((x: Row) => [String(x.email).toLowerCase(), { emailMode: x.email_mode, muted: Array.isArray(x.muted) ? x.muted : [] }]));
}

export async function saveNotificationPreference(email: string, p: NotificationPreference): Promise<void> {
  await getPool()!.query(
    `INSERT INTO notification_preferences (email, email_mode, muted) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET email_mode = EXCLUDED.email_mode, muted = EXCLUDED.muted, updated_at = CURRENT_TIMESTAMP`,
    [email.toLowerCase(), p.emailMode, json(p.muted ?? [])]
  );
}

/** Lee un ajuste de system_settings (o undefined). */
export async function getSetting(key: string): Promise<unknown> {
  const r = await getPool()!.query('SELECT value FROM system_settings WHERE key = $1', [key]);
  return r.rows[0]?.value;
}

/** Guarda un ajuste interno (no expuesto en SETTING_KEYS). */
export async function setInternalSetting(key: string, value: unknown): Promise<void> {
  await getPool()!.query(
    `INSERT INTO system_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [key, json(value)]
  );
}

// -----------------------------------------------------------------------------
// Evidencias
// -----------------------------------------------------------------------------

const EVIDENCE_COLUMNS = 'id, entity_type, entity_id, context, file_name, mime_type, size_bytes, sha256, description, uploaded_by, uploaded_by_email, uploaded_at, deleted_at, deleted_by, delete_reason';

function evidenceFromRow(r: Row): EvidenceFile {
  return {
    id: r.id, entityType: r.entity_type, entityId: r.entity_id, context: opt(r.context), fileName: r.file_name, mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes), sha256: String(r.sha256).trim(), description: opt(r.description), uploadedBy: r.uploaded_by,
    uploadedByEmail: opt(r.uploaded_by_email), uploadedAt: r.uploaded_at, deletedAt: opt(r.deleted_at), deletedBy: opt(r.deleted_by),
    deleteReason: opt(r.delete_reason),
  };
}

export async function getEvidence(id: string): Promise<EvidenceFile | null> {
  const r = await getPool()!.query(`SELECT ${EVIDENCE_COLUMNS} FROM evidence_files WHERE id = $1`, [id]);
  return r.rows[0] ? evidenceFromRow(r.rows[0]) : null;
}

export async function getEvidenceContent(id: string): Promise<{ file: EvidenceFile; content: Buffer } | null> {
  const r = await getPool()!.query(`SELECT ${EVIDENCE_COLUMNS}, content FROM evidence_files WHERE id = $1`, [id]);
  if (!r.rows[0]) return null;
  const c = r.rows[0].content;
  return { file: evidenceFromRow(r.rows[0]), content: Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array) };
}

/** Guarda el archivo y su bloque de bitácora en una sola transacción. */
export async function insertEvidence(f: EvidenceFile, content: Buffer, ledger: LedgerInput, ip: string): Promise<AuditLogEntry> {
  return withTransaction(async c => {
    await insertRow(c, 'evidence_files', {
      id: f.id, entity_type: f.entityType, entity_id: f.entityId, context: f.context ?? null, file_name: f.fileName, mime_type: f.mimeType,
      size_bytes: f.sizeBytes, sha256: f.sha256, description: f.description ?? null, uploaded_by: f.uploadedBy,
      uploaded_by_email: f.uploadedByEmail ?? null, uploaded_at: f.uploadedAt, content,
    });
    return appendLedger(ledger, ip, c);
  });
}

/** Baja lógica (el contenido se conserva) con su bloque de bitácora. */
export async function markEvidenceDeleted(id: string, by: string, reason: string, at: string, ledger: LedgerInput, ip: string): Promise<AuditLogEntry> {
  return withTransaction(async c => {
    await c.query('UPDATE evidence_files SET deleted_at = $2, deleted_by = $3, delete_reason = $4 WHERE id = $1 AND deleted_at IS NULL', [id, at, by, reason]);
    return appendLedger(ledger, ip, c);
  });
}
