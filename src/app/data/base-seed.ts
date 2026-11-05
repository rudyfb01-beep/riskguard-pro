import { OrganizationalRole, RegulatoryMilestoneTemplate, UserPermissions } from '../models/risk.model';
import { BusinessProcess, OrgArea } from '../models/catalog.model';

// Datos base: se cargan en una instalación nueva aunque no se usen datos de ejemplo.

/** Construye una matriz de permisos a partir de la lista de permisos concedidos. */
function grant(...keys: (keyof UserPermissions)[]): UserPermissions {
  const base: UserPermissions = {
    canEditRisks: false,
    canEvaluateControls: false,
    canExecuteAudits: false,
    canReportFlaws: false,
    canConvertFlaws: false,
    canAcknowledgeAlerts: false,
    canConfigureKRIs: false,
    canManageRoles: false,
    canExportReports: false,
    canManageRegulatoryReports: false,
    canManageProviders: false,
    canManageContinuity: false,
    canManageInfoSecurity: false,
    canManageCatalogs: false,
    canManageCompliance: false,
  };
  for (const k of keys) base[k] = true;
  return base;
}

const ALL_PERMISSIONS: (keyof UserPermissions)[] = [
  'canEditRisks', 'canEvaluateControls', 'canExecuteAudits', 'canReportFlaws', 'canConvertFlaws',
  'canAcknowledgeAlerts', 'canConfigureKRIs', 'canManageRoles', 'canExportReports', 'canManageRegulatoryReports',
  'canManageProviders', 'canManageContinuity', 'canManageInfoSecurity', 'canManageCatalogs', 'canManageCompliance',
];

/**
 * Cargos de gobierno corporativo de una Cooperativa de Ahorro y Crédito
 * (Consejo de Administración, Junta de Vigilancia, Comité de Riesgos, etc.).
 */
export const DEFAULT_ORGANIZATIONAL_ROLES: OrganizationalRole[] = [
  {
    id: 'role-riesgo-op',
    title: 'Jefe de Riesgo Operacional',
    department: 'Gerencia de Riesgos',
    description: 'Administra el marco de gestión de riesgo operacional, la base de pérdidas y el reporte de incidentes a la CMF y la ANCI.',
    badge: 'Super Administrador',
    isSystemRole: true,
    permissions: grant(...ALL_PERMISSIONS),
  },
  {
    id: 'role-gerencia-general',
    title: 'Gerente General',
    department: 'Gerencia General',
    description: 'Responsable ante el Consejo de la implementación del marco de riesgos; toma conocimiento y autoriza los reportes de incidentes al regulador.',
    badge: 'Alta Administración',
    isSystemRole: true,
    permissions: grant('canEditRisks', 'canReportFlaws', 'canConvertFlaws', 'canAcknowledgeAlerts', 'canExportReports', 'canManageRegulatoryReports', 'canManageProviders', 'canManageContinuity', 'canManageInfoSecurity'),
  },
  {
    id: 'role-auditoria-interna',
    title: 'Auditor Interno',
    department: 'Auditoría Interna',
    description: 'Evalúa de forma independiente la efectividad de controles y del marco de gestión; reporta al Comité de Auditoría y al Consejo.',
    badge: 'Tercera Línea',
    isSystemRole: true,
    permissions: grant('canEvaluateControls', 'canExecuteAudits', 'canReportFlaws', 'canAcknowledgeAlerts', 'canExportReports'),
  },
  {
    id: 'role-ops',
    title: 'Gerente de Operaciones',
    department: 'Gerencia de Operaciones y Tecnología',
    description: 'Dueño de procesos operativos (créditos, captaciones, pagos y sucursales); mitiga riesgos de primera línea y reporta eventos de pérdida.',
    badge: 'Dueño de Proceso',
    isSystemRole: true,
    permissions: grant('canEditRisks', 'canReportFlaws', 'canConvertFlaws', 'canAcknowledgeAlerts', 'canConfigureKRIs', 'canExportReports', 'canManageProviders', 'canManageContinuity'),
  },
  {
    id: 'role-ciso',
    title: 'Oficial de Seguridad de la Información (CISO)',
    department: 'Seguridad de la Información y Ciberseguridad',
    description: 'Gestiona controles de ciberseguridad y la notificación de ciberincidentes a la ANCI y a la CMF.',
    badge: 'Ciberseguridad',
    isSystemRole: false,
    permissions: grant('canEditRisks', 'canEvaluateControls', 'canExecuteAudits', 'canReportFlaws', 'canConvertFlaws', 'canAcknowledgeAlerts', 'canConfigureKRIs', 'canExportReports', 'canManageRegulatoryReports', 'canManageProviders', 'canManageContinuity', 'canManageInfoSecurity'),
  },
  {
    id: 'role-cumplimiento',
    title: 'Oficial de Cumplimiento',
    department: 'Cumplimiento y Prevención de Lavado de Activos',
    description: 'Supervisa el cumplimiento normativo, la prevención de lavado de activos (Ley 19.913 / UAF) y los reportes regulatorios.',
    badge: 'Cumplimiento',
    isSystemRole: false,
    permissions: grant('canEvaluateControls', 'canExecuteAudits', 'canReportFlaws', 'canAcknowledgeAlerts', 'canConfigureKRIs', 'canExportReports', 'canManageRegulatoryReports', 'canManageCompliance'),
  },
  {
    id: 'role-comite-riesgos',
    title: 'Comité de Riesgos',
    department: 'Gobierno Corporativo',
    description: 'Instancia de consejeros y alta administración que revisa el perfil de riesgo, el apetito de riesgo y los incidentes relevantes.',
    badge: 'Gobierno Corporativo',
    isSystemRole: true,
    permissions: grant('canExportReports'),
  },
  {
    id: 'role-consejo',
    title: 'Consejo de Administración',
    department: 'Gobierno Corporativo',
    description: 'Órgano responsable de aprobar las políticas de gestión de riesgos y de velar por su cumplimiento.',
    badge: 'Consejo',
    isSystemRole: true,
    permissions: grant('canExportReports'),
  },
  {
    id: 'role-junta-vigilancia',
    title: 'Junta de Vigilancia',
    department: 'Gobierno Corporativo',
    description: 'Órgano fiscalizador interno de la cooperativa; revisa la administración, los estados financieros y los informes de auditoría.',
    badge: 'Fiscalización Interna',
    isSystemRole: true,
    permissions: grant('canExportReports'),
  },
];

/** Formatea minutos como "30 min", "3 h", "15 días". */
export function formatMinutes(min: number): string {
  if (min % (24 * 60) === 0) return `${min / (24 * 60)} día${min === 24 * 60 ? '' : 's'}`;
  if (min % 60 === 0) return `${min / 60} h`;
  if (min > 60) return `${Math.floor(min / 60)} h ${min % 60} min`;
  return `${min} min`;
}

/**
 * Plazos de reporte por defecto.
 * CMF: la RAN CACs (CAC-3 §5.2, NCG 567) remite al N°1.1 del Capítulo 20-8 de la
 * RAN de bancos: reporte inicial dentro de 30 minutos desde la ocurrencia y
 * reporte de cierre al terminar el incidente.
 * ANCI (Ley 21.663): plazos desde la toma de conocimiento; validar con Cumplimiento.
 */
export const DEFAULT_REGULATORY_MILESTONES: RegulatoryMilestoneTemplate[] = [
  { id: 'cmf-aviso-inicial', authority: 'CMF', name: 'Reporte inicial a la CMF (RAN 20-8)', deadlineMinutes: 30, enabled: true, basis: 'ocurrencia' },
  { id: 'cmf-reporte-cierre', authority: 'CMF', name: 'Reporte de cierre a la CMF (RAN 20-8)', deadlineMinutes: 1, enabled: true, basis: 'ocurrencia', dueOnClose: true },
  { id: 'anci-alerta-temprana', authority: 'ANCI', name: 'Alerta temprana a la ANCI (CSIRT Nacional)', deadlineMinutes: 3 * 60, enabled: true, basis: 'conocimiento' },
  { id: 'anci-segundo-informe', authority: 'ANCI', name: 'Segundo informe a la ANCI', deadlineMinutes: 72 * 60, enabled: true, basis: 'conocimiento' },
  { id: 'anci-informe-final', authority: 'ANCI', name: 'Informe final a la ANCI', deadlineMinutes: 15 * 24 * 60, enabled: true, basis: 'conocimiento' },
];

// -----------------------------------------------------------------------------
// Mantenedores: áreas y mapa de procesos de referencia para una cooperativa
// -----------------------------------------------------------------------------

const area = (id: string, name: string, description: string): OrgArea => ({ id, name, manager: '', description, active: true });

/** Áreas base. Incluyen las de los cargos de gobierno para que los puestos queden asociados. */
export const DEFAULT_AREAS: OrgArea[] = [
  area('area-gobierno', 'Gobierno Corporativo', 'Consejo de Administración, Junta de Vigilancia y comités.'),
  area('area-gerencia-general', 'Gerencia General', ''),
  area('area-riesgos', 'Gerencia de Riesgos', 'Riesgo operacional, de crédito, de mercado y de liquidez.'),
  area('area-comercial', 'Gerencia Comercial', 'Captaciones, créditos, socios y sucursales.'),
  area('area-operaciones', 'Gerencia de Operaciones y Tecnología', 'Operaciones, medios de pago, tecnología y proveedores.'),
  area('area-finanzas', 'Gerencia de Finanzas', 'Tesorería, inversiones y contabilidad.'),
  area('area-seguridad', 'Seguridad de la Información y Ciberseguridad', ''),
  area('area-cumplimiento', 'Cumplimiento y Prevención de Lavado de Activos', ''),
  area('area-personas', 'Gerencia de Personas', ''),
  area('area-auditoria', 'Auditoría Interna', 'Reporta al Consejo de Administración.'),
];

const proc = (
  n: number, name: string, areaId: string, businessLine: BusinessProcess['businessLine'], criticality: BusinessProcess['criticality'], description = ''
): BusinessProcess => ({
  id: `proc-${String(n).padStart(2, '0')}`, code: `PRC-${String(n).padStart(2, '0')}`, name, areaId, owner: '',
  businessLine, criticality, description, active: true,
});

/** Mapa de procesos de referencia para una CAC (se ajusta en Mantenedores). */
export const COOPERATIVE_PROCESSES: BusinessProcess[] = [
  proc(1, 'Captaciones y ahorro', 'area-comercial', 'Captaciones y Ahorro', 'Crítico', 'Depósitos, cuentas de ahorro y libretas.'),
  proc(2, 'Otorgamiento de créditos', 'area-comercial', 'Créditos de Consumo', 'Crítico', 'Evaluación, aprobación, curse y desembolso.'),
  proc(3, 'Cobranza y normalización', 'area-comercial', 'Créditos de Consumo', 'Alto'),
  proc(4, 'Socios y cuotas de participación', 'area-comercial', 'Cuotas de Participación', 'Alto', 'Ingreso, retiro de socios y remanentes.'),
  proc(5, 'Atención a socios y sucursales', 'area-comercial', 'Soporte Corporativo', 'Alto'),
  proc(6, 'Medios y canales de pago', 'area-operaciones', 'Medios y Canales de Pago', 'Crítico', 'Transferencias, tarjetas, recaudación y canales digitales.'),
  proc(7, 'Tesorería e inversiones', 'area-finanzas', 'Tesorería e Inversiones', 'Crítico'),
  proc(8, 'Contabilidad y reportes regulatorios', 'area-finanzas', 'Soporte Corporativo', 'Alto'),
  proc(9, 'Tecnología e infraestructura', 'area-operaciones', 'Soporte Corporativo', 'Crítico'),
  proc(10, 'Ciberseguridad', 'area-seguridad', 'Soporte Corporativo', 'Crítico'),
  proc(11, 'Proveedores y externalización', 'area-operaciones', 'Soporte Corporativo', 'Alto'),
  proc(12, 'Prevención de lavado de activos y cumplimiento', 'area-cumplimiento', 'Soporte Corporativo', 'Alto'),
  proc(13, 'Gestión de personas', 'area-personas', 'Soporte Corporativo', 'Medio'),
  proc(14, 'Gobierno corporativo y gestión de riesgos', 'area-riesgos', 'Soporte Corporativo', 'Alto'),
];
