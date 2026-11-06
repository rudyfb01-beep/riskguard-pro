-- ==============================================================================
-- SISTEMA DE GESTIÓN INTEGRAL DE RIESGO OPERACIONAL & AUDITORÍA (CUSTODIA RISK)
-- Marco Normativo: Basilea III / ISO 31000 / COSO ERM
-- Motor de Base de Datos: PostgreSQL 14 / 15 / 16
-- Archivo: database/schema.sql
-- ==============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. DOMINIOS Y ENUMS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'basel_category') THEN
        CREATE TYPE basel_category AS ENUM (
            'Fraude Interno',
            'Fraude Externo',
            'Fallas Tecnológicas',
            'Ejecución y Procesos',
            'Prácticas Laborales',
            'Daño a Activos Físicos',
            'Cumplimiento Normativo'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_level') THEN
        CREATE TYPE risk_level AS ENUM ('Bajo', 'Medio', 'Alto', 'Crítico');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'control_type') THEN
        CREATE TYPE control_type AS ENUM ('Preventivo', 'Detectivo', 'Correctivo');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'control_automation') THEN
        CREATE TYPE control_automation AS ENUM ('Automático', 'Semiautomático', 'Manual');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'control_frequency') THEN
        CREATE TYPE control_frequency AS ENUM ('Continuo', 'Diario', 'Semanal', 'Mensual', 'Por Evento');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industry_type') THEN
        CREATE TYPE industry_type AS ENUM (
            'Fintech & Pagos Digitales',
            'Banca & Servicios Financieros',
            'Salud & Farmacéutica',
            'Manufactura & Cadena de Suministro',
            'Retail & Comercio Electrónico',
            'Personalizada'
        );
    END IF;
END$$;

-- 3. TABLA: ROLES Y PUESTOS ORGANIZACIONALES (RBAC)
CREATE TABLE IF NOT EXISTS organizational_roles (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    badge VARCHAR(100) NOT NULL DEFAULT 'Puesto Especializado',
    is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
    permissions JSONB NOT NULL DEFAULT '{
        "canEditRisks": true,
        "canEvaluateControls": true,
        "canExecuteAudits": false,
        "canReportFlaws": true,
        "canConvertFlaws": false,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": false,
        "canManageRoles": false,
        "canExportReports": true
    }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_roles_department ON organizational_roles(department);

-- 4. TABLA: USUARIOS Y COLABORADORES
CREATE TABLE IF NOT EXISTS user_profiles (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role_id VARCHAR(64) REFERENCES organizational_roles(id) ON DELETE SET NULL,
    role_title VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    badge VARCHAR(100) NOT NULL DEFAULT 'Colaborador',
    is_system_user BOOLEAN NOT NULL DEFAULT FALSE,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role_id ON user_profiles(role_id);

-- 5. TABLA: CONTROLES OPERACIONALES
CREATE TABLE IF NOT EXISTS controls (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    process VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'Preventivo',
    automation VARCHAR(50) NOT NULL DEFAULT 'Automático',
    frequency VARCHAR(50) NOT NULL DEFAULT 'Continuo',
    design_effectiveness NUMERIC(5,2) NOT NULL DEFAULT 80.00 CHECK (design_effectiveness >= 0 AND design_effectiveness <= 100),
    operating_effectiveness NUMERIC(5,2) NOT NULL DEFAULT 80.00 CHECK (operating_effectiveness >= 0 AND operating_effectiveness <= 100),
    total_effectiveness NUMERIC(5,2) NOT NULL DEFAULT 80.00 CHECK (total_effectiveness >= 0 AND total_effectiveness <= 100),
    status VARCHAR(50) NOT NULL DEFAULT 'Efectivo',
    owner VARCHAR(255) NOT NULL,
    last_tested VARCHAR(50) NOT NULL,
    evidence TEXT NOT NULL,
    sample_details TEXT,
    last_tested_by VARCHAR(255),
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_controls_code ON controls(code);
CREATE INDEX IF NOT EXISTS idx_controls_process ON controls(process);
CREATE INDEX IF NOT EXISTS idx_controls_status ON controls(status);
CREATE INDEX IF NOT EXISTS idx_controls_owner ON controls(owner);

-- 6. TABLA: EJECUCIONES DE PRUEBA Y AUDITORÍA DE CONTROLES
CREATE TABLE IF NOT EXISTS control_test_executions (
    id VARCHAR(64) PRIMARY KEY,
    control_id VARCHAR(64) NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
    test_date VARCHAR(50) NOT NULL,
    tested_by VARCHAR(255) NOT NULL,
    tester_role VARCHAR(255),
    test_method VARCHAR(100) NOT NULL,
    sample_size VARCHAR(100),
    deviations_identified INTEGER DEFAULT 0,
    design_score NUMERIC(5,2) NOT NULL,
    operating_score NUMERIC(5,2) NOT NULL,
    total_score NUMERIC(5,2) NOT NULL,
    conclusion VARCHAR(100) NOT NULL,
    evidence_notes TEXT NOT NULL,
    attachments JSONB DEFAULT '[]'::jsonb,
    ledger_hash VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_control_tests_control_id ON control_test_executions(control_id);
CREATE INDEX IF NOT EXISTS idx_control_tests_date ON control_test_executions(test_date);

-- 7. TABLA: RIESGOS OPERACIONALES (MATRIZ 4x4)
CREATE TABLE IF NOT EXISTS risks (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    process VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    responsible VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Activo',
    
    -- Evaluación Inherente 4x4 (Probabilidad 1-4, Impacto 1-4)
    inherent_likelihood INTEGER NOT NULL CHECK (inherent_likelihood BETWEEN 1 AND 4),
    inherent_impact INTEGER NOT NULL CHECK (inherent_impact BETWEEN 1 AND 4),
    inherent_score INTEGER NOT NULL CHECK (inherent_score BETWEEN 1 AND 16),
    inherent_level VARCHAR(20) NOT NULL CHECK (inherent_level IN ('Bajo', 'Medio', 'Alto', 'Crítico')),
    financial_exposure_usd NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    
    -- Evaluación Residual 4x4 post-controles
    residual_likelihood INTEGER NOT NULL CHECK (residual_likelihood BETWEEN 1 AND 4),
    residual_impact INTEGER NOT NULL CHECK (residual_impact BETWEEN 1 AND 4),
    residual_score INTEGER NOT NULL CHECK (residual_score BETWEEN 1 AND 16),
    residual_level VARCHAR(20) NOT NULL CHECK (residual_level IN ('Bajo', 'Medio', 'Alto', 'Crítico')),
    residual_exposure_usd NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    
    mitigation_plan JSONB DEFAULT '{
        "id": "",
        "title": "Plan de Mitigación",
        "owner": "Responsable Asignado",
        "dueDate": "2026-12-31",
        "budgetUSD": 0,
        "progressPct": 0,
        "status": "No Iniciado",
        "actions": []
    }'::jsonb,
    
    created_at VARCHAR(50) NOT NULL,
    last_review_date VARCHAR(50) NOT NULL,
    created_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_risks_code ON risks(code);
CREATE INDEX IF NOT EXISTS idx_risks_process ON risks(process);
CREATE INDEX IF NOT EXISTS idx_risks_category ON risks(category);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_inherent_level ON risks(inherent_level);
CREATE INDEX IF NOT EXISTS idx_risks_residual_level ON risks(residual_level);
CREATE INDEX IF NOT EXISTS idx_risks_responsible ON risks(responsible);

-- 8. TABLA RELACIONAL: RIESGOS <-> CONTROLES (Muchos a Muchos)
CREATE TABLE IF NOT EXISTS risk_controls (
    risk_id VARCHAR(64) NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    control_id VARCHAR(64) NOT NULL REFERENCES controls(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (risk_id, control_id)
);

CREATE INDEX IF NOT EXISTS idx_risk_controls_risk_id ON risk_controls(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_controls_control_id ON risk_controls(control_id);

-- 9. TABLA: INCIDENCIAS, FALLAS OPERACIONALES Y EVENTOS DE PÉRDIDA
CREATE TABLE IF NOT EXISTS operational_flaws (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    reported_by VARCHAR(255) NOT NULL,
    process VARCHAR(255) NOT NULL,
    severity VARCHAR(50) NOT NULL DEFAULT 'Media' CHECK (severity IN ('Crítica', 'Alta', 'Media', 'Baja')),
    reported_at VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pendiente de Evaluación' CHECK (status IN ('Pendiente de Evaluación', 'Convertida a Riesgo', 'Descartada')),
    incident_type VARCHAR(100) DEFAULT 'Falla de Control',
    real_loss_amount_usd NUMERIC(15,2) DEFAULT 0.00,
    recovered_amount_usd NUMERIC(15,2) DEFAULT 0.00,
    impacted_system_or_account VARCHAR(255),
    converted_risk_id VARCHAR(64) REFERENCES risks(id) ON DELETE SET NULL,
    ai_suggested_category VARCHAR(100),
    ai_suggested_controls JSONB DEFAULT '[]'::jsonb,
    ai_analysis JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_flaws_process ON operational_flaws(process);
CREATE INDEX IF NOT EXISTS idx_flaws_status ON operational_flaws(status);
CREATE INDEX IF NOT EXISTS idx_flaws_severity ON operational_flaws(severity);

-- 10. TABLA: INDICADORES CLAVE DE RIESGO (KRIs)
CREATE TABLE IF NOT EXISTS kri_definitions (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    process VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    industry VARCHAR(100) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('superior', 'inferior')),
    warning_threshold NUMERIC(12,4) NOT NULL,
    critical_threshold NUMERIC(12,4) NOT NULL,
    current_value NUMERIC(12,4) NOT NULL,
    frequency VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Normal' CHECK (status IN ('Normal', 'Advertencia', 'Crítico')),
    auto_trigger_alert BOOLEAN NOT NULL DEFAULT TRUE,
    responsible VARCHAR(255) NOT NULL,
    last_updated VARCHAR(50) NOT NULL,
    notification_preferences JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kri_code ON kri_definitions(code);
CREATE INDEX IF NOT EXISTS idx_kri_industry ON kri_definitions(industry);
CREATE INDEX IF NOT EXISTS idx_kri_status ON kri_definitions(status);
CREATE INDEX IF NOT EXISTS idx_kri_process ON kri_definitions(process);

-- 11. TABLA: ALERTAS DE ANOMALÍA Y DISPARADORES KRI
CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    kri_metric VARCHAR(255) NOT NULL,
    threshold VARCHAR(100) NOT NULL,
    current_value VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('Crítico', 'Alto', 'Medio', 'Informativo')),
    process VARCHAR(255) NOT NULL,
    triggered_at VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Activa' CHECK (status IN ('Activa', 'En Investigación', 'Mitigada', 'Silenciada')),
    escalated_to VARCHAR(255) NOT NULL,
    resolved_at VARCHAR(50),
    resolved_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_status ON anomaly_alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON anomaly_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_process ON anomaly_alerts(process);

-- 12. TABLA: PROGRAMAS DE AUDITORÍA PERIÓDICA
CREATE TABLE IF NOT EXISTS periodic_audits (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    period VARCHAR(50) NOT NULL,
    lead_auditor VARCHAR(255) NOT NULL,
    scope JSONB NOT NULL DEFAULT '[]'::jsonb,
    execution_date VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Planificada' CHECK (status IN ('Planificada', 'En Curso', 'Finalizada', 'Aprobada')),
    compliance_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (compliance_score >= 0 AND compliance_score <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audits_status ON periodic_audits(status);
CREATE INDEX IF NOT EXISTS idx_audits_period ON periodic_audits(period);

-- 13. TABLA: HALLAZGOS DE AUDITORÍA
CREATE TABLE IF NOT EXISTS audit_findings (
    id VARCHAR(64) PRIMARY KEY,
    audit_id VARCHAR(64) NOT NULL REFERENCES periodic_audits(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL CHECK (type IN ('Conforme', 'Observación', 'No Conformidad Menor', 'No Conformidad Mayor')),
    description TEXT NOT NULL,
    process VARCHAR(255) NOT NULL,
    associated_risk_code VARCHAR(50),
    corrective_action TEXT NOT NULL,
    deadline VARCHAR(50) NOT NULL,
    responsible VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Abierto' CHECK (status IN ('Abierto', 'En Subsanación', 'Cerrado')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_audit_id ON audit_findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_status ON audit_findings(status);
CREATE INDEX IF NOT EXISTS idx_audit_findings_risk_code ON audit_findings(associated_risk_code);

-- 14. TABLA: BITÁCORA INALTERABLE Y LEDGER CRIPTOGRÁFICO SHA-256
CREATE TABLE IF NOT EXISTS crypto_audit_ledger (
    id VARCHAR(64) PRIMARY KEY,
    block_number BIGSERIAL UNIQUE,
    timestamp VARCHAR(50) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_code VARCHAR(100) NOT NULL,
    details TEXT NOT NULL,
    ip_address VARCHAR(100) NOT NULL DEFAULT '127.0.0.1',
    previous_hash VARCHAR(128) NOT NULL,
    hash VARCHAR(128) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ledger_block_number ON crypto_audit_ledger(block_number);
CREATE INDEX IF NOT EXISTS idx_ledger_action ON crypto_audit_ledger(action);
CREATE INDEX IF NOT EXISTS idx_ledger_entity ON crypto_audit_ledger(entity_type, entity_code);
CREATE INDEX IF NOT EXISTS idx_ledger_hash ON crypto_audit_ledger(hash);

-- 15. TABLA: CONFIGURACIONES GLOBALES DEL SISTEMA
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================================
-- 16. PROCEDIMIENTOS Y TRIGGERS DE INTEGRIDAD Y REGLAS DE NEGOCIO
-- ==============================================================================

-- Función genérica para actualización de timestamp
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de actualización de updated_at
DROP TRIGGER IF EXISTS trg_update_roles_ts ON organizational_roles;
CREATE TRIGGER trg_update_roles_ts BEFORE UPDATE ON organizational_roles
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_users_ts ON user_profiles;
CREATE TRIGGER trg_update_users_ts BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_controls_ts ON controls;
CREATE TRIGGER trg_update_controls_ts BEFORE UPDATE ON controls
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_risks_ts ON risks;
CREATE TRIGGER trg_update_risks_ts BEFORE UPDATE ON risks
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_flaws_ts ON operational_flaws;
CREATE TRIGGER trg_update_flaws_ts BEFORE UPDATE ON operational_flaws
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_kris_ts ON kri_definitions;
CREATE TRIGGER trg_update_kris_ts BEFORE UPDATE ON kri_definitions
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

DROP TRIGGER IF EXISTS trg_update_alerts_ts ON anomaly_alerts;
CREATE TRIGGER trg_update_alerts_ts BEFORE UPDATE ON anomaly_alerts
FOR EACH ROW EXECUTE FUNCTION fn_update_timestamp();

-- Función automática para cálculo de score y nivel en Matriz 4x4
CREATE OR REPLACE FUNCTION fn_calculate_risk_matrix()
RETURNS TRIGGER AS $$
BEGIN
    -- Cálculo Inherente
    NEW.inherent_score := NEW.inherent_likelihood * NEW.inherent_impact;
    IF NEW.inherent_score >= 12 THEN
        NEW.inherent_level := 'Crítico';
    ELSIF NEW.inherent_score >= 8 THEN
        NEW.inherent_level := 'Alto';
    ELSIF NEW.inherent_score >= 4 THEN
        NEW.inherent_level := 'Medio';
    ELSE
        NEW.inherent_level := 'Bajo';
    END IF;

    -- Cálculo Residual
    NEW.residual_score := NEW.residual_likelihood * NEW.residual_impact;
    IF NEW.residual_score >= 12 THEN
        NEW.residual_level := 'Crítico';
    ELSIF NEW.residual_score >= 8 THEN
        NEW.residual_level := 'Alto';
    ELSIF NEW.residual_score >= 4 THEN
        NEW.residual_level := 'Medio';
    ELSE
        NEW.residual_level := 'Bajo';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_risk_matrix ON risks;
CREATE TRIGGER trg_calculate_risk_matrix
BEFORE INSERT OR UPDATE OF inherent_likelihood, inherent_impact, residual_likelihood, residual_impact
ON risks
FOR EACH ROW EXECUTE FUNCTION fn_calculate_risk_matrix();

-- Función para cálculo de efectividad ponderada de controles (40% diseño + 60% operación)
CREATE OR REPLACE FUNCTION fn_calculate_control_effectiveness()
RETURNS TRIGGER AS $$
BEGIN
    -- Misma regla que la aplicación: total redondeado; Efectivo >= 85, Parcial >= 65.
    NEW.total_effectiveness := ROUND((NEW.design_effectiveness * 0.40 + NEW.operating_effectiveness * 0.60)::numeric, 0);
    IF NEW.total_effectiveness >= 85 THEN
        NEW.status := 'Efectivo';
    ELSIF NEW.total_effectiveness >= 65 THEN
        NEW.status := 'Parcialmente Efectivo';
    ELSE
        NEW.status := 'Deficiente';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_control_effectiveness ON controls;
CREATE TRIGGER trg_calculate_control_effectiveness
BEFORE INSERT OR UPDATE OF design_effectiveness, operating_effectiveness
ON controls
FOR EACH ROW EXECUTE FUNCTION fn_calculate_control_effectiveness();

-- ==============================================================================
-- 17. VISTAS ANALÍTICAS Y REPORTING EJECUTIVO
-- ==============================================================================

-- Vista Resumen de Procesos y Exposición Residual
CREATE OR REPLACE VIEW v_process_risk_summary AS
SELECT 
    r.process,
    COUNT(r.id) AS total_risks,
    COUNT(CASE WHEN r.residual_level = 'Crítico' THEN 1 END) AS critical_risks,
    COUNT(CASE WHEN r.residual_level = 'Alto' THEN 1 END) AS high_risks,
    COUNT(CASE WHEN r.residual_level = 'Medio' THEN 1 END) AS medium_risks,
    COUNT(CASE WHEN r.residual_level = 'Bajo' THEN 1 END) AS low_risks,
    COALESCE(SUM(r.financial_exposure_usd), 0) AS total_inherent_exposure_usd,
    COALESCE(SUM(r.residual_exposure_usd), 0) AS total_residual_exposure_usd,
    COALESCE(SUM(r.financial_exposure_usd - r.residual_exposure_usd), 0) AS mitigated_exposure_usd,
    ROUND(AVG(r.residual_score), 2) AS avg_residual_score
FROM risks r
GROUP BY r.process;

-- Vista de Brechas de KRI Activas
CREATE OR REPLACE VIEW v_kri_breaches AS
SELECT 
    k.code,
    k.name,
    k.process,
    k.category,
    k.industry,
    k.current_value,
    k.warning_threshold,
    k.critical_threshold,
    k.unit,
    k.status,
    k.direction,
    k.responsible,
    k.last_updated
FROM kri_definitions k
WHERE k.status IN ('Advertencia', 'Crítico')
ORDER BY CASE WHEN k.status = 'Crítico' THEN 1 ELSE 2 END, k.last_updated DESC;


-- ==============================================================================
-- 18. BASE DE PÉRDIDAS OPERACIONALES Y REPORTE REGULATORIO (NORMATIVA CMF PARA CACs)
-- Idempotente: puede ejecutarse sobre una base existente.
-- ==============================================================================

ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS business_line VARCHAR(100);
ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS basel_category VARCHAR(100);
ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS basel_subcategory VARCHAR(150);
ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS occurrence_date DATE;
ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS discovery_date DATE;
ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS accounting_date DATE;
ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS accounting_account VARCHAR(150);
ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS credit_risk_boundary BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_flaws_business_line ON operational_flaws(business_line);
CREATE INDEX IF NOT EXISTS idx_flaws_occurrence_date ON operational_flaws(occurrence_date);

-- Hitos de reporte configurables (plazo en minutos desde la toma de conocimiento)
CREATE TABLE IF NOT EXISTS regulatory_milestone_templates (
    id VARCHAR(64) PRIMARY KEY,
    authority VARCHAR(10) NOT NULL CHECK (authority IN ('CMF', 'ANCI')),
    name VARCHAR(255) NOT NULL,
    deadline_minutes INTEGER NOT NULL CHECK (deadline_minutes > 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Reporte regulatorio de un incidente (uno por incidente)
CREATE TABLE IF NOT EXISTS regulatory_reports (
    flaw_id VARCHAR(64) PRIMARY KEY REFERENCES operational_flaws(id) ON DELETE CASCADE,
    awareness_at TIMESTAMPTZ NOT NULL,
    reportable_to_cmf BOOLEAN NOT NULL DEFAULT FALSE,
    reportable_to_anci BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'Abierto' CHECK (status IN ('Abierto', 'Cerrado')),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_regulatory_authority CHECK (reportable_to_cmf OR reportable_to_anci)
);

-- Envíos realizados al regulador por hito
CREATE TABLE IF NOT EXISTS regulatory_submissions (
    id SERIAL PRIMARY KEY,
    flaw_id VARCHAR(64) NOT NULL REFERENCES regulatory_reports(flaw_id) ON DELETE CASCADE,
    milestone_id VARCHAR(64) NOT NULL REFERENCES regulatory_milestone_templates(id),
    submitted_at TIMESTAMPTZ NOT NULL,
    submitted_by VARCHAR(255) NOT NULL,
    folio VARCHAR(100),
    UNIQUE (flaw_id, milestone_id)
);

-- Actualizaciones informadas al regulador
CREATE TABLE IF NOT EXISTS regulatory_report_updates (
    id SERIAL PRIMARY KEY,
    flaw_id VARCHAR(64) NOT NULL REFERENCES regulatory_reports(flaw_id) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    author VARCHAR(255) NOT NULL,
    note TEXT NOT NULL
);

-- Vista: base de pérdidas operacionales
CREATE OR REPLACE VIEW v_loss_database AS
SELECT
    f.id, f.title, f.process, f.business_line,
    COALESCE(f.basel_category, f.ai_suggested_category) AS basel_category,
    f.basel_subcategory, f.occurrence_date, f.discovery_date, f.accounting_date, f.accounting_account,
    f.real_loss_amount_usd AS gross_loss_usd,
    f.recovered_amount_usd AS recoveries_usd,
    GREATEST(f.real_loss_amount_usd - f.recovered_amount_usd, 0) AS net_loss_usd,
    f.credit_risk_boundary,
    COALESCE(r.reportable_to_cmf, FALSE) AS reported_to_cmf,
    COALESCE(r.reportable_to_anci, FALSE) AS reported_to_anci
FROM operational_flaws f
LEFT JOIN regulatory_reports r ON r.flaw_id = f.id
WHERE f.real_loss_amount_usd > 0;

-- Vista: estado de plazos regulatorios por hito
CREATE OR REPLACE VIEW v_regulatory_deadlines AS
SELECT
    r.flaw_id, t.authority, t.name AS milestone,
    r.awareness_at + make_interval(mins => t.deadline_minutes) AS deadline_at,
    s.submitted_at, s.folio,
    CASE
        WHEN s.submitted_at IS NOT NULL AND s.submitted_at <= r.awareness_at + make_interval(mins => t.deadline_minutes) THEN 'Enviado a tiempo'
        WHEN s.submitted_at IS NOT NULL THEN 'Enviado fuera de plazo'
        WHEN now() > r.awareness_at + make_interval(mins => t.deadline_minutes) THEN 'Vencido'
        ELSE 'Pendiente'
    END AS status
FROM regulatory_reports r
JOIN regulatory_milestone_templates t
  ON t.enabled AND ((t.authority = 'CMF' AND r.reportable_to_cmf) OR (t.authority = 'ANCI' AND r.reportable_to_anci))
LEFT JOIN regulatory_submissions s ON s.flaw_id = r.flaw_id AND s.milestone_id = t.id;

-- ==============================================================================
-- 19. PROVEEDORES, EXTERNALIZACIÓN Y CONTINUIDAD DEL NEGOCIO (FASE 2)
-- Idempotente: puede ejecutarse sobre una base existente.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS service_providers (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(20),
    service_description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    criticality VARCHAR(20) NOT NULL CHECK (criticality IN ('Crítico', 'Alto', 'Medio', 'Bajo')),
    internal_owner VARCHAR(255),
    supported_processes TEXT[] NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo', 'En evaluación', 'En término')),
    is_cloud BOOLEAN NOT NULL DEFAULT FALSE,
    cloud_model VARCHAR(10) CHECK (cloud_model IN ('IaaS', 'PaaS', 'SaaS')),
    data_location VARCHAR(20) NOT NULL DEFAULT 'Chile' CHECK (data_location IN ('Chile', 'Extranjero')),
    data_country VARCHAR(100),
    handles_member_data BOOLEAN NOT NULL DEFAULT FALSE,
    uses_subcontractors BOOLEAN NOT NULL DEFAULT FALSE,
    contract_start DATE,
    contract_end DATE NOT NULL,
    annual_cost_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
    clauses JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_assessment_date DATE,
    assessment_score SMALLINT CHECK (assessment_score BETWEEN 0 AND 100),
    has_exit_plan BOOLEAN NOT NULL DEFAULT FALSE,
    exit_plan_notes TEXT,
    committed_rto_hours NUMERIC(8,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_provider_contract_dates CHECK (contract_start IS NULL OR contract_end >= contract_start)
);

ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS provider_id VARCHAR(64) REFERENCES service_providers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS bia_processes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(255),
    business_line VARCHAR(100),
    description TEXT,
    impact_financial SMALLINT NOT NULL CHECK (impact_financial BETWEEN 1 AND 4),
    impact_members SMALLINT NOT NULL CHECK (impact_members BETWEEN 1 AND 4),
    impact_regulatory SMALLINT NOT NULL CHECK (impact_regulatory BETWEEN 1 AND 4),
    impact_reputational SMALLINT NOT NULL CHECK (impact_reputational BETWEEN 1 AND 4),
    mtpd_hours NUMERIC(8,2) NOT NULL,
    rto_hours NUMERIC(8,2) NOT NULL,
    rpo_hours NUMERIC(8,2) NOT NULL,
    systems TEXT[] NOT NULL DEFAULT '{}',
    minimum_staff INTEGER NOT NULL DEFAULT 0,
    alternate_site VARCHAR(255),
    last_review_date DATE NOT NULL,
    CONSTRAINT chk_bia_rto_mtpd CHECK (rto_hours <= mtpd_hours)
);

CREATE TABLE IF NOT EXISTS bia_process_providers (
    bia_process_id VARCHAR(64) REFERENCES bia_processes(id) ON DELETE CASCADE,
    provider_id VARCHAR(64) REFERENCES service_providers(id) ON DELETE CASCADE,
    PRIMARY KEY (bia_process_id, provider_id)
);

CREATE TABLE IF NOT EXISTS continuity_plans (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(60) NOT NULL,
    owner VARCHAR(255),
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    approved_by VARCHAR(100),
    approval_date DATE,
    next_review_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Borrador' CHECK (status IN ('Vigente', 'En actualización', 'Borrador'))
);

CREATE TABLE IF NOT EXISTS continuity_plan_processes (
    plan_id VARCHAR(64) REFERENCES continuity_plans(id) ON DELETE CASCADE,
    bia_process_id VARCHAR(64) REFERENCES bia_processes(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, bia_process_id)
);

CREATE TABLE IF NOT EXISTS continuity_tests (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL REFERENCES continuity_plans(id) ON DELETE CASCADE,
    test_date DATE NOT NULL,
    type VARCHAR(60) NOT NULL,
    scenario TEXT NOT NULL,
    bia_process_id VARCHAR(64) REFERENCES bia_processes(id) ON DELETE SET NULL,
    achieved_rto_hours NUMERIC(8,2),
    result VARCHAR(30) NOT NULL CHECK (result IN ('Exitosa', 'Con observaciones', 'Fallida')),
    findings TEXT,
    actions TEXT
);

-- Vista: procesos cuyo proveedor compromete un RTO mayor al requerido
CREATE OR REPLACE VIEW v_provider_rto_gaps AS
SELECT b.id AS bia_process_id, b.name AS process, b.rto_hours AS required_rto_hours,
       p.code AS provider_code, p.name AS provider, p.committed_rto_hours
FROM bia_processes b
JOIN bia_process_providers bp ON bp.bia_process_id = b.id
JOIN service_providers p ON p.id = bp.provider_id
WHERE p.committed_rto_hours IS NOT NULL AND p.committed_rto_hours > b.rto_hours;

-- Vista: contratos que vencen en los próximos 90 días o ya vencidos
CREATE OR REPLACE VIEW v_provider_contract_expiry AS
SELECT code, name, criticality, contract_end, (contract_end - CURRENT_DATE) AS days_to_end, status
FROM service_providers
WHERE contract_end <= CURRENT_DATE + 90
ORDER BY contract_end;

-- ==============================================================================
-- 20. AUTENTICACIÓN: CÓDIGO DE UN SOLO USO POR CORREO Y SESIONES (FASE 4)
-- ==============================================================================

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
-- El correo identifica al usuario al iniciar sesión: debe ser único sin distinguir mayúsculas.
DO $$
BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_email_lower ON user_profiles (lower(email));
EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'Hay correos duplicados (sin distinguir mayúsculas) en user_profiles; corríjalos para habilitar el índice único.';
END $$;

-- Códigos de acceso enviados por correo (se guarda solo su hash)
CREATE TABLE IF NOT EXISTS auth_login_codes (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    code_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ,
    request_ip VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_login_codes(user_id, created_at DESC);

-- Sesiones activas (se guarda solo el hash del token de la cookie)
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    ip VARCHAR(100),
    user_agent VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);

-- ==============================================================================
-- 21. SEGURIDAD DE LA INFORMACIÓN Y CIBERSEGURIDAD
-- ==============================================================================

CREATE TABLE IF NOT EXISTS info_assets (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(60) NOT NULL,
    owner VARCHAR(255) NOT NULL,
    custodian VARCHAR(255),
    classification VARCHAR(20) NOT NULL CHECK (classification IN ('Pública', 'Interna', 'Confidencial', 'Restringida')),
    confidentiality SMALLINT NOT NULL CHECK (confidentiality BETWEEN 1 AND 4),
    integrity SMALLINT NOT NULL CHECK (integrity BETWEEN 1 AND 4),
    availability SMALLINT NOT NULL CHECK (availability BETWEEN 1 AND 4),
    handles_personal_data BOOLEAN NOT NULL DEFAULT FALSE,
    location VARCHAR(40) NOT NULL,
    provider_id VARCHAR(64) REFERENCES service_providers(id) ON DELETE SET NULL,
    bia_process_ids TEXT[] NOT NULL DEFAULT '{}',
    last_review_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vulnerabilities (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    asset_id VARCHAR(64) NOT NULL REFERENCES info_assets(id) ON DELETE CASCADE,
    source VARCHAR(40) NOT NULL,
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('Crítica', 'Alta', 'Media', 'Baja')),
    cvss_score NUMERIC(3,1) CHECK (cvss_score BETWEEN 0 AND 10),
    detected_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('Abierta', 'En remediación', 'Mitigada', 'Riesgo aceptado', 'Cerrada')),
    owner VARCHAR(255),
    remediation TEXT,
    closed_date DATE,
    acceptance JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_vuln_dates CHECK (due_date >= detected_date),
    CONSTRAINT chk_vuln_acceptance CHECK (status <> 'Riesgo aceptado' OR acceptance IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_asset ON vulnerabilities(asset_id);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_status ON vulnerabilities(status, due_date);

CREATE TABLE IF NOT EXISTS security_assessment_items (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    domain VARCHAR(40) NOT NULL,
    requirement TEXT NOT NULL,
    guidance TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'Sin evaluar'
        CHECK (status IN ('Sin evaluar', 'Cumple', 'Cumple parcialmente', 'No cumple', 'No aplica')),
    evidence TEXT,
    owner VARCHAR(255),
    action_plan TEXT,
    due_date DATE,
    assessed_by VARCHAR(255),
    assessed_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS affected_asset_ids TEXT[] NOT NULL DEFAULT '{}';

-- Vista: vulnerabilidades abiertas fuera de plazo
CREATE OR REPLACE VIEW v_overdue_vulnerabilities AS
SELECT v.code, v.title, v.severity, v.due_date, (CURRENT_DATE - v.due_date) AS days_overdue,
       a.code AS asset_code, a.name AS asset, v.owner
FROM vulnerabilities v JOIN info_assets a ON a.id = v.asset_id
WHERE v.status IN ('Abierta', 'En remediación') AND v.due_date < CURRENT_DATE
ORDER BY v.due_date;

-- ==============================================================================
-- 22. REPORTE DE INCIDENTES SEGÚN RAN 20-8 (CAC-3 §5.2) Y PREPARACIÓN APR
-- ==============================================================================

ALTER TABLE regulatory_reports ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;
ALTER TABLE regulatory_reports ADD COLUMN IF NOT EXISTS details JSONB;
ALTER TABLE regulatory_milestone_templates ADD COLUMN IF NOT EXISTS basis VARCHAR(20) NOT NULL DEFAULT 'conocimiento';
ALTER TABLE regulatory_milestone_templates ADD COLUMN IF NOT EXISTS due_on_close BOOLEAN NOT NULL DEFAULT FALSE;
DO $$
BEGIN
    ALTER TABLE regulatory_milestone_templates ADD CONSTRAINT chk_milestone_basis CHECK (basis IN ('ocurrencia', 'conocimiento'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==============================================================================
-- 23. MANTENEDORES: ÁREAS Y MAPA DE PROCESOS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS org_areas (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    manager VARCHAR(255),
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_areas_name ON org_areas (lower(name));

-- Riesgos, controles, incidentes, KRIs, alertas y hallazgos guardan el nombre del proceso;
-- al renombrar un proceso el servidor actualiza esas referencias en la misma transacción.
CREATE TABLE IF NOT EXISTS business_processes (
    id VARCHAR(64) PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    area_id VARCHAR(64) REFERENCES org_areas(id) ON DELETE SET NULL,
    owner VARCHAR(255),
    business_line VARCHAR(100),
    criticality VARCHAR(20) NOT NULL DEFAULT 'Medio' CHECK (criticality IN ('Crítico', 'Alto', 'Medio', 'Bajo')),
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_business_processes_name ON business_processes (lower(name));
CREATE INDEX IF NOT EXISTS idx_business_processes_area ON business_processes (area_id);

-- ==============================================================================
-- 24. CUMPLIMIENTO RAN 20-7, 20-8, 20-9 Y 20-10
-- ==============================================================================

ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS ran207 JSONB;
ALTER TABLE bia_processes ADD COLUMN IF NOT EXISTS ran209 JSONB;
ALTER TABLE continuity_plans ADD COLUMN IF NOT EXISTS ran209 JSONB;
ALTER TABLE continuity_tests ADD COLUMN IF NOT EXISTS ran209 JSONB;
ALTER TABLE operational_flaws ADD COLUMN IF NOT EXISTS cyber JSONB;
ALTER TABLE info_assets ADD COLUMN IF NOT EXISTS critical_infrastructure BOOLEAN NOT NULL DEFAULT FALSE;

-- Biblioteca normativa: RAN de la CMF, leyes, circulares, estándares y políticas internas
CREATE TABLE IF NOT EXISTS compliance_norms (
    id VARCHAR(60) PRIMARY KEY,
    code VARCHAR(60) NOT NULL,
    title VARCHAR(255) NOT NULL,
    kind VARCHAR(40) NOT NULL DEFAULT 'Otra',
    issuer VARCHAR(120),
    source TEXT,
    url TEXT,
    version VARCHAR(60) NOT NULL DEFAULT '1',
    effective_date DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'Vigente' CHECK (status IN ('Vigente', 'Publicada, aún no vigente', 'En consulta', 'Derogada')),
    applicability VARCHAR(30) NOT NULL DEFAULT 'Aplica' CHECK (applicability IN ('Aplica', 'Aplica parcialmente', 'Por determinar', 'No aplica')),
    applicability_note TEXT,
    owner VARCHAR(255),
    notes TEXT,
    versions JSONB NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 100,
    referential BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_norms_code ON compliance_norms (lower(code));

-- Matriz de requisitos normativos con su evaluación ("chapter" es el id de la norma)
CREATE TABLE IF NOT EXISTS compliance_requirements (
    id VARCHAR(120) PRIMARY KEY,
    chapter VARCHAR(60) NOT NULL,
    numeral VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL,
    requirement TEXT NOT NULL,
    module VARCHAR(60),
    auto_check VARCHAR(60),
    frequency VARCHAR(20) NOT NULL DEFAULT 'Anual' CHECK (frequency IN ('Permanente', 'Anual', 'Semestral', 'Por evento')),
    status VARCHAR(30) NOT NULL DEFAULT 'Sin evaluar' CHECK (status IN ('Sin evaluar', 'Cumple', 'Cumple parcialmente', 'No cumple', 'No aplica')),
    evidence TEXT,
    owner VARCHAR(255),
    action_plan TEXT,
    due_date DATE,
    last_review_date DATE,
    reviewed_by VARCHAR(255),
    control_ids JSONB NOT NULL DEFAULT '[]',
    norm_version VARCHAR(60),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Cumplimiento multinorma: el requisito ya no se limita a las RAN, se vincula a controles
-- y guarda la versión de la norma con que se evaluó.
ALTER TABLE compliance_requirements DROP CONSTRAINT IF EXISTS compliance_requirements_chapter_check;
ALTER TABLE compliance_requirements ALTER COLUMN chapter TYPE VARCHAR(60);
ALTER TABLE compliance_requirements ADD COLUMN IF NOT EXISTS control_ids JSONB NOT NULL DEFAULT '[]';
ALTER TABLE compliance_requirements ADD COLUMN IF NOT EXISTS norm_version VARCHAR(60);
CREATE INDEX IF NOT EXISTS idx_compliance_chapter ON compliance_requirements (chapter);

-- Planes de acción: registro único de los planes que nacen de cualquier módulo
CREATE TABLE IF NOT EXISTS action_plans (
    id VARCHAR(80) PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    source_type VARCHAR(40) NOT NULL CHECK (source_type IN ('Riesgo', 'Control', 'Auditoría', 'Cumplimiento', 'Autoevaluación de seguridad', 'Continuidad', 'Proveedor', 'Incidente', 'Otro')),
    source_id VARCHAR(160),
    source_label VARCHAR(255) NOT NULL DEFAULT '',
    process VARCHAR(255),
    owner VARCHAR(255) NOT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'Media' CHECK (priority IN ('Alta', 'Media', 'Baja')),
    start_date DATE,
    due_date DATE NOT NULL,
    original_due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'En curso', 'Por verificar', 'Cerrado', 'Cancelado')),
    progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
    tasks JSONB NOT NULL DEFAULT '[]',
    updates JSONB NOT NULL DEFAULT '[]',
    reschedules JSONB NOT NULL DEFAULT '[]',
    closure JSONB,
    rejections JSONB NOT NULL DEFAULT '[]',
    cancel_reason TEXT,
    created_by VARCHAR(255) NOT NULL,
    created_at_iso VARCHAR(40) NOT NULL,
    closed_at DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_action_plans_code ON action_plans (code);
CREATE INDEX IF NOT EXISTS idx_action_plans_source ON action_plans (source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_action_plans_owner ON action_plans (lower(owner));
CREATE INDEX IF NOT EXISTS idx_action_plans_status ON action_plans (status, due_date);

-- Autoevaluaciones: campañas (RCSA, BIA, cumplimiento o propias) y la encuesta de cada responsable
CREATE TABLE IF NOT EXISTS survey_campaigns (
    id VARCHAR(80) PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('RCSA', 'BIA', 'Cumplimiento', 'Personalizada')),
    description TEXT,
    scope JSONB NOT NULL DEFAULT '[]',
    norm_id VARCHAR(60),
    respondent VARCHAR(255),
    custom_items JSONB,
    due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Borrador' CHECK (status IN ('Borrador', 'En curso', 'Cerrada')),
    launched_at VARCHAR(40),
    closed_at VARCHAR(40),
    created_by VARCHAR(255) NOT NULL,
    created_at_iso VARCHAR(40) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_campaigns_code ON survey_campaigns (code);

CREATE TABLE IF NOT EXISTS survey_responses (
    id VARCHAR(80) PRIMARY KEY,
    campaign_id VARCHAR(80) NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    respondent VARCHAR(255) NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    answers JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'En progreso', 'Enviada', 'Devuelta', 'Revisada')),
    due_date DATE NOT NULL,
    started_at VARCHAR(40),
    submitted_at VARCHAR(40),
    returned_note TEXT,
    reviewed_by VARCHAR(255),
    reviewed_at VARCHAR(40),
    review_note TEXT,
    applied JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_survey_responses_campaign ON survey_responses (campaign_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_respondent ON survey_responses (lower(respondent));

-- Pruebas de seguridad (RAN 20-10 4.1 y 4.2)
CREATE TABLE IF NOT EXISTS security_tests (
    id VARCHAR(64) PRIMARY KEY,
    test_date DATE NOT NULL,
    type VARCHAR(80) NOT NULL,
    scope TEXT NOT NULL,
    executed_by VARCHAR(255),
    result VARCHAR(30) NOT NULL CHECK (result IN ('Satisfactoria', 'Con observaciones', 'Insatisfactoria')),
    findings TEXT,
    reported_to_board_date DATE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Aprobaciones: solicitudes con niveles de aprobación (matriz en system_settings.approval_matrix)
ALTER TABLE risks ADD COLUMN IF NOT EXISTS acceptance JSONB;

CREATE TABLE IF NOT EXISTS approval_requests (
    id VARCHAR(80) PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    kind VARCHAR(40) NOT NULL,  -- validado por la aplicación (APPROVAL_KINDS)
    target_entity VARCHAR(40) NOT NULL,
    target_id VARCHAR(80) NOT NULL,
    target_label VARCHAR(300) NOT NULL,
    justification TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    requested_by VARCHAR(255) NOT NULL,
    requested_at VARCHAR(40) NOT NULL,
    steps JSONB NOT NULL DEFAULT '[]',
    current_step INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'Aprobada', 'Rechazada', 'Anulada')),
    closed_at VARCHAR(40),
    cancel_reason TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Los tipos de solicitud los valida la aplicación: se quita la restricción anterior (gestión documental agregó "documento").
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_kind_check;
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_requests_code ON approval_requests (code);
CREATE INDEX IF NOT EXISTS idx_approval_requests_target ON approval_requests (target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests (status);

-- Notificaciones: bandeja de cada persona y cola de correo
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(80) PRIMARY KEY,
    recipient VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(255) NOT NULL DEFAULT '',
    category VARCHAR(40) NOT NULL,
    severity VARCHAR(10) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'aviso', 'urgente')),
    title VARCHAR(300) NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    tab VARCHAR(60),
    entity_type VARCHAR(40),
    entity_id VARCHAR(120),
    created_at VARCHAR(40) NOT NULL,
    read_at VARCHAR(40),
    email_status VARCHAR(12) NOT NULL DEFAULT 'pendiente' CHECK (email_status IN ('pendiente', 'enviado', 'resumen', 'omitido', 'error')),
    email_error TEXT,
    email_sent_at VARCHAR(40),
    dedupe_key VARCHAR(400) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe ON notifications (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_email ON notifications (email_status);

-- Preferencias de aviso por persona (correo inmediato, resumen diario o sin correo)
CREATE TABLE IF NOT EXISTS notification_preferences (
    email VARCHAR(255) PRIMARY KEY,
    email_mode VARCHAR(12) NOT NULL DEFAULT 'inmediato' CHECK (email_mode IN ('inmediato', 'resumen', 'ninguno')),
    muted JSONB NOT NULL DEFAULT '[]',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Evidencias: archivos adjuntos a un registro (contenido en la base, SHA-256 calculado por el servidor).
-- Las bajas no borran el contenido: se marcan con quién, cuándo y por qué.
CREATE TABLE IF NOT EXISTS evidence_files (
    id VARCHAR(80) PRIMARY KEY,
    entity_type VARCHAR(40) NOT NULL,
    entity_id VARCHAR(120) NOT NULL,
    context VARCHAR(120),
    file_name VARCHAR(200) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    sha256 CHAR(64) NOT NULL,
    description TEXT,
    uploaded_by VARCHAR(255) NOT NULL,
    uploaded_by_email VARCHAR(255),
    uploaded_at VARCHAR(40) NOT NULL,
    deleted_at VARCHAR(40),
    deleted_by VARCHAR(255),
    delete_reason TEXT,
    content BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_files_entity ON evidence_files (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_evidence_files_sha ON evidence_files (sha256);

-- Gestión documental: políticas, manuales y procedimientos con versiones (cada versión
-- lleva su archivo en evidence_files) y confirmaciones de lectura.
CREATE TABLE IF NOT EXISTS controlled_documents (
    id VARCHAR(80) PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    title VARCHAR(300) NOT NULL,
    doc_type VARCHAR(30) NOT NULL CHECK (doc_type IN ('Política', 'Manual', 'Reglamento', 'Procedimiento', 'Instructivo', 'Plan', 'Formulario', 'Otro')),
    description TEXT NOT NULL DEFAULT '',
    owner VARCHAR(255) NOT NULL DEFAULT '',
    classification VARCHAR(20) NOT NULL DEFAULT 'Interna' CHECK (classification IN ('Pública', 'Interna', 'Confidencial')),
    review_months INTEGER NOT NULL DEFAULT 12 CHECK (review_months BETWEEN 1 AND 60),
    audience_role_ids JSONB NOT NULL DEFAULT '[]',
    requirement_ids JSONB NOT NULL DEFAULT '[]',
    processes JSONB NOT NULL DEFAULT '[]',
    versions JSONB NOT NULL DEFAULT '[]',
    current_version_id VARCHAR(80),
    next_review_date DATE,
    acknowledgments JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(12) NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo', 'Obsoleto')),
    obsolete_reason TEXT,
    created_by VARCHAR(255) NOT NULL DEFAULT '',
    created_at VARCHAR(40) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_controlled_documents_code ON controlled_documents (code);

-- Ingreso con Google: cuenta vinculada (claim "sub" del id_token) para cada persona
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_google_sub ON user_profiles (google_sub);
