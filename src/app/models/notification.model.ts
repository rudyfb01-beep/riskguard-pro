// =============================================================================
// NOTIFICACIONES
// Avisos para cada persona (bandeja en la aplicación y correo): asignaciones,
// aprobaciones pendientes, plazos por vencer o vencidos y eventos críticos.
// =============================================================================

export type NotificationCategory =
  | 'Aprobaciones'
  | 'Planes de acción'
  | 'Autoevaluaciones'
  | 'Incidentes'
  | 'Alertas KRI'
  | 'Continuidad'
  | 'Seguridad'
  | 'Riesgos'
  | 'Proveedores'
  | 'Documentos';

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  'Aprobaciones', 'Planes de acción', 'Autoevaluaciones', 'Incidentes', 'Alertas KRI', 'Continuidad', 'Seguridad', 'Riesgos', 'Proveedores', 'Documentos',
];

export type NotificationSeverity = 'info' | 'aviso' | 'urgente';

/** Estado del correo: pendiente de envío, enviado, incluido en el resumen diario, omitido (preferencia o sin SMTP) o con error. */
export type EmailStatus = 'pendiente' | 'enviado' | 'resumen' | 'omitido' | 'error';

export interface AppNotification {
  id: string;
  recipient: string;        // correo (minúsculas)
  recipientName: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  tab?: string;             // pestaña de la aplicación
  entityType?: string;      // entidad (nombre de la API) para abrir el registro
  entityId?: string;
  createdAt: string;        // ISO
  readAt?: string;
  emailStatus?: EmailStatus;
  emailError?: string;
  emailSentAt?: string;
  dedupeKey: string;        // evita repetir el mismo aviso
}

export type NotificationDraft = Omit<AppNotification, 'id' | 'createdAt' | 'readAt' | 'emailStatus' | 'emailError' | 'emailSentAt'>;

/** Parámetros generales (Mantenedores). */
export interface NotificationSettings {
  emailEnabled: boolean;
  digestHour: number;            // hora local del resumen diario (0–23)
  planDueDays: number;           // aviso de plan por vencer
  surveyDueDays: number;         // aviso de autoevaluación por vencer
  approvalReminderDays: number;  // recordatorio de aprobación sin resolver
  escalationDays: number;        // días de atraso para escalar un plan a quien administra
  contractNoticeDays: number;    // aviso de contrato de proveedor por vencer
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailEnabled: true,
  digestHour: 8,
  planDueDays: 7,
  surveyDueDays: 3,
  approvalReminderDays: 3,
  escalationDays: 15,
  contractNoticeDays: 60,
};

/** Preferencia de cada persona. */
export type EmailMode = 'inmediato' | 'resumen' | 'ninguno';

export interface NotificationPreference {
  emailMode: EmailMode;
  muted: NotificationCategory[];   // categorías sin correo (siguen en la bandeja)
}

export const DEFAULT_NOTIFICATION_PREFERENCE: NotificationPreference = { emailMode: 'inmediato', muted: [] };
