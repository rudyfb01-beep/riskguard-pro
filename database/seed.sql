-- ==============================================================================
-- SISTEMA DE GESTIÓN INTEGRAL DE RIESGO OPERACIONAL & AUDITORÍA (CUSTODIA RISK)
-- Datos Iniciales / Semilla de Demostración y Producción
-- Archivo: database/seed.sql
-- ==============================================================================

-- 1. CARGOS DE GOBIERNO COOPERATIVO (RBAC)
INSERT INTO organizational_roles (id, title, department, description, badge, is_system_role, permissions) VALUES
('role-riesgo-op', 'Jefe de Riesgo Operacional', 'Gerencia de Riesgos', 'Administra el marco de gestión de riesgo operacional, la base de pérdidas y el reporte de incidentes a la CMF y la ANCI.', 'Super Administrador', TRUE, '{"canEditRisks": true, "canEvaluateControls": true, "canExecuteAudits": true, "canReportFlaws": true, "canConvertFlaws": true, "canAcknowledgeAlerts": true, "canConfigureKRIs": true, "canManageRoles": true, "canExportReports": true, "canManageRegulatoryReports": true}'::jsonb),
('role-gerencia-general', 'Gerente General', 'Gerencia General', 'Responsable ante el Consejo de la implementación del marco de riesgos; toma conocimiento y autoriza los reportes de incidentes al regulador.', 'Alta Administración', TRUE, '{"canEditRisks": true, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": true, "canConvertFlaws": true, "canAcknowledgeAlerts": true, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": true}'::jsonb),
('role-auditoria-interna', 'Auditor Interno', 'Auditoría Interna', 'Evalúa de forma independiente la efectividad de controles y del marco de gestión; reporta al Comité de Auditoría y al Consejo.', 'Tercera Línea', TRUE, '{"canEditRisks": false, "canEvaluateControls": true, "canExecuteAudits": true, "canReportFlaws": true, "canConvertFlaws": false, "canAcknowledgeAlerts": true, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb),
('role-ops', 'Gerente de Operaciones', 'Gerencia de Operaciones y Tecnología', 'Dueño de procesos operativos (créditos, captaciones, pagos y sucursales); mitiga riesgos de primera línea y reporta eventos de pérdida.', 'Dueño de Proceso', TRUE, '{"canEditRisks": true, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": true, "canConvertFlaws": true, "canAcknowledgeAlerts": true, "canConfigureKRIs": true, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb),
('role-ciso', 'Oficial de Seguridad de la Información (CISO)', 'Seguridad de la Información y Ciberseguridad', 'Gestiona controles de ciberseguridad y la notificación de ciberincidentes a la ANCI y a la CMF.', 'Ciberseguridad', FALSE, '{"canEditRisks": true, "canEvaluateControls": true, "canExecuteAudits": true, "canReportFlaws": true, "canConvertFlaws": true, "canAcknowledgeAlerts": true, "canConfigureKRIs": true, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": true}'::jsonb),
('role-cumplimiento', 'Oficial de Cumplimiento', 'Cumplimiento y Prevención de Lavado de Activos', 'Supervisa el cumplimiento normativo, la prevención de lavado de activos (Ley 19.913 / UAF) y los reportes regulatorios.', 'Cumplimiento', FALSE, '{"canEditRisks": false, "canEvaluateControls": true, "canExecuteAudits": true, "canReportFlaws": true, "canConvertFlaws": false, "canAcknowledgeAlerts": true, "canConfigureKRIs": true, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": true}'::jsonb),
('role-comite-riesgos', 'Comité de Riesgos', 'Gobierno Corporativo', 'Instancia de consejeros y alta administración que revisa el perfil de riesgo, el apetito de riesgo y los incidentes relevantes.', 'Gobierno Corporativo', TRUE, '{"canEditRisks": false, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": false, "canConvertFlaws": false, "canAcknowledgeAlerts": false, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb),
('role-consejo', 'Consejo de Administración', 'Gobierno Corporativo', 'Órgano responsable de aprobar las políticas de gestión de riesgos y de velar por su cumplimiento.', 'Consejo', TRUE, '{"canEditRisks": false, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": false, "canConvertFlaws": false, "canAcknowledgeAlerts": false, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb),
('role-junta-vigilancia', 'Junta de Vigilancia', 'Gobierno Corporativo', 'Órgano fiscalizador interno de la cooperativa; revisa la administración, los estados financieros y los informes de auditoría.', 'Fiscalización Interna', TRUE, '{"canEditRisks": false, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": false, "canConvertFlaws": false, "canAcknowledgeAlerts": false, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 2. USUARIOS DE EJEMPLO (UNO POR CARGO)
INSERT INTO user_profiles (id, name, email, role_id, role_title, department, badge, is_system_user, permissions) VALUES
('usr-riesgo-op', 'Dra. Elena Vasconcelos', 'elena.vasconcelos@custodia-risk.com', 'role-riesgo-op', 'Jefe de Riesgo Operacional', 'Gerencia de Riesgos', 'Jefa de Riesgo Operacional', TRUE, '{"canEditRisks": true, "canEvaluateControls": true, "canExecuteAudits": true, "canReportFlaws": true, "canConvertFlaws": true, "canAcknowledgeAlerts": true, "canConfigureKRIs": true, "canManageRoles": true, "canExportReports": true, "canManageRegulatoryReports": true}'::jsonb),
('usr-gerencia-general', 'Sr. Patricio Rojas', 'patricio.rojas@custodia-risk.com', 'role-gerencia-general', 'Gerente General', 'Gerencia General', 'Gerente General', TRUE, '{"canEditRisks": true, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": true, "canConvertFlaws": true, "canAcknowledgeAlerts": true, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": true}'::jsonb),
('usr-auditoria-interna', 'Lic. Roberto Miranda', 'roberto.miranda@custodia-risk.com', 'role-auditoria-interna', 'Auditor Interno', 'Auditoría Interna', 'Auditor Interno Líder', TRUE, '{"canEditRisks": false, "canEvaluateControls": true, "canExecuteAudits": true, "canReportFlaws": true, "canConvertFlaws": false, "canAcknowledgeAlerts": true, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb),
('usr-ops', 'Ing. Carlos Mendoza', 'carlos.mendoza@custodia-risk.com', 'role-ops', 'Gerente de Operaciones', 'Gerencia de Operaciones y Tecnología', 'Dueño de Proceso', TRUE, '{"canEditRisks": true, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": true, "canConvertFlaws": true, "canAcknowledgeAlerts": true, "canConfigureKRIs": true, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb),
('usr-ciso', 'Ing. Alejandro Vega', 'alejandro.vega@custodia-risk.com', 'role-ciso', 'Oficial de Seguridad de la Información (CISO)', 'Seguridad de la Información y Ciberseguridad', 'Ciberseguridad', FALSE, '{"canEditRisks": true, "canEvaluateControls": true, "canExecuteAudits": true, "canReportFlaws": true, "canConvertFlaws": true, "canAcknowledgeAlerts": true, "canConfigureKRIs": true, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": true}'::jsonb),
('usr-cumplimiento', 'Dra. Sofía Valenzuela', 'sofia.valenzuela@custodia-risk.com', 'role-cumplimiento', 'Oficial de Cumplimiento', 'Cumplimiento y Prevención de Lavado de Activos', 'Cumplimiento', FALSE, '{"canEditRisks": false, "canEvaluateControls": true, "canExecuteAudits": true, "canReportFlaws": true, "canConvertFlaws": false, "canAcknowledgeAlerts": true, "canConfigureKRIs": true, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": true}'::jsonb),
('usr-comite-riesgos', 'Sr. Andrés Fuentes', 'andres.fuentes@custodia-risk.com', 'role-comite-riesgos', 'Comité de Riesgos', 'Gobierno Corporativo', 'Presidente Comité de Riesgos', TRUE, '{"canEditRisks": false, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": false, "canConvertFlaws": false, "canAcknowledgeAlerts": false, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb),
('usr-consejo', 'Sra. Carmen Soto', 'carmen.soto@custodia-risk.com', 'role-consejo', 'Consejo de Administración', 'Gobierno Corporativo', 'Presidenta del Consejo', TRUE, '{"canEditRisks": false, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": false, "canConvertFlaws": false, "canAcknowledgeAlerts": false, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb),
('usr-junta-vigilancia', 'Sra. Mónica Araya', 'monica.araya@custodia-risk.com', 'role-junta-vigilancia', 'Junta de Vigilancia', 'Gobierno Corporativo', 'Junta de Vigilancia', TRUE, '{"canEditRisks": false, "canEvaluateControls": false, "canExecuteAudits": false, "canReportFlaws": false, "canConvertFlaws": false, "canAcknowledgeAlerts": false, "canConfigureKRIs": false, "canManageRoles": false, "canExportReports": true, "canManageRegulatoryReports": false}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- 3. CONTROLES OPERACIONALES
INSERT INTO controls (id, code, name, description, process, type, automation, frequency, design_effectiveness, operating_effectiveness, total_effectiveness, status, owner, last_tested, evidence, sample_details, last_tested_by, attachments) VALUES
(
    'c-1',
    'CON-CYB-01',
    'MFA y Cifrado TLS 1.3 en Gateway de Pagos',
    'Autenticación multifactor mandatoria para operaciones críticas y cifrado de extremo a extremo.',
    'Procesamiento de Pagos & Transferencias',
    'Preventivo',
    'Automático',
    'Continuo',
    95.00,
    90.00,
    92.00,
    'Efectivo',
    'Ing. Mariana Restrepo (CISO)',
    '2026-10-18',
    'Reporte de auditoría de seguridad perimetral Q3-2026 sin hallazgos críticos.',
    'Inspección de 50.000 transacciones tokenizadas',
    'Carlos Benítez (Auditoría)',
    '[{"id":"ev-1","fileName":"Cert_TLS13_Gateway_Oct26.pdf","fileSize":"2.4 MB","fileType":"application/pdf","uploadedAt":"2026-10-18 10:15","uploadedBy":"Carlos Benítez"}]'::jsonb
),
(
    'c-2',
    'CON-AML-02',
    'Motor Anti-Fraude & Bloqueo ML en Tiempo Real',
    'Reglas heurísticas y modelo de machine learning para detección de patrones anómalos.',
    'Procesamiento de Pagos & Transferencias',
    'Detectivo',
    'Automático',
    'Continuo',
    90.00,
    85.00,
    87.00,
    'Efectivo',
    'Lic. Roberto Arismendi',
    '2026-10-19',
    'Registro de 1.420 transacciones bloqueadas con tasa de falso positivo inferior al 0.08%.',
    'Muestreo aleatorio de 2.000 transferencias sospechosas',
    'Carlos Benítez (Auditoría)',
    '[]'::jsonb
),
(
    'c-3',
    'CON-OPS-03',
    'Conciliación Bancaria Diaria Automatizada',
    'Cruce automatizado de extractos bancarios frente a ledger transaccional interno.',
    'Tesorería y Liquidación',
    'Detectivo',
    'Automático',
    'Diario',
    85.00,
    80.00,
    82.00,
    'Efectivo',
    'Cra. Sofía Lagos',
    '2026-10-20',
    'Acta de cierre contable y conciliación sin descuadres mayores a $0.00 USD.',
    'Conciliación de 12 cuentas corresponsales',
    'Diego Salcedo',
    '[]'::jsonb
),
(
    'c-4',
    'CON-FRA-04',
    'Validación Biométrica y Prueba de Vida Liveness 3D',
    'Verificación de identidad facial certificada iBeta Nivel 2 contra bases oficiales.',
    'Onboarding Digital & KYC',
    'Preventivo',
    'Automático',
    'Continuo',
    95.00,
    75.00,
    83.00,
    'Efectivo',
    'Dr. Fernando Vélez',
    '2026-10-15',
    'Validación biométrica exitosa en 99.4% de enrolamientos del mes.',
    'Muestra de 500 expedientes biométricos',
    'Carlos Benítez',
    '[]'::jsonb
),
(
    'c-5',
    'CON-INF-05',
    'Arquitectura Multi-Región Activo-Activo con Failover',
    'Despliegue distribuido en dos regiones cloud con conmutación por error en < 60 segundos.',
    'Infraestructura Cloud & Core Bancario',
    'Correctivo',
    'Automático',
    'Continuo',
    85.00,
    70.00,
    76.00,
    'Parcialmente Efectivo',
    'Ing. David Kim',
    '2026-09-30',
    'Simulación de caída de zona de disponibilidad completada en 42 segundos.',
    'Prueba de conmutación de tráfico regional',
    'Mariana Restrepo',
    '[]'::jsonb
),
(
    'c-6',
    'CON-LEG-06',
    'Doble Firma y Segregación de Funciones (SoD)',
    'Requerimiento de autorización mancomunada para dispersiones superiores a $10.000 USD.',
    'Tesorería y Liquidación',
    'Preventivo',
    'Semiautomático',
    'Continuo',
    90.00,
    90.00,
    90.00,
    'Efectivo',
    'Dra. Patricia Mendívil',
    '2026-10-12',
    'Bitácora de autorizaciones con tokens físicos de hardware FIDO2.',
    '100% de operaciones mayores a umbral verificadas',
    'Valeria Cifuentes',
    '[]'::jsonb
),
(
    'c-7',
    'CON-BKP-07',
    'Respaldos Inmutables en Frío (Air-Gapped WORM)',
    'Copias de seguridad diarias de base de datos con retención de 7 años protegidas contra ransomware.',
    'Infraestructura Cloud & Core Bancario',
    'Correctivo',
    'Automático',
    'Diario',
    90.00,
    85.00,
    87.00,
    'Efectivo',
    'Ing. David Kim',
    '2026-10-10',
    'Prueba de restauración de base de datos en entorno de laboratorio en 28 minutos.',
    'Restauración de snapshot de 1.2 TB',
    'Carlos Benítez',
    '[]'::jsonb
),
(
    'c-8',
    'CON-HR-08',
    'Screening de Antecedentes y Certificación de Confianza',
    'Verificación de antecedentes judiciales, financieros y pruebas de confianza pre-contratación.',
    'Gestión de Talento & Accesos',
    'Preventivo',
    'Manual',
    'Por Evento',
    80.00,
    70.00,
    74.00,
    'Parcialmente Efectivo',
    'Lic. Claudia Morales',
    '2026-10-01',
    '100% de empleados con acceso a sistemas de producción evaluados anualmente.',
    'Auditoría sobre 45 legajos de colaboradores clave',
    'Diego Salcedo',
    '[]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 4. RIESGOS OPERACIONALES (MATRIZ 4x4)
INSERT INTO risks (
    id, code, title, description, process, category, responsible, status,
    inherent_likelihood, inherent_impact, inherent_score, inherent_level, financial_exposure_usd,
    residual_likelihood, residual_impact, residual_score, residual_level, residual_exposure_usd,
    mitigation_plan, created_at, last_review_date
) VALUES
(
    'r-1',
    'RSK-001',
    'Ataque de Ransomware y Exfiltración de Base de Datos Transaccional',
    'Compromiso de credenciales con privilegios elevados que resulta en cifrado de repositorios y robo de información PII de tarjetahabientes.',
    'Infraestructura Cloud & Core Bancario',
    'Fallas Tecnológicas',
    'Ing. Mariana Restrepo (CISO)',
    'Activo',
    3, 4, 12, 'Crítico', 8500000.00,
    1, 3, 3, 'Bajo', 650000.00,
    '{
        "id": "mp-1",
        "title": "Fortalecimiento de Seguridad Zero-Trust y Respaldos Inmutables",
        "owner": "Mariana Restrepo",
        "dueDate": "2026-11-30",
        "budgetUSD": 140000,
        "progressPct": 75,
        "status": "En Progreso",
        "actions": ["Despliegue EDR en todos los servidores", "Migración de backups a bóveda WORM inmutable", "Simulacro de recuperación ante ransomware"]
    }'::jsonb,
    '2026-01-15', '2026-10-18'
),
(
    'r-2',
    'RSK-002',
    'Ataque de Suplantación de Identidad y Fraude Sintético en Onboarding',
    'Creación masiva de cuentas mediante documentos de identidad falsificados y deepfakes para lavado de dinero o fraude crediticio.',
    'Onboarding Digital & KYC',
    'Fraude Externo',
    'Dr. Fernando Vélez',
    'Bajo Monitoreo',
    4, 3, 12, 'Crítico', 3200000.00,
    2, 2, 4, 'Medio', 480000.00,
    '{
        "id": "mp-2",
        "title": "Incorporación de Verificación Biométrica 3D Activa y Validación con Burós",
        "owner": "Fernando Vélez",
        "dueDate": "2026-12-15",
        "budgetUSD": 85000,
        "progressPct": 60,
        "status": "En Progreso",
        "actions": ["Calibración de umbrales liveness 3D", "Conexión a listas restrictivas OFAC/Interpol", "Revisión manual de casos borderline"]
    }'::jsonb,
    '2026-02-10', '2026-10-15'
),
(
    'r-3',
    'RSK-003',
    'Caída Prolongada del Core Bancario en Horas Pico de Liquidación',
    'Indisponibilidad del servicio de transferencias inmediatas por sobrecarga o falla de red, excediendo el RTO fijado en 15 minutos.',
    'Infraestructura Cloud & Core Bancario',
    'Fallas Tecnológicas',
    'Ing. David Kim',
    'Activo',
    3, 4, 12, 'Crítico', 5600000.00,
    1, 3, 3, 'Bajo', 520000.00,
    '{
        "id": "mp-3",
        "title": "Arquitectura Multi-Región Activo-Activo y Pruebas de Carga",
        "owner": "David Kim",
        "dueDate": "2026-11-15",
        "budgetUSD": 190000,
        "progressPct": 85,
        "status": "En Progreso",
        "actions": ["Replicación de base de datos inter-región en tiempo real", "Balanceador global de latencia", "Pruebas de caos mensual (Chaos Engineering)"]
    }'::jsonb,
    '2026-01-20', '2026-09-30'
),
(
    'r-4',
    'RSK-004',
    'Desvío no Autorizado de Fondos por Colusión o Abuso de Privilegios',
    'Colaborador con acceso administrativo que altera registros de liquidación o desvía saldos a cuentas de terceros relacionadas.',
    'Tesorería y Liquidación',
    'Fraude Interno',
    'Dra. Patricia Mendívil',
    'Mitigado',
    2, 4, 8, 'Alto', 4200000.00,
    1, 2, 2, 'Bajo', 210000.00,
    '{
        "id": "mp-4",
        "title": "Segregación Estricta de Funciones y Auditoría de Cuentas Puente",
        "owner": "Patricia Mendívil",
        "dueDate": "2026-10-31",
        "budgetUSD": 45000,
        "progressPct": 90,
        "status": "En Progreso",
        "actions": ["Doble firma mancomunada en transferencias > $10k", "Monitoreo de accesos anómalos fuera de horario laboral", "Rotación periódica de personal de tesorería"]
    }'::jsonb,
    '2026-03-05', '2026-10-12'
),
(
    'r-5',
    'RSK-005',
    'Sanción Regulatoria por Incumplimiento de Reportes de Transacciones Sospechosas',
    'Omisión involuntaria en el reporte dentro del plazo legal de 24 horas de operaciones de alto valor sospechosas de lavado de activos.',
    'Prevención de Lavado & Cumplimiento',
    'Cumplimiento Normativo',
    'Lic. Roberto Arismendi',
    'Bajo Monitoreo',
    3, 3, 9, 'Alto', 2800000.00,
    1, 2, 2, 'Bajo', 350000.00,
    '{
        "id": "mp-5",
        "title": "Automatización del Flujo Regulatorio ROS y Alertas Tempranas",
        "owner": "Roberto Arismendi",
        "dueDate": "2026-12-01",
        "budgetUSD": 60000,
        "progressPct": 70,
        "status": "En Progreso",
        "actions": ["Canal directo API con la Unidad de Inteligencia Financiera", "Matriz automatizada de umbrales regulatorios", "Capacitación obligatoria al 100% de analistas"]
    }'::jsonb,
    '2026-02-18', '2026-10-19'
),
(
    'r-6',
    'RSK-006',
    'Inconsistencias en Conciliación de Cuentas y Descuadre Contable',
    'Diferencias no detectadas oportunamente entre saldos de compensación de cámaras y cuentas de mayor contable.',
    'Tesorería y Liquidación',
    'Ejecución y Procesos',
    'Cra. Sofía Lagos',
    'Mitigado',
    3, 2, 6, 'Medio', 1200000.00,
    1, 1, 1, 'Bajo', 95000.00,
    '{
        "id": "mp-6",
        "title": "Motor Automatizado de Conciliación y Alertas de Descuadre",
        "owner": "Sofía Lagos",
        "dueDate": "2026-09-15",
        "budgetUSD": 35000,
        "progressPct": 100,
        "status": "Completado",
        "actions": ["Algoritmo de reconciliación en tiempo real", "Notificación instantánea ante desfases > $500 USD", "Auditoría mensual independiente"]
    }'::jsonb,
    '2026-04-12', '2026-10-20'
),
(
    'r-7',
    'RSK-007',
    'Fuga de Información Confidencial por Descuido o Falta de Cifrado en Reposo',
    'Extracción accidental o deliberada de datos sensibles de clientes en reportes analíticos no anonimizados.',
    'Gestión de Datos & Analítica',
    'Fallas Tecnológicas',
    'Ing. Mariana Restrepo (CISO)',
    'Activo',
    2, 3, 6, 'Medio', 1900000.00,
    1, 2, 2, 'Bajo', 180000.00,
    '{
        "id": "mp-7",
        "title": "Implementación de Enmascaramiento de Datos y DLP Corporativo",
        "owner": "Mariana Restrepo",
        "dueDate": "2026-11-20",
        "budgetUSD": 55000,
        "progressPct": 65,
        "status": "En Progreso",
        "actions": ["Enmascaramiento dinámico en ambientes de QA/Analytics", "Herramienta Data Loss Prevention en endpoints", "Revisión semestral de permisos a data lake"]
    }'::jsonb,
    '2026-03-22', '2026-10-05'
),
(
    'r-8',
    'RSK-008',
    'Falta de Continuidad de Negocio por Pérdida de Personal Clave',
    'Dependencia crítica de colaboradores específicos en procesos de liquidación sin documentación o planes de sucesión.',
    'Gestión de Talento & Accesos',
    'Prácticas Laborales',
    'Lic. Claudia Morales',
    'Activo',
    3, 2, 6, 'Medio', 850000.00,
    2, 1, 2, 'Bajo', 220000.00,
    '{
        "id": "mp-8",
        "title": "Manuales Operativos de Continuidad y Programa de Sombra (Cross-Training)",
        "owner": "Claudia Morales",
        "dueDate": "2026-12-31",
        "budgetUSD": 25000,
        "progressPct": 50,
        "status": "En Progreso",
        "actions": ["Elaboración de manuales de procedimientos paso a paso", "Entrenamiento cruzado en roles críticos", "Plan de retención y bonos por permanencia"]
    }'::jsonb,
    '2026-05-14', '2026-10-01'
)
ON CONFLICT (id) DO NOTHING;

-- 5. RELACIÓN RIESGOS <-> CONTROLES (ASIGNACIÓN)
INSERT INTO risk_controls (risk_id, control_id) VALUES
('r-1', 'c-1'),
('r-1', 'c-5'),
('r-1', 'c-7'),
('r-2', 'c-2'),
('r-2', 'c-4'),
('r-3', 'c-5'),
('r-3', 'c-7'),
('r-4', 'c-3'),
('r-4', 'c-6'),
('r-5', 'c-2'),
('r-5', 'c-6'),
('r-6', 'c-3'),
('r-7', 'c-1'),
('r-8', 'c-8')
ON CONFLICT (risk_id, control_id) DO NOTHING;

-- 6. KRIs INICIALES (POR INDUSTRIA)
INSERT INTO kri_definitions (
    id, code, name, description, process, category, industry, unit, direction,
    warning_threshold, critical_threshold, current_value, frequency, status,
    auto_trigger_alert, responsible, last_updated, notification_preferences
) VALUES
(
    'kri-1',
    'KRI-FIN-01',
    'Tasa de Transacciones Declinadas por Sospecha de Fraude',
    'Porcentaje de transacciones bloqueadas por el motor de prevención de fraude.',
    'Procesamiento de Pagos & Transferencias',
    'Fraude Externo',
    'Fintech & Pagos Digitales',
    '%',
    'superior',
    1.5000,
    3.0000,
    1.8200,
    'Continuo (Tiempo Real)',
    'Advertencia',
    TRUE,
    'Lic. Roberto Arismendi',
    '2026-10-21 07:15',
    '{
        "emailEnabled": true,
        "emailRecipients": ["fraude@custodia-risk.com"],
        "emailTemplate": "completa",
        "smsEnabled": true,
        "smsRecipients": ["+54 9 11 4589-2044"],
        "webhookEnabled": false,
        "notifyOnWarning": true,
        "notifyOnCritical": true,
        "cooldownMinutes": 30,
        "escalateToRiskOfficer": true
    }'::jsonb
),
(
    'kri-2',
    'KRI-FIN-02',
    'Tiempo Medio de Conmutación de Servidores (RTO Failover)',
    'Tiempo transcurrido en completar el cambio de región cloud ante contingencias.',
    'Infraestructura Cloud & Core Bancario',
    'Fallas Tecnológicas',
    'Fintech & Pagos Digitales',
    'minutos',
    'superior',
    10.0000,
    20.0000,
    8.4000,
    'Por Evento',
    'Normal',
    TRUE,
    'Ing. David Kim',
    '2026-10-20 18:30',
    NULL
),
(
    'kri-3',
    'KRI-FIN-03',
    'Reintentos Fallidos de Autenticación de Cuentas (Brute-Force)',
    'Eventos acumulados por minuto de contraseñas incorrectas en el portal bancario.',
    'Onboarding Digital & KYC',
    'Fraude Externo',
    'Fintech & Pagos Digitales',
    'eventos/hora',
    'superior',
    500.0000,
    1200.0000,
    1340.0000,
    'Por Minuto',
    'Crítico',
    TRUE,
    'Ing. Mariana Restrepo (CISO)',
    '2026-10-21 07:55',
    '{
        "emailEnabled": true,
        "emailRecipients": ["ciso@custodia-risk.com", "soc@custodia-risk.com"],
        "emailTemplate": "completa",
        "smsEnabled": true,
        "smsRecipients": ["+52 55 8421-9930"],
        "webhookEnabled": true,
        "webhookUrl": "https://api.custodia-risk.com/v1/soc-alerts",
        "notifyOnWarning": true,
        "notifyOnCritical": true,
        "cooldownMinutes": 15,
        "escalateToRiskOfficer": true
    }'::jsonb
),
(
    'kri-4',
    'KRI-BNK-01',
    'Descalce de Liquidez Intradía en Cuentas Corresponsales',
    'Diferencia máxima porcentual entre obligaciones exigibles y saldos disponibles.',
    'Tesorería y Liquidación',
    'Ejecución y Procesos',
    'Banca & Servicios Financieros',
    '%',
    'superior',
    5.0000,
    10.0000,
    3.8000,
    'Horario',
    'Normal',
    TRUE,
    'Cra. Sofía Lagos',
    '2026-10-21 06:00',
    NULL
),
(
    'kri-5',
    'KRI-BNK-02',
    'Plazo Promedio de Envío de Reporte ROS (Horas de Espera)',
    'Tiempo transcurrido desde la detección de una operación sospechosa hasta su reporte legal.',
    'Prevención de Lavado & Cumplimiento',
    'Cumplimiento Normativo',
    'Banca & Servicios Financieros',
    'horas',
    'superior',
    18.0000,
    24.0000,
    21.5000,
    'Diario',
    'Advertencia',
    TRUE,
    'Lic. Roberto Arismendi',
    '2026-10-20 22:00',
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 7. ALERTAS ACTIVAS
INSERT INTO anomaly_alerts (
    id, code, title, description, kri_metric, threshold, current_value, severity, process, triggered_at, status, escalated_to
) VALUES
(
    'alt-1',
    'ALT-2026-001',
    'Pico Anómalo de Intentos de Acceso no Autorizado en API Pública',
    'Detección de 1.340 intentos por hora desde rangos de IP de hosting en el extranjero.',
    'KRI-FIN-03: Reintentos Fallidos de Autenticación',
    '> 1.200 ev/h',
    '1.340 ev/h',
    'Crítico',
    'Onboarding Digital & KYC',
    '2026-10-21 07:55',
    'Activa',
    'Mariana Restrepo (CISO)'
),
(
    'alt-2',
    'ALT-2026-002',
    'Desviación Preventiva en Transacciones Bloqueadas por Fraude',
    'El porcentaje de rechazo superó el límite de advertencia del 1.5% tras campaña de promociones.',
    'KRI-FIN-01: Tasa de Transacciones Declinadas',
    '> 1.50%',
    '1.82%',
    'Medio',
    'Procesamiento de Pagos & Transferencias',
    '2026-10-21 07:15',
    'En Investigación',
    'Roberto Arismendi (Cumplimiento)'
)
ON CONFLICT (id) DO NOTHING;

-- 8. INCIDENCIAS / FALLAS OPERACIONALES REGISTRADAS
INSERT INTO operational_flaws (
    id, title, description, reported_by, process, severity, reported_at, status, incident_type,
    real_loss_amount_usd, recovered_amount_usd, impacted_system_or_account, converted_risk_id
) VALUES
(
    'flw-1',
    'Latencia en Notificaciones Push de Validación 2FA por Proveedor SMS',
    'Durante 48 minutos los mensajes SMS con código OTP demoraron más de 3 minutos en llegar a usuarios de operadores móviles específicos.',
    'Diego Salcedo',
    'Procesamiento de Pagos & Transferencias',
    'Media',
    '2026-10-17 14:22',
    'Pendiente de Evaluación',
    'Falla de Control',
    0.00,
    0.00,
    'Gateway SMS Twilio/Infobip',
    NULL
),
(
    'flw-2',
    'Descuadre Temporal en Conciliación de Tarjetas por Timeout en Red de Pagos',
    'Cierre nocturno arrojó una diferencia de $4.500 USD por transacciones pendientes de confirmación en el switch adquirente.',
    'Cra. Sofía Lagos',
    'Tesorería y Liquidación',
    'Baja',
    '2026-10-19 23:40',
    'Pendiente de Evaluación',
    'Casi Pérdida (Near Miss)',
    4500.00,
    4500.00,
    'Switch Transaccional Visa Direct',
    NULL
)
ON CONFLICT (id) DO NOTHING;

-- 9. PROGRAMAS DE AUDITORÍA Y HALLAZGOS
INSERT INTO periodic_audits (
    id, code, title, type, period, lead_auditor, scope, execution_date, status, compliance_score
) VALUES
(
    'aud-1',
    'AUD-2026-Q3',
    'Auditoría Integral de Controles Generales de TI y Ciberseguridad',
    'Auditoría Interna',
    'Q3-2026',
    'Carlos Benítez',
    '["Infraestructura Cloud & Core Bancario", "Ciberseguridad y Accesos", "Gestión de Cambios"]'::jsonb,
    '2026-10-18',
    'Aprobada',
    92.50
),
(
    'aud-2',
    'AUD-2026-AML',
    'Revisión Anual de Cumplimiento Regulatorio y Prevención de Fraude',
    'Auditoría Regulatoria',
    'Semestre II-2026',
    'Carlos Benítez',
    '["Onboarding Digital & KYC", "Prevención de Lavado & Cumplimiento", "Tesorería"]'::jsonb,
    '2026-11-10',
    'Planificada',
    0.00
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO audit_findings (
    id, audit_id, type, description, process, associated_risk_code, corrective_action, deadline, responsible, status
) VALUES
(
    'fnd-1',
    'aud-1',
    'Observación',
    'Se detectó que dos respaldos mensuales de base de datos fueron almacenados sin verificación formal de suma hash SHA-256 previa.',
    'Infraestructura Cloud & Core Bancario',
    'RSK-001',
    'Implementar validación criptográfica automática en el pipeline de respaldo.',
    '2026-11-15',
    'Ing. David Kim',
    'En Subsanación'
),
(
    'fnd-2',
    'aud-1',
    'Conforme',
    'Los mecanismos de cifrado en tránsito TLS 1.3 y reposo AES-256 cumplen holgadamente los estándares ISO 27001 y PCI-DSS v4.0.',
    'Ciberseguridad y Accesos',
    'RSK-001',
    'Mantener monitoreo continuo de certificados.',
    '2027-10-18',
    'Mariana Restrepo',
    'Cerrado'
)
ON CONFLICT (id) DO NOTHING;

-- 10. BLOQUES INICIALES DEL LEDGER CRIPTOGRÁFICO SHA-256
INSERT INTO crypto_audit_ledger (
    id, block_number, timestamp, user_name, user_role, action, entity_type, entity_code, details, ip_address, previous_hash, hash
) VALUES
(
    'blk-001',
    1,
    '2026-10-01 08:00:00',
    'Sistema Custodia Risk',
    'Sistema Base',
    'CREACIÓN_RIESGO',
    'Riesgo',
    'RSK-GENESIS',
    'Génesis de la bitácora inalterable de auditoría para la organización.',
    '127.0.0.1',
    '0000000000000000000000000000000000000000000000000000000000000000',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
),
(
    'blk-002',
    2,
    '2026-10-18 10:15:30',
    'Carlos Benítez',
    'Auditor Líder de Control Interno',
    'EVALUACIÓN_CONTROL',
    'Control',
    'CON-CYB-01',
    'Prueba de efectividad operativa completada: 92% Efectivo con evidencia documental.',
    '192.168.10.45',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3e3870e28f32247188b857732'
),
(
    'blk-003',
    3,
    '2026-10-21 07:55:12',
    'Sistema de Detección KRI',
    'Monitor Automático',
    'ALERTA_DISPARADA',
    'Alerta',
    'ALT-2026-001',
    'Disparo automático de alerta crítica KRI-FIN-03: Reintentos fallidos 1.340 ev/h excede umbral 1.200 ev/h.',
    '10.0.4.12',
    'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3e3870e28f32247188b857732',
    'c20ad4d76fe97759aa27a0c99bff6710ea47f525b0ef093a8d56b27e8a937012'
)
ON CONFLICT (id) DO NOTHING;

-- 11. CONFIGURACIONES GLOBALES
INSERT INTO system_settings (key, value) VALUES
(
    'current_industry',
    '"Fintech & Pagos Digitales"'::jsonb
),
(
    'global_notification_preferences',
    '{
        "emailEnabled": true,
        "emailRecipients": ["oficial.riesgo@custodia-risk.com", "alertas-kri@custodia-risk.com"],
        "emailTemplate": "completa",
        "smsEnabled": true,
        "smsRecipients": ["+54 9 11 4589-2044", "+52 55 8421-9930"],
        "webhookEnabled": false,
        "webhookUrl": "https://api.custodia-risk.com/v1/webhooks/kri-alerts",
        "notifyOnWarning": true,
        "notifyOnCritical": true,
        "cooldownMinutes": 30,
        "escalateToRiskOfficer": true
    }'::jsonb
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- 12. BASE DE PÉRDIDAS Y REPORTE REGULATORIO (FASE 1 · NORMATIVA CMF PARA CACs)
UPDATE operational_flaws SET
    business_line = 'Medios y Canales de Pago', basel_category = 'Fallas Tecnológicas',
    basel_subcategory = 'Interrupción del negocio y fallas de sistemas',
    occurrence_date = '2026-10-17', discovery_date = '2026-10-17'
WHERE id = 'flw-1';

UPDATE operational_flaws SET
    business_line = 'Medios y Canales de Pago', basel_category = 'Ejecución y Procesos',
    basel_subcategory = 'Recepción, ejecución y mantenimiento de operaciones',
    occurrence_date = '2026-10-19', discovery_date = '2026-10-19', accounting_date = '2026-10-20',
    accounting_account = 'Gastos por pérdidas operacionales – procesos'
WHERE id = 'flw-2';

-- Plazos referenciales: validar con Cumplimiento contra la RAN CACs y la Ley 21.663.
INSERT INTO regulatory_milestone_templates (id, authority, name, deadline_minutes, enabled) VALUES
('cmf-aviso-inicial', 'CMF', 'Aviso inicial a la CMF', 30, TRUE),
('anci-alerta-temprana', 'ANCI', 'Alerta temprana a la ANCI (CSIRT Nacional)', 180, TRUE),
('anci-segundo-informe', 'ANCI', 'Segundo informe a la ANCI', 4320, TRUE),
('anci-informe-final', 'ANCI', 'Informe final a la ANCI', 21600, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO regulatory_reports (flaw_id, awareness_at, reportable_to_cmf, reportable_to_anci, status) VALUES
('flw-1', '2026-10-17 14:40:00-03', TRUE, FALSE, 'Cerrado')
ON CONFLICT (flaw_id) DO NOTHING;

INSERT INTO regulatory_submissions (flaw_id, milestone_id, submitted_at, submitted_by, folio) VALUES
('flw-1', 'cmf-aviso-inicial', '2026-10-17 15:02:00-03', 'Dra. Elena Vasconcelos', 'CMF-INC-2026-0187')
ON CONFLICT (flaw_id, milestone_id) DO NOTHING;

INSERT INTO system_settings (key, value) VALUES
('loss_registration_threshold_usd', '1000'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 13. PROVEEDORES Y CONTINUIDAD DEL NEGOCIO (FASE 2) · datos ficticios de ejemplo
INSERT INTO service_providers (id, code, name, tax_id, service_description, category, criticality, internal_owner, supported_processes, status, is_cloud, cloud_model, data_location, data_country, handles_member_data, uses_subcontractors, contract_start, contract_end, annual_cost_usd, clauses, last_assessment_date, assessment_score, has_exit_plan, exit_plan_notes, committed_rto_hours) VALUES
('prv-1', 'PRV-001', 'Núcleo Financiero SpA', '76.111.222-3', 'Core financiero en modalidad SaaS: cuentas de ahorro, créditos, cuotas de participación y contabilidad.', 'Core financiero / Procesamiento de datos', 'Crítico', 'Ing. Carlos Mendoza', ARRAY['Créditos y Cobranza', 'Captaciones y Ahorro', 'Operaciones de Pago']::text[], 'Activo', TRUE, 'SaaS', 'Chile', NULL, TRUE, TRUE, '2023-01-01', '2027-12-31', 420000, '{"regulatorAccess":true,"auditRights":true,"confidentiality":true,"incidentNotification":true,"continuity":true,"serviceLevels":true,"subcontracting":true,"dataLocation":true,"termination":true}'::jsonb, '2026-03-10', 88, TRUE, 'Migración a proveedor alternativo en 9 meses con extracción completa de datos en formato estándar.', 4),
('prv-2', 'PRV-002', 'NubeSur Cloud Services', '77.333.444-5', 'Infraestructura en la nube (IaaS) para el sitio alternativo de recuperación y respaldos.', 'Servicios en la nube', 'Crítico', 'Ing. Alejandro Vega', ARRAY['Infraestructura Cloud', 'Operaciones de Pago']::text[], 'Activo', TRUE, 'IaaS', 'Extranjero', 'Estados Unidos', TRUE, FALSE, '2024-04-01', '2027-03-31', 185000, '{"regulatorAccess":false,"auditRights":true,"confidentiality":true,"incidentNotification":true,"continuity":true,"serviceLevels":true,"subcontracting":true,"dataLocation":true,"termination":true}'::jsonb, '2025-08-20', 74, FALSE, NULL, 8),
('prv-3', 'PRV-003', 'Pagos Andinos S.A.', '96.555.666-7', 'Recaudación de cuotas de crédito por PAC/PAT y botón de pago.', 'Medios de pago y recaudación', 'Alto', 'Ing. Carlos Mendoza', ARRAY['Operaciones de Pago', 'Créditos y Cobranza']::text[], 'Activo', FALSE, NULL, 'Chile', NULL, TRUE, FALSE, '2021-12-16', '2026-12-15', 64000, '{"regulatorAccess":true,"auditRights":true,"confidentiality":true,"incidentNotification":true,"continuity":true,"serviceLevels":true,"subcontracting":true,"dataLocation":true,"termination":false}'::jsonb, '2026-05-02', 79, TRUE, 'Recaudación transitoria vía cajas de sucursales.', 12),
('prv-4', 'PRV-004', 'Cobranzas del Pacífico Ltda.', '78.777.888-9', 'Cobranza prejudicial y judicial de cartera morosa.', 'Cobranza externa', 'Medio', 'Dra. Sofía Valenzuela', ARRAY['Créditos y Cobranza']::text[], 'Activo', FALSE, NULL, 'Chile', NULL, TRUE, TRUE, '2025-02-01', '2027-01-31', 38000, '{"regulatorAccess":true,"auditRights":false,"confidentiality":true,"incidentNotification":false,"continuity":true,"serviceLevels":true,"subcontracting":false,"dataLocation":true,"termination":true}'::jsonb, NULL, NULL, FALSE, NULL, NULL),
('prv-5', 'PRV-005', 'Centinela SOC SpA', '76.999.000-1', 'Centro de operaciones de seguridad 24x7: monitoreo, detección y respuesta a ciberincidentes.', 'Ciberseguridad (SOC / monitoreo)', 'Alto', 'Ing. Alejandro Vega', ARRAY['Ciberseguridad & TI']::text[], 'Activo', TRUE, 'SaaS', 'Chile', NULL, FALSE, FALSE, '2025-07-01', '2028-06-30', 96000, '{"regulatorAccess":true,"auditRights":true,"confidentiality":true,"incidentNotification":true,"continuity":true,"serviceLevels":true,"subcontracting":true,"dataLocation":true,"termination":true}'::jsonb, '2026-07-15', 92, TRUE, 'Traspaso de casos de uso y reglas de correlación al SOC alternativo.', 2),
('prv-6', 'PRV-006', 'Fono Socios Contact Center', '77.222.111-0', 'Atención telefónica de socios y bloqueo de tarjetas fuera de horario.', 'Atención telefónica / Contact center', 'Medio', 'Sr. Patricio Rojas', ARRAY['Atención a Socios y Sucursales']::text[], 'En término', FALSE, NULL, 'Chile', NULL, TRUE, FALSE, '2022-10-01', '2026-09-30', 52000, '{"regulatorAccess":true,"auditRights":true,"confidentiality":true,"incidentNotification":true,"continuity":false,"serviceLevels":true,"subcontracting":true,"dataLocation":true,"termination":true}'::jsonb, '2025-11-05', 68, TRUE, 'Internalización del servicio en curso.', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO bia_processes (id, name, owner, business_line, description, impact_financial, impact_members, impact_regulatory, impact_reputational, mtpd_hours, rto_hours, rpo_hours, systems, minimum_staff, alternate_site, last_review_date) VALUES
('bia-1', 'Otorgamiento de créditos de consumo', 'Ing. Carlos Mendoza', 'Créditos de Consumo', 'Evaluación, aprobación, curse y desembolso de créditos a socios.', 3, 3, 2, 3, 48, 24, 4, ARRAY['Core financiero', 'Motor de evaluación crediticia']::text[], 6, 'Sucursal Casa Matriz / teletrabajo', '2026-04-15'),
('bia-2', 'Depósitos y retiros de ahorro', 'Ing. Carlos Mendoza', 'Captaciones y Ahorro', 'Depósitos, retiros y consultas de saldo de cuentas de ahorro en sucursales y canales digitales.', 4, 4, 4, 4, 8, 4, 0.25, ARRAY['Core financiero', 'Plataforma de cajas']::text[], 12, 'Sitio alterno en la nube + sucursales de respaldo', '2026-04-15'),
('bia-3', 'Transferencias y pagos en canales digitales', 'Ing. Alejandro Vega', 'Medios y Canales de Pago', 'Transferencias electrónicas, pagos de créditos y servicios desde web y app de socios.', 4, 4, 3, 4, 6, 4, 0.25, ARRAY['Portal web y app de socios', 'Core financiero', 'Switch de transferencias']::text[], 4, 'Sitio alterno en la nube', '2026-04-15'),
('bia-4', 'Recaudación de cuotas de crédito', 'Ing. Carlos Mendoza', 'Créditos de Consumo', 'Cobro de cuotas por descuento por planilla, PAC/PAT y botón de pago.', 3, 3, 2, 2, 72, 24, 24, ARRAY['Core financiero', 'Plataforma de recaudación']::text[], 3, 'Cajas de sucursales', '2026-04-15'),
('bia-5', 'Cobranza de cartera morosa', 'Dra. Sofía Valenzuela', 'Créditos de Consumo', 'Gestión de cobranza prejudicial y judicial.', 2, 2, 2, 2, 120, 72, 24, ARRAY['Core financiero', 'Sistema de cobranza']::text[], 2, 'Teletrabajo', '2026-04-15'),
('bia-6', 'Reportes normativos a la CMF y la UAF', 'Dra. Sofía Valenzuela', 'Soporte Corporativo', 'Generación y envío de archivos normativos y reportes de operaciones sospechosas.', 2, 1, 4, 3, 48, 24, 24, ARRAY['Core financiero', 'Plataforma de cumplimiento']::text[], 2, 'Teletrabajo', '2026-04-15'),
('bia-7', 'Atención a socios en sucursales y contact center', 'Sr. Patricio Rojas', 'Captaciones y Ahorro', 'Atención presencial y telefónica, bloqueo de tarjetas y reclamos.', 2, 4, 2, 3, 24, 12, 4, ARRAY['Plataforma de atención', 'Telefonía IP']::text[], 10, 'Sucursales cercanas', '2025-06-10')
ON CONFLICT (id) DO NOTHING;

INSERT INTO bia_process_providers (bia_process_id, provider_id) VALUES
('bia-1', 'prv-1'),
('bia-2', 'prv-1'),
('bia-2', 'prv-2'),
('bia-3', 'prv-1'),
('bia-3', 'prv-2'),
('bia-4', 'prv-3'),
('bia-5', 'prv-4'),
('bia-7', 'prv-6')
ON CONFLICT DO NOTHING;

INSERT INTO continuity_plans (id, code, name, type, owner, version, approved_by, approval_date, next_review_date, status) VALUES
('pln-1', 'BCP-01', 'Plan de continuidad de operaciones con socios', 'Plan de Continuidad (BCP)', 'Ing. Carlos Mendoza', '3.1', 'Consejo de Administración', '2026-03-25', '2027-03-25', 'Vigente'),
('pln-2', 'DRP-01', 'Recuperación del centro de datos y core financiero', 'Recuperación ante Desastres (DRP)', 'Ing. Alejandro Vega', '2.4', 'Gerente General', '2025-09-15', '2026-09-15', 'En actualización'),
('pln-3', 'CRI-01', 'Plan de gestión de crisis', 'Gestión de Crisis', 'Sr. Patricio Rojas', '1.2', 'Consejo de Administración', '2026-01-20', '2027-01-20', 'Vigente')
ON CONFLICT (id) DO NOTHING;

INSERT INTO continuity_plan_processes (plan_id, bia_process_id) VALUES
('pln-1', 'bia-2'),
('pln-1', 'bia-3'),
('pln-1', 'bia-4'),
('pln-1', 'bia-7'),
('pln-2', 'bia-1'),
('pln-2', 'bia-2'),
('pln-2', 'bia-3')
ON CONFLICT DO NOTHING;

INSERT INTO continuity_tests (id, plan_id, test_date, type, scenario, bia_process_id, achieved_rto_hours, result, findings, actions) VALUES
('tst-1', 'pln-2', '2026-06-14', 'Prueba técnica DRP', 'Caída del centro de datos principal y conmutación al sitio alterno en la nube.', 'bia-3', 6.5, 'Con observaciones', 'La restauración de la base del switch de transferencias tomó 4 horas más de lo previsto.', 'Automatizar la restauración y repetir la prueba antes de diciembre.'),
('tst-2', 'pln-1', '2026-08-22', 'Simulacro', 'Corte eléctrico prolongado en Casa Matriz.', 'bia-7', 3, 'Exitosa', 'Atención derivada a sucursales cercanas en 3 horas.', 'Actualizar el árbol de llamadas del personal.')
ON CONFLICT (id) DO NOTHING;

UPDATE operational_flaws SET provider_id = 'prv-3' WHERE id = 'flw-2' AND provider_id IS NULL;

-- Permisos nuevos de la fase 2
UPDATE organizational_roles
SET permissions = permissions || jsonb_build_object(
    'canManageProviders', id IN ('role-riesgo-op', 'role-gerencia-general', 'role-ops', 'role-ciso'),
    'canManageContinuity', id IN ('role-riesgo-op', 'role-gerencia-general', 'role-ops', 'role-ciso'))
WHERE NOT (permissions ? 'canManageProviders');

UPDATE user_profiles u
SET permissions = u.permissions || jsonb_build_object(
    'canManageProviders', COALESCE((r.permissions->>'canManageProviders')::boolean, FALSE),
    'canManageContinuity', COALESCE((r.permissions->>'canManageContinuity')::boolean, FALSE))
FROM organizational_roles r
WHERE r.id = u.role_id AND NOT (u.permissions ? 'canManageProviders');
