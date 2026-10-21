import { createHash } from 'node:crypto';
import { PoolClient } from 'pg';
import { getPool } from './db';
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

/**
 * Repositorio PostgreSQL: convierte los objetos que usa la aplicación en filas
 * de las tablas relacionales (y viceversa). Cada guardado reemplaza el objeto
 * completo, incluidas sus tablas hijas, dentro de una transacción.
 */

type Row = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Entidades que la API permite guardar, en orden de dependencias (claves foráneas). */
export const ENTITY_ORDER = [
  'roles', 'users', 'controls', 'risks', 'providers', 'regulatory-milestones',
  'flaws', 'alerts', 'audits', 'kris', 'bia', 'plans', 'continuity-tests',
  'info-assets', 'vulnerabilities', 'security-assessment',
] as const;
export type EntityName = typeof ENTITY_ORDER[number];

export const SETTING_KEYS = ['current_industry', 'global_notification_preferences', 'loss_registration_threshold_usd'] as const;
export type SettingKey = typeof SETTING_KEYS[number];

export interface BootstrapData {
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
  ledger: AuditLogEntry[];
  settings: Partial<Record<SettingKey, unknown>>;
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

async function withTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  if (!pool) throw new Error('Base de datos no configurada');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** INSERT ... ON CONFLICT (pk) DO UPDATE con todas las columnas indicadas. */
async function upsertRow(c: PoolClient, table: string, pk: string, data: Row, touchUpdatedAt = true) {
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

async function insertRow(c: PoolClient, table: string, data: Row) {
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
    infoAssets, vulns, secItems,
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
  ]);

  const testsBy = groupBy(tests, 'control_id');
  const rcBy = groupBy(riskControls, 'risk_id');
  const reportBy = new Map(regReports.map(r => [r.flaw_id, r]));
  const subsBy = groupBy(regSubs, 'flaw_id');
  const updBy = groupBy(regUpdates, 'flaw_id');
  const findingsBy = groupBy(findings, 'audit_id');
  const biaProvBy = groupBy(biaProviders, 'bia_process_id');
  const planProcBy = groupBy(planProcesses, 'plan_id');

  return {
    roles: roles.map(roleFromRow),
    users: users.map(userFromRow),
    controls: controls.map(r => controlFromRow(r, testsBy.get(r.id) ?? [])),
    risks: risks.map(r => riskFromRow(r, (rcBy.get(r.id) ?? []).map(x => x.control_id))),
    providers: providers.map(providerFromRow),
    regulatoryMilestones: milestones.map(m => ({
      id: m.id, authority: m.authority, name: m.name, deadlineMinutes: m.deadline_minutes, enabled: m.enabled,
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
    committedRtoHours: opt(r.committed_rto_hours),
  };
}

function flawFromRow(r: Row, rep: Row | undefined, subs: Row[], upds: Row[]): OperationalFlaw {
  const report: RegulatoryReport | undefined = rep && {
    awarenessAt: iso(rep.awareness_at),
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
    regulatoryReport: report, providerId: opt(r.provider_id), affectedAssetIds: r.affected_asset_ids ?? [],
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
    minimumStaff: r.minimum_staff, alternateSite: r.alternate_site ?? '', lastReviewDate: r.last_review_date,
  };
}

function planFromRow(r: Row, processIds: string[]): ContinuityPlan {
  return {
    id: r.id, code: r.code, name: r.name, type: r.type, processIds, owner: r.owner ?? '', version: r.version,
    approvedBy: r.approved_by ?? '', approvalDate: r.approval_date ?? '', nextReviewDate: r.next_review_date, status: r.status,
  };
}

function continuityTestFromRow(r: Row): ContinuityTest {
  return {
    id: r.id, planId: r.plan_id, date: r.test_date, type: r.type, scenario: r.scenario, processId: opt(r.bia_process_id),
    achievedRtoHours: opt(r.achieved_rto_hours), result: r.result, findings: r.findings ?? '', actions: r.actions ?? '',
  };
}

function assetFromRow(r: Row): InformationAsset {
  return {
    id: r.id, code: r.code, name: r.name, description: r.description ?? '', type: r.type, owner: r.owner,
    custodian: r.custodian ?? '', classification: r.classification,
    cia: { confidentiality: r.confidentiality, integrity: r.integrity, availability: r.availability },
    handlesPersonalData: r.handles_personal_data, location: r.location, providerId: opt(r.provider_id),
    biaProcessIds: r.bia_process_ids ?? [], lastReviewDate: r.last_review_date,
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
const savers: Record<EntityName, (c: PoolClient, o: any) => Promise<void>> = {
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
      created_at: o.createdAt, last_review_date: o.lastReviewDate,
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
    });
  },

  async 'regulatory-milestones'(c, o: RegulatoryMilestoneTemplate) {
    await upsertRow(c, 'regulatory_milestone_templates', 'id', {
      id: o.id, authority: o.authority, name: o.name, deadline_minutes: o.deadlineMinutes, enabled: o.enabled,
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
      affected_asset_ids: o.affectedAssetIds ?? [],
    });
    const r = o.regulatoryReport;
    if (!r) {
      await c.query('DELETE FROM regulatory_reports WHERE flaw_id = $1', [o.id]);
      return;
    }
    await upsertRow(c, 'regulatory_reports', 'flaw_id', {
      flaw_id: o.id, awareness_at: r.awarenessAt, reportable_to_cmf: r.reportableToCMF, reportable_to_anci: r.reportableToANCI,
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
      last_review_date: o.lastReviewDate,
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
      last_review_date: o.lastReviewDate,
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
    }, false);
  },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const TABLE_BY_ENTITY: Record<EntityName, { table: string; pk: string }> = {
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
  'info-assets': { table: 'info_assets', pk: 'id' },
  vulnerabilities: { table: 'vulnerabilities', pk: 'id' },
  'security-assessment': { table: 'security_assessment_items', pk: 'id' },
};

export function isEntity(name: string): name is EntityName {
  return (ENTITY_ORDER as readonly string[]).includes(name);
}

export async function saveEntity<T extends { id: string }>(entity: EntityName, obj: T, client?: PoolClient): Promise<void> {
  if (client) return savers[entity](client, obj);
  await withTransaction(c => savers[entity](c, obj));
}

export async function deleteEntity(entity: EntityName, id: string): Promise<void> {
  const { table, pk } = TABLE_BY_ENTITY[entity];
  await withTransaction(c => c.query(`DELETE FROM ${table} WHERE ${pk} = $1`, [id]));
}

export async function saveSetting(key: SettingKey, value: unknown, client?: PoolClient): Promise<void> {
  const sql = `INSERT INTO system_settings (key, value) VALUES ($1, $2)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`;
  if (client) await client.query(sql, [key, json(value)]);
  else await getPool()!.query(sql, [key, json(value)]);
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
export async function appendLedger(input: LedgerInput, ipAddress: string, client?: PoolClient): Promise<AuditLogEntry> {
  const run = async (c: PoolClient) => {
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
export async function importLedgerBlock(c: PoolClient, e: AuditLogEntry): Promise<void> {
  await c.query(
    `INSERT INTO crypto_audit_ledger (id, block_number, timestamp, user_name, user_role, action, entity_type, entity_code, details, ip_address, previous_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`,
    [e.id, e.blockNumber, e.timestamp, e.userName, e.userRole, e.action, e.entityType, e.entityCode, e.details, e.ipAddress, e.previousHash, e.hash]
  );
}

export { withTransaction };
