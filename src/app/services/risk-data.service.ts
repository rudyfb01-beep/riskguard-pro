import { Injectable, computed, signal } from '@angular/core';
import {
  Control,
  OperationalFlaw,
  PeriodicAudit,
  Risk,
  RiskLevel,
  AnomalyAlert,
  AuditLogEntry,
  UserProfile,
  AuditFinding,
  ProcessHeatmapSummary,
  ProcessHeatmapCell,
  ControlEvidenceAttachment,
  ControlTestExecution,
  IndustryType,
  KriDefinition,
  KriNotificationPreferences,
  OrganizationalRole,
  UserPermissions
} from '../models/risk.model';
import { computeBlockHash } from '../utils/crypto-ledger';

export const INDUSTRY_KRI_PRESETS: Record<IndustryType, Omit<KriDefinition, 'id' | 'lastUpdated'>[]> = {
  'Fintech & Pagos Digitales': [
    {
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
      responsible: 'Jefe de Arquitectura de Pagos'
    },
    {
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
      responsible: 'DevOps / SRE'
    },
    {
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
      responsible: 'Unidad de Prevención de Fraude'
    },
    {
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
      responsible: 'Supervisión de Operaciones'
    },
    {
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
      responsible: 'SOC / SecOps'
    }
  ],
  'Banca & Servicios Financieros': [
    {
      code: 'KRI-BNK-01',
      name: 'Operaciones de Alto Valor sin Sello de Doble Firma',
      description: 'Transferencias interbancarias > USD 20,000 liberadas sin validación dual estricta',
      process: 'Tesorería',
      category: 'Fraude Interno',
      industry: 'Banca & Servicios Financieros',
      unit: 'casos/mes',
      direction: 'superior',
      warningThreshold: 1,
      criticalThreshold: 3,
      currentValue: 0,
      frequency: 'Diario',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Oficial de Control de Tesorería'
    },
    {
      code: 'KRI-BNK-02',
      name: 'Tasa de Rechazo en Validaciones KYC / Listas Negativas',
      description: 'Proporción de solicitudes de apertura bloqueadas por coincidencia con listas OFAC/PEP',
      process: 'Cumplimiento Legal',
      category: 'Cumplimiento Normativo',
      industry: 'Banca & Servicios Financieros',
      unit: '%',
      direction: 'superior',
      warningThreshold: 4.0,
      criticalThreshold: 8.0,
      currentValue: 2.8,
      frequency: 'Diario',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Oficial de Cumplimiento AML'
    },
    {
      code: 'KRI-BNK-03',
      name: 'Coeficiente de Cobertura de Liquidez (LCR)',
      description: 'Activos líquidos de alta calidad frente a salidas netas de efectivo a 30 días (Basilea III)',
      process: 'Tesorería',
      category: 'Ejecución y Procesos',
      industry: 'Banca & Servicios Financieros',
      unit: '%',
      direction: 'inferior',
      warningThreshold: 110,
      criticalThreshold: 102,
      currentValue: 124,
      frequency: 'Diario',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Gerente Financiero & ALM'
    },
    {
      code: 'KRI-BNK-04',
      name: 'Demora en Despacho de Reportes Regulatorios (SAR)',
      description: 'Horas transcurridas para informar operaciones sospechosas a la autoridad reguladora',
      process: 'Cumplimiento Legal',
      category: 'Cumplimiento Normativo',
      industry: 'Banca & Servicios Financieros',
      unit: 'horas',
      direction: 'superior',
      warningThreshold: 12,
      criticalThreshold: 24,
      currentValue: 48,
      frequency: 'Por Evento',
      status: 'Crítico',
      autoTriggerAlert: true,
      responsible: 'Oficial de Cumplimiento Regulatorio'
    },
    {
      code: 'KRI-BNK-05',
      name: 'Indisponibilidad Acumulada de Core Bancario / Canales',
      description: 'Minutos mensuales de caída no programada en banca en línea o cajeros automáticos',
      process: 'Infraestructura Cloud',
      category: 'Fallas Tecnológicas',
      industry: 'Banca & Servicios Financieros',
      unit: 'minutos/mes',
      direction: 'superior',
      warningThreshold: 20,
      criticalThreshold: 60,
      currentValue: 15,
      frequency: 'Mensual',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Gerencia de Tecnología Bancaria'
    }
  ],
  'Salud & Farmacéutica': [
    {
      code: 'KRI-MED-01',
      name: 'Tiempo de Respuesta a Alarmas de Soporte Vital',
      description: 'Segundos promedio de atención a alarmas críticas en unidades de cuidados intensivos',
      process: 'Operaciones Clínicas',
      category: 'Ejecución y Procesos',
      industry: 'Salud & Farmacéutica',
      unit: 'segundos',
      direction: 'superior',
      warningThreshold: 45,
      criticalThreshold: 90,
      currentValue: 32,
      frequency: 'Continuo (Tiempo Real)',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Jefatura de Enfermería y Cuidados Críticos'
    },
    {
      code: 'KRI-MED-02',
      name: 'Tasa de Errores de Dispensación y Dosificación',
      description: 'Desviaciones o discrepancias identificadas en la entrega de medicamentos a pacientes',
      process: 'Farmacia Hospitalaria',
      category: 'Ejecución y Procesos',
      industry: 'Salud & Farmacéutica',
      unit: '%',
      direction: 'superior',
      warningThreshold: 0.15,
      criticalThreshold: 0.40,
      currentValue: 0.08,
      frequency: 'Diario',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Director de Farmacia Clínica'
    },
    {
      code: 'KRI-MED-03',
      name: 'Intentos de Acceso No Autorizado a Historias Clínicas (HIPAA)',
      description: 'Consultas anómalas a datos de pacientes protegidos sin orden médica activa',
      process: 'Ciberseguridad & TI',
      category: 'Cumplimiento Normativo',
      industry: 'Salud & Farmacéutica',
      unit: 'intentos/semana',
      direction: 'superior',
      warningThreshold: 1,
      criticalThreshold: 3,
      currentValue: 2,
      frequency: 'Semanal',
      status: 'Advertencia',
      autoTriggerAlert: true,
      responsible: 'Oficial de Seguridad de la Información Médica'
    },
    {
      code: 'KRI-MED-04',
      name: 'Desviación Térmica en Cadena de Frío de Biológicos',
      description: 'Variación fuera del rango regulado (2°C a 8°C) en cámaras de conservación de vacunas',
      process: 'Cadena de Suministro',
      category: 'Daño a Activos Físicos',
      industry: 'Salud & Farmacéutica',
      unit: '°C fuera de rango',
      direction: 'superior',
      warningThreshold: 0.8,
      criticalThreshold: 2.0,
      currentValue: 0.2,
      frequency: 'Continuo (Tiempo Real)',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Supervisor de Logística Biomédica'
    },
    {
      code: 'KRI-MED-05',
      name: 'Días de Reserva de Insumos Médicos Estratégicos',
      description: 'Inventario de seguridad disponible para anestésicos, oxígeno y reactivos clave',
      process: 'Cadena de Suministro',
      category: 'Ejecución y Procesos',
      industry: 'Salud & Farmacéutica',
      unit: 'días',
      direction: 'inferior',
      warningThreshold: 14,
      criticalThreshold: 7,
      currentValue: 18,
      frequency: 'Semanal',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Gerencia de Abastecimiento Clínico'
    }
  ],
  'Manufactura & Cadena de Suministro': [
    {
      code: 'KRI-MFG-01',
      name: 'Eficiencia Global de los Equipos (OEE)',
      description: 'Disponibilidad x Rendimiento x Calidad en las líneas principales de ensamblaje',
      process: 'Producción & Ensamble',
      category: 'Ejecución y Procesos',
      industry: 'Manufactura & Cadena de Suministro',
      unit: '%',
      direction: 'inferior',
      warningThreshold: 78.0,
      criticalThreshold: 68.0,
      currentValue: 81.4,
      frequency: 'Diario',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Gerente de Planta'
    },
    {
      code: 'KRI-MFG-02',
      name: 'Tasa de Frecuencia de Accidentes con Baja (LTIR)',
      description: 'Incidentes de seguridad y salud ocupacional por millón de horas trabajadas (OSHA)',
      process: 'Seguridad y Salud (HSE)',
      category: 'Prácticas Laborales',
      industry: 'Manufactura & Cadena de Suministro',
      unit: 'casos/M horas',
      direction: 'superior',
      warningThreshold: 1.2,
      criticalThreshold: 2.5,
      currentValue: 0.8,
      frequency: 'Mensual',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Director de Seguridad Industrial'
    },
    {
      code: 'KRI-MFG-03',
      name: 'Paradas No Programadas por Falla Mecánica / Eléctrica',
      description: 'Minutos de paro de maquinaria crítica por avería no detectada en mantenimiento preventivo',
      process: 'Mantenimiento Industrial',
      category: 'Fallas Tecnológicas',
      industry: 'Manufactura & Cadena de Suministro',
      unit: 'minutos/turno',
      direction: 'superior',
      warningThreshold: 35,
      criticalThreshold: 90,
      currentValue: 48,
      frequency: 'Por Evento',
      status: 'Advertencia',
      autoTriggerAlert: true,
      responsible: 'Jefe de Mantenimiento Predictivo'
    },
    {
      code: 'KRI-MFG-04',
      name: 'Defectos por Millón de Piezas (PPM)',
      description: 'Tasa de no conformidades detectadas en el control de calidad de salida final',
      process: 'Aseguramiento de Calidad',
      category: 'Ejecución y Procesos',
      industry: 'Manufactura & Cadena de Suministro',
      unit: 'PPM',
      direction: 'superior',
      warningThreshold: 250,
      criticalThreshold: 600,
      currentValue: 190,
      frequency: 'Semanal',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Gerente de Calidad (Six Sigma)'
    },
    {
      code: 'KRI-MFG-05',
      name: 'Cumplimiento de Entrega a Tiempo y Completa (OTIF)',
      description: 'Porcentaje de despachos que cumplen estrictamente con la fecha y cantidades acordadas',
      process: 'Logística & Distribución',
      category: 'Ejecución y Procesos',
      industry: 'Manufactura & Cadena de Suministro',
      unit: '%',
      direction: 'inferior',
      warningThreshold: 92.0,
      criticalThreshold: 85.0,
      currentValue: 94.2,
      frequency: 'Semanal',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Director de Cadena de Suministro'
    }
  ],
  'Retail & Comercio Electrónico': [
    {
      code: 'KRI-RET-01',
      name: 'Tasa de Abandono de Carrito por Error Técnico de Checkout',
      description: 'Clientes que no pudieron finalizar compra por excepciones en pasarela o stock desincronizado',
      process: 'Plataforma E-Commerce',
      category: 'Fallas Tecnológicas',
      industry: 'Retail & Comercio Electrónico',
      unit: '%',
      direction: 'superior',
      warningThreshold: 3.5,
      criticalThreshold: 6.5,
      currentValue: 2.8,
      frequency: 'Continuo (Tiempo Real)',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Tech Lead E-Commerce'
    },
    {
      code: 'KRI-RET-02',
      name: 'Quiebres de Stock en Catálogo Activo (Out of Stock)',
      description: 'Porcentaje de SKUs con alta demanda que no cuentan con existencia física en fulfillment',
      process: 'Inventarios & Logística',
      category: 'Ejecución y Procesos',
      industry: 'Retail & Comercio Electrónico',
      unit: '%',
      direction: 'superior',
      warningThreshold: 2.0,
      criticalThreshold: 4.5,
      currentValue: 3.8,
      frequency: 'Diario',
      status: 'Advertencia',
      autoTriggerAlert: true,
      responsible: 'Gerente de Planificación de Demanda'
    },
    {
      code: 'KRI-RET-03',
      name: 'Merma y Discrepancias de Inventario Físico vs ERP',
      description: 'Diferencia en valor monetario entre el recuento cíclico y los registros de existencias',
      process: 'Operaciones de Tienda & Almacén',
      category: 'Fraude Interno',
      industry: 'Retail & Comercio Electrónico',
      unit: '% del inventario',
      direction: 'superior',
      warningThreshold: 0.7,
      criticalThreshold: 1.8,
      currentValue: 0.5,
      frequency: 'Mensual',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Jefe de Prevención de Pérdidas'
    },
    {
      code: 'KRI-RET-04',
      name: 'Incumplimiento de SLA en Entregas de Última Milla',
      description: 'Envíos a domicilio entregados fuera de la ventana horaria prometida al consumidor',
      process: 'Distribución y Despacho',
      category: 'Ejecución y Procesos',
      industry: 'Retail & Comercio Electrónico',
      unit: '%',
      direction: 'superior',
      warningThreshold: 6.0,
      criticalThreshold: 12.0,
      currentValue: 5.2,
      frequency: 'Diario',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Supervisor de Logística de Última Milla'
    },
    {
      code: 'KRI-RET-05',
      name: 'Tasa de Devoluciones por Producto Dañado en Transporte',
      description: 'Retornos de mercancía atribuibles a deficiencias de embalaje o manipulación en tránsito',
      process: 'Atención al Cliente & Logística Inversa',
      category: 'Daño a Activos Físicos',
      industry: 'Retail & Comercio Electrónico',
      unit: '%',
      direction: 'superior',
      warningThreshold: 1.5,
      criticalThreshold: 3.5,
      currentValue: 1.2,
      frequency: 'Semanal',
      status: 'Normal',
      autoTriggerAlert: true,
      responsible: 'Jefe de Control de Calidad y Empaque'
    }
  ],
  'Personalizada': []
};

export const DEFAULT_ORGANIZATIONAL_ROLES: OrganizationalRole[] = [
  {
    id: 'role-cro',
    title: 'Oficial de Riesgo (CRO)',
    department: 'Gerencia General de Riesgos y Cumplimiento',
    description: 'Máxima autoridad ejecutiva en apetito de riesgo, gobierno de control interno y supervisión de KRIs.',
    badge: 'Super Administrador',
    isSystemRole: true,
    permissions: {
      canEditRisks: true,
      canEvaluateControls: true,
      canExecuteAudits: true,
      canReportFlaws: true,
      canConvertFlaws: true,
      canAcknowledgeAlerts: true,
      canConfigureKRIs: true,
      canManageRoles: true,
      canExportReports: true,
    }
  },
  {
    id: 'role-auditor',
    title: 'Auditor de Control Interno',
    department: 'Unidad de Auditoría Continua',
    description: 'Responsable de verificar pruebas de efectividad de diseño y operativa, muestreos y hallazgos.',
    badge: 'Auditor Líder ISO 31000',
    isSystemRole: true,
    permissions: {
      canEditRisks: false,
      canEvaluateControls: true,
      canExecuteAudits: true,
      canReportFlaws: true,
      canConvertFlaws: false,
      canAcknowledgeAlerts: true,
      canConfigureKRIs: false,
      canManageRoles: false,
      canExportReports: true,
    }
  },
  {
    id: 'role-ops',
    title: 'Gerente de Operaciones',
    department: 'Dirección de Operaciones y Tecnología',
    description: 'Dueño de macroprocesos operativos, mitigación de riesgos de línea y reporte de eventos de pérdida.',
    badge: 'Dueño de Proceso',
    isSystemRole: true,
    permissions: {
      canEditRisks: true,
      canEvaluateControls: false,
      canExecuteAudits: false,
      canReportFlaws: true,
      canConvertFlaws: true,
      canAcknowledgeAlerts: true,
      canConfigureKRIs: true,
      canManageRoles: false,
      canExportReports: true,
    }
  },
  {
    id: 'role-ciso',
    title: 'Oficial de Seguridad de la Información (CISO)',
    department: 'Ciberseguridad y Protección de Datos',
    description: 'Custodio de controles de ciberresiliencia, cifrado, accesos privilegiados y monitoreo de intrusiones.',
    badge: 'Ciberseguridad & TI',
    isSystemRole: false,
    permissions: {
      canEditRisks: true,
      canEvaluateControls: true,
      canExecuteAudits: true,
      canReportFlaws: true,
      canConvertFlaws: true,
      canAcknowledgeAlerts: true,
      canConfigureKRIs: true,
      canManageRoles: false,
      canExportReports: true,
    }
  },
  {
    id: 'role-aml',
    title: 'Jefe de Cumplimiento Normativo (AML/KYC)',
    department: 'Prevención de Lavado y Cumplimiento Legal',
    description: 'Supervisa el marco regulatorio Basilea, prevención de fraude, reportes regulatorios y listas de control.',
    badge: 'Cumplimiento Legal',
    isSystemRole: false,
    permissions: {
      canEditRisks: false,
      canEvaluateControls: true,
      canExecuteAudits: true,
      canReportFlaws: true,
      canConvertFlaws: false,
      canAcknowledgeAlerts: true,
      canConfigureKRIs: true,
      canManageRoles: false,
      canExportReports: true,
    }
  },
  {
    id: 'role-board',
    title: 'Comité de Riesgos y Directorio',
    department: 'Gobierno Corporativo',
    description: 'Visualización ejecutiva de mapas de calor, reportes agregados y dictámenes de auditoría externa.',
    badge: 'Alta Dirección',
    isSystemRole: true,
    permissions: {
      canEditRisks: false,
      canEvaluateControls: false,
      canExecuteAudits: false,
      canReportFlaws: false,
      canConvertFlaws: false,
      canAcknowledgeAlerts: false,
      canConfigureKRIs: false,
      canManageRoles: false,
      canExportReports: true,
    }
  }
];

export const DEFAULT_GLOBAL_NOTIFICATION_PREFERENCES: KriNotificationPreferences = {
  emailEnabled: true,
  emailRecipients: ['oficial.riesgo@custodia-risk.com', 'alertas-kri@custodia-risk.com'],
  emailTemplate: 'completa',
  smsEnabled: true,
  smsRecipients: ['+54 9 11 4589-2044', '+52 55 8421-9930'],
  webhookEnabled: false,
  webhookUrl: 'https://api.custodia-risk.com/v1/webhooks/kri-alerts',
  notifyOnWarning: true,
  notifyOnCritical: true,
  cooldownMinutes: 30,
  escalateToRiskOfficer: true
};

@Injectable({
  providedIn: 'root'
})
export class RiskDataService {
  // Configured Industry Profile
  readonly currentIndustry = signal<IndustryType>('Fintech & Pagos Digitales');

  // Global KRI Notification Preferences (Email & SMS)
  readonly globalNotificationSettings = signal<KriNotificationPreferences>(DEFAULT_GLOBAL_NOTIFICATION_PREFERENCES);

  // Defined Organizational Roles (Puestos)
  readonly organizationalRoles = signal<OrganizationalRole[]>(DEFAULT_ORGANIZATIONAL_ROLES);

  // Predefined Compliance User Profiles (Usuarios & Colaboradores)
  readonly userProfiles = signal<UserProfile[]>([
    {
      id: 'usr-cro',
      name: 'Dra. Elena Vasconcelos',
      email: 'elena.vasconcelos@custodia-risk.com',
      role: 'Oficial de Riesgo (CRO)',
      roleId: 'role-cro',
      department: 'Gerencia General de Riesgos y Cumplimiento',
      badge: 'Oficial Principal Certificado',
      isSystemUser: true,
      permissions: {
        canEditRisks: true,
        canEvaluateControls: true,
        canExecuteAudits: true,
        canReportFlaws: true,
        canConvertFlaws: true,
        canAcknowledgeAlerts: true,
        canConfigureKRIs: true,
        canManageRoles: true,
        canExportReports: true,
      }
    },
    {
      id: 'usr-auditor',
      name: 'Lic. Roberto Miranda',
      email: 'roberto.miranda@custodia-risk.com',
      role: 'Auditor de Control Interno',
      roleId: 'role-auditor',
      department: 'Unidad de Auditoría Continua',
      badge: 'Auditor Líder ISO 31000',
      isSystemUser: true,
      permissions: {
        canEditRisks: false,
        canEvaluateControls: true,
        canExecuteAudits: true,
        canReportFlaws: true,
        canConvertFlaws: false,
        canAcknowledgeAlerts: true,
        canConfigureKRIs: false,
        canManageRoles: false,
        canExportReports: true,
      }
    },
    {
      id: 'usr-ops',
      name: 'Ing. Carlos Mendoza',
      email: 'carlos.mendoza@custodia-risk.com',
      role: 'Gerente de Operaciones',
      roleId: 'role-ops',
      department: 'Dirección de Operaciones y Tecnología',
      badge: 'Dueño de Proceso',
      isSystemUser: true,
      permissions: {
        canEditRisks: true,
        canEvaluateControls: false,
        canExecuteAudits: false,
        canReportFlaws: true,
        canConvertFlaws: true,
        canAcknowledgeAlerts: true,
        canConfigureKRIs: true,
        canManageRoles: false,
        canExportReports: true,
      }
    },
    {
      id: 'usr-ciso',
      name: 'Ing. Alejandro Vega',
      email: 'alejandro.vega@custodia-risk.com',
      role: 'Oficial de Seguridad de la Información (CISO)',
      roleId: 'role-ciso',
      department: 'Ciberseguridad y Protección de Datos',
      badge: 'Ciberseguridad & TI',
      isSystemUser: false,
      permissions: {
        canEditRisks: true,
        canEvaluateControls: true,
        canExecuteAudits: true,
        canReportFlaws: true,
        canConvertFlaws: true,
        canAcknowledgeAlerts: true,
        canConfigureKRIs: true,
        canManageRoles: false,
        canExportReports: true,
      }
    },
    {
      id: 'usr-aml',
      name: 'Dra. Sofía Valenzuela',
      email: 'sofia.valenzuela@custodia-risk.com',
      role: 'Jefe de Cumplimiento Normativo (AML/KYC)',
      roleId: 'role-aml',
      department: 'Prevención de Lavado y Cumplimiento Legal',
      badge: 'Cumplimiento Legal',
      isSystemUser: false,
      permissions: {
        canEditRisks: false,
        canEvaluateControls: true,
        canExecuteAudits: true,
        canReportFlaws: true,
        canConvertFlaws: false,
        canAcknowledgeAlerts: true,
        canConfigureKRIs: true,
        canManageRoles: false,
        canExportReports: true,
      }
    },
    {
      id: 'usr-board',
      name: 'Comité de Auditoría y Directorio',
      email: 'comite.directorio@custodia-risk.com',
      role: 'Comité de Riesgos y Directorio',
      roleId: 'role-board',
      department: 'Gobierno Corporativo',
      badge: 'Alta Dirección',
      isSystemUser: true,
      permissions: {
        canEditRisks: false,
        canEvaluateControls: false,
        canExecuteAudits: false,
        canReportFlaws: false,
        canConvertFlaws: false,
        canAcknowledgeAlerts: false,
        canConfigureKRIs: false,
        canManageRoles: false,
        canExportReports: true,
      }
    }
  ]);

  // Backward compatible getter for existing templates
  get availableProfiles(): UserProfile[] {
    return this.userProfiles();
  }

  // Active User Profile
  readonly currentProfile = signal<UserProfile>(this.userProfiles()[0]);

  // Key Risk Indicators (KRIs) with Industry Specific Thresholds
  readonly kriDefinitions = signal<KriDefinition[]>([
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
  ]);

  // Controls Catalog with Attached Evidence and Test History
  readonly controls = signal<Control[]>([
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
  ]);

  // Risks Catalog
  readonly risks = signal<Risk[]>([
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
  ]);

  // Operational Incidents & Loss Events (Incidentes Operacionales y Pérdidas)
  readonly flaws = signal<OperationalFlaw[]>([
    {
      id: 'inc-1',
      title: 'Falla de Control: Uso de cuenta compartida "operador_noche" en transferencias',
      description: 'Se detectó que dos analistas de guardia utilizan credenciales maestras compartidas para acelerar procesamiento sin validación dual del supervisor.',
      reportedBy: 'Audit. Roberto Miranda',
      process: 'Tesorería',
      severity: 'Crítica',
      reportedAt: '2026-10-17 21:15',
      status: 'Pendiente de Evaluación',
      incidentType: 'Falla de Control',
      realLossAmountUSD: 0,
      recoveredAmountUSD: 0,
      impactedSystemOrAccount: 'Sistema SWIFT / Mesa de Dinero',
      aiSuggestedCategory: 'Fraude Interno',
      aiSuggestedControls: ['Eliminar usuarios genéricos', 'Forzar autenticación nominal con token individual']
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
      aiSuggestedControls: ['Auto-expansión de almacenamiento', 'Alarma crítica con escalamiento PagerDuty']
    },
    {
      id: 'inc-3',
      title: 'Evento de Pérdida Real: Cobro duplicado y penalización por descalce en pasarela de pagos',
      description: 'Falla de sincronización horaria de lotes provocó la ejecución duplicada de 14 transferencias interbancarias, causando reclamos y un cargo no recuperable de arbitraje.',
      reportedBy: 'Analista Sofía Ramos',
      process: 'Operaciones de Pago',
      severity: 'Media',
      reportedAt: '2026-10-15 17:45',
      status: 'Pendiente de Evaluación',
      incidentType: 'Evento de Pérdida Real',
      realLossAmountUSD: 18450,
      recoveredAmountUSD: 4200,
      impactedSystemOrAccount: 'Pasarela Internacional XYZ',
      aiSuggestedCategory: 'Ejecución y Procesos',
      aiSuggestedControls: ['API directa de conciliación continua', 'Penalización por SLA en contrato']
    },
    {
      id: 'inc-4',
      title: 'Evento de Pérdida Real: Multa regulatoria por reporte extemporáneo de transacciones SAR',
      description: 'Retraso de 48 horas en el despacho telemático del reporte de transacciones sospechosas debido a fallo no alertado en el script de integración de cumplimiento.',
      reportedBy: 'Oficial Laura Méndez',
      process: 'Cumplimiento Legal',
      severity: 'Alta',
      reportedAt: '2026-10-14 11:20',
      status: 'Pendiente de Evaluación',
      incidentType: 'Evento de Pérdida Real',
      realLossAmountUSD: 35000,
      recoveredAmountUSD: 0,
      impactedSystemOrAccount: 'Portal Regulador UAF',
      aiSuggestedCategory: 'Cumplimiento Normativo',
      aiSuggestedControls: ['Monitoreo continuo de deadlines regulatorios', 'Firma digital de respaldo']
    }
  ]);

  // Real-time Anomaly Alerts (KRI breaches & operational anomalies)
  readonly alerts = signal<AnomalyAlert[]>([
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
  ]);

  // Periodic Audits
  readonly audits = signal<PeriodicAudit[]>([
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
      complianceScore: 91,
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
      complianceScore: 84,
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
  ]);

  // Inalterable Audit Trail (Blockchain-like immutable chained ledger)
  readonly auditTrail = signal<AuditLogEntry[]>([
    {
      id: 'log-1',
      blockNumber: 1,
      timestamp: '2026-10-18T10:00:12Z',
      userName: 'Dra. Elena Vasconcelos',
      userRole: 'Oficial de Riesgo (CRO)',
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
      userRole: 'Oficial de Riesgo (CRO)',
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
  ]);

  // Dynamic search and filter signals for the risks catalog
  readonly riskSearchTerm = signal<string>('');
  readonly filterProcess = signal<string>('TODOS');
  readonly filterCategory = signal<string>('TODAS');
  readonly filterLevel = signal<string>('TODOS');
  readonly matrixSelectedCell = signal<{ likelihood: number; impact: number } | null>(null);
  readonly heatmapSelectedProcess = signal<string>('TODOS');

  readonly defaultProcesses = [
    'Operaciones de Pago',
    'Tesorería',
    'Ciberseguridad & TI',
    'Infraestructura Cloud',
    'Cumplimiento Legal',
    'Gestión Humana',
    'Gobierno y Control',
    'Cadena de Suministro'
  ];

  readonly processMetadata: Record<string, { icon: string; owner: string; department: string }> = {
    'Operaciones de Pago': {
      icon: 'payments',
      owner: 'Ing. Carlos Mendoza',
      department: 'Gerencia de Operaciones'
    },
    'Tesorería': {
      icon: 'account_balance',
      owner: 'Lic. Laura Benítez',
      department: 'Gerencia de Finanzas y Tesorería'
    },
    'Ciberseguridad & TI': {
      icon: 'security',
      owner: 'Ing. Marcelo Solís',
      department: 'Oficina de Ciberseguridad & CISO'
    },
    'Infraestructura Cloud': {
      icon: 'cloud',
      owner: 'SRE / Cloud Architect',
      department: 'Arquitectura de Infraestructura'
    },
    'Cumplimiento Legal': {
      icon: 'gavel',
      owner: 'Abg. Claudia Morales',
      department: 'Dirección Jurídica y Compliance'
    },
    'Gestión Humana': {
      icon: 'people',
      owner: 'Lic. Mariana Ruiz',
      department: 'Talento y Cultura Organizacional'
    },
    'Gobierno y Control': {
      icon: 'policy',
      owner: 'Lic. Roberto Miranda',
      department: 'Unidad de Auditoría y Control Interno'
    },
    'Cadena de Suministro': {
      icon: 'inventory_2',
      owner: 'Jefatura de Adquisiciones',
      department: 'Cadena de Abastecimiento & Terceros'
    }
  };

  // Computed: Filtered Risks
  readonly filteredRisks = computed(() => {
    const term = this.riskSearchTerm().toLowerCase().trim();
    const proc = this.filterProcess();
    const cat = this.filterCategory();
    const lvl = this.filterLevel();
    const cell = this.matrixSelectedCell();

    return this.risks().filter(r => {
      // Cell filter from 4x4 heatmap
      if (cell) {
        if (r.inherentLikelihood !== cell.likelihood || r.inherentImpact !== cell.impact) {
          return false;
        }
      }

      if (proc !== 'TODOS' && r.process !== proc) return false;
      if (cat !== 'TODAS' && r.category !== cat) return false;
      if (lvl !== 'TODOS' && r.residualLevel !== lvl && r.inherentLevel !== lvl) return false;

      if (!term) return true;
      return (
        r.code.toLowerCase().includes(term) ||
        r.title.toLowerCase().includes(term) ||
        r.description.toLowerCase().includes(term) ||
        r.process.toLowerCase().includes(term) ||
        r.responsible.toLowerCase().includes(term)
      );
    });
  });

  // Computed: Executive Metrics for Decision Making
  readonly metrics = computed(() => {
    const allRisks = this.risks();
    const allControls = this.controls();
    const allAlerts = this.alerts();
    const allAudits = this.audits();

    const totalInherentExposureUSD = allRisks.reduce((acc, r) => acc + r.financialExposureUSD, 0);
    const totalResidualExposureUSD = allRisks.reduce((acc, r) => acc + r.residualExposureUSD, 0);
    const mitigatedUSD = Math.max(0, totalInherentExposureUSD - totalResidualExposureUSD);
    const mitigationEfficiencyPct = totalInherentExposureUSD > 0
      ? Math.round((mitigatedUSD / totalInherentExposureUSD) * 100)
      : 0;

    const criticalRisksCount = allRisks.filter(r => r.inherentLevel === 'Crítico').length;
    const residualCriticalCount = allRisks.filter(r => r.residualLevel === 'Crítico').length;
    const highRisksCount = allRisks.filter(r => r.residualLevel === 'Alto').length;

    const avgControlEffectiveness = allControls.length > 0
      ? Math.round(allControls.reduce((acc, c) => acc + c.totalEffectiveness, 0) / allControls.length)
      : 0;

    const activeAlertsCount = allAlerts.filter(a => a.status === 'Activa' || a.status === 'En Investigación').length;
    const criticalAlertsCount = allAlerts.filter(a => a.severity === 'Crítico' && a.status === 'Activa').length;

    // Operational Health Index (OHI) on a 0-100 scale based on weighted factors
    const controlWeight = (avgControlEffectiveness / 100) * 40;
    const exposureMitigationWeight = (mitigationEfficiencyPct / 100) * 35;
    const alertsPenalty = Math.min(25, (activeAlertsCount * 5) + (criticalAlertsCount * 10));
    const complianceWeight = allAudits.length > 0
      ? (allAudits.reduce((acc, a) => acc + a.complianceScore, 0) / allAudits.length) * 0.25
      : 20;

    const operationalHealthIndex = Math.max(0, Math.min(100, Math.round(controlWeight + exposureMitigationWeight + complianceWeight - (alertsPenalty * 0.5))));

    return {
      totalRisks: allRisks.length,
      totalInherentExposureUSD,
      totalResidualExposureUSD,
      mitigatedUSD,
      mitigationEfficiencyPct,
      criticalRisksCount,
      residualCriticalCount,
      highRisksCount,
      totalControls: allControls.length,
      avgControlEffectiveness,
      activeAlertsCount,
      criticalAlertsCount,
      operationalHealthIndex
    };
  });

  // Calculate 4x4 heatmap counts for Inherent and Residual risks (can be global or filtered by process)
  readonly heatmapMatrix = computed(() => {
    // 4x4 matrix: likelihood (1 to 4) x impact (1 to 4)
    // Row 4 is Likelihood 4 (Frecuente), Col 4 is Impact 4 (Catastrófico)
    const grid: {
      likelihood: number;
      impact: number;
      score: number;
      level: RiskLevel;
      inherentCount: number;
      residualCount: number;
      inherentRisks: Risk[];
      residualRisks: Risk[];
    }[][] = [];

    const selectedProc = this.heatmapSelectedProcess();
    const allRisks = this.risks();
    const risks = selectedProc === 'TODOS'
      ? allRisks
      : allRisks.filter(r => r.process === selectedProc);

    for (let l = 4; l >= 1; l--) {
      const row = [];
      for (let i = 1; i <= 4; i++) {
        const score = l * i;
        const level = this.calculateRiskLevel(l, i);
        const inherentMatches = risks.filter(r => r.inherentLikelihood === l && r.inherentImpact === i);
        const residualMatches = risks.filter(r => r.residualLikelihood === l && r.residualImpact === i);
        row.push({
          likelihood: l,
          impact: i,
          score,
          level,
          inherentCount: inherentMatches.length,
          residualCount: residualMatches.length,
          inherentRisks: inherentMatches,
          residualRisks: residualMatches
        });
      }
      grid.push(row);
    }
    return grid;
  });

  // Computed: Heatmap summaries for each individual business process
  readonly processHeatmapSummaries = computed<ProcessHeatmapSummary[]>(() => {
    const allRisks = this.risks();
    const allControls = this.controls();
    const allAlerts = this.alerts();
    const allFlaws = this.flaws();

    // Collect all distinct processes
    const knownProcesses = new Set<string>(this.defaultProcesses);
    for (const r of allRisks) {
      if (r.process) knownProcesses.add(r.process);
    }
    for (const c of allControls) {
      if (c.process) knownProcesses.add(c.process);
    }

    const summaries: ProcessHeatmapSummary[] = [];

    for (const proc of knownProcesses) {
      const pRisks = allRisks.filter(r => r.process === proc);
      const pControls = allControls.filter(c => c.process === proc);
      const pAlerts = allAlerts.filter(a => a.process === proc && (a.status === 'Activa' || a.status === 'En Investigación'));
      const pIncidents = allFlaws.filter(f => f.process === proc && f.status !== 'Descartada');

      const inherentExposureUSD = pRisks.reduce((acc, r) => acc + r.financialExposureUSD, 0);
      const residualExposureUSD = pRisks.reduce((acc, r) => acc + r.residualExposureUSD, 0);
      const mitigatedUSD = Math.max(0, inherentExposureUSD - residualExposureUSD);
      const mitigationPct = inherentExposureUSD > 0
        ? Math.round((mitigatedUSD / inherentExposureUSD) * 100)
        : 0;

      const criticalRisksCount = pRisks.filter(r => r.residualLevel === 'Crítico').length;
      const highRisksCount = pRisks.filter(r => r.residualLevel === 'Alto').length;
      const mediumRisksCount = pRisks.filter(r => r.residualLevel === 'Medio').length;
      const lowRisksCount = pRisks.filter(r => r.residualLevel === 'Bajo').length;

      const avgInherentScore = pRisks.length > 0
        ? Math.round((pRisks.reduce((acc, r) => acc + r.inherentScore, 0) / pRisks.length) * 10) / 10
        : 0;
      const avgResidualScore = pRisks.length > 0
        ? Math.round((pRisks.reduce((acc, r) => acc + r.residualScore, 0) / pRisks.length) * 10) / 10
        : 0;

      let maxInherentLevel: RiskLevel = 'Bajo';
      let maxResidualLevel: RiskLevel = 'Bajo';
      if (pRisks.some(r => r.inherentLevel === 'Crítico')) maxInherentLevel = 'Crítico';
      else if (pRisks.some(r => r.inherentLevel === 'Alto')) maxInherentLevel = 'Alto';
      else if (pRisks.some(r => r.inherentLevel === 'Medio')) maxInherentLevel = 'Medio';

      if (criticalRisksCount > 0) maxResidualLevel = 'Crítico';
      else if (highRisksCount > 0) maxResidualLevel = 'Alto';
      else if (mediumRisksCount > 0) maxResidualLevel = 'Medio';

      const avgControlEffectiveness = pControls.length > 0
        ? Math.round(pControls.reduce((acc, c) => acc + c.totalEffectiveness, 0) / pControls.length)
        : 0;

      // 4x4 grid per process
      const grid: ProcessHeatmapCell[][] = [];
      for (let l = 4; l >= 1; l--) {
        const row: ProcessHeatmapCell[] = [];
        for (let i = 1; i <= 4; i++) {
          const score = l * i;
          const level = this.calculateRiskLevel(l, i);
          const inherentMatches = pRisks.filter(r => r.inherentLikelihood === l && r.inherentImpact === i);
          const residualMatches = pRisks.filter(r => r.residualLikelihood === l && r.residualImpact === i);
          row.push({
            likelihood: l,
            impact: i,
            score,
            level,
            inherentCount: inherentMatches.length,
            residualCount: residualMatches.length,
            inherentRisks: inherentMatches,
            residualRisks: residualMatches
          });
        }
        grid.push(row);
      }

      const meta = this.processMetadata[proc] || {
        icon: 'business_center',
        owner: 'Responsable de Proceso',
        department: 'Área Operativa'
      };

      summaries.push({
        process: proc,
        icon: meta.icon,
        owner: meta.owner,
        department: meta.department,
        risksCount: pRisks.length,
        inherentExposureUSD,
        residualExposureUSD,
        mitigatedUSD,
        mitigationPct,
        maxInherentLevel,
        maxResidualLevel,
        avgInherentScore,
        avgResidualScore,
        criticalRisksCount,
        highRisksCount,
        mediumRisksCount,
        lowRisksCount,
        controlsCount: pControls.length,
        avgControlEffectiveness,
        activeAlertsCount: pAlerts.length,
        activeIncidentsCount: pIncidents.length,
        risks: pRisks,
        grid
      });
    }

    return summaries.sort((a, b) => {
      if (a.risksCount === 0 && b.risksCount > 0) return 1;
      if (b.risksCount === 0 && a.risksCount > 0) return -1;
      return b.residualExposureUSD - a.residualExposureUSD;
    });
  });

  // Helper to determine risk level on 4x4 scale (1 to 16 score)
  calculateRiskLevel(likelihood: number, impact: number): RiskLevel {
    const score = likelihood * impact;
    if (score >= 12) return 'Crítico'; // e.g. 4x4=16, 4x3=12, 3x4=12
    if (score >= 8) return 'Alto';     // e.g. 3x3=9, 2x4=8, 4x2=8
    if (score >= 4) return 'Medio';    // e.g. 2x3=6, 3x2=6, 2x2=4, 1x4=4, 4x1=4
    return 'Bajo';                     // e.g. 1x3=3, 3x1=3, 1x2=2, 2x1=2, 1x1=1
  }

  // Calculate Residual Risk from Inherent Risk and applied controls (4x4 scale)
  calculateResidual(
    inherentLikelihood: number,
    inherentImpact: number,
    inherentExposureUSD: number,
    controlIds: string[]
  ): {
    residualLikelihood: number;
    residualImpact: number;
    residualScore: number;
    residualLevel: RiskLevel;
    residualExposureUSD: number;
  } {
    const clampedL = Math.max(1, Math.min(4, inherentLikelihood));
    const clampedI = Math.max(1, Math.min(4, inherentImpact));

    if (!controlIds || controlIds.length === 0) {
      return {
        residualLikelihood: clampedL,
        residualImpact: clampedI,
        residualScore: clampedL * clampedI,
        residualLevel: this.calculateRiskLevel(clampedL, clampedI),
        residualExposureUSD: inherentExposureUSD
      };
    }

    const currentControls = this.controls().filter(c => controlIds.includes(c.id));
    if (currentControls.length === 0) {
      return {
        residualLikelihood: clampedL,
        residualImpact: clampedI,
        residualScore: clampedL * clampedI,
        residualLevel: this.calculateRiskLevel(clampedL, clampedI),
        residualExposureUSD: inherentExposureUSD
      };
    }

    const avgEffectiveness = currentControls.reduce((acc, c) => acc + c.totalEffectiveness, 0) / currentControls.length;
    const factor = avgEffectiveness / 100;

    // Likelihood reduction up to 2-3 points depending on controls on 1-4 scale
    const likelihoodReduction = Math.min(clampedL - 1, Math.round((clampedL - 1) * factor * 0.9));
    const residualLikelihood = Math.max(1, clampedL - likelihoodReduction);

    // Impact reduction up to 2 points depending on corrective/resilience controls
    const impactReduction = Math.min(clampedI - 1, Math.round((clampedI - 1) * factor * 0.75));
    const residualImpact = Math.max(1, clampedI - impactReduction);

    const residualScore = residualLikelihood * residualImpact;
    const residualLevel = this.calculateRiskLevel(residualLikelihood, residualImpact);
    const residualExposureUSD = Math.round(inherentExposureUSD * (1 - factor * 0.8));

    return {
      residualLikelihood,
      residualImpact,
      residualScore,
      residualLevel,
      residualExposureUSD
    };
  }

  // Switch User Profile (Role-based access)
  async switchProfile(profileOrId: string | UserProfile) {
    const profileId = typeof profileOrId === 'string' ? profileOrId : profileOrId.id;
    const profile = this.userProfiles().find(p => p.id === profileId);
    if (!profile) return;
    this.currentProfile.set(profile);
    await this.appendAuditLog(
      'CAMBIO_SESIÓN',
      'Sesión',
      profile.id,
      `Inicio de sesión con perfil de cumplimiento: ${profile.name} (${profile.role})`
    );
  }

  // Switch Industry Profile and adapt KRI presets
  async setIndustry(industry: IndustryType) {
    this.currentIndustry.set(industry);
    const presets = INDUSTRY_KRI_PRESETS[industry];
    if (presets && presets.length > 0) {
      const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
      const newKriList: KriDefinition[] = presets.map((p, idx) => ({
        ...p,
        id: `kri-${industry.toLowerCase().slice(0, 3)}-${idx + 1}`,
        lastUpdated: now
      }));
      this.kriDefinitions.set(newKriList);
    }
    await this.appendAuditLog(
      'CAMBIO_INDUSTRIA',
      'KRI',
      industry,
      `Configuración de industria cambiada a "${industry}". Umbrales y catálogo de KRIs adaptados automáticamente.`
    );
  }

  // Update an existing KRI definition and its thresholds
  async updateKriThreshold(kriId: string, updates: Partial<KriDefinition>) {
    const existing = this.kriDefinitions().find(k => k.id === kriId);
    if (!existing) return;

    const updated: KriDefinition = {
      ...existing,
      ...updates,
      lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };

    // Re-evaluate status against updated thresholds
    updated.status = this.evaluateKriStatus(updated.currentValue, updated.direction, updated.warningThreshold, updated.criticalThreshold);

    this.kriDefinitions.update(list => list.map(k => k.id === kriId ? updated : k));

    await this.appendAuditLog(
      'CONFIGURACIÓN_UMBRAL_KRI',
      'KRI',
      updated.code,
      `Umbrales ajustados para KRI "${updated.name}". Umbral Adv: ${updated.warningThreshold} ${updated.unit}, Umbral Crítico: ${updated.criticalThreshold} ${updated.unit}.`
    );

    // If critical and autoTriggerAlert, trigger alert
    if (updated.status === 'Crítico' && updated.autoTriggerAlert) {
      await this.triggerAlert({
        title: `KRI Crítico: ${updated.name}`,
        description: `El KRI ${updated.code} ha sobrepasado el umbral crítico configurado (${updated.criticalThreshold} ${updated.unit}).`,
        kriMetric: updated.name,
        threshold: `${updated.direction === 'superior' ? '>=' : '<='} ${updated.criticalThreshold} ${updated.unit}`,
        currentValue: `${updated.currentValue} ${updated.unit}`,
        severity: 'Crítico',
        process: updated.process,
        escalatedTo: updated.responsible
      });
    }
  }

  // Update Notification Preferences (Email & SMS) globally or for a specific KRI
  async updateNotificationPreferences(kriId: string | 'GLOBAL', preferences: KriNotificationPreferences) {
    if (kriId === 'GLOBAL') {
      this.globalNotificationSettings.set(preferences);
      await this.appendAuditLog(
        'CONFIGURACIÓN_NOTIFICACIONES',
        'KRI',
        'GLOBAL',
        `Preferencias globales de notificación actualizadas: Email=${preferences.emailEnabled ? 'Activo' : 'Inactivo'} (${preferences.emailRecipients.join(', ')}), SMS=${preferences.smsEnabled ? 'Activo' : 'Inactivo'} (${preferences.smsRecipients.join(', ')}). Cooldown: ${preferences.cooldownMinutes}m.`
      );
    } else {
      const existing = this.kriDefinitions().find(k => k.id === kriId);
      if (!existing) return;
      const updated: KriDefinition = {
        ...existing,
        notificationPreferences: preferences,
        lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' ')
      };
      this.kriDefinitions.update(list => list.map(k => k.id === kriId ? updated : k));
      await this.appendAuditLog(
        'CONFIGURACIÓN_NOTIFICACIONES',
        'KRI',
        existing.code,
        `Preferencias de notificación para KRI "${existing.name}" actualizadas: Email=${preferences.emailEnabled ? 'Activo' : 'Inactivo'}, SMS=${preferences.smsEnabled ? 'Activo' : 'Inactivo'}.`
      );
    }
  }

  // Simulate sending a test alert notification (Email, SMS or Webhook)
  async testSendNotification(
    channel: 'email' | 'sms' | 'webhook',
    kriCode: string,
    recipient: string,
    messagePreview?: string
  ): Promise<{ success: boolean; message: string; timestamp: string }> {
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const user = this.currentProfile();
    const details = `Envío de prueba vía ${channel.toUpperCase()} para KRI [${kriCode}] a "${recipient}". Disparado por ${user.name}. ${messagePreview ? `Detalle: "${messagePreview.slice(0, 60)}..."` : ''}`;

    await this.appendAuditLog(
      'CONFIGURACIÓN_NOTIFICACIONES',
      'KRI',
      kriCode,
      `[PRUEBA DISPATCH ${channel.toUpperCase()}] ${details}`
    );

    return {
      success: true,
      message: `Notificación de prueba enviada exitosamente a través del canal ${channel.toUpperCase()} a ${recipient}.`,
      timestamp
    };
  }

  // Record a new sensor / telemetry value for a KRI
  async recordKriValue(kriId: string, newValue: number) {
    const kri = this.kriDefinitions().find(k => k.id === kriId);
    if (!kri) return;

    const newStatus = this.evaluateKriStatus(newValue, kri.direction, kri.warningThreshold, kri.criticalThreshold);
    const updated: KriDefinition = {
      ...kri,
      currentValue: newValue,
      status: newStatus,
      lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };

    this.kriDefinitions.update(list => list.map(k => k.id === kriId ? updated : k));

    if (newStatus === 'Crítico' && kri.autoTriggerAlert) {
      await this.triggerAlert({
        title: `KRI Excedido Crítico: ${kri.name}`,
        description: `Lectura registrada (${newValue} ${kri.unit}) supera el límite crítico de ${kri.criticalThreshold} ${kri.unit}.`,
        kriMetric: kri.name,
        threshold: `${kri.direction === 'superior' ? '>=' : '<='} ${kri.criticalThreshold} ${kri.unit}`,
        currentValue: `${newValue} ${kri.unit}`,
        severity: 'Crítico',
        process: kri.process,
        escalatedTo: kri.responsible
      });
    } else if (newStatus === 'Advertencia' && kri.autoTriggerAlert) {
      await this.triggerAlert({
        title: `Advertencia de KRI: ${kri.name}`,
        description: `Lectura registrada (${newValue} ${kri.unit}) entra en zona de advertencia (umbral ${kri.warningThreshold} ${kri.unit}).`,
        kriMetric: kri.name,
        threshold: `${kri.direction === 'superior' ? '>=' : '<='} ${kri.warningThreshold} ${kri.unit}`,
        currentValue: `${newValue} ${kri.unit}`,
        severity: 'Medio',
        process: kri.process,
        escalatedTo: kri.responsible
      });
    }
  }

  evaluateKriStatus(val: number, direction: 'superior' | 'inferior', warning: number, critical: number): 'Normal' | 'Advertencia' | 'Crítico' {
    if (direction === 'superior') {
      if (val >= critical) return 'Crítico';
      if (val >= warning) return 'Advertencia';
      return 'Normal';
    } else {
      if (val <= critical) return 'Crítico';
      if (val <= warning) return 'Advertencia';
      return 'Normal';
    }
  }

  // Add custom KRI
  async addCustomKri(kriData: Partial<KriDefinition>): Promise<KriDefinition> {
    const code = kriData.code || `KRI-${Date.now().toString().slice(-4)}`;
    const newKri: KriDefinition = {
      id: `kri-${Date.now()}`,
      code,
      name: kriData.name || 'Nuevo Indicador Clave de Riesgo',
      description: kriData.description || 'Monitoreo de tolerancia operacional',
      process: kriData.process || 'Operaciones',
      category: kriData.category || 'Ejecución y Procesos',
      industry: this.currentIndustry(),
      unit: kriData.unit || '%',
      direction: kriData.direction || 'superior',
      warningThreshold: kriData.warningThreshold ?? 5,
      criticalThreshold: kriData.criticalThreshold ?? 10,
      currentValue: kriData.currentValue ?? 0,
      frequency: kriData.frequency || 'Diario',
      status: 'Normal',
      autoTriggerAlert: kriData.autoTriggerAlert ?? true,
      responsible: kriData.responsible || this.currentProfile().name,
      lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };

    newKri.status = this.evaluateKriStatus(newKri.currentValue, newKri.direction, newKri.warningThreshold, newKri.criticalThreshold);
    this.kriDefinitions.update(list => [newKri, ...list]);

    await this.appendAuditLog(
      'CONFIGURACIÓN_UMBRAL_KRI',
      'KRI',
      newKri.code,
      `Alta de nuevo KRI "${newKri.name}" para industria ${newKri.industry}. Umbral Adv: ${newKri.warningThreshold} ${newKri.unit}, Crítico: ${newKri.criticalThreshold} ${newKri.unit}.`
    );

    return newKri;
  }

  // Create organizational position/role
  async addOrganizationalRole(roleData: Partial<OrganizationalRole>): Promise<OrganizationalRole> {
    const newRole: OrganizationalRole = {
      id: `role-${Date.now()}`,
      title: roleData.title || 'Nuevo Puesto Operativo',
      department: roleData.department || 'Operaciones',
      description: roleData.description || 'Definición de puesto y responsabilidades',
      badge: roleData.badge || 'Puesto Personalizado',
      isSystemRole: false,
      permissions: roleData.permissions || {
        canEditRisks: false,
        canEvaluateControls: false,
        canExecuteAudits: false,
        canReportFlaws: true,
        canConvertFlaws: false,
        canAcknowledgeAlerts: false,
        canConfigureKRIs: false,
        canManageRoles: false,
        canExportReports: true
      }
    };

    this.organizationalRoles.update(list => [...list, newRole]);
    await this.appendAuditLog(
      'CREACIÓN_PUESTO',
      'Puesto',
      newRole.title,
      `Nuevo puesto organizacional definido: "${newRole.title}" en departamento "${newRole.department}".`
    );

    return newRole;
  }

  // Update permissions of a role
  async updateOrganizationalRole(roleId: string, updates: Partial<OrganizationalRole>) {
    this.organizationalRoles.update(list => list.map(r => r.id === roleId ? { ...r, ...updates } : r));

    // Also update any user profiles assigned to this role
    if (updates.permissions) {
      this.userProfiles.update(profiles => profiles.map(p => {
        if (p.roleId === roleId || p.role === updates.title) {
          return {
            ...p,
            permissions: { ...p.permissions, ...updates.permissions },
            role: updates.title || p.role,
            department: updates.department || p.department
          };
        }
        return p;
      }));

      // If active profile matches, update it too
      const current = this.currentProfile();
      if (current.roleId === roleId || current.role === updates.title) {
        this.currentProfile.update(cp => ({
          ...cp,
          permissions: { ...cp.permissions, ...updates.permissions! },
          role: updates.title || cp.role,
          department: updates.department || cp.department
        }));
      }
    }

    await this.appendAuditLog(
      'MODIFICACIÓN_PERMISOS',
      'Puesto',
      roleId,
      `Permisos y parámetros del puesto actualizados por ${this.currentProfile().name}.`
    );
  }

  // Add a user profile
  async addUserProfile(userData: Partial<UserProfile>): Promise<UserProfile> {
    const roleMatch = this.organizationalRoles().find(r => r.id === userData.roleId || r.title === userData.role);
    const permissions = userData.permissions || (roleMatch ? roleMatch.permissions : {
      canEditRisks: false,
      canEvaluateControls: false,
      canExecuteAudits: false,
      canReportFlaws: true,
      canConvertFlaws: false,
      canAcknowledgeAlerts: false,
      canConfigureKRIs: false,
      canManageRoles: false,
      canExportReports: true
    });

    const newUser: UserProfile = {
      id: `usr-${Date.now()}`,
      name: userData.name || 'Nuevo Colaborador',
      email: userData.email || 'colaborador@custodia-risk.com',
      role: userData.role || (roleMatch ? roleMatch.title : 'Colaborador Operativo'),
      roleId: userData.roleId || (roleMatch ? roleMatch.id : undefined),
      department: userData.department || (roleMatch ? roleMatch.department : 'Operaciones'),
      badge: userData.badge || (roleMatch ? roleMatch.badge : 'Puesto Activo'),
      isSystemUser: false,
      permissions
    };

    this.userProfiles.update(list => [...list, newUser]);
    await this.appendAuditLog(
      'ALTA_USUARIO',
      'Usuario',
      newUser.email,
      `Alta de colaborador ${newUser.name} asignado al puesto "${newUser.role}".`
    );

    return newUser;
  }

  // Update existing user profile
  async updateUserProfile(userId: string, updates: Partial<UserProfile>) {
    this.userProfiles.update(list => list.map(u => u.id === userId ? { ...u, ...updates } : u));
    if (this.currentProfile().id === userId) {
      this.currentProfile.update(cp => ({ ...cp, ...updates }));
    }
  }

  // Delete a user profile (cuenta de usuario)
  async deleteUserProfile(userId: string): Promise<boolean> {
    const list = this.userProfiles();
    if (list.length <= 1) {
      throw new Error('No se puede eliminar la única cuenta de usuario del sistema.');
    }

    const userToDelete = list.find(u => u.id === userId);
    if (!userToDelete) return false;

    const remaining = list.filter(u => u.id !== userId);
    this.userProfiles.set(remaining);

    // If active session belongs to this deleted user, immediately switch to the first remaining user
    if (this.currentProfile().id === userId) {
      this.currentProfile.set(remaining[0]);
    }

    await this.appendAuditLog(
      'BAJA_USUARIO',
      'Usuario',
      userToDelete.email,
      `Baja y eliminación de cuenta de colaborador "${userToDelete.name}" (${userToDelete.role}) confirmada por ${this.currentProfile().name}.`
    );

    return true;
  }

  // Delete an organizational role (puesto personalizado)
  async deleteOrganizationalRole(roleId: string): Promise<boolean> {
    const roles = this.organizationalRoles();
    const roleToDelete = roles.find(r => r.id === roleId);
    if (!roleToDelete) return false;
    if (roleToDelete.isSystemRole) {
      throw new Error('No se puede eliminar un puesto base del sistema.');
    }

    this.organizationalRoles.update(list => list.filter(r => r.id !== roleId));
    await this.appendAuditLog(
      'MODIFICACIÓN_PERMISOS',
      'Puesto',
      roleToDelete.title,
      `Eliminación del puesto organizacional "${roleToDelete.title}" por ${this.currentProfile().name}.`
    );
    return true;
  }

  // Permission checking helper
  hasPermission(permission: keyof UserPermissions): boolean {
    const profile = this.currentProfile();
    return !!profile.permissions?.[permission];
  }


  // Add a new risk (bounded to 4x4 scale)
  async addRisk(riskData: Partial<Risk>): Promise<Risk> {
    const code = `RGO-${100 + this.risks().length + 1}`;
    const inherentL = Math.max(1, Math.min(4, riskData.inherentLikelihood || 2));
    const inherentI = Math.max(1, Math.min(4, riskData.inherentImpact || 2));
    const inherentScore = inherentL * inherentI;
    const inherentLevel = this.calculateRiskLevel(inherentL, inherentI);
    const inherentExposure = riskData.financialExposureUSD || 100000;
    const controlIds = riskData.controlIds || [];

    const residual = this.calculateResidual(inherentL, inherentI, inherentExposure, controlIds);

    const newRisk: Risk = {
      id: `rsk-${Date.now()}`,
      code,
      title: riskData.title || 'Nuevo Riesgo Operacional',
      description: riskData.description || '',
      process: riskData.process || 'Operaciones Centrales',
      category: riskData.category || 'Ejecución y Procesos',
      responsible: riskData.responsible || this.currentProfile().name,
      status: 'Activo',
      inherentLikelihood: inherentL,
      inherentImpact: inherentI,
      inherentScore,
      inherentLevel,
      financialExposureUSD: inherentExposure,
      controlIds,
      residualLikelihood: residual.residualLikelihood,
      residualImpact: residual.residualImpact,
      residualScore: residual.residualScore,
      residualLevel: residual.residualLevel,
      residualExposureUSD: residual.residualExposureUSD,
      mitigationPlan: riskData.mitigationPlan || {
        id: `mit-${Date.now()}`,
        title: `Plan de Mitigación para ${code}`,
        owner: riskData.responsible || this.currentProfile().name,
        dueDate: '2026-12-31',
        budgetUSD: 15000,
        progressPct: 10,
        status: 'En Progreso',
        actions: ['Definir controles preventivos clave', 'Implementar monitoreo de umbral']
      },
      createdAt: new Date().toISOString().split('T')[0],
      lastReviewDate: new Date().toISOString().split('T')[0]
    };

    this.risks.update(list => [newRisk, ...list]);
    await this.appendAuditLog(
      'CREACIÓN_RIESGO',
      'Riesgo',
      newRisk.code,
      `Creación de riesgo "${newRisk.title}". Inherente: ${newRisk.inherentScore} (${newRisk.inherentLevel}). Residual: ${newRisk.residualScore} (${newRisk.residualLevel}).`
    );
    return newRisk;
  }

  // Update an existing risk
  async updateRisk(id: string, updates: Partial<Risk>) {
    const existing = this.risks().find(r => r.id === id);
    if (!existing) return;

    const inherentL = updates.inherentLikelihood ?? existing.inherentLikelihood;
    const inherentI = updates.inherentImpact ?? existing.inherentImpact;
    const inherentScore = inherentL * inherentI;
    const inherentLevel = this.calculateRiskLevel(inherentL, inherentI);
    const inherentExposure = updates.financialExposureUSD ?? existing.financialExposureUSD;
    const controlIds = updates.controlIds ?? existing.controlIds;

    const residual = this.calculateResidual(inherentL, inherentI, inherentExposure, controlIds);

    const updatedRisk: Risk = {
      ...existing,
      ...updates,
      inherentLikelihood: inherentL,
      inherentImpact: inherentI,
      inherentScore,
      inherentLevel,
      financialExposureUSD: inherentExposure,
      controlIds,
      residualLikelihood: residual.residualLikelihood,
      residualImpact: residual.residualImpact,
      residualScore: residual.residualScore,
      residualLevel: residual.residualLevel,
      residualExposureUSD: residual.residualExposureUSD,
      lastReviewDate: new Date().toISOString().split('T')[0]
    };

    this.risks.update(list => list.map(r => r.id === id ? updatedRisk : r));
    await this.appendAuditLog(
      'MODIFICACIÓN_RIESGO',
      'Riesgo',
      updatedRisk.code,
      `Modificación de parámetros en riesgo "${updatedRisk.title}". Residual recalculado a ${updatedRisk.residualLevel}.`
    );
  }

  // Toggle control association on a risk
  async toggleControlOnRisk(riskId: string, controlId: string) {
    const risk = this.risks().find(r => r.id === riskId);
    if (!risk) return;
    const isAttached = risk.controlIds.includes(controlId);
    const newControlIds = isAttached
      ? risk.controlIds.filter(id => id !== controlId)
      : [...risk.controlIds, controlId];

    await this.updateRisk(riskId, { controlIds: newControlIds });
    await this.appendAuditLog(
      'APLICACIÓN_CONTROL',
      'Control',
      controlId,
      `${isAttached ? 'Desvinculación' : 'Aplicación'} del control al riesgo ${risk.code}.`
    );
  }

  // Add a new control with test evidence
  async addControl(controlData: Partial<Control>): Promise<Control> {
    const code = `CTR-${200 + this.controls().length + 1}`;
    const design = controlData.designEffectiveness ?? 85;
    const operating = controlData.operatingEffectiveness ?? 80;
    const totalEffectiveness = Math.round((design * 0.4) + (operating * 0.6));
    const status = totalEffectiveness >= 85 ? 'Efectivo' : totalEffectiveness >= 65 ? 'Parcialmente Efectivo' : 'Deficiente';
    const testDate = new Date().toISOString().split('T')[0];

    const initialAttachments: ControlEvidenceAttachment[] = controlData.attachments || [];

    const initialTest: ControlTestExecution = {
      id: `tst-${Date.now()}`,
      testDate,
      testedBy: this.currentProfile().name,
      testerRole: this.currentProfile().role,
      testMethod: 'Inspección de Muestra',
      sampleSize: controlData.sampleDetails || 'Prueba inicial de diseño y efectividad operativa',
      deviationsIdentified: 0,
      designScore: design,
      operatingScore: operating,
      totalScore: totalEffectiveness,
      conclusion: status === 'Efectivo' ? 'Efectivo / Conforme' : status === 'Parcialmente Efectivo' ? 'Con Desviaciones Menores' : 'Deficiente / No Conforme',
      evidenceNotes: controlData.evidence || 'Prueba de efectividad registrada satisfactoriamente.',
      attachments: initialAttachments
    };

    const newControl: Control = {
      id: `ctr-${Date.now()}`,
      code,
      name: controlData.name || 'Nuevo Control Operacional',
      description: controlData.description || '',
      process: controlData.process || 'Operaciones Centrales',
      type: controlData.type || 'Preventivo',
      automation: controlData.automation || 'Automático',
      frequency: controlData.frequency || 'Continuo',
      designEffectiveness: design,
      operatingEffectiveness: operating,
      totalEffectiveness,
      status,
      owner: controlData.owner || this.currentProfile().name,
      lastTested: testDate,
      lastTestedBy: this.currentProfile().name,
      sampleDetails: controlData.sampleDetails || 'Prueba inicial documentada',
      evidence: controlData.evidence || 'Prueba de efectividad registrada satisfactoriamente.',
      attachments: initialAttachments,
      testHistory: [initialTest]
    };

    this.controls.update(list => [newControl, ...list]);
    await this.appendAuditLog(
      'EVALUACIÓN_CONTROL',
      'Control',
      newControl.code,
      `Alta y evaluación de control "${newControl.name}". Efectividad total: ${newControl.totalEffectiveness}%. Evidencias adjuntas: ${initialAttachments.length} archivo(s).`
    );
    return newControl;
  }

  // Evaluate control effectiveness and attach test evidence
  async evaluateControl(
    id: string,
    design: number,
    operating: number,
    evidence?: string,
    attachments?: ControlEvidenceAttachment[],
    testExecution?: Partial<ControlTestExecution>
  ) {
    const control = this.controls().find(c => c.id === id);
    if (!control) return;

    const totalEffectiveness = Math.round((design * 0.4) + (operating * 0.6));
    const status = totalEffectiveness >= 85 ? 'Efectivo' : totalEffectiveness >= 65 ? 'Parcialmente Efectivo' : 'Deficiente';
    const testDate = new Date().toISOString().split('T')[0];

    const currentAttachments = control.attachments || [];
    const newAttachments = attachments || [];
    const mergedAttachments = [...newAttachments, ...currentAttachments.filter(ca => !newAttachments.some(na => na.id === ca.id))];

    const newTestRecord: ControlTestExecution = {
      id: `tst-${Date.now()}`,
      testDate,
      testedBy: testExecution?.testedBy || this.currentProfile().name,
      testerRole: testExecution?.testerRole || this.currentProfile().role,
      testMethod: testExecution?.testMethod || 'Inspección de Muestra',
      sampleSize: testExecution?.sampleSize || control.sampleDetails || 'Muestra de 30 operaciones auditadas',
      deviationsIdentified: testExecution?.deviationsIdentified ?? 0,
      designScore: design,
      operatingScore: operating,
      totalScore: totalEffectiveness,
      conclusion: status === 'Efectivo' ? 'Efectivo / Conforme' : status === 'Parcialmente Efectivo' ? 'Con Desviaciones Menores' : 'Deficiente / No Conforme',
      evidenceNotes: evidence || control.evidence,
      attachments: mergedAttachments,
      ledgerHash: 'sha256-verified-test'
    };

    const updatedControl: Control = {
      ...control,
      designEffectiveness: design,
      operatingEffectiveness: operating,
      totalEffectiveness,
      status,
      lastTested: testDate,
      lastTestedBy: this.currentProfile().name,
      sampleDetails: testExecution?.sampleSize || control.sampleDetails,
      evidence: evidence || control.evidence,
      attachments: mergedAttachments,
      testHistory: [newTestRecord, ...(control.testHistory || [])]
    };

    this.controls.update(list => list.map(c => c.id === id ? updatedControl : c));

    // Recalculate residual risk for all risks that use this control
    const impactedRisks = this.risks().filter(r => r.controlIds.includes(id));
    for (const r of impactedRisks) {
      const residual = this.calculateResidual(r.inherentLikelihood, r.inherentImpact, r.financialExposureUSD, r.controlIds);
      this.risks.update(list => list.map(item => item.id === r.id ? { ...item, ...residual } : item));
    }

    const filesDesc = mergedAttachments.length > 0 ? ` Archivos adjuntos: ${mergedAttachments.map(a => a.fileName).join(', ')}.` : '';
    await this.appendAuditLog(
      'EVALUACIÓN_CONTROL',
      'Control',
      control.code,
      `Prueba y evaluación de control "${control.name}": Diseño ${design}%, Operación ${operating}%, Total ${totalEffectiveness}%. Muestra: ${newTestRecord.sampleSize}.${filesDesc} ${impactedRisks.length} riesgos recalculados automáticamente.`
    );
  }

  // Delete an attachment from a control
  async deleteControlAttachment(controlId: string, attachmentId: string) {
    const control = this.controls().find(c => c.id === controlId);
    if (!control || !control.attachments) return;

    const removed = control.attachments.find(a => a.id === attachmentId);
    const updatedAttachments = control.attachments.filter(a => a.id !== attachmentId);

    this.controls.update(list => list.map(c => c.id === controlId ? {
      ...c,
      attachments: updatedAttachments
    } : c));

    if (removed) {
      await this.appendAuditLog(
        'EVALUACIÓN_CONTROL',
        'Control',
        control.code,
        `Eliminación de archivo de evidencia "${removed.fileName}" en control ${control.code}.`
      );
    }
  }

  // Trigger download of an attached evidence file
  downloadAttachment(attachment: ControlEvidenceAttachment) {
    let blob: Blob;
    if (attachment.fileDataUrl) {
      // Data URL or custom content
      blob = new Blob([attachment.fileDataUrl], { type: attachment.fileType });
    } else {
      // Mock generated official evidence file representation
      const sampleText = `================================================================================\n` +
        `CUSTODIA RISK - EXPEDIENTE OFICIAL DE EVIDENCIA DE CONTROL OPERACIONAL\n` +
        `================================================================================\n` +
        `Archivo: ${attachment.fileName}\n` +
        `Fecha de Carga: ${attachment.uploadedAt}\n` +
        `Responsable de Carga: ${attachment.uploadedBy}\n` +
        `Tamaño: ${attachment.fileSize}\n` +
        `Tipo MIME: ${attachment.fileType}\n` +
        `Descripción de la Evidencia: ${attachment.description || 'Sin descripción adicional'}\n` +
        `Hash SHA-256 de Integridad: ${attachment.fileHashSha256 || '9f8e7d6c5b4a3210fedcba9876543210abcdef0123456789abcdef0123456789'}\n` +
        `Marco Normativo: ISO 31000:2018 / COSO ERM / Basilea III\n` +
        `================================================================================\n\n` +
        `[CERTIFICACIÓN DE PRUEBA DE CONTROL]\n` +
        `Se certifica que la evidencia adjunta ha sido inspeccionada por el equipo de control\n` +
        `interno y auditoría de riesgos, cumpliendo con los estándares de validez, suficiencia,\n` +
        `relevancia y trazabilidad criptográfica en la bitácora inalterable.\n`;
      blob = new Blob([sampleText], { type: 'text/plain;charset=utf-8' });
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Computed metrics for Incidents & Loss Events
  readonly totalRealLossesUSD = computed(() =>
    this.flaws().reduce((sum, f) => sum + (f.realLossAmountUSD || 0), 0)
  );
  readonly totalLossesRecoveredUSD = computed(() =>
    this.flaws().reduce((sum, f) => sum + (f.recoveredAmountUSD || 0), 0)
  );
  readonly controlFailuresCount = computed(() =>
    this.flaws().filter(f => f.incidentType === 'Falla de Control').length
  );
  readonly lossEventsCount = computed(() =>
    this.flaws().filter(f => f.incidentType === 'Evento de Pérdida Real').length
  );

  // Report a new incident / flaw (Registro de Incidencia / Evento de Pérdida o Falla de Control)
  async reportFlaw(flawData: Partial<OperationalFlaw>): Promise<OperationalFlaw> {
    const newFlaw: OperationalFlaw = {
      id: `inc-${Date.now()}`,
      title: flawData.title || 'Incidencia operacional reportada',
      description: flawData.description || '',
      reportedBy: flawData.reportedBy || this.currentProfile().name,
      process: flawData.process || 'Operaciones',
      severity: flawData.severity || 'Alta',
      reportedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'Pendiente de Evaluación',
      incidentType: flawData.incidentType || 'Falla de Control',
      realLossAmountUSD: flawData.realLossAmountUSD || 0,
      recoveredAmountUSD: flawData.recoveredAmountUSD || 0,
      impactedSystemOrAccount: flawData.impactedSystemOrAccount || '',
      aiSuggestedCategory: flawData.aiSuggestedCategory,
      aiSuggestedControls: flawData.aiSuggestedControls,
      aiAnalysis: flawData.aiAnalysis
    };

    this.flaws.update(list => [newFlaw, ...list]);
    await this.appendAuditLog(
      'REPORTE_INCIDENCIA',
      'Incidencia',
      newFlaw.id,
      `Registro de incidencia (${newFlaw.incidentType}) en proceso ${newFlaw.process}: "${newFlaw.title}". Severidad: ${newFlaw.severity}.${newFlaw.realLossAmountUSD ? ` Pérdida real: $${newFlaw.realLossAmountUSD} USD.` : ''}`
    );
    return newFlaw;
  }

  // Update an existing incident / event (Actualizar evento de pérdida o falla de control)
  async updateFlaw(id: string, updates: Partial<OperationalFlaw>): Promise<OperationalFlaw> {
    const existing = this.flaws().find(f => f.id === id);
    if (!existing) throw new Error('Incidencia no encontrada');

    const updated: OperationalFlaw = {
      ...existing,
      ...updates
    };

    this.flaws.update(list => list.map(f => f.id === id ? updated : f));
    await this.appendAuditLog(
      'ACTUALIZACION_INCIDENCIA',
      'Incidencia',
      id,
      `Actualización de incidencia/evento "${updated.title}". Tipo: ${updated.incidentType || 'No especificado'}. Pérdida real: $${updated.realLossAmountUSD || 0} USD.`
    );
    return updated;
  }

  // Convert an incident/flaw directly into an assessed risk
  async convertFlawToRisk(flawId: string, customData?: Partial<Risk>): Promise<Risk> {
    const flaw = this.flaws().find(f => f.id === flawId);
    if (!flaw) throw new Error('Incidencia no encontrada');

    const createdRisk = await this.addRisk({
      title: customData?.title || `Riesgo originado por incidencia: ${flaw.title}`,
      description: customData?.description || `${flaw.description} (Reportado originalmente por ${flaw.reportedBy} el ${flaw.reportedAt})`,
      process: customData?.process || flaw.process,
      category: customData?.category || flaw.aiSuggestedCategory || 'Ejecución y Procesos',
      inherentLikelihood: customData?.inherentLikelihood || (flaw.severity === 'Crítica' ? 4 : flaw.severity === 'Alta' ? 3 : 2),
      inherentImpact: customData?.inherentImpact || (flaw.severity === 'Crítica' ? 4 : flaw.severity === 'Alta' ? 3 : 2),
      financialExposureUSD: customData?.financialExposureUSD || (flaw.realLossAmountUSD && flaw.realLossAmountUSD > 0 ? flaw.realLossAmountUSD * 2 : 150000),
      controlIds: customData?.controlIds || []
    });

    this.flaws.update(list => list.map(f => f.id === flawId ? {
      ...f,
      status: 'Convertida a Riesgo',
      convertedRiskId: createdRisk.id
    } : f));

    await this.appendAuditLog(
      'CONVERSIÓN_A_RIESGO',
      'Incidencia',
      flaw.id,
      `Incidencia "${flaw.title}" evaluada y convertida formalmente en el riesgo operacional ${createdRisk.code}.`
    );

    return createdRisk;
  }

  // Trigger an anomaly alert (for testing or automation)
  async triggerAlert(alertData: Partial<AnomalyAlert>): Promise<AnomalyAlert> {
    const code = `ALT-${400 + this.alerts().length + 1}`;
    const newAlert: AnomalyAlert = {
      id: `alt-${Date.now()}`,
      code,
      title: alertData.title || 'Anomalía operativa detectada',
      description: alertData.description || 'Desviación en los umbrales de control operacional',
      kriMetric: alertData.kriMetric || 'Desviación Operacional KRI',
      threshold: alertData.threshold || 'Valor estándar',
      currentValue: alertData.currentValue || 'Excedido',
      severity: alertData.severity || 'Alto',
      process: alertData.process || 'Operaciones',
      triggeredAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'Activa',
      escalatedTo: alertData.escalatedTo || 'Oficial de Riesgo Operacional'
    };

    this.alerts.update(list => [newAlert, ...list]);
    await this.appendAuditLog(
      'ALERTA_DISPARADA',
      'Alerta',
      newAlert.code,
      `Alerta automática ${newAlert.code} por anomalía en proceso ${newAlert.process}: "${newAlert.title}". Severidad: ${newAlert.severity}.`
    );
    return newAlert;
  }

  // Acknowledge or resolve an alert
  async updateAlertStatus(alertId: string, status: 'En Investigación' | 'Mitigada' | 'Silenciada') {
    const alert = this.alerts().find(a => a.id === alertId);
    if (!alert) return;

    this.alerts.update(list => list.map(a => a.id === alertId ? { ...a, status } : a));
    await this.appendAuditLog(
      'RESOLUCIÓN_ALERTA',
      'Alerta',
      alert.code,
      `Estado de la alerta ${alert.code} actualizado a "${status}" por ${this.currentProfile().name}.`
    );
  }

  // Register audit findings or review
  async addAuditFinding(auditId: string, finding: Omit<AuditFinding, 'id'>) {
    const audit = this.audits().find(a => a.id === auditId);
    if (!audit) return;

    const newFinding: AuditFinding = {
      ...finding,
      id: `fnd-${Date.now()}`
    };

    const updatedFindings = [...audit.findings, newFinding];
    // recalculate compliance score: deductions for findings
    const deductions = updatedFindings.filter(f => f.type === 'No Conformidad Mayor').length * 15 +
      updatedFindings.filter(f => f.type === 'No Conformidad Menor').length * 8 +
      updatedFindings.filter(f => f.type === 'Observación').length * 3;
    const newScore = Math.max(0, 100 - deductions);

    this.audits.update(list => list.map(a => a.id === auditId ? {
      ...a,
      findings: updatedFindings,
      complianceScore: newScore
    } : a));

    await this.appendAuditLog(
      'AUDITORÍA_REGISTRADA',
      'Auditoría',
      audit.code,
      `Registro de hallazgo (${newFinding.type}) en auditoría ${audit.code}: "${newFinding.description}". Score recalculado a ${newScore}%.`
    );
  }

  // Append entry to inalterable cryptographic audit ledger
  async appendAuditLog(
    action: AuditLogEntry['action'],
    entityType: AuditLogEntry['entityType'],
    entityCode: string,
    details: string
  ) {
    const currentList = this.auditTrail();
    const lastEntry = currentList[0]; // newest is top or check last block
    const maxBlockNumber = currentList.reduce((max, e) => Math.max(max, e.blockNumber), 0);
    const newBlockNumber = maxBlockNumber + 1;
    const previousHash = lastEntry ? lastEntry.hash : '0000000000000000000000000000000000000000000000000000000000000000';
    const timestamp = new Date().toISOString();
    const user = this.currentProfile();

    const hash = await computeBlockHash(
      newBlockNumber,
      timestamp,
      user.name,
      action,
      entityCode,
      details,
      previousHash
    );

    const newEntry: AuditLogEntry = {
      id: `log-${Date.now()}`,
      blockNumber: newBlockNumber,
      timestamp,
      userName: user.name,
      userRole: user.role,
      action,
      entityType,
      entityCode,
      details,
      ipAddress: '10.240.1.45', // simulated verified corporate internal IP
      previousHash,
      hash
    };

    this.auditTrail.update(list => [newEntry, ...list]);
  }

  // Verify the entire cryptographic audit trail chain
  async verifyAuditTrailIntegrity(): Promise<{ isValid: boolean; brokenBlockNumber?: number; totalBlocks: number }> {
    const list = [...this.auditTrail()].sort((a, b) => a.blockNumber - b.blockNumber);
    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (const block of list) {
      if (block.blockNumber > 1 && block.previousHash !== prevHash) {
        return { isValid: false, brokenBlockNumber: block.blockNumber, totalBlocks: list.length };
      }
      prevHash = block.hash;
    }
    return { isValid: true, totalBlocks: list.length };
  }

  // Export Data to CSV (Compatible with Microsoft Excel in Latin America and Global formats with UTF-8 BOM)
  exportToExcel(type: 'risks' | 'controls' | 'audit_trail' | 'complete') {
    const csvContentStart = '\uFEFF'; // UTF-8 BOM for Excel to properly render accents and special characters
    const now = new Date().toISOString().slice(0, 10);
    const filename = `Custodia_Riesgo_Operacional_${type}_${now}.csv`;
    let csvContent = csvContentStart;

    if (type === 'risks' || type === 'complete') {
      csvContent += 'MATRIZ DE GESTIÓN DE RIESGO OPERACIONAL - CUSTODIA RISK\n';
      csvContent += `Fecha de Exportación:;${new Date().toLocaleString()};Generado Por:;${this.currentProfile().name} (${this.currentProfile().role})\n\n`;
      csvContent += 'Código;Título;Proceso;Categoría Basilea;Riesgo Inherente Prob;Riesgo Inherente Imp;Score Inherente;Nivel Inherente;Exposición USD;Controles Aplicados;Score Residual;Nivel Residual;Exposición Residual USD;Estado;Plan de Mitigación;Avance Plan %\n';

      this.risks().forEach(r => {
        const controlsStr = r.controlIds.map(cId => {
          const c = this.controls().find(item => item.id === cId);
          return c ? c.code : cId;
        }).join(', ');

        csvContent += `"${r.code}";"${r.title.replace(/"/g, '""')}";"${r.process}";"${r.category}";${r.inherentLikelihood};${r.inherentImpact};${r.inherentScore};"${r.inherentLevel}";${r.financialExposureUSD};"${controlsStr}";${r.residualScore};"${r.residualLevel}";${r.residualExposureUSD};"${r.status}";"${r.mitigationPlan.title.replace(/"/g, '""')}";${r.mitigationPlan.progressPct}%\n`;
      });
      csvContent += '\n';
    }

    if (type === 'controls' || type === 'complete') {
      csvContent += 'CATÁLOGO DE CONTROLES OPERACIONALES\n';
      csvContent += 'Código;Nombre del Control;Proceso;Tipo;Automatización;Frecuencia;Diseño %;Operación %;Efectividad Total %;Estado;Responsable;Última Prueba\n';

      this.controls().forEach(c => {
        csvContent += `"${c.code}";"${c.name.replace(/"/g, '""')}";"${c.process}";"${c.type}";"${c.automation}";"${c.frequency}";${c.designEffectiveness}%;${c.operatingEffectiveness}%;${c.totalEffectiveness}%;"${c.status}";"${c.owner}";"${c.lastTested}"\n`;
      });
      csvContent += '\n';
    }

    if (type === 'audit_trail' || type === 'complete') {
      csvContent += 'BITÁCORA INALTERABLE DE AUDITORÍA Y TRAZABILIDAD (LEDGER CRIPTOGRÁFICO)\n';
      csvContent += 'Bloque #;Timestamp;Usuario;Rol;Acción;Entidad;Código;Detalle de Operación;Hash de Integridad SHA-256\n';

      this.auditTrail().forEach(a => {
        csvContent += `${a.blockNumber};"${a.timestamp}";"${a.userName}";"${a.userRole}";"${a.action}";"${a.entityType}";"${a.entityCode}";"${a.details.replace(/"/g, '""')}";"${a.hash}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.appendAuditLog(
      'EXPORTACIÓN_REPORTE',
      'Reporte',
      filename,
      `Exportación de reporte tabular Excel/CSV (${type}) completada satisfactoriamente.`
    );
  }
}
