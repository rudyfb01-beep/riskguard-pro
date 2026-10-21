-- ==============================================================================
-- SISTEMA DE GESTIÓN INTEGRAL DE RIESGO OPERACIONAL & AUDITORÍA (CUSTODIA RISK)
-- Datos Iniciales / Semilla de Demostración y Producción
-- Archivo: database/seed.sql
-- ==============================================================================

-- 1. PUESTOS Y ROLES ORGANIZACIONALES (RBAC)
INSERT INTO organizational_roles (id, title, department, description, badge, is_system_role, permissions) VALUES
(
    'role-cro',
    'Oficial Senior de Riesgo Operacional (CRO)',
    'Gestión Integral de Riesgos',
    'Supervisa la gobernanza corporativa de riesgos, políticas Basilea III, auditorías y calibración de apetito al riesgo.',
    'Alta Dirección',
    TRUE,
    '{
        "canEditRisks": true,
        "canEvaluateControls": true,
        "canExecuteAudits": true,
        "canReportFlaws": true,
        "canConvertFlaws": true,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": true,
        "canManageRoles": true,
        "canExportReports": true
    }'::jsonb
),
(
    'role-internal-audit',
    'Auditor Líder de Control Interno',
    'Auditoría y Aseguramiento Interno',
    'Valida el diseño y efectividad operativa de los controles, ejecuta programas periódicos y formula hallazgos.',
    'Aseguramiento',
    TRUE,
    '{
        "canEditRisks": false,
        "canEvaluateControls": true,
        "canExecuteAudits": true,
        "canReportFlaws": true,
        "canConvertFlaws": true,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": false,
        "canManageRoles": false,
        "canExportReports": true
    }'::jsonb
),
(
    'role-ciso',
    'Líder de Seguridad de la Información (CISO)',
    'Ciberseguridad y Continuidad',
    'Gestor de riesgos tecnológicos, respuesta a incidentes de seguridad, cifrado de activos y pruebas BCP/DRP.',
    'Ciberseguridad',
    TRUE,
    '{
        "canEditRisks": true,
        "canEvaluateControls": true,
        "canExecuteAudits": false,
        "canReportFlaws": true,
        "canConvertFlaws": true,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": true,
        "canManageRoles": false,
        "canExportReports": true
    }'::jsonb
),
(
    'role-risk-analyst',
    'Analista de Riesgo Operacional',
    'Gestión Integral de Riesgos',
    'Monitoreo continuo de KRIs, calificación de matrices 4x4, seguimiento de planes de mitigación e investigación.',
    'Operaciones',
    TRUE,
    '{
        "canEditRisks": true,
        "canEvaluateControls": true,
        "canExecuteAudits": false,
        "canReportFlaws": true,
        "canConvertFlaws": true,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": false,
        "canManageRoles": false,
        "canExportReports": true
    }'::jsonb
),
(
    'role-aml',
    'Jefe de Cumplimiento Normativo (AML/KYC)',
    'Prevención de Lavado y Cumplimiento Legal',
    'Supervisa el marco regulatorio Basilea, prevención de fraude, reportes regulatorios y listas de control.',
    'Cumplimiento Legal',
    FALSE,
    '{
        "canEditRisks": false,
        "canEvaluateControls": true,
        "canExecuteAudits": true,
        "canReportFlaws": true,
        "canConvertFlaws": false,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": true,
        "canManageRoles": false,
        "canExportReports": true
    }'::jsonb
),
(
    'role-board',
    'Comité de Riesgos y Directorio',
    'Gobierno Corporativo',
    'Visualización ejecutiva de mapas de calor, reportes agregados y dictámenes de auditoría externa.',
    'Alta Dirección',
    TRUE,
    '{
        "canEditRisks": false,
        "canEvaluateControls": false,
        "canExecuteAudits": false,
        "canReportFlaws": false,
        "canConvertFlaws": false,
        "canAcknowledgeAlerts": false,
        "canConfigureKRIs": false,
        "canManageRoles": false,
        "canExportReports": true
    }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 2. USUARIOS Y COLABORADORES INICIALES
INSERT INTO user_profiles (id, name, email, role_id, role_title, department, badge, is_system_user, permissions) VALUES
(
    'usr-valeria',
    'Valeria Cifuentes',
    'valeria.cifuentes@custodia-risk.com',
    'role-cro',
    'Oficial Senior de Riesgo Operacional (CRO)',
    'Gestión Integral de Riesgos',
    'Alta Dirección',
    TRUE,
    '{
        "canEditRisks": true,
        "canEvaluateControls": true,
        "canExecuteAudits": true,
        "canReportFlaws": true,
        "canConvertFlaws": true,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": true,
        "canManageRoles": true,
        "canExportReports": true
    }'::jsonb
),
(
    'usr-carlos',
    'Carlos Benítez',
    'carlos.benitez@custodia-risk.com',
    'role-internal-audit',
    'Auditor Líder de Control Interno',
    'Auditoría y Aseguramiento Interno',
    'Aseguramiento',
    TRUE,
    '{
        "canEditRisks": false,
        "canEvaluateControls": true,
        "canExecuteAudits": true,
        "canReportFlaws": true,
        "canConvertFlaws": true,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": false,
        "canManageRoles": false,
        "canExportReports": true
    }'::jsonb
),
(
    'usr-mariana',
    'Mariana Restrepo',
    'mariana.restrepo@custodia-risk.com',
    'role-ciso',
    'Líder de Seguridad de la Información (CISO)',
    'Ciberseguridad y Continuidad',
    'Ciberseguridad',
    TRUE,
    '{
        "canEditRisks": true,
        "canEvaluateControls": true,
        "canExecuteAudits": false,
        "canReportFlaws": true,
        "canConvertFlaws": true,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": true,
        "canManageRoles": false,
        "canExportReports": true
    }'::jsonb
),
(
    'usr-diego',
    'Diego Salcedo',
    'diego.salcedo@custodia-risk.com',
    'role-risk-analyst',
    'Analista de Riesgo Operacional',
    'Gestión Integral de Riesgos',
    'Operaciones',
    TRUE,
    '{
        "canEditRisks": true,
        "canEvaluateControls": true,
        "canExecuteAudits": false,
        "canReportFlaws": true,
        "canConvertFlaws": true,
        "canAcknowledgeAlerts": true,
        "canConfigureKRIs": false,
        "canManageRoles": false,
        "canExportReports": true
    }'::jsonb
)
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
