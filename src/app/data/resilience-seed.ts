import { BiaProcess, ContinuityPlan, ContinuityTest, ContractClauseKey, ServiceProvider } from '../models/resilience.model';

/** Todas las cláusulas presentes, salvo las indicadas. */
function clausesExcept(...missing: ContractClauseKey[]): Record<ContractClauseKey, boolean> {
  const all: ContractClauseKey[] = [
    'regulatorAccess', 'auditRights', 'confidentiality', 'incidentNotification', 'continuity',
    'serviceLevels', 'subcontracting', 'dataLocation', 'termination',
  ];
  return Object.fromEntries(all.map(k => [k, !missing.includes(k)])) as Record<ContractClauseKey, boolean>;
}

// Proveedores de ejemplo (nombres ficticios).
export const SEED_PROVIDERS: ServiceProvider[] = [
  {
    id: 'prv-1', code: 'PRV-001', name: 'Núcleo Financiero SpA', taxId: '76.111.222-3',
    serviceDescription: 'Core financiero en modalidad SaaS: cuentas de ahorro, créditos, cuotas de participación y contabilidad.',
    category: 'Core financiero / Procesamiento de datos', criticality: 'Crítico', internalOwner: 'Ing. Carlos Mendoza',
    supportedProcesses: ['Créditos y Cobranza', 'Captaciones y Ahorro', 'Operaciones de Pago'], status: 'Activo',
    isCloud: true, cloudModel: 'SaaS', dataLocation: 'Chile', handlesMemberData: true, usesSubcontractors: true,
    contractStart: '2023-01-01', contractEnd: '2027-12-31', annualCostUSD: 420000,
    clauses: clausesExcept(), lastAssessmentDate: '2026-03-10', assessmentScore: 88,
    hasExitPlan: true, exitPlanNotes: 'Migración a proveedor alternativo en 9 meses con extracción completa de datos en formato estándar.',
    committedRtoHours: 4,
  },
  {
    id: 'prv-2', code: 'PRV-002', name: 'NubeSur Cloud Services', taxId: '77.333.444-5',
    serviceDescription: 'Infraestructura en la nube (IaaS) para el sitio alternativo de recuperación y respaldos.',
    category: 'Servicios en la nube', criticality: 'Crítico', internalOwner: 'Ing. Alejandro Vega',
    supportedProcesses: ['Infraestructura Cloud', 'Operaciones de Pago'], status: 'Activo',
    isCloud: true, cloudModel: 'IaaS', dataLocation: 'Extranjero', dataCountry: 'Estados Unidos', handlesMemberData: true, usesSubcontractors: false,
    contractStart: '2024-04-01', contractEnd: '2027-03-31', annualCostUSD: 185000,
    clauses: clausesExcept('regulatorAccess'), lastAssessmentDate: '2025-08-20', assessmentScore: 74,
    hasExitPlan: false, committedRtoHours: 8,
  },
  {
    id: 'prv-3', code: 'PRV-003', name: 'Pagos Andinos S.A.', taxId: '96.555.666-7',
    serviceDescription: 'Recaudación de cuotas de crédito por PAC/PAT y botón de pago.',
    category: 'Medios de pago y recaudación', criticality: 'Alto', internalOwner: 'Ing. Carlos Mendoza',
    supportedProcesses: ['Operaciones de Pago', 'Créditos y Cobranza'], status: 'Activo',
    isCloud: false, dataLocation: 'Chile', handlesMemberData: true, usesSubcontractors: false,
    contractStart: '2021-12-16', contractEnd: '2026-12-15', annualCostUSD: 64000,
    clauses: clausesExcept('termination'), lastAssessmentDate: '2026-05-02', assessmentScore: 79,
    hasExitPlan: true, exitPlanNotes: 'Recaudación transitoria vía cajas de sucursales.', committedRtoHours: 12,
  },
  {
    id: 'prv-4', code: 'PRV-004', name: 'Cobranzas del Pacífico Ltda.', taxId: '78.777.888-9',
    serviceDescription: 'Cobranza prejudicial y judicial de cartera morosa.',
    category: 'Cobranza externa', criticality: 'Medio', internalOwner: 'Dra. Sofía Valenzuela',
    supportedProcesses: ['Créditos y Cobranza'], status: 'Activo',
    isCloud: false, dataLocation: 'Chile', handlesMemberData: true, usesSubcontractors: true,
    contractStart: '2025-02-01', contractEnd: '2027-01-31', annualCostUSD: 38000,
    clauses: clausesExcept('auditRights', 'incidentNotification', 'subcontracting'),
    hasExitPlan: false,
  },
  {
    id: 'prv-5', code: 'PRV-005', name: 'Centinela SOC SpA', taxId: '76.999.000-1',
    serviceDescription: 'Centro de operaciones de seguridad 24x7: monitoreo, detección y respuesta a ciberincidentes.',
    category: 'Ciberseguridad (SOC / monitoreo)', criticality: 'Alto', internalOwner: 'Ing. Alejandro Vega',
    supportedProcesses: ['Ciberseguridad & TI'], status: 'Activo',
    isCloud: true, cloudModel: 'SaaS', dataLocation: 'Chile', handlesMemberData: false, usesSubcontractors: false,
    contractStart: '2025-07-01', contractEnd: '2028-06-30', annualCostUSD: 96000,
    clauses: clausesExcept(), lastAssessmentDate: '2026-07-15', assessmentScore: 92,
    hasExitPlan: true, exitPlanNotes: 'Traspaso de casos de uso y reglas de correlación al SOC alternativo.', committedRtoHours: 2,
  },
  {
    id: 'prv-6', code: 'PRV-006', name: 'Fono Socios Contact Center', taxId: '77.222.111-0',
    serviceDescription: 'Atención telefónica de socios y bloqueo de tarjetas fuera de horario.',
    category: 'Atención telefónica / Contact center', criticality: 'Medio', internalOwner: 'Sr. Patricio Rojas',
    supportedProcesses: ['Atención a Socios y Sucursales'], status: 'En término',
    isCloud: false, dataLocation: 'Chile', handlesMemberData: true, usesSubcontractors: false,
    contractStart: '2022-10-01', contractEnd: '2026-09-30', annualCostUSD: 52000,
    clauses: clausesExcept('continuity'), lastAssessmentDate: '2025-11-05', assessmentScore: 68,
    hasExitPlan: true, exitPlanNotes: 'Internalización del servicio en curso.',
  },
];

// Procesos críticos con su análisis de impacto (BIA).
export const SEED_BIA: BiaProcess[] = [
  {
    id: 'bia-1', name: 'Otorgamiento de créditos de consumo', owner: 'Ing. Carlos Mendoza', businessLine: 'Créditos de Consumo',
    description: 'Evaluación, aprobación, curse y desembolso de créditos a socios.',
    impact: { financial: 3, members: 3, regulatory: 2, reputational: 3 }, mtpdHours: 48, rtoHours: 24, rpoHours: 4,
    systems: ['Core financiero', 'Motor de evaluación crediticia'], providerIds: ['prv-1'], minimumStaff: 6,
    alternateSite: 'Sucursal Casa Matriz / teletrabajo', lastReviewDate: '2026-04-15',
  },
  {
    id: 'bia-2', name: 'Depósitos y retiros de ahorro', owner: 'Ing. Carlos Mendoza', businessLine: 'Captaciones y Ahorro',
    description: 'Depósitos, retiros y consultas de saldo de cuentas de ahorro en sucursales y canales digitales.',
    impact: { financial: 4, members: 4, regulatory: 4, reputational: 4 }, mtpdHours: 8, rtoHours: 4, rpoHours: 0.25,
    systems: ['Core financiero', 'Plataforma de cajas'], providerIds: ['prv-1', 'prv-2'], minimumStaff: 12,
    alternateSite: 'Sitio alterno en la nube + sucursales de respaldo', lastReviewDate: '2026-04-15',
  },
  {
    id: 'bia-3', name: 'Transferencias y pagos en canales digitales', owner: 'Ing. Alejandro Vega', businessLine: 'Medios y Canales de Pago',
    description: 'Transferencias electrónicas, pagos de créditos y servicios desde web y app de socios.',
    impact: { financial: 4, members: 4, regulatory: 3, reputational: 4 }, mtpdHours: 6, rtoHours: 4, rpoHours: 0.25,
    systems: ['Portal web y app de socios', 'Core financiero', 'Switch de transferencias'], providerIds: ['prv-1', 'prv-2'], minimumStaff: 4,
    alternateSite: 'Sitio alterno en la nube', lastReviewDate: '2026-04-15',
  },
  {
    id: 'bia-4', name: 'Recaudación de cuotas de crédito', owner: 'Ing. Carlos Mendoza', businessLine: 'Créditos de Consumo',
    description: 'Cobro de cuotas por descuento por planilla, PAC/PAT y botón de pago.',
    impact: { financial: 3, members: 3, regulatory: 2, reputational: 2 }, mtpdHours: 72, rtoHours: 24, rpoHours: 24,
    systems: ['Core financiero', 'Plataforma de recaudación'], providerIds: ['prv-3'], minimumStaff: 3,
    alternateSite: 'Cajas de sucursales', lastReviewDate: '2026-04-15',
  },
  {
    id: 'bia-5', name: 'Cobranza de cartera morosa', owner: 'Dra. Sofía Valenzuela', businessLine: 'Créditos de Consumo',
    description: 'Gestión de cobranza prejudicial y judicial.',
    impact: { financial: 2, members: 2, regulatory: 2, reputational: 2 }, mtpdHours: 120, rtoHours: 72, rpoHours: 24,
    systems: ['Core financiero', 'Sistema de cobranza'], providerIds: ['prv-4'], minimumStaff: 2,
    alternateSite: 'Teletrabajo', lastReviewDate: '2026-04-15',
  },
  {
    id: 'bia-6', name: 'Reportes normativos a la CMF y la UAF', owner: 'Dra. Sofía Valenzuela', businessLine: 'Soporte Corporativo',
    description: 'Generación y envío de archivos normativos y reportes de operaciones sospechosas.',
    impact: { financial: 2, members: 1, regulatory: 4, reputational: 3 }, mtpdHours: 48, rtoHours: 24, rpoHours: 24,
    systems: ['Core financiero', 'Plataforma de cumplimiento'], providerIds: [], minimumStaff: 2,
    alternateSite: 'Teletrabajo', lastReviewDate: '2026-04-15',
  },
  {
    id: 'bia-7', name: 'Atención a socios en sucursales y contact center', owner: 'Sr. Patricio Rojas', businessLine: 'Captaciones y Ahorro',
    description: 'Atención presencial y telefónica, bloqueo de tarjetas y reclamos.',
    impact: { financial: 2, members: 4, regulatory: 2, reputational: 3 }, mtpdHours: 24, rtoHours: 12, rpoHours: 4,
    systems: ['Plataforma de atención', 'Telefonía IP'], providerIds: ['prv-6'], minimumStaff: 10,
    alternateSite: 'Sucursales cercanas', lastReviewDate: '2025-06-10',
  },
];

export const SEED_PLANS: ContinuityPlan[] = [
  {
    id: 'pln-1', code: 'BCP-01', name: 'Plan de continuidad de operaciones con socios', type: 'Plan de Continuidad (BCP)',
    processIds: ['bia-2', 'bia-3', 'bia-4', 'bia-7'], owner: 'Ing. Carlos Mendoza', version: '3.1',
    approvedBy: 'Consejo de Administración', approvalDate: '2026-03-25', nextReviewDate: '2027-03-25', status: 'Vigente',
  },
  {
    id: 'pln-2', code: 'DRP-01', name: 'Recuperación del centro de datos y core financiero', type: 'Recuperación ante Desastres (DRP)',
    processIds: ['bia-1', 'bia-2', 'bia-3'], owner: 'Ing. Alejandro Vega', version: '2.4',
    approvedBy: 'Gerente General', approvalDate: '2025-09-15', nextReviewDate: '2026-09-15', status: 'En actualización',
  },
  {
    id: 'pln-3', code: 'CRI-01', name: 'Plan de gestión de crisis', type: 'Gestión de Crisis',
    processIds: [], owner: 'Sr. Patricio Rojas', version: '1.2',
    approvedBy: 'Consejo de Administración', approvalDate: '2026-01-20', nextReviewDate: '2027-01-20', status: 'Vigente',
  },
];

export const SEED_TESTS: ContinuityTest[] = [
  {
    id: 'tst-1', planId: 'pln-2', date: '2026-06-14', type: 'Prueba técnica DRP',
    scenario: 'Caída del centro de datos principal y conmutación al sitio alterno en la nube.',
    processId: 'bia-3', achievedRtoHours: 6.5, result: 'Con observaciones',
    findings: 'La restauración de la base del switch de transferencias tomó 4 horas más de lo previsto.',
    actions: 'Automatizar la restauración y repetir la prueba antes de diciembre.',
  },
  {
    id: 'tst-2', planId: 'pln-1', date: '2026-08-22', type: 'Simulacro',
    scenario: 'Corte eléctrico prolongado en Casa Matriz.',
    processId: 'bia-7', achievedRtoHours: 3, result: 'Exitosa',
    findings: 'Atención derivada a sucursales cercanas en 3 horas.',
    actions: 'Actualizar el árbol de llamadas del personal.',
  },
];
