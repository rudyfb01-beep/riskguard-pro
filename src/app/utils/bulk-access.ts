import { UserPermissions } from '../models/risk.model';

/**
 * Permisos que habilitan algún tipo de carga masiva (o los importadores de riesgos y requisitos).
 * Archivo aparte para que el menú no cargue todo el motor de importación.
 */
export const BULK_ACCESS_PERMISSIONS: (keyof UserPermissions)[] = [
  'canManageCatalogs', 'canManageRoles', 'canEvaluateControls', 'canEditRisks', 'canManageProviders', 'canManageInfoSecurity',
  'canManageRegulatoryReports', 'canConvertFlaws', 'canManageCompliance',
];

export const canOpenBulkImport = (p: Partial<UserPermissions> | undefined) => BULK_ACCESS_PERMISSIONS.some(k => !!p?.[k]);
