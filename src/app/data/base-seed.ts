import { OrganizationalRole, RegulatoryMilestoneTemplate, UserPermissions } from '../models/risk.model';

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
  };
  for (const k of keys) base[k] = true;
  return base;
}

const ALL_PERMISSIONS: (keyof UserPermissions)[] = [
  'canEditRisks', 'canEvaluateControls', 'canExecuteAudits', 'canReportFlaws', 'canConvertFlaws',
  'canAcknowledgeAlerts', 'canConfigureKRIs', 'canManageRoles', 'canExportReports', 'canManageRegulatoryReports',
  'canManageProviders', 'canManageContinuity',
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
    permissions: grant('canEditRisks', 'canReportFlaws', 'canConvertFlaws', 'canAcknowledgeAlerts', 'canExportReports', 'canManageRegulatoryReports', 'canManageProviders', 'canManageContinuity'),
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
    permissions: grant('canEditRisks', 'canEvaluateControls', 'canExecuteAudits', 'canReportFlaws', 'canConvertFlaws', 'canAcknowledgeAlerts', 'canConfigureKRIs', 'canExportReports', 'canManageRegulatoryReports', 'canManageProviders', 'canManageContinuity'),
  },
  {
    id: 'role-cumplimiento',
    title: 'Oficial de Cumplimiento',
    department: 'Cumplimiento y Prevención de Lavado de Activos',
    description: 'Supervisa el cumplimiento normativo, la prevención de lavado de activos (Ley 19.913 / UAF) y los reportes regulatorios.',
    badge: 'Cumplimiento',
    isSystemRole: false,
    permissions: grant('canEvaluateControls', 'canExecuteAudits', 'canReportFlaws', 'canAcknowledgeAlerts', 'canConfigureKRIs', 'canExportReports', 'canManageRegulatoryReports'),
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
 * Plazos de reporte por defecto, contados desde la toma de conocimiento.
 * Son valores referenciales y configurables: deben validarse con Cumplimiento
 * contra el texto vigente de la RAN CACs (CMF) y la Ley 21.663 (ANCI).
 */
export const DEFAULT_REGULATORY_MILESTONES: RegulatoryMilestoneTemplate[] = [
  { id: 'cmf-aviso-inicial', authority: 'CMF', name: 'Aviso inicial a la CMF', deadlineMinutes: 30, enabled: true },
  { id: 'anci-alerta-temprana', authority: 'ANCI', name: 'Alerta temprana a la ANCI (CSIRT Nacional)', deadlineMinutes: 3 * 60, enabled: true },
  { id: 'anci-segundo-informe', authority: 'ANCI', name: 'Segundo informe a la ANCI', deadlineMinutes: 72 * 60, enabled: true },
  { id: 'anci-informe-final', authority: 'ANCI', name: 'Informe final a la ANCI', deadlineMinutes: 15 * 24 * 60, enabled: true },
];
