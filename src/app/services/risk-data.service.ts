import { Injectable, computed, inject, signal } from '@angular/core';
import { CatalogService } from './catalog.service';
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
  UserPermissions,
  RegulatoryMilestoneTemplate,
  RegulatoryReport,
  MilestoneStatus,
  Ran208Details
} from '../models/risk.model';
import { computeBlockHash } from '../utils/crypto-ledger';
import { ImportRow } from '../utils/risk-import';
import { DEFAULT_ORGANIZATIONAL_ROLES, DEFAULT_REGULATORY_MILESTONES, formatMinutes } from '../data/base-seed';
import { DEMO_ALERTS, DEMO_AUDITS, DEMO_CONTROLS, DEMO_FLAWS, DEMO_KRIS, DEMO_LEDGER, DEMO_RISKS, DEMO_USERS } from '../data/demo-seed';

export { DEFAULT_ORGANIZATIONAL_ROLES, DEFAULT_REGULATORY_MILESTONES, formatMinutes };

/** Copia profunda para no compartir referencias con los datos semilla. */
function clone<T>(v: T): T {
  return structuredClone(v);
}



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

export const DEFAULT_GLOBAL_NOTIFICATION_PREFERENCES: KriNotificationPreferences = {
  emailEnabled: true,
  emailRecipients: ['oficial.riesgo@demo.riskguard.cl', 'alertas-kri@demo.riskguard.cl'],
  emailTemplate: 'completa',
  smsEnabled: true,
  smsRecipients: ['+54 9 11 4589-2044', '+52 55 8421-9930'],
  webhookEnabled: false,
  webhookUrl: 'https://api.demo.riskguard.cl/v1/webhooks/kri-alerts',
  notifyOnWarning: true,
  notifyOnCritical: true,
  cooldownMinutes: 30,
  escalateToRiskOfficer: true
};

/** Acción rechazada porque el cargo actual no tiene el permiso necesario. */
export class PermissionDeniedError extends Error {}

@Injectable({
  providedIn: 'root'
})
export class RiskDataService {
  // Configured Industry Profile
  readonly currentIndustry = signal<IndustryType>('Fintech & Pagos Digitales');

  // Global KRI Notification Preferences (Email & SMS)
  readonly globalNotificationSettings = signal<KriNotificationPreferences>(DEFAULT_GLOBAL_NOTIFICATION_PREFERENCES);

  // Defined Organizational Roles (Puestos)
  readonly organizationalRoles = signal<OrganizationalRole[]>(clone(DEFAULT_ORGANIZATIONAL_ROLES));

  // Usuarios y colaboradores
  readonly userProfiles = signal<UserProfile[]>(clone(DEMO_USERS));

  // Backward compatible getter for existing templates
  get availableProfiles(): UserProfile[] {
    return this.userProfiles();
  }

  /** Con sesión iniciada el usuario es fijo: no se puede cambiar de perfil desde la pantalla. */
  readonly sessionLocked = signal(false);

  // Active User Profile
  readonly currentProfile = signal<UserProfile>(this.userProfiles()[0]);

  // Key Risk Indicators (KRIs) with Industry Specific Thresholds
  readonly kriDefinitions = signal<KriDefinition[]>(clone(DEMO_KRIS));

  // Controls Catalog with Attached Evidence and Test History
  readonly controls = signal<Control[]>(clone(DEMO_CONTROLS));

  // Risks Catalog
  readonly risks = signal<Risk[]>(clone(DEMO_RISKS));

  // Operational Incidents & Loss Events (Incidentes Operacionales y Base de Pérdidas)
  readonly flaws = signal<OperationalFlaw[]>(clone(DEMO_FLAWS));

  // Real-time Anomaly Alerts (KRI breaches & operational anomalies)
  readonly alerts = signal<AnomalyAlert[]>(clone(DEMO_ALERTS));

  // Periodic Audits
  readonly audits = signal<PeriodicAudit[]>(clone(DEMO_AUDITS));

  // Inalterable Audit Trail (Blockchain-like immutable chained ledger)
  readonly auditTrail = signal<AuditLogEntry[]>(clone(DEMO_LEDGER));

  // Dynamic search and filter signals for the risks catalog
  readonly riskSearchTerm = signal<string>('');
  readonly filterProcess = signal<string>('TODOS');
  readonly filterCategory = signal<string>('TODAS');
  readonly filterLevel = signal<string>('TODOS');
  readonly matrixSelectedCell = signal<{ likelihood: number; impact: number } | null>(null);
  readonly heatmapSelectedProcess = signal<string>('TODOS');

  /** Mantenedores (áreas, procesos, parámetros). */
  readonly catalog = inject(CatalogService);

  /** Moneda de registro de montos (Mantenedores → Parámetros generales). */
  readonly currencyCode = computed(() => this.catalog.currency());

  /** Estado del riesgo residual frente al apetito de su categoría. */
  appetiteOf(r: Risk) {
    return this.catalog.appetiteStatus(r.residualScore, r.category);
  }

  /** Resumen por categoría: riesgos sobre apetito o fuera de tolerancia y pérdida neta del año vs. límite. */
  readonly appetiteSummary = computed(() => {
    const year = String(new Date().getFullYear());
    const risks = this.risks().filter(r => r.status !== 'Cerrado');
    const rows = this.catalog.riskAppetite().limits.map(limit => {
      const list = risks.filter(r => r.category === limit.category);
      const over = list.filter(r => this.appetiteOf(r) === 'Sobre el apetito');
      const out = list.filter(r => this.appetiteOf(r) === 'Fuera de tolerancia');
      const yearLoss = this.flaws()
        .filter(f => (f.baselCategory ?? '') === limit.category && (f.accountingDate || f.occurrenceDate || f.reportedAt || '').startsWith(year))
        .reduce((s, f) => s + this.netLoss(f), 0);
      return {
        limit, risks: list.length, maxResidual: list.reduce((m, r) => Math.max(m, r.residualScore), 0),
        over: over.length, outOfTolerance: out.length, yearLoss,
        lossExceeded: !!limit.annualLossLimit && yearLoss > limit.annualLossLimit,
      };
    });
    return {
      rows,
      over: rows.reduce((s, r) => s + r.over, 0),
      outOfTolerance: rows.reduce((s, r) => s + r.outOfTolerance, 0),
      lossExceeded: rows.filter(r => r.lossExceeded).length,
    };
  });

  /** Procesos activos del mantenedor (para filtros y listas). */
  get defaultProcesses(): string[] {
    return this.catalog.processNames();
  }

  /** Íconos de los procesos de ejemplo; el resto usa uno genérico. */
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
      // Cell filter from 4×4 heatmap
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
    // Cumplimiento: promedio de las auditorías finalizadas o aprobadas (80 % si aún no hay).
    const done = allAudits.filter(a => a.status === 'Finalizada' || a.status === 'Aprobada');
    const auditCompliancePct = done.length ? Math.round(done.reduce((acc, a) => acc + a.complianceScore, 0) / done.length) : 80;
    const complianceWeight = auditCompliancePct * 0.25;
    const appliedAlertsPenalty = Math.round(alertsPenalty * 0.5);

    const operationalHealthIndex = Math.max(0, Math.min(100, Math.round(controlWeight + exposureMitigationWeight + complianceWeight - appliedAlertsPenalty)));
    // Sin riesgos ni controles registrados el índice no tiene base: se informa "sin datos".
    const hasHealthData = allRisks.length > 0 || allControls.length > 0;
    const health = !hasHealthData
      ? { label: 'Sin datos suficientes', tone: 'neutral' as const }
      : operationalHealthIndex >= 80 ? { label: 'Postura Operacional Óptima', tone: 'good' as const }
      : operationalHealthIndex >= 60 ? { label: 'Postura Aceptable con Alertas', tone: 'warn' as const }
      : { label: 'Atención Requerida', tone: 'bad' as const };

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
      auditCompliancePct,
      appliedAlertsPenalty,
      operationalHealthIndex,
      hasHealthData,
      healthLabel: health.label,
      healthTone: health.tone,
    };
  });

  // Calculate 4×4 heatmap counts for Inherent and Residual risks (can be global or filtered by process)
  readonly heatmapMatrix = computed(() => {
    // 4×4 matrix: likelihood (1 to 4) x impact (1 to 4)
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

      // 4×4 grid per process
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

      const catalogProc = this.catalog.processByName(proc);
      const legacy = this.processMetadata[proc];
      const meta = {
        icon: legacy?.icon ?? 'account_tree',
        owner: catalogProc?.owner || legacy?.owner || 'Sin dueño asignado',
        department: this.catalog.areaById(catalogProc?.areaId)?.name || legacy?.department || 'Sin área asignada',
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

  // Helper to determine risk level on 4×4 scale (1 to 16 score)
  calculateRiskLevel(likelihood: number, impact: number): RiskLevel {
    const score = likelihood * impact;
    if (score >= 12) return 'Crítico'; // e.g. 4×4=16, 4x3=12, 3x4=12
    if (score >= 8) return 'Alto';     // e.g. 3x3=9, 2x4=8, 4x2=8
    if (score >= 4) return 'Medio';    // e.g. 2x3=6, 3x2=6, 2x2=4, 1x4=4, 4x1=4
    return 'Bajo';                     // e.g. 1x3=3, 3x1=3, 1x2=2, 2x1=2, 1x1=1
  }

  // Calculate Residual Risk from Inherent Risk and applied controls (4×4 scale)
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
    if (this.sessionLocked()) return;
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
  /** Proceso del mantenedor equivalente a un nombre (igual, o el que comparte más palabras; si no, el primero). */
  closestProcess(name: string): string {
    const names = this.catalog.processNames();
    if (names.includes(name)) return name;
    const words = (s: string) => new Set(s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(w => w.length > 3));
    const target = words(name);
    let best = names[0] ?? name, score = 0;
    for (const n of names) {
      const sc = [...words(n)].filter(w => target.has(w)).length;
      if (sc > score) { best = n; score = sc; }
    }
    return best;
  }

  async setIndustry(industry: IndustryType) {
    this.ensure(['canConfigureKRIs'], 'cambiar el perfil de industria de los KRIs');
    this.currentIndustry.set(industry);
    // Agrega los KRIs sugeridos que falten; no reemplaza ni borra los existentes.
    const presets = INDUSTRY_KRI_PRESETS[industry] ?? [];
    const existing = new Set(this.kriDefinitions().map(k => k.code));
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const added: KriDefinition[] = presets.filter(p => !existing.has(p.code)).map((p, idx) => ({
      ...p,
      id: `kri-${industry.toLowerCase().slice(0, 3)}-${Date.now().toString(36)}-${idx + 1}`,
      process: this.closestProcess(p.process),
      lastUpdated: now
    }));
    if (added.length) this.kriDefinitions.update(list => [...list, ...added]);
    await this.appendAuditLog(
      'CAMBIO_INDUSTRIA',
      'KRI',
      industry,
      `KRIs sugeridos para "${industry}": ${added.length ? `${added.length} agregados (${added.map(k => k.code).join(', ')})` : 'ya estaban todos'}. Los KRIs existentes se mantienen.`
    );
  }

  // Update an existing KRI definition and its thresholds
  async updateKriThreshold(kriId: string, updates: Partial<KriDefinition>) {
    this.ensure(['canConfigureKRIs'], 'configurar umbrales de KRIs');
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
    this.ensure(['canConfigureKRIs'], 'configurar notificaciones de KRIs');
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
    this.ensure(['canConfigureKRIs'], 'probar notificaciones de KRIs');
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
    this.ensure(['canConfigureKRIs'], 'registrar valores de KRIs');
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
    this.ensure(['canConfigureKRIs'], 'crear KRIs');
    const code = kriData.code || `KRI-${Date.now().toString().slice(-4)}`;
    const newKri: KriDefinition = {
      id: `kri-${Date.now()}`,
      code,
      name: kriData.name || 'Nuevo Indicador Clave de Riesgo',
      description: kriData.description || 'Monitoreo de tolerancia operacional',
      process: this.closestProcess(kriData.process || ''),
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
    this.ensure(['canManageRoles'], 'administrar puestos y permisos');
    const newRole: OrganizationalRole = {
      id: `role-${Date.now()}`,
      title: roleData.title || 'Nuevo Puesto Operativo',
      department: roleData.department || (this.catalog.activeAreas()[0]?.name ?? 'Sin área'),
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
    this.ensure(['canManageRoles'], 'administrar puestos y permisos');
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
    this.ensure(['canManageRoles'], 'administrar usuarios');
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
      email: userData.email || 'colaborador@demo.riskguard.cl',
      role: userData.role || (roleMatch ? roleMatch.title : 'Colaborador Operativo'),
      roleId: userData.roleId || (roleMatch ? roleMatch.id : undefined),
      department: userData.department || (roleMatch ? roleMatch.department : (this.catalog.activeAreas()[0]?.name ?? 'Sin área')),
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
    this.ensure(['canManageRoles'], 'administrar usuarios');
    this.userProfiles.update(list => list.map(u => u.id === userId ? { ...u, ...updates } : u));
    if (this.currentProfile().id === userId) {
      this.currentProfile.update(cp => ({ ...cp, ...updates }));
    }
  }

  // Delete a user profile (cuenta de usuario)
  async deleteUserProfile(userId: string): Promise<boolean> {
    this.ensure(['canManageRoles'], 'administrar usuarios');
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
    this.ensure(['canManageRoles'], 'administrar puestos y permisos');
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

  /** true si el cargo actual tiene al menos uno de los permisos indicados. */
  canAny(...permissions: (keyof UserPermissions)[]): boolean {
    return permissions.some(p => this.hasPermission(p));
  }

  /** Último intento de acción bloqueado por permisos (la app lo muestra como aviso). */
  readonly permissionNotice = signal<{ message: string; at: number } | null>(null);

  /**
   * Corta la acción si el cargo actual no tiene el permiso. Es la misma regla que aplica el
   * servidor, de modo que lo que se ve en pantalla coincide con lo que se puede guardar.
   */
  /** Igual que ensure, pero devuelve false en vez de lanzar (para abrir formularios). */
  requirePermission(permissions: (keyof UserPermissions)[], action: string): boolean {
    try { this.ensure(permissions, action); return true; } catch { return false; }
  }

  ensure(permissions: (keyof UserPermissions)[], action: string): void {
    if (this.canAny(...permissions)) return;
    const message = `Tu cargo (${this.currentProfile().role}) no tiene permiso para ${action}.`;
    this.permissionNotice.set({ message, at: Date.now() });
    throw new PermissionDeniedError(message);
  }


  // Add a new risk (bounded to 4×4 scale)
  async addRisk(riskData: Partial<Risk>): Promise<Risk> {
    this.ensure(['canEditRisks', 'canConvertFlaws'], 'crear riesgos');
    const code = `RGO-${100 + this.risks().length + 1}`;
    const inherentL = Math.max(1, Math.min(4, riskData.inherentLikelihood || 2));
    const inherentI = Math.max(1, Math.min(4, riskData.inherentImpact || 2));
    const inherentScore = inherentL * inherentI;
    const inherentLevel = this.calculateRiskLevel(inherentL, inherentI);
    const inherentExposure = riskData.financialExposureUSD || (this.currencyCode() === 'CLP' ? 100_000_000 : 100000);
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

  /**
   * Carga masiva desde una matriz en Excel/CSV (ver utils/risk-import.ts).
   * Crea los riesgos nuevos y, con `updateExisting`, actualiza los que tienen el mismo código;
   * si no, los omite. Deja un solo registro en la bitácora con el resumen.
   */
  async importRisks(
    rows: ImportRow[],
    opts: { updateExisting: boolean; hasExposure: boolean; hasControls: boolean; fileName: string },
  ): Promise<{ created: number; updated: number; skipped: number }> {
    this.ensure(['canEditRisks'], 'importar riesgos');
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 86_400_000).toISOString().split('T')[0];
    const stamp = Date.now().toString(36);
    const byCode = new Map(this.risks().map(r => [r.code.toUpperCase(), r]));
    const usedCodes = new Set(byCode.keys());
    let seq = this.risks().reduce((m, r) => Math.max(m, Number(r.code.match(/(\d+)$/)?.[1] ?? 0)), 100);
    const nextCode = () => { let c: string; do { c = `RGO-${++seq}`; } while (usedCodes.has(c)); usedCodes.add(c); return c; };
    const actionsOf = (text: string) => text.split(/\r?\n|;/).map(a => a.trim()).filter(Boolean);

    const created: Risk[] = [];
    const updated = new Map<string, Risk>();
    let skipped = 0;

    rows.forEach((row, i) => {
      if (row.errors.length) { skipped++; return; }
      const existing = row.code ? byCode.get(row.code) : undefined;
      if (existing && !opts.updateExisting) { skipped++; return; }

      const exposure = existing && !opts.hasExposure ? existing.financialExposureUSD : row.exposure;
      const controlIds = existing && !opts.hasControls ? existing.controlIds : row.controlIds;
      const residual = this.calculateResidual(row.likelihood, row.impact, exposure, controlIds);
      const base = {
        title: row.title,
        description: row.description || existing?.description || '',
        process: row.process,
        category: row.category,
        responsible: row.responsible || existing?.responsible || this.currentProfile().name,
        status: row.status,
        inherentLikelihood: row.likelihood,
        inherentImpact: row.impact,
        inherentScore: row.likelihood * row.impact,
        inherentLevel: this.calculateRiskLevel(row.likelihood, row.impact),
        financialExposureUSD: exposure,
        controlIds,
        ...residual,
        lastReviewDate: today,
      };

      if (existing) {
        updated.set(existing.id, {
          ...existing, ...base,
          mitigationPlan: row.mitigation
            ? { ...existing.mitigationPlan, title: actionsOf(row.mitigation)[0] ?? existing.mitigationPlan.title, actions: actionsOf(row.mitigation) }
            : existing.mitigationPlan,
        });
        return;
      }
      const code = row.code && !usedCodes.has(row.code) ? (usedCodes.add(row.code), row.code) : nextCode();
      const actions = actionsOf(row.mitigation);
      created.push({
        id: `rsk-imp-${stamp}-${i + 1}`,
        code,
        ...base,
        mitigationPlan: {
          id: `mit-imp-${stamp}-${i + 1}`,
          title: actions[0] ?? `Plan de Mitigación para ${code}`,
          owner: base.responsible,
          dueDate: nextYear,
          budgetUSD: 0,
          progressPct: 0,
          status: 'No Iniciado',
          actions,
        },
        createdAt: today,
      });
    });

    if (created.length || updated.size) {
      this.risks.update(list => [...created, ...list.map(r => updated.get(r.id) ?? r)]);
    }
    const result = { created: created.length, updated: updated.size, skipped };
    await this.appendAuditLog(
      'IMPORTACIÓN_RIESGOS',
      'Riesgo',
      'IMPORTACIÓN',
      `Importación de matriz de riesgos desde "${opts.fileName}": ${result.created} creados${created.length ? ` (${created.map(r => r.code).join(', ')})` : ''}, ${result.updated} actualizados${updated.size ? ` (${[...updated.values()].map(r => r.code).join(', ')})` : ''}, ${result.skipped} omitidos.`,
    );
    return result;
  }

  // Update an existing risk
  async updateRisk(id: string, updates: Partial<Risk>) {
    this.ensure(['canEditRisks'], 'editar riesgos');
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
    this.ensure(['canEditRisks'], 'editar riesgos');
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
    this.ensure(['canEditRisks', 'canEvaluateControls'], 'crear controles');
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
    this.ensure(['canEvaluateControls'], 'evaluar controles');
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
    this.ensure(['canEvaluateControls'], 'eliminar evidencias de controles');
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
  readonly totalNetLossesUSD = computed(() =>
    this.flaws().reduce((sum, f) => sum + this.netLoss(f), 0)
  );

  // ===========================================================================
  // BASE DE PÉRDIDAS OPERACIONALES
  // ===========================================================================

  /** Umbral mínimo de pérdida bruta para incluir un evento en la base de pérdidas. */
  readonly lossRegistrationThresholdUSD = signal<number>(1000);

  netLoss(f: OperationalFlaw): number {
    return Math.max(0, (f.realLossAmountUSD || 0) - (f.recoveredAmountUSD || 0));
  }

  /** Eventos con impacto financiero (pérdida bruta > 0), ordenados por fecha de ocurrencia. */
  readonly lossDatabase = computed(() =>
    this.flaws()
      .filter(f => (f.realLossAmountUSD || 0) > 0)
      .sort((a, b) => (b.occurrenceDate || b.reportedAt).localeCompare(a.occurrenceDate || a.reportedAt))
  );

  isAboveLossThreshold(f: OperationalFlaw): boolean {
    return (f.realLossAmountUSD || 0) >= this.lossRegistrationThresholdUSD();
  }

  /** Campos de la base de pérdidas que faltan para un evento con pérdida. */
  missingLossFields(f: OperationalFlaw): string[] {
    const missing: string[] = [];
    if (!f.businessLine) missing.push('Línea de negocio');
    if (!f.baselCategory) missing.push('Categoría Basilea');
    if (!f.occurrenceDate) missing.push('Fecha de ocurrencia');
    if (!f.discoveryDate) missing.push('Fecha de descubrimiento');
    if (!f.accountingDate) missing.push('Fecha de contabilización');
    if (!f.accountingAccount) missing.push('Cuenta contable');
    return missing;
  }

  setLossThreshold(value: number) {
    this.ensure(['canManageRegulatoryReports'], 'cambiar el umbral de la base de pérdidas');
    const v = Math.max(0, Math.round(value || 0));
    this.lossRegistrationThresholdUSD.set(v);
  }

  // ===========================================================================
  // REPORTE REGULATORIO DE INCIDENTES (CMF / ANCI)
  // ===========================================================================

  readonly regulatoryMilestones = signal<RegulatoryMilestoneTemplate[]>(
    DEFAULT_REGULATORY_MILESTONES.map(m => ({ ...m }))
  );

  /** Incidentes con reporte regulatorio iniciado (abiertos primero). */
  readonly regulatoryIncidents = computed(() =>
    this.flaws()
      .filter(f => !!f.regulatoryReport)
      .sort((a, b) => {
        const ra = a.regulatoryReport!, rb = b.regulatoryReport!;
        if (ra.status !== rb.status) return ra.status === 'Abierto' ? -1 : 1;
        return rb.awarenessAt.localeCompare(ra.awarenessAt);
      })
  );

  /** Hitos aplicables a un reporte según las autoridades marcadas. */
  milestonesFor(report: RegulatoryReport): RegulatoryMilestoneTemplate[] {
    return this.regulatoryMilestones().filter(m =>
      m.enabled &&
      ((m.authority === 'CMF' && report.reportableToCMF) || (m.authority === 'ANCI' && report.reportableToANCI))
    );
  }

  /** Momento desde el que corre el plazo del hito: ocurrencia del incidente o toma de conocimiento. */
  milestoneBaseTime(report: RegulatoryReport, m: RegulatoryMilestoneTemplate): Date {
    const base = m.basis === 'ocurrencia' && report.occurredAt ? report.occurredAt : report.awarenessAt;
    return new Date(base);
  }

  milestoneDeadline(report: RegulatoryReport, m: RegulatoryMilestoneTemplate): Date {
    return new Date(this.milestoneBaseTime(report, m).getTime() + m.deadlineMinutes * 60_000);
  }

  milestoneStatus(report: RegulatoryReport, m: RegulatoryMilestoneTemplate, nowMs: number): MilestoneStatus {
    const sub = report.submissions.find(s => s.milestoneId === m.id);
    // Los hitos "al cierre" (p. ej. reporte de cierre RAN 20-8) no vencen por tiempo.
    if (m.dueOnClose) return sub ? 'Enviado a tiempo' : 'Pendiente';
    const deadline = this.milestoneDeadline(report, m).getTime();
    if (sub) return new Date(sub.submittedAt).getTime() <= deadline ? 'Enviado a tiempo' : 'Enviado fuera de plazo';
    return nowMs > deadline ? 'Vencido' : 'Pendiente';
  }

  /** Hitos "al cierre" aún sin enviar (impiden cerrar el reporte). */
  pendingClosingMilestones(report: RegulatoryReport): RegulatoryMilestoneTemplate[] {
    return this.milestonesFor(report).filter(m => m.dueOnClose && !report.submissions.some(s => s.milestoneId === m.id));
  }

  async updateRegulatoryDetails(flawId: string, changes: { occurredAt?: string; details: Ran208Details }) {
    this.ensure(['canManageRegulatoryReports'], 'gestionar reportes a la CMF y la ANCI');
    const flaw = this.flaws().find(f => f.id === flawId);
    const report = flaw?.regulatoryReport;
    if (!flaw || !report) return;
    this.patchFlaw(flawId, {
      regulatoryReport: { ...report, occurredAt: changes.occurredAt ?? report.occurredAt, details: { ...changes.details } },
    });
    await this.appendAuditLog('ACTUALIZACIÓN_REPORTE_REGULATORIO', 'Reporte Regulatorio', flawId,
      `Ficha RAN 20-8 actualizada para "${flaw.title}".`);
  }

  /** Resumen agregado de cumplimiento de plazos. */
  regulatorySummary(nowMs: number) {
    let pending = 0, overdue = 0, onTime = 0, late = 0;
    for (const f of this.regulatoryIncidents()) {
      const r = f.regulatoryReport!;
      for (const m of this.milestonesFor(r)) {
        const st = this.milestoneStatus(r, m, nowMs);
        if (st === 'Pendiente') { if (r.status === 'Abierto') pending++; }
        else if (st === 'Vencido') { if (r.status === 'Abierto') overdue++; }
        else if (st === 'Enviado a tiempo') onTime++;
        else late++;
      }
    }
    const sent = onTime + late;
    return {
      open: this.regulatoryIncidents().filter(f => f.regulatoryReport!.status === 'Abierto').length,
      pending,
      overdue,
      onTimePct: sent > 0 ? Math.round((onTime / sent) * 100) : null as number | null,
    };
  }

  async startRegulatoryReport(flawId: string, opts: { awarenessAt: string; occurredAt?: string; cmf: boolean; anci: boolean }) {
    this.ensure(['canManageRegulatoryReports', 'canReportFlaws'], 'iniciar reportes a la CMF y la ANCI');
    const flaw = this.flaws().find(f => f.id === flawId);
    if (!flaw) throw new Error('Incidencia no encontrada');
    if (!opts.cmf && !opts.anci) throw new Error('Debe seleccionar al menos una autoridad');
    const report: RegulatoryReport = {
      awarenessAt: new Date(opts.awarenessAt).toISOString(),
      occurredAt: opts.occurredAt ? new Date(opts.occurredAt).toISOString() : (flaw.regulatoryReport?.occurredAt ?? new Date(opts.awarenessAt).toISOString()),
      details: flaw.regulatoryReport?.details,
      reportableToCMF: opts.cmf,
      reportableToANCI: opts.anci,
      submissions: flaw.regulatoryReport?.submissions ?? [],
      updates: flaw.regulatoryReport?.updates ?? [],
      status: flaw.regulatoryReport?.status ?? 'Abierto',
      closedAt: flaw.regulatoryReport?.closedAt,
    };
    this.patchFlaw(flawId, { regulatoryReport: report });
    const authorities = [opts.cmf ? 'CMF' : null, opts.anci ? 'ANCI' : null].filter(Boolean).join(' y ');
    await this.appendAuditLog(
      'INICIO_REPORTE_REGULATORIO',
      'Reporte Regulatorio',
      flawId,
      `${flaw.regulatoryReport ? 'Ajuste' : 'Inicio'} de reporte regulatorio a ${authorities} por "${flaw.title}". Toma de conocimiento: ${report.awarenessAt}.`
    );
  }

  async registerRegulatorySubmission(flawId: string, milestoneId: string, folio: string, submittedAt?: string) {
    this.ensure(['canManageRegulatoryReports'], 'gestionar reportes a la CMF y la ANCI');
    const flaw = this.flaws().find(f => f.id === flawId);
    const report = flaw?.regulatoryReport;
    const milestone = this.regulatoryMilestones().find(m => m.id === milestoneId);
    if (!flaw || !report || !milestone) throw new Error('Reporte o hito no encontrado');
    const submission = {
      milestoneId,
      submittedAt: submittedAt ? new Date(submittedAt).toISOString() : new Date().toISOString(),
      submittedBy: this.currentProfile().name,
      folio: folio.trim() || undefined,
    };
    this.patchFlaw(flawId, {
      regulatoryReport: {
        ...report,
        submissions: [...report.submissions.filter(s => s.milestoneId !== milestoneId), submission],
      },
    });
    const st = this.milestoneStatus({ ...report, submissions: [submission] }, milestone, Date.now());
    await this.appendAuditLog(
      'ENVÍO_REPORTE_REGULATORIO',
      'Reporte Regulatorio',
      flawId,
      `${milestone.name} registrado${submission.folio ? ` (folio ${submission.folio})` : ''}. Resultado: ${st}.`
    );
  }

  async addRegulatoryUpdate(flawId: string, note: string) {
    this.ensure(['canManageRegulatoryReports'], 'gestionar reportes a la CMF y la ANCI');
    const flaw = this.flaws().find(f => f.id === flawId);
    const report = flaw?.regulatoryReport;
    if (!flaw || !report || !note.trim()) return;
    this.patchFlaw(flawId, {
      regulatoryReport: {
        ...report,
        updates: [...report.updates, { at: new Date().toISOString(), by: this.currentProfile().name, note: note.trim() }],
      },
    });
    await this.appendAuditLog('ACTUALIZACIÓN_REPORTE_REGULATORIO', 'Reporte Regulatorio', flawId, `Actualización: ${note.trim()}`);
  }

  async closeRegulatoryReport(flawId: string) {
    this.ensure(['canManageRegulatoryReports'], 'gestionar reportes a la CMF y la ANCI');
    const flaw = this.flaws().find(f => f.id === flawId);
    const report = flaw?.regulatoryReport;
    if (!flaw || !report) return;
    const pending = this.pendingClosingMilestones(report);
    if (pending.length) throw new Error(`Antes de cerrar registre: ${pending.map(m => m.name).join(', ')}.`);
    this.patchFlaw(flawId, { regulatoryReport: { ...report, status: 'Cerrado', closedAt: new Date().toISOString() } });
    await this.appendAuditLog('CIERRE_REPORTE_REGULATORIO', 'Reporte Regulatorio', flawId, `Reporte regulatorio de "${flaw.title}" cerrado.`);
  }

  async updateRegulatoryMilestones(list: RegulatoryMilestoneTemplate[]) {
    this.ensure(['canManageRegulatoryReports'], 'configurar plazos regulatorios');
    this.regulatoryMilestones.set(list.map(m => ({ ...m, deadlineMinutes: Math.max(1, Math.round(m.deadlineMinutes)) })));
    const desc = list.map(m => `${m.name}: ${m.enabled ? formatMinutes(m.deadlineMinutes) : 'desactivado'}`).join('; ');
    await this.appendAuditLog('CONFIGURACIÓN_PLAZOS_REGULATORIOS', 'Reporte Regulatorio', 'PLAZOS', `Plazos regulatorios actualizados. ${desc}.`);
  }

  private patchFlaw(id: string, updates: Partial<OperationalFlaw>) {
    this.flaws.update(list => list.map(f => (f.id === id ? { ...f, ...updates } : f)));
  }

  // Report a new incident / flaw (Registro de Incidencia / Evento de Pérdida o Falla de Control)
  async reportFlaw(flawData: Partial<OperationalFlaw>): Promise<OperationalFlaw> {
    this.ensure(['canReportFlaws'], 'registrar incidencias');
    const newFlaw: OperationalFlaw = {
      id: `inc-${Date.now()}`,
      title: flawData.title || 'Incidencia operacional reportada',
      description: flawData.description || '',
      reportedBy: flawData.reportedBy || this.currentProfile().name,
      process: this.closestProcess(flawData.process || ''),
      severity: flawData.severity || 'Alta',
      reportedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'Pendiente de Evaluación',
      incidentType: flawData.incidentType || 'Falla de Control',
      realLossAmountUSD: flawData.realLossAmountUSD || 0,
      recoveredAmountUSD: flawData.recoveredAmountUSD || 0,
      impactedSystemOrAccount: flawData.impactedSystemOrAccount || '',
      aiSuggestedCategory: flawData.aiSuggestedCategory,
      aiSuggestedControls: flawData.aiSuggestedControls,
      aiAnalysis: flawData.aiAnalysis,
      businessLine: flawData.businessLine,
      baselCategory: flawData.baselCategory ?? flawData.aiSuggestedCategory,
      baselSubcategory: flawData.baselSubcategory,
      occurrenceDate: flawData.occurrenceDate,
      discoveryDate: flawData.discoveryDate,
      accountingDate: flawData.accountingDate,
      accountingAccount: flawData.accountingAccount,
      creditRiskBoundary: flawData.creditRiskBoundary,
      providerId: flawData.providerId
    };

    this.flaws.update(list => [newFlaw, ...list]);
    await this.appendAuditLog(
      'REPORTE_INCIDENCIA',
      'Incidencia',
      newFlaw.id,
      `Registro de incidencia (${newFlaw.incidentType}) en proceso ${newFlaw.process}: "${newFlaw.title}". Severidad: ${newFlaw.severity}.${newFlaw.realLossAmountUSD ? ` Pérdida real: ${this.catalog.formatMoney(newFlaw.realLossAmountUSD)}.` : ''}`
    );
    return newFlaw;
  }

  // Update an existing incident / event (Actualizar evento de pérdida o falla de control)
  async updateFlaw(id: string, updates: Partial<OperationalFlaw>): Promise<OperationalFlaw> {
    this.ensure(['canReportFlaws', 'canConvertFlaws', 'canManageRegulatoryReports'], 'editar incidencias');
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
      `Actualización de incidencia/evento "${updated.title}". Tipo: ${updated.incidentType || 'No especificado'}. Pérdida real: ${this.catalog.formatMoney(updated.realLossAmountUSD || 0)}.`
    );
    return updated;
  }

  // Convert an incident/flaw directly into an assessed risk
  async convertFlawToRisk(flawId: string, customData?: Partial<Risk>): Promise<Risk> {
    this.ensure(['canConvertFlaws'], 'convertir incidencias en riesgos');
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
    this.ensure(['canConfigureKRIs', 'canAcknowledgeAlerts', 'canReportFlaws'], 'generar alertas');
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
      process: this.closestProcess(alertData.process || ''),
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
    this.ensure(['canAcknowledgeAlerts'], 'gestionar alertas');
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
  /** Puntaje de cumplimiento: 100 menos descuentos por hallazgo (mismo criterio que antes). */
  auditScore(findings: AuditFinding[]): number {
    const d = findings.filter(f => f.type === 'No Conformidad Mayor').length * 15
      + findings.filter(f => f.type === 'No Conformidad Menor').length * 8
      + findings.filter(f => f.type === 'Observación').length * 3;
    return Math.max(0, 100 - d);
  }

  /** Promedio de las auditorías finalizadas o aprobadas (null si no hay). */
  readonly globalAuditScore = computed<number | null>(() => {
    const done = this.audits().filter(a => a.status === 'Finalizada' || a.status === 'Aprobada');
    return done.length ? Math.round(done.reduce((s, a) => s + a.complianceScore, 0) / done.length) : null;
  });

  nextAuditCode(): string {
    const year = new Date().getFullYear();
    const max = this.audits().reduce((m, a) => {
      const mm = a.code.match(/(\d+)$/);
      return a.code.includes(String(year)) && mm ? Math.max(m, Number(mm[1])) : m;
    }, 0);
    return `AUD-${year}-${String(max + 1).padStart(2, '0')}`;
  }

  /** Crea o actualiza una auditoría (plan, alcance, estado). El puntaje se calcula de los hallazgos. */
  async saveAudit(data: PeriodicAudit) {
    this.ensure(['canExecuteAudits'], 'registrar o editar auditorías');
    const prev = this.audits().find(a => a.id === data.id);
    const audit: PeriodicAudit = { ...data, complianceScore: this.auditScore(data.findings) };
    this.audits.update(list => (prev ? list.map(a => (a.id === audit.id ? audit : a)) : [...list, audit]));
    await this.appendAuditLog(prev ? 'MODIFICACIÓN_AUDITORÍA' : 'AUDITORÍA_REGISTRADA', 'Auditoría', audit.code,
      prev ? `Auditoría ${audit.code} actualizada${prev.status !== audit.status ? `: estado ${prev.status} → ${audit.status}` : ''}.`
        : `Auditoría planificada: ${audit.code} "${audit.title}" (${audit.type}, ${audit.period}). Auditor líder: ${audit.leadAuditor}.`);
  }

  async deleteAudit(auditId: string) {
    this.ensure(['canExecuteAudits'], 'eliminar auditorías');
    const audit = this.audits().find(a => a.id === auditId);
    if (!audit) return;
    this.audits.update(list => list.filter(a => a.id !== auditId));
    await this.appendAuditLog('MODIFICACIÓN_AUDITORÍA', 'Auditoría', audit.code, `Auditoría eliminada: ${audit.code} "${audit.title}" (${audit.findings.length} hallazgos).`);
  }

  /** Crea o actualiza un hallazgo y recalcula el puntaje. */
  async saveAuditFinding(auditId: string, finding: AuditFinding) {
    this.ensure(['canExecuteAudits'], 'registrar hallazgos de auditoría');
    const audit = this.audits().find(a => a.id === auditId);
    if (!audit) return;
    const exists = audit.findings.some(f => f.id === finding.id);
    const findings = exists ? audit.findings.map(f => (f.id === finding.id ? finding : f)) : [...audit.findings, finding];
    const score = this.auditScore(findings);
    this.audits.update(list => list.map(a => (a.id === auditId ? { ...a, findings, complianceScore: score } : a)));
    await this.appendAuditLog(exists ? 'MODIFICACIÓN_AUDITORÍA' : 'AUDITORÍA_REGISTRADA', 'Auditoría', audit.code,
      `${exists ? 'Hallazgo actualizado' : 'Hallazgo registrado'} (${finding.type}, ${finding.status}) en ${audit.code}: "${finding.description.slice(0, 120)}". Puntaje ${score}%.`);
  }

  async deleteAuditFinding(auditId: string, findingId: string) {
    this.ensure(['canExecuteAudits'], 'eliminar hallazgos de auditoría');
    const audit = this.audits().find(a => a.id === auditId);
    const finding = audit?.findings.find(f => f.id === findingId);
    if (!audit || !finding) return;
    const findings = audit.findings.filter(f => f.id !== findingId);
    const score = this.auditScore(findings);
    this.audits.update(list => list.map(a => (a.id === auditId ? { ...a, findings, complianceScore: score } : a)));
    await this.appendAuditLog('MODIFICACIÓN_AUDITORÍA', 'Auditoría', audit.code, `Hallazgo eliminado en ${audit.code}: "${finding.description.slice(0, 120)}". Puntaje ${score}%.`);
  }

  async addAuditFinding(auditId: string, finding: Omit<AuditFinding, 'id'>) {
    this.ensure(['canExecuteAudits'], 'registrar hallazgos de auditoría');
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
  exportToExcel(type: 'risks' | 'controls' | 'audit_trail' | 'loss_database' | 'complete') {
    this.ensure(['canExportReports'], 'exportar reportes');
    const csvContentStart = '\uFEFF'; // UTF-8 BOM for Excel to properly render accents and special characters
    const now = new Date().toISOString().slice(0, 10);
    const filename = `RiskGuard_Riesgo_Operacional_${type}_${now}.csv`;
    let csvContent = csvContentStart;

    if (type === 'risks' || type === 'complete') {
      csvContent += 'MATRIZ DE GESTIÓN DE RIESGO OPERACIONAL - CUSTODIA RISK\n';
      csvContent += `Fecha de Exportación:;${new Date().toLocaleString()};Generado Por:;${this.currentProfile().name} (${this.currentProfile().role})\n\n`;
      csvContent += `Código;Título;Proceso;Categoría Basilea;Riesgo Inherente Prob;Riesgo Inherente Imp;Score Inherente;Nivel Inherente;Exposición ${this.currencyCode()};Controles Aplicados;Score Residual;Nivel Residual;Exposición Residual ${this.currencyCode()};Estado;Plan de Mitigación;Avance Plan %\n`;

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

    if (type === 'loss_database' || type === 'complete') {
      const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      csvContent += 'BASE DE PÉRDIDAS OPERACIONALES\n';
      csvContent += `Umbral de registro (${this.currencyCode()}):;${this.lossRegistrationThresholdUSD()}\n`;
      csvContent += `ID;Título;Línea de Negocio;Categoría Basilea (N1);Subcategoría (N2);Proceso;Fecha Ocurrencia;Fecha Descubrimiento;Fecha Contabilización;Cuenta Contable;Pérdida Bruta ${this.currencyCode()};Recuperaciones ${this.currencyCode()};Pérdida Neta ${this.currencyCode()};Sobre Umbral;Frontera Riesgo de Crédito;Reporte CMF;Reporte ANCI\n`;
      this.lossDatabase().forEach(f => {
        csvContent += [
          q(f.id), q(f.title), q(f.businessLine), q(f.baselCategory ?? f.aiSuggestedCategory), q(f.baselSubcategory), q(f.process),
          q(f.occurrenceDate), q(f.discoveryDate), q(f.accountingDate), q(this.catalog.accountLabel(f.accountingAccount)),
          f.realLossAmountUSD || 0, f.recoveredAmountUSD || 0, this.netLoss(f),
          q(this.isAboveLossThreshold(f) ? 'Sí' : 'No'), q(f.creditRiskBoundary ? 'Sí' : 'No'),
          q(f.regulatoryReport?.reportableToCMF ? 'Sí' : 'No'), q(f.regulatoryReport?.reportableToANCI ? 'Sí' : 'No'),
        ].join(';') + '\n';
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
