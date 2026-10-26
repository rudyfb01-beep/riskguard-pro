import { BusinessProcess } from '../models/catalog.model';
import {
  AnomalyAlert, AuditLogEntry, Control, KriDefinition, OperationalFlaw, PeriodicAudit, Risk, UserProfile,
} from '../models/risk.model';
import { DEFAULT_ORGANIZATIONAL_ROLES } from './base-seed';

// Datos de EJEMPLO (ficticios) para demostración. No se cargan en producción salvo SEED_DEMO_DATA=true.

/** Fecha ISO de hace N minutos (para datos de demostración con plazos en curso). */
function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

/** Convierte un ISO a 'YYYY-MM-DD HH:mm' en hora local. */
function localStamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const DEMO_USERS: UserProfile[] = ([
      ['usr-riesgo-op', 'Dra. Elena Vasconcelos', 'elena.vasconcelos', 'role-riesgo-op', 'Jefa de Riesgo Operacional'],
      ['usr-gerencia-general', 'Sr. Patricio Rojas', 'patricio.rojas', 'role-gerencia-general', 'Gerente General'],
      ['usr-auditoria-interna', 'Lic. Roberto Miranda', 'roberto.miranda', 'role-auditoria-interna', 'Auditor Interno Líder'],
      ['usr-ops', 'Ing. Carlos Mendoza', 'carlos.mendoza', 'role-ops', 'Dueño de Proceso'],
      ['usr-ciso', 'Ing. Alejandro Vega', 'alejandro.vega', 'role-ciso', 'Ciberseguridad'],
      ['usr-cumplimiento', 'Dra. Sofía Valenzuela', 'sofia.valenzuela', 'role-cumplimiento', 'Cumplimiento'],
      ['usr-comite-riesgos', 'Sr. Andrés Fuentes', 'andres.fuentes', 'role-comite-riesgos', 'Presidente Comité de Riesgos'],
      ['usr-consejo', 'Sra. Carmen Soto', 'carmen.soto', 'role-consejo', 'Presidenta del Consejo'],
      ['usr-junta-vigilancia', 'Sra. Mónica Araya', 'monica.araya', 'role-junta-vigilancia', 'Junta de Vigilancia'],
    ] as const).map(([id, name, mail, roleId, badge]) => {
      const role = DEFAULT_ORGANIZATIONAL_ROLES.find(r => r.id === roleId)!;
      return {
        id,
        name,
        email: `${mail}@demo.riskguard.cl`,
        role: role.title,
        roleId,
        department: role.department,
        badge,
        isSystemUser: !!role.isSystemRole,
        permissions: { ...role.permissions },
      } satisfies UserProfile;
    });

export const DEMO_KRIS: KriDefinition[] = [
  {
    id: 'kri-fin-1',
    code: 'KRI-FIN-01',
    name: 'Tasa de Fallas en Pasarela de Pagos',
    description: 'Porcentaje de transacciones rechazadas por fallas de integración o timeout en pasarela',
    process: 'Operaciones de Pago',
    category: 'Fallas Tecnológicas',
    industry: 'Fintech & Pagos Digitales',
    unit: '%',
    direction: 'superior',
    warningThreshold: 1.5,
    criticalThreshold: 3.0,
    currentValue: 1.1,
    frequency: 'Continuo (Tiempo Real)',
    status: 'Normal',
    autoTriggerAlert: true,
    responsible: 'Jefe de Arquitectura de Pagos',
    lastUpdated: '2026-10-18 16:30'
  },
  {
    id: 'kri-fin-2',
    code: 'KRI-FIN-02',
    name: 'Latencia P99 de Autorización Transaccional',
    description: 'Tiempo de respuesta del 99% de las solicitudes de validación de transacciones',
    process: 'Operaciones de Pago',
    category: 'Fallas Tecnológicas',
    industry: 'Fintech & Pagos Digitales',
    unit: 'ms',
    direction: 'superior',
    warningThreshold: 350,
    criticalThreshold: 750,
    currentValue: 420,
    frequency: 'Por Minuto',
    status: 'Advertencia',
    autoTriggerAlert: true,
    responsible: 'DevOps / SRE',
    lastUpdated: '2026-10-18 16:25'
  },
  {
    id: 'kri-fin-3',
    code: 'KRI-FIN-03',
    name: 'Ratio de Contracargos y Fraude Transaccional',
    description: 'Índice de operaciones desconocidas o reclamadas por tarjetahabientes vs total facturado',
    process: 'Tesorería',
    category: 'Fraude Externo',
    industry: 'Fintech & Pagos Digitales',
    unit: '%',
    direction: 'superior',
    warningThreshold: 0.5,
    criticalThreshold: 0.9,
    currentValue: 0.35,
    frequency: 'Diario',
    status: 'Normal',
    autoTriggerAlert: true,
    responsible: 'Unidad de Prevención de Fraude',
    lastUpdated: '2026-10-18 15:00'
  },
  {
    id: 'kri-fin-4',
    code: 'KRI-FIN-04',
    name: 'Transacciones en Cola de Excepción Manual',
    description: 'Número de pagos retenidos que requieren liberación manual por discrepancias en reglas antifraude',
    process: 'Operaciones de Pago',
    category: 'Ejecución y Procesos',
    industry: 'Fintech & Pagos Digitales',
    unit: 'casos',
    direction: 'superior',
    warningThreshold: 5,
    criticalThreshold: 15,
    currentValue: 18,
    frequency: 'Continuo (Tiempo Real)',
    status: 'Crítico',
    autoTriggerAlert: true,
    responsible: 'Supervisión de Operaciones',
    lastUpdated: '2026-10-18 16:15'
  },
  {
    id: 'kri-fin-5',
    code: 'KRI-FIN-05',
    name: 'Peticiones API con Tokens Revocados o Expirados',
    description: 'Detección de intentos de autenticación anómalos o scraping en endpoints abiertos',
    process: 'Ciberseguridad & TI',
    category: 'Fallas Tecnológicas',
    industry: 'Fintech & Pagos Digitales',
    unit: 'intentos/min',
    direction: 'superior',
    warningThreshold: 3,
    criticalThreshold: 10,
    currentValue: 12,
    frequency: 'Por Minuto',
    status: 'Crítico',
    autoTriggerAlert: true,
    responsible: 'SOC / SecOps',
    lastUpdated: '2026-10-18 15:40'
  }
];

export const DEMO_CONTROLS: Control[] = [
  {
    id: 'ctr-1',
    code: 'CTR-101',
    name: 'Gestión de Accesos Privilegiados (PAM) y MFA FIDO2',
    description: 'Rotación obligatoria de credenciales y doble factor biométrico/llave física para accesos a infraestructura crítica.',
    process: 'Ciberseguridad & TI',
    type: 'Preventivo',
    automation: 'Automático',
    frequency: 'Continuo',
    designEffectiveness: 95,
    operatingEffectiveness: 90,
    totalEffectiveness: 92,
    status: 'Efectivo',
    owner: 'SecOps Team',
    lastTested: '2026-10-12',
    lastTestedBy: 'Oficial de Ciberseguridad',
    sampleDetails: 'Muestra de 50 sesiones privilegiadas de administración en servidores de bases de datos productivas',
    evidence: 'Logs del módulo CyberArk y auditoría de tokens de sesión válidos sin excepciones.',
    attachments: [
      {
        id: 'att-101',
        fileName: 'Auditoria_CyberArk_PAM_Q3_Muestra50.pdf',
        fileSize: '2.4 MB',
        fileType: 'application/pdf',
        uploadedAt: '2026-10-12',
        uploadedBy: 'SecOps Team',
        description: 'Reporte oficial de extracción de sesiones SSH y RDP auditadas con llave FIDO2.',
        fileHashSha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0'
      },
      {
        id: 'att-102',
        fileName: 'Logs_Extraccion_Tokens_FIDO2.csv',
        fileSize: '680 KB',
        fileType: 'text/csv',
        uploadedAt: '2026-10-12',
        uploadedBy: 'SecOps Team',
        description: 'Muestra de 1,200 eventos de autenticación criptográfica exitosos sin bypass.'
      }
    ],
    testHistory: [
      {
        id: 'tst-101',
        testDate: '2026-10-12',
        testedBy: 'Oficial de Ciberseguridad',
        testerRole: 'Auditor de Seguridad',
        testMethod: 'Inspección de Muestra',
        sampleSize: '50 sesiones de 1,420 registradas',
        deviationsIdentified: 0,
        designScore: 95,
        operatingScore: 90,
        totalScore: 92,
        conclusion: 'Efectivo / Conforme',
        evidenceNotes: 'Verificación de trazabilidad en bóveda digital. Ningún acceso directo sin MFA.',
        attachments: [
          {
            id: 'att-101',
            fileName: 'Auditoria_CyberArk_PAM_Q3_Muestra50.pdf',
            fileSize: '2.4 MB',
            fileType: 'application/pdf',
            uploadedAt: '2026-10-12',
            uploadedBy: 'SecOps Team',
            description: 'Reporte oficial de sesiones SSH auditadas'
          }
        ]
      }
    ]
  },
  {
    id: 'ctr-2',
    code: 'CTR-102',
    name: 'Control Dual de Cuatro Ojos en Transferencias > $20k',
    description: 'Ninguna transferencia bancaria o ajuste contable mayor a USD 20,000 puede liberarse sin aprobación de dos firmantes.',
    process: 'Tesorería',
    type: 'Preventivo',
    automation: 'Automático',
    frequency: 'Por Evento',
    designEffectiveness: 90,
    operatingEffectiveness: 88,
    totalEffectiveness: 89,
    status: 'Efectivo',
    owner: 'Jefatura de Tesorería',
    lastTested: '2026-10-14',
    lastTestedBy: 'Laura Benítez',
    sampleDetails: 'Muestra aleatoria de 40 transferencias del mes superiores a USD 20,000',
    evidence: 'Muestra aleatoria de 40 transferencias del mes con dobles firmas criptográficas verificadas.',
    attachments: [
      {
        id: 'att-201',
        fileName: 'Acta_Verificacion_Doble_Firma_Q3.pdf',
        fileSize: '1.8 MB',
        fileType: 'application/pdf',
        uploadedAt: '2026-10-14',
        uploadedBy: 'Laura Benítez',
        description: 'Acta notarial de firmas duales para transferencias bancarias de alto valor.',
        fileHashSha256: '9f8e7d6c5b4a3210fedcba9876543210abcdef0123456789abcdef0123456789'
      },
      {
        id: 'att-202',
        fileName: 'Muestra_40_Transferencias_Swift.xlsx',
        fileSize: '520 KB',
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uploadedAt: '2026-10-14',
        uploadedBy: 'Laura Benítez',
        description: 'Matriz cruzada de transferencias > $20k verificadas contra token físico.'
      }
    ],
    testHistory: [
      {
        id: 'tst-201',
        testDate: '2026-10-14',
        testedBy: 'Laura Benítez',
        testerRole: 'Auditor Financiero',
        testMethod: 'Inspección de Muestra',
        sampleSize: '40 transferencias de 180 transacciones elegibles',
        deviationsIdentified: 0,
        designScore: 90,
        operatingScore: 88,
        totalScore: 89,
        conclusion: 'Efectivo / Conforme',
        evidenceNotes: 'Las 40 transferencias seleccionadas contaban con sello de doble autorización antes de su liberación SWIFT.',
        attachments: []
      }
    ]
  },
  {
    id: 'ctr-3',
    code: 'CTR-103',
    name: 'Replicación Activa Multi-Región con Failover < 30s',
    description: 'Clústeres distribuidos en 2 zonas con conmutación por fallo automática ante caída de nodo primario.',
    process: 'Infraestructura Cloud',
    type: 'Correctivo',
    automation: 'Automático',
    frequency: 'Continuo',
    designEffectiveness: 85,
    operatingEffectiveness: 80,
    totalEffectiveness: 82,
    status: 'Efectivo',
    owner: 'DevOps / SRE',
    lastTested: '2026-09-28',
    lastTestedBy: 'DevOps Lead',
    sampleDetails: 'Simulacro no programado de corte en zona primara de base de datos',
    evidence: 'Informe de simulacro de desastre con RTO de 22s y RPO de 0s.',
    attachments: [
      {
        id: 'att-301',
        fileName: 'Informe_Simulacro_Failover_DRP.pdf',
        fileSize: '3.1 MB',
        fileType: 'application/pdf',
        uploadedAt: '2026-09-28',
        uploadedBy: 'DevOps / SRE',
        description: 'Certificado de prueba de failover conmutado en 22 segundos sin pérdida de registros.'
      }
    ]
  },
  {
    id: 'ctr-4',
    code: 'CTR-104',
    name: 'Conciliación Bancaria Automática Diaria',
    description: 'Cruce algorítmico automatizado diario a las 05:00 UTC entre saldos contables y extractos bancarios SWIFT MT940.',
    process: 'Operaciones de Pago',
    type: 'Detectivo',
    automation: 'Automático',
    frequency: 'Diario',
    designEffectiveness: 92,
    operatingEffectiveness: 84,
    totalEffectiveness: 88,
    status: 'Efectivo',
    owner: 'Contabilidad Central',
    lastTested: '2026-10-17',
    lastTestedBy: 'Contralor Adjunto',
    sampleDetails: 'Cruce de 30 días de extractos SWIFT MT940 contra mayor general',
    evidence: 'Matriz de partidas conciliatorias con 0 descuadres superiores a $500.',
    attachments: [
      {
        id: 'att-401',
        fileName: 'Cruce_Conciliacion_Swift_MT940.xlsx',
        fileSize: '1.2 MB',
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uploadedAt: '2026-10-17',
        uploadedBy: 'Contabilidad Central',
        description: 'Cruce algorítmico de saldos bancarios y auxiliares.'
      }
    ]
  },
  {
    id: 'ctr-5',
    code: 'CTR-105',
    name: 'Escaneo Continuo de Vulnerabilidades y SAST/DAST en CI/CD',
    description: 'Bloqueo automático de despliegues a producción si se detectan vulnerabilidades CVSS >= 7.0.',
    process: 'Ciberseguridad & TI',
    type: 'Preventivo',
    automation: 'Automático',
    frequency: 'Continuo',
    designEffectiveness: 88,
    operatingEffectiveness: 72,
    totalEffectiveness: 80,
    status: 'Parcialmente Efectivo',
    owner: 'Seguridad de Aplicaciones',
    lastTested: '2026-10-10',
    lastTestedBy: 'AppSec Engineer',
    sampleDetails: 'Revisión de 120 pipelines de despliegue en repositorio central',
    evidence: 'Pipeline SonarQube con 4 excepciones temporales aprobadas.',
    attachments: [
      {
        id: 'att-501',
        fileName: 'Reporte_SonarQube_SAST_DAST.pdf',
        fileSize: '4.5 MB',
        fileType: 'application/pdf',
        uploadedAt: '2026-10-10',
        uploadedBy: 'Seguridad de Aplicaciones',
        description: 'Auditoría de hallazgos SAST y remediación de vulnerabilidades.'
      }
    ]
  },
  {
    id: 'ctr-6',
    code: 'CTR-106',
    name: 'Matriz de Segregación de Funciones (SoD) y Matriz RACI',
    description: 'Revisión semestral de permisos incompatibles entre creación de beneficiarios y autorización de pagos.',
    process: 'Gobierno y Control',
    type: 'Detectivo',
    automation: 'Manual',
    frequency: 'Mensual',
    designEffectiveness: 75,
    operatingEffectiveness: 65,
    totalEffectiveness: 70,
    status: 'Parcialmente Efectivo',
    owner: 'Auditoría Interna',
    lastTested: '2026-10-01',
    lastTestedBy: 'Auditor Interno',
    sampleDetails: 'Muestra del 100% de perfiles de usuario con acceso al ERP contable',
    evidence: 'Informe de revisión de accesos con 3 observaciones en remediación.',
    attachments: [
      {
        id: 'att-601',
        fileName: 'Matriz_Conflictos_SoD_ERP.xlsx',
        fileSize: '890 KB',
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        uploadedAt: '2026-10-01',
        uploadedBy: 'Auditoría Interna',
        description: 'Matriz de segregación de funciones con perfiles cruzados identificados.'
      }
    ]
  }
];

export const DEMO_RISKS: Risk[] = [
  {
    id: 'rsk-1',
    code: 'RGO-101',
    title: 'Interrupción prolongada en pasarela de pagos por saturación de transacciones',
    description: 'Caída de servicios de procesamiento de cobros y pagos durante picos comerciales, provocando transacciones fallidas y penalizaciones de clientes.',
    process: 'Operaciones de Pago',
    category: 'Fallas Tecnológicas',
    responsible: 'Ing. Carlos Mendoza',
    status: 'Activo',
    inherentLikelihood: 3,
    inherentImpact: 4,
    inherentScore: 12,
    inherentLevel: 'Crítico',
    financialExposureUSD: 450000,
    controlIds: ['ctr-3', 'ctr-4'],
    residualLikelihood: 1,
    residualImpact: 2,
    residualScore: 2,
    residualLevel: 'Bajo',
    residualExposureUSD: 95000,
    mitigationPlan: {
      id: 'mit-101',
      title: 'Despliegue de Auto-escalado Dinámico y Pasarelas de Respaldo',
      owner: 'SRE Team',
      dueDate: '2026-11-30',
      budgetUSD: 35000,
      progressPct: 75,
      status: 'En Progreso',
      actions: [
        'Habilitar multi-cloud gateway balanceado',
        'Implementar colas de reintento idempotentes',
        'Ajustar métricas de alerta preventiva a 70% de CPU'
      ]
    },
    createdAt: '2026-08-10',
    lastReviewDate: '2026-10-15'
  },
  {
    id: 'rsk-2',
    code: 'RGO-102',
    title: 'Apropiación o desvío de fondos mediante credenciales clonadas de tesorero',
    description: 'Uso no autorizado de credenciales de operadores de tesorería para emitir transferencias fraudulentas al exterior.',
    process: 'Tesorería',
    category: 'Fraude Interno',
    responsible: 'Lic. Laura Benítez',
    status: 'Bajo Monitoreo',
    inherentLikelihood: 2,
    inherentImpact: 4,
    inherentScore: 8,
    inherentLevel: 'Alto',
    financialExposureUSD: 750000,
    controlIds: ['ctr-1', 'ctr-2', 'ctr-6'],
    residualLikelihood: 1,
    residualImpact: 2,
    residualScore: 2,
    residualLevel: 'Bajo',
    residualExposureUSD: 110000,
    mitigationPlan: {
      id: 'mit-102',
      title: 'Certificación de Tokens FIDO2 Físicos y Control Biométrico',
      owner: 'Seguridad de la Información',
      dueDate: '2026-10-31',
      budgetUSD: 18000,
      progressPct: 90,
      status: 'En Progreso',
      actions: [
        'Entrega de llaves YubiKey 5C a todos los autorizadores',
        'Restricción estricta por rangos de IP de sede corporativa',
        'Notificación SMS/Push en tiempo real ante giros superiores a $10k'
      ]
    },
    createdAt: '2026-07-15',
    lastReviewDate: '2026-10-14'
  },
  {
    id: 'rsk-3',
    code: 'RGO-103',
    title: 'Exfiltración de base de datos de clientes por vulnerabilidad en API pública',
    description: 'Ataque externo explotando endpoints sin sanitización adecuada con fuga de información sensible sujeta a GDPR / Habeas Data.',
    process: 'Ciberseguridad & TI',
    category: 'Fallas Tecnológicas',
    responsible: 'Ing. Marcelo Solís',
    status: 'Activo',
    inherentLikelihood: 3,
    inherentImpact: 3,
    inherentScore: 9,
    inherentLevel: 'Alto',
    financialExposureUSD: 600000,
    controlIds: ['ctr-1', 'ctr-5'],
    residualLikelihood: 2,
    residualImpact: 2,
    residualScore: 4,
    residualLevel: 'Medio',
    residualExposureUSD: 135000,
    mitigationPlan: {
      id: 'mit-103',
      title: 'Hardening de API Gateway y Enmascaramiento Dinámico de Datos',
      owner: 'Arquitectura de Ciberseguridad',
      dueDate: '2026-12-15',
      budgetUSD: 42000,
      progressPct: 50,
      status: 'En Progreso',
      actions: [
        'Instalación de Web Application Firewall (WAF) con reglas OWASP Core',
        'Tokenización de PII en reposo y tránsito',
        'Pruebas de penetración externas (Ethical Hacking)'
      ]
    },
    createdAt: '2026-09-01',
    lastReviewDate: '2026-10-11'
  },
  {
    id: 'rsk-4',
    code: 'RGO-104',
    title: 'Multas y sanciones por omisión o retraso de reporte de transacciones sospechosas',
    description: 'Incumplimiento de plazos perentorios para notificar a la Unidad de Inteligencia Financiera / Regulador de operaciones atípicas.',
    process: 'Cumplimiento Legal',
    category: 'Cumplimiento Normativo',
    responsible: 'Abg. Claudia Morales',
    status: 'Mitigado',
    inherentLikelihood: 2,
    inherentImpact: 3,
    inherentScore: 6,
    inherentLevel: 'Medio',
    financialExposureUSD: 380000,
    controlIds: ['ctr-4', 'ctr-6'],
    residualLikelihood: 1,
    residualImpact: 2,
    residualScore: 2,
    residualLevel: 'Bajo',
    residualExposureUSD: 65000,
    mitigationPlan: {
      id: 'mit-104',
      title: 'Sistema de Alertas Regulatorias Automatizadas y Detección de PEPs',
      owner: 'Oficialía de Cumplimiento',
      dueDate: '2026-09-30',
      budgetUSD: 22000,
      progressPct: 100,
      status: 'Completado',
      actions: [
        'Integración con listas restrictivas OFAC/ONU automáticas',
        'Flujo de escalamiento de 24 horas para casos sospechosos'
      ]
    },
    createdAt: '2026-06-20',
    lastReviewDate: '2026-10-05'
  },
  {
    id: 'rsk-5',
    code: 'RGO-105',
    title: 'Descuadre en liquidaciones interbancarias por desfase en archivos de compensación',
    description: 'Errores en la ingestión de ficheros de compensación nocturna que generan asimetría de saldos con bancos corresponsales.',
    process: 'Operaciones de Pago',
    category: 'Ejecución y Procesos',
    responsible: 'Lic. Fernando Ortiz',
    status: 'Activo',
    inherentLikelihood: 2,
    inherentImpact: 2,
    inherentScore: 4,
    inherentLevel: 'Medio',
    financialExposureUSD: 180000,
    controlIds: ['ctr-4'],
    residualLikelihood: 1,
    residualImpact: 1,
    residualScore: 1,
    residualLevel: 'Bajo',
    residualExposureUSD: 45000,
    mitigationPlan: {
      id: 'mit-105',
      title: 'Validación Criptográfica de Archivos y Alertas de Desfase Horario',
      owner: 'Operaciones Bancarias',
      dueDate: '2026-11-15',
      budgetUSD: 12000,
      progressPct: 60,
      status: 'En Progreso',
      actions: [
        'Verificación de Checksum SHA-256 en archivos entrantes',
        'Monitoreo de umbral de tiempo máximo de llegada'
      ]
    },
    createdAt: '2026-08-25',
    lastReviewDate: '2026-10-16'
  },
  {
    id: 'rsk-6',
    code: 'RGO-106',
    title: 'Fuga de talentos críticos y desarticulación del equipo de ingeniería de pagos',
    description: 'Rotación acelerada de desarrolladores seniors de servicios core sin transferencia formal de conocimiento técnico.',
    process: 'Gestión Humana',
    category: 'Prácticas Laborales',
    responsible: 'Lic. Mariana Ruiz',
    status: 'Activo',
    inherentLikelihood: 3,
    inherentImpact: 3,
    inherentScore: 9,
    inherentLevel: 'Alto',
    financialExposureUSD: 220000,
    controlIds: [],
    residualLikelihood: 3,
    residualImpact: 3,
    residualScore: 9,
    residualLevel: 'Alto',
    residualExposureUSD: 220000,
    mitigationPlan: {
      id: 'mit-106',
      title: 'Plan de Retención de Personal Clave y Documentación Obligatoria',
      owner: 'Recursos Humanos & CTO',
      dueDate: '2026-11-20',
      budgetUSD: 45000,
      progressPct: 35,
      status: 'En Progreso',
      actions: [
        'Bono de permanencia para ingenieros estratégicos',
        'Estándar obligatorio de documentación de arquitectura (RFCs)',
        'Esquema de pares (Shadowing) para tareas críticas'
      ]
    },
    createdAt: '2026-09-15',
    lastReviewDate: '2026-10-08'
  },
  {
    id: 'rsk-7',
    code: 'RGO-107',
    title: 'Indisponibilidad del clúster de base de datos transaccional por saturación de IOPS y réplicas desfasadas',
    description: 'Caída de servicios de lectura/escritura por saturación de volumen EBS durante cierre contable mensual con desfase de réplicas en clúster secundario.',
    process: 'Infraestructura Cloud',
    category: 'Fallas Tecnológicas',
    responsible: 'Ing. Carlos Mendoza',
    status: 'Activo',
    inherentLikelihood: 3,
    inherentImpact: 4,
    inherentScore: 12,
    inherentLevel: 'Crítico',
    financialExposureUSD: 520000,
    controlIds: ['ctr-3'],
    residualLikelihood: 1,
    residualImpact: 3,
    residualScore: 3,
    residualLevel: 'Bajo',
    residualExposureUSD: 130000,
    mitigationPlan: {
      id: 'mit-107',
      title: 'Aprovisionamiento de SSDs io2 Block Express y Sharding Automático',
      owner: 'DevOps / SRE Lead',
      dueDate: '2026-11-25',
      budgetUSD: 38000,
      progressPct: 65,
      status: 'En Progreso',
      actions: [
        'Migración a volúmenes provisionados io2 con 64,000 IOPS garantizados',
        'Configurar alarmas proactivas de lag de réplica a los 5 segundos',
        'Implementar particionado lógico por fechas de conciliación'
      ]
    },
    createdAt: '2026-08-20',
    lastReviewDate: '2026-10-16'
  },
  {
    id: 'rsk-8',
    code: 'RGO-108',
    title: 'Incompatibilidad de perfiles y falta de segregación de funciones (SoD) en parametrización contable',
    description: 'Asignación concurrente de permisos de creación de cuentas y validación de partidas a analistas contables sin supervisión independiente.',
    process: 'Gobierno y Control',
    category: 'Ejecución y Procesos',
    responsible: 'Lic. Roberto Miranda',
    status: 'Bajo Monitoreo',
    inherentLikelihood: 2,
    inherentImpact: 3,
    inherentScore: 6,
    inherentLevel: 'Medio',
    financialExposureUSD: 240000,
    controlIds: ['ctr-6'],
    residualLikelihood: 1,
    residualImpact: 2,
    residualScore: 2,
    residualLevel: 'Bajo',
    residualExposureUSD: 60000,
    mitigationPlan: {
      id: 'mit-108',
      title: 'Automatización del Análisis de Conflictos SoD en ERP',
      owner: 'Auditoría Interna y Contraloría',
      dueDate: '2026-11-10',
      budgetUSD: 16000,
      progressPct: 80,
      status: 'En Progreso',
      actions: [
        'Configuración de reglas cruzadas de exclusión en módulo IAM',
        'Recertificación semestral automatizada de roles con workflow de aprobación'
      ]
    },
    createdAt: '2026-07-28',
    lastReviewDate: '2026-10-12'
  }
];

export const DEMO_FLAWS: OperationalFlaw[] = [
  {
    id: 'inc-6',
    title: 'Interrupción del sitio web y app de socios por falla en balanceador',
    description: 'Los canales digitales de socios quedaron indisponibles. Las transferencias y pagos de créditos en línea no pudieron procesarse.',
    reportedBy: 'Ing. Carlos Mendoza',
    process: 'Ciberseguridad & TI',
    severity: 'Crítica',
    reportedAt: localStamp(minutesAgo(55)),
    status: 'Pendiente de Evaluación',
    incidentType: 'Vulnerabilidad Operativa',
    realLossAmountUSD: 0,
    recoveredAmountUSD: 0,
    impactedSystemOrAccount: 'Portal web y app de socios',
    affectedAssetIds: ['ast-2', 'ast-6'],
    providerId: 'prv-2',
    aiSuggestedCategory: 'Fallas Tecnológicas',
    businessLine: 'Medios y Canales de Pago',
    baselCategory: 'Fallas Tecnológicas',
    baselSubcategory: 'Interrupción del negocio y fallas de sistemas',
    occurrenceDate: minutesAgo(70).slice(0, 10),
    discoveryDate: minutesAgo(55).slice(0, 10),
    regulatoryReport: {
      awarenessAt: minutesAgo(50),
      occurredAt: minutesAgo(70),
      details: {
        possibleCauses: 'Falla de hardware en el balanceador del proveedor de nube.',
        affectedProducts: 'Transferencias, pago de créditos y consultas de saldo en canales digitales.',
        affectedChannels: ['Página web', 'Aplicación móvil'],
        customerType: 'Personas', estimatedAffectedMembers: 4200, affectedTransactions: 0,
        measures: 'Conmutación al sitio alternativo en curso; aviso en redes sociales.',
        informant: 'Ing. Carlos Mendoza, Gerente de Operaciones',
      },
      reportableToCMF: true,
      reportableToANCI: false,
      submissions: [],
      updates: [
        { at: minutesAgo(45), by: 'Ing. Carlos Mendoza', note: 'Proveedor de infraestructura confirma falla de hardware; en curso conmutación a sitio alternativo.' }
      ],
      status: 'Abierto'
    }
  },
  {
    id: 'inc-5',
    title: 'Campaña de phishing suplantando a la cooperativa con robo de credenciales de socios',
    description: 'Sitio falso con la imagen de la cooperativa capturó credenciales de socios. Se detectaron transferencias no reconocidas desde 9 cuentas de ahorro.',
    reportedBy: 'Ing. Alejandro Vega',
    process: 'Ciberseguridad & TI',
    severity: 'Crítica',
    reportedAt: localStamp(minutesAgo(25)),
    status: 'Pendiente de Evaluación',
    incidentType: 'Evento de Pérdida Real',
    realLossAmountUSD: 12800,
    recoveredAmountUSD: 3000,
    impactedSystemOrAccount: 'Cuentas de ahorro de socios / Canal web',
    affectedAssetIds: ['ast-2', 'ast-1'],
    cyber: {
      isCyber: true, threatType: 'Phishing / ingeniería social', malware: 'Sitio falso cooperativa-socios[.]com; kit de phishing con captura de OTP',
      protection: 'Bloqueo del dominio, reseteo de claves y doble factor reforzado', industryAlertAt: '2026-09-02T15:10:00.000Z',
      industryAlertChannel: 'Plataforma de alertas de la industria y CSIRT', forensicRequired: true, forensicBy: '', forensicSummary: '',
      lessonsLearned: 'Monitoreo de dominios similares y campaña de concientización a socios.',
    },
    aiSuggestedCategory: 'Fraude Externo',
    aiSuggestedControls: ['Segundo factor de autenticación en transferencias', 'Monitoreo de dominios similares (takedown)'],
    businessLine: 'Captaciones y Ahorro',
    baselCategory: 'Fraude Externo',
    baselSubcategory: 'Seguridad de los sistemas',
    occurrenceDate: minutesAgo(180).slice(0, 10),
    discoveryDate: minutesAgo(25).slice(0, 10),
    regulatoryReport: {
      awarenessAt: minutesAgo(20),
      occurredAt: minutesAgo(25),
      reportableToCMF: true,
      reportableToANCI: true,
      submissions: [],
      updates: [],
      status: 'Abierto'
    }
  },
  {
    id: 'inc-1',
    title: 'Falla de Control: Uso de cuenta compartida "operador_noche" en transferencias',
    description: 'Se detectó que dos analistas de guardia utilizan credenciales maestras compartidas para acelerar procesamiento sin validación dual del supervisor.',
    reportedBy: 'Lic. Roberto Miranda',
    process: 'Tesorería',
    severity: 'Crítica',
    reportedAt: '2026-10-17 21:15',
    status: 'Pendiente de Evaluación',
    incidentType: 'Falla de Control',
    realLossAmountUSD: 0,
    recoveredAmountUSD: 0,
    impactedSystemOrAccount: 'Sistema de transferencias / Mesa de Dinero',
    affectedAssetIds: ['ast-1'],
    aiSuggestedCategory: 'Fraude Interno',
    aiSuggestedControls: ['Eliminar usuarios genéricos', 'Forzar autenticación nominal con token individual'],
    businessLine: 'Tesorería e Inversiones',
    baselCategory: 'Fraude Interno',
    baselSubcategory: 'Actividades no autorizadas',
    occurrenceDate: '2026-10-17',
    discoveryDate: '2026-10-17'
  },
  {
    id: 'inc-2',
    title: 'Falla de Control: Omisión de respaldo secundario durante mantenimiento de clúster',
    description: 'La tarea automatizada de snapshot falló por falta de espacio en el bucket de archivo frío y nadie revisó la notificación de advertencia generada.',
    reportedBy: 'Operador TI Javier Castro',
    process: 'Infraestructura Cloud',
    severity: 'Alta',
    reportedAt: '2026-10-16 08:30',
    status: 'Pendiente de Evaluación',
    incidentType: 'Falla de Control',
    realLossAmountUSD: 0,
    recoveredAmountUSD: 0,
    impactedSystemOrAccount: 'Clúster PostgreSQL Core',
    aiSuggestedCategory: 'Fallas Tecnológicas',
    aiSuggestedControls: ['Auto-expansión de almacenamiento', 'Alarma crítica con escalamiento PagerDuty'],
    businessLine: 'Soporte Corporativo',
    baselCategory: 'Fallas Tecnológicas',
    baselSubcategory: 'Interrupción del negocio y fallas de sistemas',
    occurrenceDate: '2026-10-15',
    discoveryDate: '2026-10-16',
    regulatoryReport: {
      awarenessAt: '2026-10-16T11:40:00.000Z',
      occurredAt: '2026-10-16T11:35:00.000Z',
      reportableToCMF: true,
      reportableToANCI: false,
      submissions: [
        { milestoneId: 'cmf-aviso-inicial', submittedAt: '2026-10-16T12:02:00.000Z', submittedBy: 'Dra. Elena Vasconcelos', folio: 'CMF-INC-2026-0187' },
        { milestoneId: 'cmf-reporte-cierre', submittedAt: '2026-10-16T17:50:00.000Z', submittedBy: 'Dra. Elena Vasconcelos', folio: 'CMF-INC-2026-0187' }
      ],
      updates: [
        { at: '2026-10-16T15:30:00.000Z', by: 'Dra. Elena Vasconcelos', note: 'Respaldo regenerado y verificado. Sin pérdida de datos de socios.' }
      ],
      status: 'Cerrado',
      closedAt: '2026-10-16T18:00:00.000Z'
    }
  },
  {
    id: 'inc-3',
    title: 'Evento de Pérdida Real: Cobro duplicado de cuotas de crédito por desfase en lote de pagos',
    description: 'Falla de sincronización horaria de lotes provocó el cargo duplicado de cuotas de crédito a 14 socios, con devoluciones y un costo no recuperable de procesamiento.',
    reportedBy: 'Analista Sofía Ramos',
    process: 'Operaciones de Pago',
    severity: 'Media',
    reportedAt: '2026-10-15 17:45',
    status: 'Pendiente de Evaluación',
    incidentType: 'Evento de Pérdida Real',
    realLossAmountUSD: 18450,
    recoveredAmountUSD: 4200,
    impactedSystemOrAccount: 'Recaudación de cuotas / PAC',
    providerId: 'prv-3',
    aiSuggestedCategory: 'Ejecución y Procesos',
    aiSuggestedControls: ['API directa de conciliación continua', 'Penalización por SLA en contrato'],
    businessLine: 'Créditos de Consumo',
    baselCategory: 'Ejecución y Procesos',
    baselSubcategory: 'Recepción, ejecución y mantenimiento de operaciones',
    occurrenceDate: '2026-10-14',
    discoveryDate: '2026-10-15',
    accountingDate: '2026-10-16',
    accountingAccount: '4.2.01.002',
    creditRiskBoundary: false
  },
  {
    id: 'inc-4',
    title: 'Evento de Pérdida Real: Multa por envío extemporáneo de reporte de operaciones sospechosas',
    description: 'Retraso de 48 horas en el envío del reporte de operaciones sospechosas a la UAF debido a un fallo no alertado en el script de integración de cumplimiento.',
    reportedBy: 'Oficial Laura Méndez',
    process: 'Cumplimiento Legal',
    severity: 'Alta',
    reportedAt: '2026-10-14 11:20',
    status: 'Pendiente de Evaluación',
    incidentType: 'Evento de Pérdida Real',
    realLossAmountUSD: 35000,
    recoveredAmountUSD: 0,
    impactedSystemOrAccount: 'Portal UAF',
    aiSuggestedCategory: 'Cumplimiento Normativo',
    aiSuggestedControls: ['Monitoreo continuo de deadlines regulatorios', 'Firma digital de respaldo'],
    businessLine: 'Soporte Corporativo',
    baselCategory: 'Cumplimiento Normativo',
    baselSubcategory: 'Prácticas empresariales o de mercado improcedentes',
    occurrenceDate: '2026-09-02',
    discoveryDate: '2026-09-04',
    accountingDate: '2026-10-14',
    accountingAccount: '4.2.01.003'
  }
];

export const DEMO_ALERTS: AnomalyAlert[] = [
  {
    id: 'alt-1',
    code: 'ALT-401',
    title: 'KRI Excedido: 18 operaciones en cola de excepción manual',
    description: 'El umbral de tolerancia fijado para el proceso de pagos es de máximo 5 transacciones en cola manual. Se detecta congestión.',
    kriMetric: 'Transacciones en Cola de Excepción',
    threshold: '<= 5 transacciones',
    currentValue: '18 transacciones',
    severity: 'Crítico',
    process: 'Operaciones de Pago',
    triggeredAt: '2026-10-18 16:15',
    status: 'Activa',
    escalatedTo: 'Jefatura de Operaciones de Pago'
  },
  {
    id: 'alt-2',
    code: 'ALT-402',
    title: 'Anomalía de Acceso: Múltiples reintentos con token expirado',
    description: 'Módulo de autenticación detectó 12 peticiones de API con tokens revocados provenientes del nodo de integración B2B.',
    kriMetric: 'Tasa de Fallos de Autenticación API',
    threshold: '<= 3 intentos/min',
    currentValue: '12 intentos/min',
    severity: 'Alto',
    process: 'Ciberseguridad & TI',
    triggeredAt: '2026-10-18 15:40',
    status: 'Activa',
    escalatedTo: 'SOC / Ciberseguridad'
  },
  {
    id: 'alt-3',
    code: 'ALT-403',
    title: 'Control CTR-105: Advertencia de degradación de cobertura',
    description: 'Se registraron 3 excepciones consecutivas al escaneo SAST en rama principal de pagos sin ticket de exención formal.',
    kriMetric: 'Cobertura de Pruebas de Seguridad en Despliegues',
    threshold: '>= 95%',
    currentValue: '86.4%',
    severity: 'Medio',
    process: 'Ciberseguridad & TI',
    triggeredAt: '2026-10-18 13:20',
    status: 'En Investigación',
    escalatedTo: 'Líder Técnico de Arquitectura'
  }
];

export const DEMO_AUDITS: PeriodicAudit[] = [
  {
    id: 'aud-1',
    code: 'AUD-2026-Q1',
    title: 'Auditoría Periódica de Riesgo Operacional y Resiliencia Q1',
    type: 'Auditoría Interna',
    period: 'Q1 2026',
    leadAuditor: 'Lic. Roberto Miranda',
    scope: ['Tesorería', 'Operaciones de Pago', 'Infraestructura Cloud'],
    executionDate: '2026-03-31',
    status: 'Finalizada',
    complianceScore: 97,
    findings: [
      {
        id: 'fnd-1',
        type: 'Conforme',
        description: 'El control dual CTR-102 se ejecutó en el 100% de la muestra de operaciones de alto valor.',
        process: 'Tesorería',
        associatedRiskCode: 'RGO-102',
        correctiveAction: 'Mantener revisión trimestral.',
        deadline: '2026-06-30',
        responsible: 'Laura Benítez',
        status: 'Cerrado'
      },
      {
        id: 'fnd-2',
        type: 'Observación',
        description: 'Demora de hasta 48 horas en la baja de perfiles de colaboradores desvinculados.',
        process: 'Gestión Humana',
        associatedRiskCode: 'RGO-106',
        correctiveAction: 'Automatizar webhook de revocación con sistema de nómina.',
        deadline: '2026-05-15',
        responsible: 'Mariana Ruiz',
        status: 'En Subsanación'
      }
    ]
  },
  {
    id: 'aud-2',
    code: 'AUD-2026-Q2',
    title: 'Auditoría de Cumplimiento Normativo y Prevención de Fraude Q2',
    type: 'Auditoría Regulatoria',
    period: 'Q2 2026',
    leadAuditor: 'Dra. Elena Vasconcelos',
    scope: ['Cumplimiento Legal', 'Tesorería', 'Ciberseguridad & TI'],
    executionDate: '2026-06-30',
    status: 'En Curso',
    complianceScore: 92,
    findings: [
      {
        id: 'fnd-3',
        type: 'No Conformidad Menor',
        description: 'Carencia de bitácora inalterable en el sistema de contingencia secundario.',
        process: 'Infraestructura Cloud',
        associatedRiskCode: 'RGO-101',
        correctiveAction: 'Sincronizar el ledger inalterable a clúster secundario con replicación criptográfica.',
        deadline: '2026-11-15',
        responsible: 'Carlos Mendoza',
        status: 'En Subsanación'
      }
    ]
  }
];

export const DEMO_LEDGER: AuditLogEntry[] = [
  {
    id: 'log-1',
    blockNumber: 1,
    timestamp: '2026-10-18T10:00:12Z',
    userName: 'Dra. Elena Vasconcelos',
    userRole: 'Jefe de Riesgo Operacional',
    action: 'CREACIÓN_RIESGO',
    entityType: 'Riesgo',
    entityCode: 'RGO-101',
    details: 'Identificación y alta de riesgo por falla en pasarela de pagos. Riesgo Inherente: 20 (Crítico).',
    ipAddress: '10.240.1.45',
    previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
    hash: '3f7a81c4e9d02b8813fa211c4709eb97bc4a88f583e20e8d052a23e8e19c0b55'
  },
  {
    id: 'log-2',
    blockNumber: 2,
    timestamp: '2026-10-18T11:22:04Z',
    userName: 'Dra. Elena Vasconcelos',
    userRole: 'Jefe de Riesgo Operacional',
    action: 'APLICACIÓN_CONTROL',
    entityType: 'Control',
    entityCode: 'CTR-102',
    details: 'Asociación del control dual al riesgo RGO-102. Reducción calculada de riesgo residual a 3 (Bajo).',
    ipAddress: '10.240.1.45',
    previousHash: '3f7a81c4e9d02b8813fa211c4709eb97bc4a88f583e20e8d052a23e8e19c0b55',
    hash: 'a1b7e49c830022dc5ff48109ad7b653e002c918235a90d4fbb9104fae1098612'
  },
  {
    id: 'log-3',
    blockNumber: 3,
    timestamp: '2026-10-18T14:10:45Z',
    userName: 'Audit. Roberto Miranda',
    userRole: 'Auditor de Control Interno',
    action: 'EVALUACIÓN_CONTROL',
    entityType: 'Control',
    entityCode: 'CTR-101',
    details: 'Prueba de eficacia de control PAM: Resultado 92% (Efectivo). Sin hallazgos graves.',
    ipAddress: '10.240.2.89',
    previousHash: 'a1b7e49c830022dc5ff48109ad7b653e002c918235a90d4fbb9104fae1098612',
    hash: '77c8e01bf2845391a27e408cc815d3e098a514d10f99238e55e0984f1837c77d'
  },
  {
    id: 'log-4',
    blockNumber: 4,
    timestamp: '2026-10-18T16:15:20Z',
    userName: 'Sistema Automático KRI',
    userRole: 'Monitor Continuo',
    action: 'ALERTA_DISPARADA',
    entityType: 'Alerta',
    entityCode: 'ALT-401',
    details: 'Alerta KRI disparada: 18 operaciones en cola manual superan el umbral establecido de 5.',
    ipAddress: '127.0.0.1 (Engine)',
    previousHash: '77c8e01bf2845391a27e408cc815d3e098a514d10f99238e55e0984f1837c77d',
    hash: '9d4f107c2a88301be44e11fa9900c43288b49e1029c918fa4002d08a901844ec'
  }
];


// -----------------------------------------------------------------------------
// Mantenedores (datos de ejemplo): procesos que usan los riesgos y controles de ejemplo
// -----------------------------------------------------------------------------

const demoProc = (n: number, name: string, areaId: string, owner: string, businessLine: BusinessProcess['businessLine'], criticality: BusinessProcess['criticality']): BusinessProcess => ({
  id: `proc-demo-${n}`, code: `PRC-${String(n).padStart(2, '0')}`, name, areaId, owner, businessLine, criticality, description: '', active: true,
});

export const DEMO_PROCESSES: BusinessProcess[] = [
  demoProc(1, 'Operaciones de Pago', 'area-operaciones', 'Carlos Mendoza', 'Medios y Canales de Pago', 'Crítico'),
  demoProc(2, 'Tesorería', 'area-finanzas', 'Laura Benítez', 'Tesorería e Inversiones', 'Crítico'),
  demoProc(3, 'Ciberseguridad & TI', 'area-seguridad', 'Alejandro Vega', 'Soporte Corporativo', 'Crítico'),
  demoProc(4, 'Infraestructura Cloud', 'area-operaciones', 'Carlos Mendoza', 'Soporte Corporativo', 'Alto'),
  demoProc(5, 'Cumplimiento Legal', 'area-cumplimiento', 'Sofía Valenzuela', 'Soporte Corporativo', 'Alto'),
  demoProc(6, 'Gestión Humana', 'area-personas', '', 'Soporte Corporativo', 'Medio'),
  demoProc(7, 'Gobierno y Control', 'area-gobierno', 'Roberto Miranda', 'Soporte Corporativo', 'Alto'),
  demoProc(8, 'Cadena de Suministro', 'area-operaciones', '', 'Soporte Corporativo', 'Medio'),
  demoProc(9, 'Captaciones y Ahorro', 'area-comercial', '', 'Captaciones y Ahorro', 'Crítico'),
  demoProc(10, 'Créditos y Cobranza', 'area-comercial', '', 'Créditos de Consumo', 'Crítico'),
  demoProc(11, 'Atención a Socios y Sucursales', 'area-comercial', '', 'Soporte Corporativo', 'Alto'),
];

/** Plan de cuentas de ejemplo para la base de pérdidas. */
export const DEMO_ACCOUNTING_ACCOUNTS = [
  { code: '4.2.01.001', name: 'Pérdidas por fraude externo', active: true },
  { code: '4.2.01.002', name: 'Gastos por pérdidas operacionales – procesos', active: true },
  { code: '4.2.01.003', name: 'Multas y sanciones', active: true },
  { code: '4.2.01.004', name: 'Pérdidas por fallas tecnológicas', active: true },
  { code: '5.1.09.001', name: 'Recuperación de pérdidas operacionales', active: true },
];
