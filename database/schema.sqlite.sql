-- RiskGuard Pro: esquema SQLite equivalente a database/schema.sql (PostgreSQL).
-- Tablas e índices generados con scripts/generar-esquema-sqlite.mjs; idempotente (se aplica en cada arranque).
-- Tipos declarados que el servidor convierte al leer: BOOLEAN, JSONTEXT (JSON), TEXTARRAY (lista JSON),
-- DATE (AAAA-MM-DD) y TIMESTAMPTZ (ISO 8601 UTC).

CREATE TABLE IF NOT EXISTS organizational_roles (
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    description TEXT NOT NULL,
    badge TEXT NOT NULL DEFAULT 'Puesto Especializado',
    is_system_role BOOLEAN NOT NULL DEFAULT 0,
    permissions JSONTEXT NOT NULL DEFAULT '{"canEditRisks": true, "canManageRoles": false, "canReportFlaws": true, "canConvertFlaws": false, "canConfigureKRIs": false, "canExecuteAudits": false, "canExportReports": true, "canEvaluateControls": true, "canAcknowledgeAlerts": true}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role_id TEXT,
    role_title TEXT NOT NULL,
    department TEXT NOT NULL,
    badge TEXT NOT NULL DEFAULT 'Colaborador',
    is_system_user BOOLEAN NOT NULL DEFAULT 0,
    permissions JSONTEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    active BOOLEAN NOT NULL DEFAULT 1,
    last_login_at TIMESTAMPTZ,
    FOREIGN KEY (role_id) REFERENCES organizational_roles(id) ON DELETE SET NULL,
    PRIMARY KEY (id),
    UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS controls (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    process TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Preventivo',
    automation TEXT NOT NULL DEFAULT 'Automático',
    frequency TEXT NOT NULL DEFAULT 'Continuo',
    design_effectiveness NUMERIC NOT NULL DEFAULT 80.00,
    operating_effectiveness NUMERIC NOT NULL DEFAULT 80.00,
    total_effectiveness NUMERIC NOT NULL DEFAULT 80.00,
    status TEXT NOT NULL DEFAULT 'Efectivo',
    owner TEXT NOT NULL,
    last_tested TEXT NOT NULL,
    evidence TEXT NOT NULL,
    sample_details TEXT,
    last_tested_by TEXT,
    attachments JSONTEXT DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((design_effectiveness >= (0)) AND (design_effectiveness <= (100)))),
    CHECK (((operating_effectiveness >= (0)) AND (operating_effectiveness <= (100)))),
    CHECK (((total_effectiveness >= (0)) AND (total_effectiveness <= (100)))),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS control_test_executions (
    id TEXT NOT NULL,
    control_id TEXT NOT NULL,
    test_date TEXT NOT NULL,
    tested_by TEXT NOT NULL,
    tester_role TEXT,
    test_method TEXT NOT NULL,
    sample_size TEXT,
    deviations_identified INTEGER DEFAULT 0,
    design_score NUMERIC NOT NULL,
    operating_score NUMERIC NOT NULL,
    total_score NUMERIC NOT NULL,
    conclusion TEXT NOT NULL,
    evidence_notes TEXT NOT NULL,
    attachments JSONTEXT DEFAULT '[]',
    ledger_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (control_id) REFERENCES controls(id) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS risks (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    process TEXT NOT NULL,
    category TEXT NOT NULL,
    responsible TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Activo',
    inherent_likelihood INTEGER NOT NULL,
    inherent_impact INTEGER NOT NULL,
    inherent_score INTEGER NOT NULL,
    inherent_level TEXT NOT NULL,
    financial_exposure_usd NUMERIC NOT NULL DEFAULT 0.00,
    residual_likelihood INTEGER NOT NULL,
    residual_impact INTEGER NOT NULL,
    residual_score INTEGER NOT NULL,
    residual_level TEXT NOT NULL,
    residual_exposure_usd NUMERIC NOT NULL DEFAULT 0.00,
    mitigation_plan JSONTEXT DEFAULT '{"id": "", "owner": "Responsable Asignado", "title": "Plan de Mitigación", "status": "No Iniciado", "actions": [], "dueDate": "2026-12-31", "budgetUSD": 0, "progressPct": 0}',
    created_at TEXT NOT NULL,
    last_review_date TEXT NOT NULL,
    created_timestamp TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    acceptance JSONTEXT,
    CHECK (((inherent_impact >= 1) AND (inherent_impact <= 4))),
    CHECK (((inherent_level) IN ('Bajo', 'Medio', 'Alto', 'Crítico'))),
    CHECK (((inherent_likelihood >= 1) AND (inherent_likelihood <= 4))),
    CHECK (((inherent_score >= 1) AND (inherent_score <= 16))),
    CHECK (((residual_impact >= 1) AND (residual_impact <= 4))),
    CHECK (((residual_level) IN ('Bajo', 'Medio', 'Alto', 'Crítico'))),
    CHECK (((residual_likelihood >= 1) AND (residual_likelihood <= 4))),
    CHECK (((residual_score >= 1) AND (residual_score <= 16))),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS risk_controls (
    risk_id TEXT NOT NULL,
    control_id TEXT NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (control_id) REFERENCES controls(id) ON DELETE CASCADE,
    FOREIGN KEY (risk_id) REFERENCES risks(id) ON DELETE CASCADE,
    PRIMARY KEY (risk_id, control_id)
);

CREATE TABLE IF NOT EXISTS operational_flaws (
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    process TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'Media',
    reported_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendiente de Evaluación',
    incident_type TEXT DEFAULT 'Falla de Control',
    real_loss_amount_usd NUMERIC DEFAULT 0.00,
    recovered_amount_usd NUMERIC DEFAULT 0.00,
    impacted_system_or_account TEXT,
    converted_risk_id TEXT,
    ai_suggested_category TEXT,
    ai_suggested_controls JSONTEXT DEFAULT '[]',
    ai_analysis JSONTEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    business_line TEXT,
    basel_category TEXT,
    basel_subcategory TEXT,
    occurrence_date DATE,
    discovery_date DATE,
    accounting_date DATE,
    accounting_account TEXT,
    credit_risk_boundary BOOLEAN NOT NULL DEFAULT 0,
    provider_id TEXT,
    affected_asset_ids TEXTARRAY NOT NULL DEFAULT '[]',
    cyber JSONTEXT,
    CHECK (((severity) IN ('Crítica', 'Alta', 'Media', 'Baja'))),
    CHECK (((status) IN ('Pendiente de Evaluación', 'Convertida a Riesgo', 'Descartada'))),
    FOREIGN KEY (converted_risk_id) REFERENCES risks(id) ON DELETE SET NULL,
    FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS kri_definitions (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    process TEXT NOT NULL,
    category TEXT NOT NULL,
    industry TEXT NOT NULL,
    unit TEXT NOT NULL,
    direction TEXT NOT NULL,
    warning_threshold NUMERIC NOT NULL,
    critical_threshold NUMERIC NOT NULL,
    current_value NUMERIC NOT NULL,
    frequency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Normal',
    auto_trigger_alert BOOLEAN NOT NULL DEFAULT 1,
    responsible TEXT NOT NULL,
    last_updated TEXT NOT NULL,
    notification_preferences JSONTEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((direction) IN ('superior', 'inferior'))),
    CHECK (((status) IN ('Normal', 'Advertencia', 'Crítico'))),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    kri_metric TEXT NOT NULL,
    threshold TEXT NOT NULL,
    current_value TEXT NOT NULL,
    severity TEXT NOT NULL,
    process TEXT NOT NULL,
    triggered_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Activa',
    escalated_to TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((severity) IN ('Crítico', 'Alto', 'Medio', 'Informativo'))),
    CHECK (((status) IN ('Activa', 'En Investigación', 'Mitigada', 'Silenciada'))),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS periodic_audits (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    period TEXT NOT NULL,
    lead_auditor TEXT NOT NULL,
    scope JSONTEXT NOT NULL DEFAULT '[]',
    execution_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Planificada',
    compliance_score NUMERIC NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((compliance_score >= (0)) AND (compliance_score <= (100)))),
    CHECK (((status) IN ('Planificada', 'En Curso', 'Finalizada', 'Aprobada'))),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS audit_findings (
    id TEXT NOT NULL,
    audit_id TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    process TEXT NOT NULL,
    associated_risk_code TEXT,
    corrective_action TEXT NOT NULL,
    deadline TEXT NOT NULL,
    responsible TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Abierto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((status) IN ('Abierto', 'En Subsanación', 'Cerrado'))),
    CHECK (((type) IN ('Conforme', 'Observación', 'No Conformidad Menor', 'No Conformidad Mayor'))),
    FOREIGN KEY (audit_id) REFERENCES periodic_audits(id) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS crypto_audit_ledger (
    id TEXT NOT NULL,
    block_number INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_code TEXT NOT NULL,
    details TEXT NOT NULL,
    ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
    previous_hash TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (id),
    UNIQUE (block_number)
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT NOT NULL,
    value JSONTEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS regulatory_milestone_templates (
    id TEXT NOT NULL,
    authority TEXT NOT NULL,
    name TEXT NOT NULL,
    deadline_minutes INTEGER NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    basis TEXT NOT NULL DEFAULT 'conocimiento',
    due_on_close BOOLEAN NOT NULL DEFAULT 0,
    CHECK (((basis) IN ('ocurrencia', 'conocimiento'))),
    CHECK (((authority) IN ('CMF', 'ANCI'))),
    CHECK ((deadline_minutes > 0)),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS regulatory_reports (
    flaw_id TEXT NOT NULL,
    awareness_at TIMESTAMPTZ NOT NULL,
    reportable_to_cmf BOOLEAN NOT NULL DEFAULT 0,
    reportable_to_anci BOOLEAN NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Abierto',
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    occurred_at TIMESTAMPTZ,
    details JSONTEXT,
    CHECK ((reportable_to_cmf OR reportable_to_anci)),
    CHECK (((status) IN ('Abierto', 'Cerrado'))),
    FOREIGN KEY (flaw_id) REFERENCES operational_flaws(id) ON DELETE CASCADE,
    PRIMARY KEY (flaw_id)
);

CREATE TABLE IF NOT EXISTS regulatory_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flaw_id TEXT NOT NULL,
    milestone_id TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL,
    submitted_by TEXT NOT NULL,
    folio TEXT,
    FOREIGN KEY (flaw_id) REFERENCES regulatory_reports(flaw_id) ON DELETE CASCADE,
    FOREIGN KEY (milestone_id) REFERENCES regulatory_milestone_templates(id),
    UNIQUE (flaw_id, milestone_id)
);

CREATE TABLE IF NOT EXISTS regulatory_report_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flaw_id TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    author TEXT NOT NULL,
    note TEXT NOT NULL,
    FOREIGN KEY (flaw_id) REFERENCES regulatory_reports(flaw_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_providers (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    tax_id TEXT,
    service_description TEXT NOT NULL,
    category TEXT NOT NULL,
    criticality TEXT NOT NULL,
    internal_owner TEXT,
    supported_processes TEXTARRAY NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'Activo',
    is_cloud BOOLEAN NOT NULL DEFAULT 0,
    cloud_model TEXT,
    data_location TEXT NOT NULL DEFAULT 'Chile',
    data_country TEXT,
    handles_member_data BOOLEAN NOT NULL DEFAULT 0,
    uses_subcontractors BOOLEAN NOT NULL DEFAULT 0,
    contract_start DATE,
    contract_end DATE NOT NULL,
    annual_cost_usd NUMERIC NOT NULL DEFAULT 0,
    clauses JSONTEXT NOT NULL DEFAULT '{}',
    last_assessment_date DATE,
    assessment_score INTEGER,
    has_exit_plan BOOLEAN NOT NULL DEFAULT 0,
    exit_plan_notes TEXT,
    committed_rto_hours NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    ran207 JSONTEXT,
    CHECK (((contract_start IS NULL) OR (contract_end >= contract_start))),
    CHECK (((assessment_score >= 0) AND (assessment_score <= 100))),
    CHECK (((cloud_model) IN ('IaaS', 'PaaS', 'SaaS'))),
    CHECK (((criticality) IN ('Crítico', 'Alto', 'Medio', 'Bajo'))),
    CHECK (((data_location) IN ('Chile', 'Extranjero'))),
    CHECK (((status) IN ('Activo', 'En evaluación', 'En término'))),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS bia_processes (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    owner TEXT,
    business_line TEXT,
    description TEXT,
    impact_financial INTEGER NOT NULL,
    impact_members INTEGER NOT NULL,
    impact_regulatory INTEGER NOT NULL,
    impact_reputational INTEGER NOT NULL,
    mtpd_hours NUMERIC NOT NULL,
    rto_hours NUMERIC NOT NULL,
    rpo_hours NUMERIC NOT NULL,
    systems TEXTARRAY NOT NULL DEFAULT '[]',
    minimum_staff INTEGER NOT NULL DEFAULT 0,
    alternate_site TEXT,
    last_review_date DATE NOT NULL,
    ran209 JSONTEXT,
    CHECK (((impact_financial >= 1) AND (impact_financial <= 4))),
    CHECK (((impact_members >= 1) AND (impact_members <= 4))),
    CHECK (((impact_regulatory >= 1) AND (impact_regulatory <= 4))),
    CHECK (((impact_reputational >= 1) AND (impact_reputational <= 4))),
    CHECK ((rto_hours <= mtpd_hours)),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS bia_process_providers (
    bia_process_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    FOREIGN KEY (bia_process_id) REFERENCES bia_processes(id) ON DELETE CASCADE,
    FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE CASCADE,
    PRIMARY KEY (bia_process_id, provider_id)
);

CREATE TABLE IF NOT EXISTS continuity_plans (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    owner TEXT,
    version TEXT NOT NULL DEFAULT '1.0',
    approved_by TEXT,
    approval_date DATE,
    next_review_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Borrador',
    ran209 JSONTEXT,
    CHECK (((status) IN ('Vigente', 'En actualización', 'Borrador'))),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS continuity_plan_processes (
    plan_id TEXT NOT NULL,
    bia_process_id TEXT NOT NULL,
    FOREIGN KEY (bia_process_id) REFERENCES bia_processes(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES continuity_plans(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, bia_process_id)
);

CREATE TABLE IF NOT EXISTS continuity_tests (
    id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    test_date DATE NOT NULL,
    type TEXT NOT NULL,
    scenario TEXT NOT NULL,
    bia_process_id TEXT,
    achieved_rto_hours NUMERIC,
    result TEXT NOT NULL,
    findings TEXT,
    actions TEXT,
    ran209 JSONTEXT,
    CHECK (((result) IN ('Exitosa', 'Con observaciones', 'Fallida'))),
    FOREIGN KEY (bia_process_id) REFERENCES bia_processes(id) ON DELETE SET NULL,
    FOREIGN KEY (plan_id) REFERENCES continuity_plans(id) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS auth_login_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    request_ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    expires_at TIMESTAMPTZ NOT NULL,
    ip TEXT,
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
    PRIMARY KEY (token_hash)
);

CREATE TABLE IF NOT EXISTS info_assets (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    owner TEXT NOT NULL,
    custodian TEXT,
    classification TEXT NOT NULL,
    confidentiality INTEGER NOT NULL,
    integrity INTEGER NOT NULL,
    availability INTEGER NOT NULL,
    handles_personal_data BOOLEAN NOT NULL DEFAULT 0,
    location TEXT NOT NULL,
    provider_id TEXT,
    bia_process_ids TEXTARRAY NOT NULL DEFAULT '[]',
    last_review_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    critical_infrastructure BOOLEAN NOT NULL DEFAULT 0,
    CHECK (((availability >= 1) AND (availability <= 4))),
    CHECK (((classification) IN ('Pública', 'Interna', 'Confidencial', 'Restringida'))),
    CHECK (((confidentiality >= 1) AND (confidentiality <= 4))),
    CHECK (((integrity >= 1) AND (integrity <= 4))),
    FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL,
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS vulnerabilities (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    asset_id TEXT NOT NULL,
    source TEXT NOT NULL,
    severity TEXT NOT NULL,
    cvss_score NUMERIC,
    detected_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status TEXT NOT NULL,
    owner TEXT,
    remediation TEXT,
    closed_date DATE,
    acceptance JSONTEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK ((((status) <> 'Riesgo aceptado') OR (acceptance IS NOT NULL))),
    CHECK ((due_date >= detected_date)),
    CHECK (((cvss_score >= (0)) AND (cvss_score <= (10)))),
    CHECK (((severity) IN ('Crítica', 'Alta', 'Media', 'Baja'))),
    CHECK (((status) IN ('Abierta', 'En remediación', 'Mitigada', 'Riesgo aceptado', 'Cerrada'))),
    FOREIGN KEY (asset_id) REFERENCES info_assets(id) ON DELETE CASCADE,
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS security_assessment_items (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    domain TEXT NOT NULL,
    requirement TEXT NOT NULL,
    guidance TEXT,
    status TEXT NOT NULL DEFAULT 'Sin evaluar',
    evidence TEXT,
    owner TEXT,
    action_plan TEXT,
    due_date DATE,
    assessed_by TEXT,
    assessed_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((status) IN ('Sin evaluar', 'Cumple', 'Cumple parcialmente', 'No cumple', 'No aplica'))),
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS org_areas (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    manager TEXT,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS business_processes (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    area_id TEXT,
    owner TEXT,
    business_line TEXT,
    criticality TEXT NOT NULL DEFAULT 'Medio',
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((criticality) IN ('Crítico', 'Alto', 'Medio', 'Bajo'))),
    FOREIGN KEY (area_id) REFERENCES org_areas(id) ON DELETE SET NULL,
    PRIMARY KEY (id),
    UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS compliance_norms (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'Otra',
    issuer TEXT,
    source TEXT,
    url TEXT,
    version TEXT NOT NULL DEFAULT '1',
    effective_date DATE,
    status TEXT NOT NULL DEFAULT 'Vigente',
    applicability TEXT NOT NULL DEFAULT 'Aplica',
    applicability_note TEXT,
    owner TEXT,
    notes TEXT,
    versions JSONTEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 100,
    referential BOOLEAN NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((applicability) IN ('Aplica', 'Aplica parcialmente', 'Por determinar', 'No aplica'))),
    CHECK (((status) IN ('Vigente', 'Publicada, aún no vigente', 'En consulta', 'Derogada'))),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS compliance_requirements (
    id TEXT NOT NULL,
    chapter TEXT NOT NULL,
    numeral TEXT NOT NULL,
    title TEXT NOT NULL,
    requirement TEXT NOT NULL,
    module TEXT,
    auto_check TEXT,
    frequency TEXT NOT NULL DEFAULT 'Anual',
    status TEXT NOT NULL DEFAULT 'Sin evaluar',
    evidence TEXT,
    owner TEXT,
    action_plan TEXT,
    due_date DATE,
    last_review_date DATE,
    reviewed_by TEXT,
    control_ids JSONTEXT NOT NULL DEFAULT '[]',
    norm_version TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((frequency) IN ('Permanente', 'Anual', 'Semestral', 'Por evento'))),
    CHECK (((status) IN ('Sin evaluar', 'Cumple', 'Cumple parcialmente', 'No cumple', 'No aplica'))),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS action_plans (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    source_type TEXT NOT NULL,
    source_id TEXT,
    source_label TEXT NOT NULL DEFAULT '',
    process TEXT,
    owner TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'Media',
    start_date DATE,
    due_date DATE NOT NULL,
    original_due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendiente',
    progress_pct INTEGER NOT NULL DEFAULT 0,
    tasks JSONTEXT NOT NULL DEFAULT '[]',
    updates JSONTEXT NOT NULL DEFAULT '[]',
    reschedules JSONTEXT NOT NULL DEFAULT '[]',
    closure JSONTEXT,
    rejections JSONTEXT NOT NULL DEFAULT '[]',
    cancel_reason TEXT,
    created_by TEXT NOT NULL,
    created_at_iso TEXT NOT NULL,
    closed_at DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((priority) IN ('Alta', 'Media', 'Baja'))),
    CHECK (((progress_pct >= 0) AND (progress_pct <= 100))),
    CHECK (((source_type) IN ('Riesgo', 'Control', 'Auditoría', 'Cumplimiento', 'Autoevaluación de seguridad', 'Continuidad', 'Proveedor', 'Incidente', 'Otro'))),
    CHECK (((status) IN ('Pendiente', 'En curso', 'Por verificar', 'Cerrado', 'Cancelado'))),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS survey_campaigns (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT,
    scope JSONTEXT NOT NULL DEFAULT '[]',
    norm_id TEXT,
    respondent TEXT,
    custom_items JSONTEXT,
    due_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'Borrador',
    launched_at TEXT,
    closed_at TEXT,
    created_by TEXT NOT NULL,
    created_at_iso TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((kind) IN ('RCSA', 'BIA', 'Cumplimiento', 'Personalizada'))),
    CHECK (((status) IN ('Borrador', 'En curso', 'Cerrada'))),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS survey_responses (
    id TEXT NOT NULL,
    campaign_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    respondent TEXT NOT NULL,
    items JSONTEXT NOT NULL DEFAULT '[]',
    answers JSONTEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'Pendiente',
    due_date DATE NOT NULL,
    started_at TEXT,
    submitted_at TEXT,
    returned_note TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    review_note TEXT,
    applied JSONTEXT NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((status) IN ('Pendiente', 'En progreso', 'Enviada', 'Devuelta', 'Revisada'))),
    FOREIGN KEY (campaign_id) REFERENCES survey_campaigns(id) ON DELETE CASCADE,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS security_tests (
    id TEXT NOT NULL,
    test_date DATE NOT NULL,
    type TEXT NOT NULL,
    scope TEXT NOT NULL,
    executed_by TEXT,
    result TEXT NOT NULL,
    findings TEXT,
    reported_to_board_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((result) IN ('Satisfactoria', 'Con observaciones', 'Insatisfactoria'))),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS approval_requests (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    kind TEXT NOT NULL,
    target_entity TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_label TEXT NOT NULL,
    justification TEXT NOT NULL,
    payload JSONTEXT NOT NULL DEFAULT '{}',
    requested_by TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    steps JSONTEXT NOT NULL DEFAULT '[]',
    current_step INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Pendiente',
    closed_at TEXT,
    cancel_reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((status) IN ('Pendiente', 'Aprobada', 'Rechazada', 'Anulada'))),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    recipient_name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    tab TEXT,
    entity_type TEXT,
    entity_id TEXT,
    created_at TEXT NOT NULL,
    read_at TEXT,
    email_status TEXT NOT NULL DEFAULT 'pendiente',
    email_error TEXT,
    email_sent_at TEXT,
    dedupe_key TEXT NOT NULL,
    CHECK (((email_status) IN ('pendiente', 'enviado', 'resumen', 'omitido', 'error'))),
    CHECK (((severity) IN ('info', 'aviso', 'urgente'))),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
    email TEXT NOT NULL,
    email_mode TEXT NOT NULL DEFAULT 'inmediato',
    muted JSONTEXT NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((email_mode) IN ('inmediato', 'resumen', 'ninguno'))),
    PRIMARY KEY (email)
);

CREATE TABLE IF NOT EXISTS evidence_files (
    id TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    context TEXT,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    description TEXT,
    uploaded_by TEXT NOT NULL,
    uploaded_by_email TEXT,
    uploaded_at TEXT NOT NULL,
    deleted_at TEXT,
    deleted_by TEXT,
    delete_reason TEXT,
    content BLOB NOT NULL,
    CHECK ((size_bytes > 0)),
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS controlled_documents (
    id TEXT NOT NULL,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner TEXT NOT NULL DEFAULT '',
    classification TEXT NOT NULL DEFAULT 'Interna',
    review_months INTEGER NOT NULL DEFAULT 12,
    audience_role_ids JSONTEXT NOT NULL DEFAULT '[]',
    requirement_ids JSONTEXT NOT NULL DEFAULT '[]',
    processes JSONTEXT NOT NULL DEFAULT '[]',
    versions JSONTEXT NOT NULL DEFAULT '[]',
    current_version_id TEXT,
    next_review_date DATE,
    acknowledgments JSONTEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'Activo',
    obsolete_reason TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (((classification) IN ('Pública', 'Interna', 'Confidencial'))),
    CHECK (((doc_type) IN ('Política', 'Manual', 'Reglamento', 'Procedimiento', 'Instructivo', 'Plan', 'Formulario', 'Otro'))),
    CHECK (((review_months >= 1) AND (review_months <= 60))),
    CHECK (((status) IN ('Activo', 'Obsoleto'))),
    PRIMARY KEY (id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_org_roles_department ON organizational_roles (department);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles (email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role_id ON user_profiles (role_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email_lower ON user_profiles (lower((email)));
CREATE INDEX IF NOT EXISTS idx_controls_code ON controls (code);
CREATE INDEX IF NOT EXISTS idx_controls_process ON controls (process);
CREATE INDEX IF NOT EXISTS idx_controls_status ON controls (status);
CREATE INDEX IF NOT EXISTS idx_controls_owner ON controls (owner);
CREATE INDEX IF NOT EXISTS idx_control_tests_control_id ON control_test_executions (control_id);
CREATE INDEX IF NOT EXISTS idx_control_tests_date ON control_test_executions (test_date);
CREATE INDEX IF NOT EXISTS idx_risks_code ON risks (code);
CREATE INDEX IF NOT EXISTS idx_risks_process ON risks (process);
CREATE INDEX IF NOT EXISTS idx_risks_category ON risks (category);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks (status);
CREATE INDEX IF NOT EXISTS idx_risks_inherent_level ON risks (inherent_level);
CREATE INDEX IF NOT EXISTS idx_risks_residual_level ON risks (residual_level);
CREATE INDEX IF NOT EXISTS idx_risks_responsible ON risks (responsible);
CREATE INDEX IF NOT EXISTS idx_risk_controls_risk_id ON risk_controls (risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_controls_control_id ON risk_controls (control_id);
CREATE INDEX IF NOT EXISTS idx_flaws_process ON operational_flaws (process);
CREATE INDEX IF NOT EXISTS idx_flaws_status ON operational_flaws (status);
CREATE INDEX IF NOT EXISTS idx_flaws_severity ON operational_flaws (severity);
CREATE INDEX IF NOT EXISTS idx_flaws_business_line ON operational_flaws (business_line);
CREATE INDEX IF NOT EXISTS idx_flaws_occurrence_date ON operational_flaws (occurrence_date);
CREATE INDEX IF NOT EXISTS idx_kri_code ON kri_definitions (code);
CREATE INDEX IF NOT EXISTS idx_kri_industry ON kri_definitions (industry);
CREATE INDEX IF NOT EXISTS idx_kri_status ON kri_definitions (status);
CREATE INDEX IF NOT EXISTS idx_kri_process ON kri_definitions (process);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON anomaly_alerts (status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON anomaly_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_alerts_process ON anomaly_alerts (process);
CREATE INDEX IF NOT EXISTS idx_audits_status ON periodic_audits (status);
CREATE INDEX IF NOT EXISTS idx_audits_period ON periodic_audits (period);
CREATE INDEX IF NOT EXISTS idx_audit_findings_audit_id ON audit_findings (audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_status ON audit_findings (status);
CREATE INDEX IF NOT EXISTS idx_audit_findings_risk_code ON audit_findings (associated_risk_code);
CREATE INDEX IF NOT EXISTS idx_ledger_block_number ON crypto_audit_ledger (block_number);
CREATE INDEX IF NOT EXISTS idx_ledger_action ON crypto_audit_ledger (action);
CREATE INDEX IF NOT EXISTS idx_ledger_entity ON crypto_audit_ledger (entity_type, entity_code);
CREATE INDEX IF NOT EXISTS idx_ledger_hash ON crypto_audit_ledger (hash);
CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_login_codes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_asset ON vulnerabilities (asset_id);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_status ON vulnerabilities (status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_areas_name ON org_areas (lower((name)));
CREATE UNIQUE INDEX IF NOT EXISTS ux_business_processes_name ON business_processes (lower((name)));
CREATE INDEX IF NOT EXISTS idx_business_processes_area ON business_processes (area_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_norms_code ON compliance_norms (lower((code)));
CREATE INDEX IF NOT EXISTS idx_compliance_chapter ON compliance_requirements (chapter);
CREATE UNIQUE INDEX IF NOT EXISTS idx_action_plans_code ON action_plans (code);
CREATE INDEX IF NOT EXISTS idx_action_plans_source ON action_plans (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_action_plans_owner ON action_plans (lower((owner)));
CREATE INDEX IF NOT EXISTS idx_action_plans_status ON action_plans (status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_campaigns_code ON survey_campaigns (code);
CREATE INDEX IF NOT EXISTS idx_survey_responses_campaign ON survey_responses (campaign_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_respondent ON survey_responses (lower((respondent)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_code ON approval_requests (code);
CREATE INDEX IF NOT EXISTS idx_approval_requests_target ON approval_requests (target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_email ON notifications (email_status);
CREATE INDEX IF NOT EXISTS idx_evidence_files_entity ON evidence_files (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_files_sha ON evidence_files (sha256);
CREATE UNIQUE INDEX IF NOT EXISTS idx_controlled_documents_code ON controlled_documents (code);

-- =============================================================================
-- Disparadores (mismas reglas que las funciones de PostgreSQL)
-- =============================================================================

-- Matriz 4×4: puntaje y nivel inherente y residual.
CREATE TRIGGER IF NOT EXISTS trg_risk_matrix_ins AFTER INSERT ON risks
BEGIN
    UPDATE risks SET
        inherent_score = NEW.inherent_likelihood * NEW.inherent_impact,
        inherent_level = CASE WHEN NEW.inherent_likelihood * NEW.inherent_impact >= 12 THEN 'Crítico'
                              WHEN NEW.inherent_likelihood * NEW.inherent_impact >= 8 THEN 'Alto'
                              WHEN NEW.inherent_likelihood * NEW.inherent_impact >= 4 THEN 'Medio' ELSE 'Bajo' END,
        residual_score = NEW.residual_likelihood * NEW.residual_impact,
        residual_level = CASE WHEN NEW.residual_likelihood * NEW.residual_impact >= 12 THEN 'Crítico'
                              WHEN NEW.residual_likelihood * NEW.residual_impact >= 8 THEN 'Alto'
                              WHEN NEW.residual_likelihood * NEW.residual_impact >= 4 THEN 'Medio' ELSE 'Bajo' END
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_risk_matrix_upd AFTER UPDATE OF inherent_likelihood, inherent_impact, residual_likelihood, residual_impact, inherent_score, inherent_level, residual_score, residual_level ON risks
BEGIN
    UPDATE risks SET
        inherent_score = NEW.inherent_likelihood * NEW.inherent_impact,
        inherent_level = CASE WHEN NEW.inherent_likelihood * NEW.inherent_impact >= 12 THEN 'Crítico'
                              WHEN NEW.inherent_likelihood * NEW.inherent_impact >= 8 THEN 'Alto'
                              WHEN NEW.inherent_likelihood * NEW.inherent_impact >= 4 THEN 'Medio' ELSE 'Bajo' END,
        residual_score = NEW.residual_likelihood * NEW.residual_impact,
        residual_level = CASE WHEN NEW.residual_likelihood * NEW.residual_impact >= 12 THEN 'Crítico'
                              WHEN NEW.residual_likelihood * NEW.residual_impact >= 8 THEN 'Alto'
                              WHEN NEW.residual_likelihood * NEW.residual_impact >= 4 THEN 'Medio' ELSE 'Bajo' END
    WHERE id = NEW.id;
END;

-- Efectividad de controles: 40% diseño + 60% operación; Efectivo >= 85, Parcial >= 65.
CREATE TRIGGER IF NOT EXISTS trg_control_effectiveness_ins AFTER INSERT ON controls
BEGIN
    UPDATE controls SET
        total_effectiveness = ROUND(NEW.design_effectiveness * 0.40 + NEW.operating_effectiveness * 0.60, 0),
        status = CASE WHEN ROUND(NEW.design_effectiveness * 0.40 + NEW.operating_effectiveness * 0.60, 0) >= 85 THEN 'Efectivo'
                      WHEN ROUND(NEW.design_effectiveness * 0.40 + NEW.operating_effectiveness * 0.60, 0) >= 65 THEN 'Parcialmente Efectivo'
                      ELSE 'Deficiente' END
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_control_effectiveness_upd AFTER UPDATE OF design_effectiveness, operating_effectiveness, total_effectiveness, status ON controls
BEGIN
    UPDATE controls SET
        total_effectiveness = ROUND(NEW.design_effectiveness * 0.40 + NEW.operating_effectiveness * 0.60, 0),
        status = CASE WHEN ROUND(NEW.design_effectiveness * 0.40 + NEW.operating_effectiveness * 0.60, 0) >= 85 THEN 'Efectivo'
                      WHEN ROUND(NEW.design_effectiveness * 0.40 + NEW.operating_effectiveness * 0.60, 0) >= 65 THEN 'Parcialmente Efectivo'
                      ELSE 'Deficiente' END
    WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_organizational_roles_updated_at AFTER UPDATE ON organizational_roles
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE organizational_roles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_user_profiles_updated_at AFTER UPDATE ON user_profiles
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE user_profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_controls_updated_at AFTER UPDATE ON controls
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE controls SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_risks_updated_at AFTER UPDATE ON risks
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE risks SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_operational_flaws_updated_at AFTER UPDATE ON operational_flaws
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE operational_flaws SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_kri_definitions_updated_at AFTER UPDATE ON kri_definitions
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE kri_definitions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;

CREATE TRIGGER IF NOT EXISTS trg_anomaly_alerts_updated_at AFTER UPDATE ON anomaly_alerts
WHEN NEW.updated_at IS OLD.updated_at
BEGIN
    UPDATE anomaly_alerts SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE rowid = NEW.rowid;
END;
