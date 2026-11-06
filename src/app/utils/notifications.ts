import {
  AppNotification, DEFAULT_NOTIFICATION_SETTINGS, NotificationCategory, NotificationDraft, NotificationSettings, NotificationSeverity,
} from '../models/notification.model';
import { ActionPlan } from '../models/action-plan.model';
import { SurveyCampaign, SurveyResponse } from '../models/survey.model';
import { APPROVAL_KINDS, ApprovalRequest } from '../models/approval.model';
import { AnomalyAlert, KriNotificationPreferences, OperationalFlaw, Risk, UserPermissions } from '../models/risk.model';
import { ContinuityPlan, ServiceProvider } from '../models/resilience.model';
import { Vulnerability } from '../models/security.model';
import { isOpenPlan, personKey } from './action-plans';
import { approvalSummary, eligibleApprovers, lastActivity } from './approvals';
import { ControlledDocument } from '../models/document.model';
import { audienceOf, currentVersion, hasAcknowledged } from './documents';
import { CrisisCommittee, CrisisEvent } from '../models/crisis.model';
import { levelName } from './crisis';

export interface NotifyUser {
  name: string;
  email: string;
  roleId?: string;
  active?: boolean;
  permissions: Partial<UserPermissions>;
}

/** Completa los parámetros guardados con los valores por defecto y los acota. */
export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<NotificationSettings>;
  const num = (v: unknown, d: number, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  return {
    emailEnabled: typeof r.emailEnabled === 'boolean' ? r.emailEnabled : d.emailEnabled,
    digestHour: num(r.digestHour, d.digestHour, 0, 23),
    planDueDays: num(r.planDueDays, d.planDueDays, 0, 60),
    surveyDueDays: num(r.surveyDueDays, d.surveyDueDays, 0, 30),
    approvalReminderDays: num(r.approvalReminderDays, d.approvalReminderDays, 0, 30),
    escalationDays: num(r.escalationDays, d.escalationDays, 1, 180),
    contractNoticeDays: num(r.contractNoticeDays, d.contractNoticeDays, 0, 365),
  };
}

// -----------------------------------------------------------------------------
// Destinatarios
// -----------------------------------------------------------------------------

const activeUsers = (users: NotifyUser[]) => users.filter(u => u.active !== false && !!u.email);

export function userByName(name: string | undefined, users: NotifyUser[]): NotifyUser | undefined {
  if (!name?.trim()) return undefined;
  const k = personKey(name);
  return activeUsers(users).find(u => personKey(u.name) === k);
}

export function usersWithPermission(perm: keyof UserPermissions, users: NotifyUser[]): NotifyUser[] {
  return activeUsers(users).filter(u => !!u.permissions?.[perm]);
}

const notMe = (actorName: string | undefined) => (u: NotifyUser) => !actorName || personKey(u.name) !== personKey(actorName);

interface Base {
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  tab?: string;
  entityType?: string;
  entityId?: string;
}

/** Un aviso por destinatario; la clave de deduplicación incluye el correo. */
function forUsers(users: (NotifyUser | undefined)[], base: Base, key: string): NotificationDraft[] {
  const seen = new Set<string>();
  const out: NotificationDraft[] = [];
  for (const u of users) {
    if (!u?.email) continue;
    const email = u.email.trim().toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ ...base, recipient: email, recipientName: u.name, dedupeKey: `${key}|${email}` });
  }
  return out;
}

const DAY = 86_400_000;
export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(toDay.slice(0, 10) + 'T00:00:00Z') - Date.parse(fromDay.slice(0, 10) + 'T00:00:00Z')) / DAY);
}

// -----------------------------------------------------------------------------
// Avisos por cambios (los genera el servidor al guardar; en demostración, el cliente)
// -----------------------------------------------------------------------------

export interface ChangeContext {
  actorName: string;
  users: NotifyUser[];
  /** Campaña de la encuesta (survey-responses). */
  campaign?: SurveyCampaign | null;
  /** Preferencias de KRIs (alerts). */
  kriPreferences?: KriNotificationPreferences | null;
  /** Comité de Crisis (crisis-events). */
  committee?: CrisisCommittee | null;
  now: string;   // ISO
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function changeNotifications(entity: string, prev: any, next: any, ctx: ChangeContext): NotificationDraft[] {
  if (!next) return [];
  switch (entity) {
    case 'action-plans': return planChanges(prev, next, ctx);
    case 'survey-responses': return responseChanges(prev, next, ctx);
    case 'approvals': return approvalChanges(prev, next, ctx);
    case 'flaws': return flawChanges(prev, next, ctx);
    case 'alerts': return alertChanges(prev, next, ctx);
    case 'documents': return documentChanges(prev, next, ctx);
    case 'crisis-events': return crisisChanges(prev, next, ctx);
    default: return [];
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function planChanges(prev: ActionPlan | null, p: ActionPlan, ctx: ChangeContext): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  const owner = userByName(p.owner, ctx.users);
  const ref = { tab: 'planes-accion', entityType: 'action-plans', entityId: p.id, category: 'Planes de acción' as const };
  const ownerIfNotActor = owner && notMe(ctx.actorName)(owner) ? owner : undefined;
  if (!prev || personKey(prev.owner) !== personKey(p.owner)) {
    out.push(...forUsers([ownerIfNotActor], {
      ...ref, severity: 'aviso', title: `Se te asignó el plan ${p.code}`,
      body: `"${p.title}" (${p.sourceType}: ${p.sourceLabel}). Plazo: ${p.dueDate}. Prioridad ${p.priority}.`,
    }, `plan-assigned:${p.id}:${personKey(p.owner)}`));
  }
  if (!prev) return out;
  if (prev.status !== 'Por verificar' && p.status === 'Por verificar') {
    const managers = usersWithPermission('canManageActionPlans', ctx.users).filter(notMe(p.owner));
    out.push(...forUsers(managers, {
      ...ref, severity: 'aviso', title: `${p.code} espera verificación de cierre`,
      body: `${p.closure?.submittedBy ?? p.owner} envió "${p.title}" a verificación. Evidencia: ${p.closure?.evidence ?? '—'}`,
    }, `plan-verify:${p.id}:${p.closure?.submittedAt ?? ctx.now}`));
  }
  if (prev.status === 'Por verificar' && p.status === 'Cerrado') {
    out.push(...forUsers([ownerIfNotActor], {
      ...ref, severity: 'info', title: `${p.code} cerrado`, body: `${p.closure?.verifiedBy ?? ctx.actorName} verificó el cierre de "${p.title}".`,
    }, `plan-closed:${p.id}`));
  }
  if ((p.rejections?.length ?? 0) > (prev.rejections?.length ?? 0)) {
    const r = p.rejections![p.rejections!.length - 1];
    out.push(...forUsers([ownerIfNotActor], {
      ...ref, severity: 'aviso', title: `${p.code}: cierre devuelto`, body: `${r.verifiedBy ?? ctx.actorName} devolvió "${p.title}": ${r.note ?? ''}`,
    }, `plan-rejected:${p.id}:${p.rejections!.length}`));
  }
  if (p.reschedules.length > prev.reschedules.length) {
    const r = p.reschedules[p.reschedules.length - 1];
    out.push(...forUsers([ownerIfNotActor], {
      ...ref, severity: 'info', title: `${p.code} reprogramado al ${r.to}`, body: `"${p.title}": plazo ${r.from} → ${r.to}. Motivo: ${r.reason}`,
    }, `plan-rescheduled:${p.id}:${p.reschedules.length}`));
  }
  if (prev.status !== 'Cancelado' && p.status === 'Cancelado') {
    out.push(...forUsers([ownerIfNotActor], {
      ...ref, severity: 'info', title: `${p.code} cancelado`, body: `"${p.title}" fue cancelado: ${p.cancelReason ?? ''}`,
    }, `plan-cancelled:${p.id}`));
  }
  return out;
}

function responseChanges(prev: SurveyResponse | null, r: SurveyResponse, ctx: ChangeContext): NotificationDraft[] {
  const c = ctx.campaign;
  if (!c || c.status !== 'En curso') return [];
  const ref = { tab: 'autoevaluaciones', entityType: 'survey-responses', entityId: r.id, category: 'Autoevaluaciones' as const };
  const respondent = userByName(r.respondent, ctx.users);
  const out: NotificationDraft[] = [];
  if (!prev || personKey(prev.respondent) !== personKey(r.respondent)) {
    out.push(...forUsers([respondent].filter(u => u && notMe(ctx.actorName)(u)), {
      ...ref, severity: 'aviso', title: `Autoevaluación pendiente: ${c.title}`,
      body: `${c.code} · ${r.subject}: ${r.items.length} preguntas. Plazo: ${r.dueDate}.${c.description ? ` ${c.description}` : ''}`,
    }, `survey-assigned:${r.id}:${personKey(r.respondent)}`));
  }
  if (!prev) return out;
  if (prev.status !== 'Enviada' && r.status === 'Enviada') {
    out.push(...forUsers(usersWithPermission('canManageSurveys', ctx.users).filter(notMe(r.respondent)), {
      ...ref, severity: 'info', title: `${r.respondent} envió su autoevaluación`, body: `${c.code} · ${r.subject}: lista para revisar.`,
    }, `survey-submitted:${r.id}:${r.submittedAt ?? ctx.now}`));
  }
  if (prev.status !== 'Devuelta' && r.status === 'Devuelta') {
    out.push(...forUsers([respondent], {
      ...ref, severity: 'aviso', title: `Autoevaluación devuelta: ${r.subject}`, body: `${c.code}: ${r.returnedNote ?? 'revise las observaciones y vuelva a enviarla.'}`,
    }, `survey-returned:${r.id}:${ctx.now.slice(0, 16)}`));
  }
  if (prev.status !== 'Revisada' && r.status === 'Revisada') {
    out.push(...forUsers([respondent], {
      ...ref, severity: 'info', title: `Autoevaluación revisada: ${r.subject}`, body: `${c.code}: ${r.reviewedBy ?? ctx.actorName} revisó sus respuestas.${r.reviewNote ? ` ${r.reviewNote}` : ''}`,
    }, `survey-reviewed:${r.id}`));
  }
  return out;
}

function approvalChanges(prev: ApprovalRequest | null, r: ApprovalRequest, ctx: ChangeContext): NotificationDraft[] {
  const info = APPROVAL_KINDS[r.kind];
  const ref = { tab: 'aprobaciones', entityType: 'approvals', entityId: r.id, category: 'Aprobaciones' as const };
  const requester = userByName(r.requestedBy, ctx.users);
  const out: NotificationDraft[] = [];
  const toApprovers = (step: number, title: string, key: string) => out.push(...forUsers(eligibleApprovers(r, activeUsers(ctx.users), step), {
    ...ref, severity: 'urgente', title, body: `${approvalSummary(r)}. Solicitado por ${r.requestedBy}: ${r.justification}`,
  }, key));

  if (!prev) {
    toApprovers(0, `Aprobación pendiente: ${info.short} (${r.code})`, `approval-pending:${r.id}:0`);
    return out;
  }
  if (r.status === 'Pendiente' && r.currentStep > prev.currentStep) {
    const s = r.steps[prev.currentStep];
    toApprovers(r.currentStep, `Aprobación pendiente: ${info.short} (${r.code})`, `approval-pending:${r.id}:${r.currentStep}`);
    out.push(...forUsers([requester], {
      ...ref, severity: 'info', title: `${r.code}: aprobada por ${s.roleTitle}`,
      body: `${s.decidedBy} aprobó el nivel ${prev.currentStep + 1} de ${r.steps.length}. Pasa a ${r.steps[r.currentStep].roleTitle}.`,
    }, `approval-step:${r.id}:${prev.currentStep}`));
  }
  if (prev.status === 'Pendiente' && r.status === 'Aprobada') {
    const s = r.steps[r.steps.length - 1];
    out.push(...forUsers([requester], {
      ...ref, severity: 'info', title: `${r.code} aprobada: ${info.short}`, body: `${approvalSummary(r)}. Aprobó ${s.decidedBy}. ${info.effect}`,
    }, `approval-done:${r.id}`));
  }
  if (prev.status === 'Pendiente' && r.status === 'Rechazada') {
    const s = r.steps[r.currentStep];
    out.push(...forUsers([requester], {
      ...ref, severity: 'aviso', title: `${r.code} rechazada: ${info.short}`, body: `${s.decidedBy} (${s.roleTitle}) rechazó: ${s.comment ?? ''}`,
    }, `approval-rejected:${r.id}`));
  }
  if (prev.status === 'Pendiente' && r.status === 'Anulada') {
    out.push(...forUsers(eligibleApprovers(r, activeUsers(ctx.users)), {
      ...ref, severity: 'info', title: `${r.code} anulada`, body: `${r.requestedBy} anuló la solicitud: ${approvalSummary(r)}.`,
    }, `approval-cancelled:${r.id}`));
  }
  return out;
}

function flawChanges(prev: OperationalFlaw | null, f: OperationalFlaw, ctx: ChangeContext): NotificationDraft[] {
  if (prev || (f.severity !== 'Crítica' && f.severity !== 'Alta')) return [];
  const to = [...usersWithPermission('canConvertFlaws', ctx.users), ...usersWithPermission('canManageRegulatoryReports', ctx.users)].filter(notMe(ctx.actorName));
  return forUsers(to, {
    category: 'Incidentes', severity: f.severity === 'Crítica' ? 'urgente' : 'aviso', tab: 'incidentes-perdidas', entityType: 'flaws', entityId: f.id,
    title: `Incidente ${f.severity.toLowerCase()}: ${f.title}`,
    body: `Reportado por ${f.reportedBy} en ${f.process}. Revise si corresponde reportar a la CMF o la ANCI.`,
  }, `flaw-new:${f.id}`);
}

function documentChanges(prev: ControlledDocument | null, d: ControlledDocument, ctx: ChangeContext): NotificationDraft[] {
  const v = currentVersion(d);
  if (!v || (prev && prev.currentVersionId === d.currentVersionId)) return [];
  const ref = { category: 'Documentos' as const, tab: 'documentos', entityType: 'documents', entityId: d.id };
  return forUsers(audienceOf(d, activeUsers(ctx.users)), {
    ...ref, severity: 'aviso', title: `Nueva versión vigente: ${d.code} ${d.title} v${v.version}`,
    body: `Vigente desde ${v.effectiveDate ?? v.approvedAt}. ${v.changeSummary ? `Cambios: ${v.changeSummary}. ` : ''}Léala y confirme su lectura.`,
  }, `doc-ack:${d.id}:${v.id}`);
}

function alertChanges(prev: AnomalyAlert | null, a: AnomalyAlert, ctx: ChangeContext): NotificationDraft[] {
  if (prev) return [];
  const prefs = ctx.kriPreferences;
  const critical = a.severity === 'Crítico';
  const warning = a.severity === 'Alto' || a.severity === 'Medio';
  if (prefs && ((critical && !prefs.notifyOnCritical) || (warning && !prefs.notifyOnWarning) || (!critical && !warning))) return [];
  if (!prefs && !critical) return [];
  // Destinatarios: quienes atienden alertas y, si el correo de KRIs está activo, la lista configurada.
  const extra: NotifyUser[] = prefs?.emailEnabled
    ? prefs.emailRecipients.filter(e => /@/.test(e)).map(e => ctx.users.find(u => u.email.toLowerCase() === e.toLowerCase()) ?? { name: e, email: e, permissions: {} })
    : [];
  const officers = prefs?.escalateToRiskOfficer ? usersWithPermission('canEditRisks', ctx.users) : [];
  const to = [...usersWithPermission('canAcknowledgeAlerts', ctx.users), ...officers, ...extra];
  // Periodo de silencio: un aviso por KRI y ventana.
  const windowMin = Math.max(1, prefs?.cooldownMinutes ?? 0);
  const bucket = Math.floor(Date.parse(a.triggeredAt || ctx.now) / (windowMin * 60_000));
  return forUsers(to, {
    category: 'Alertas KRI', severity: critical ? 'urgente' : 'aviso', tab: 'alertas-kri', entityType: 'alerts', entityId: a.id,
    title: `Alerta ${a.severity.toLowerCase()}: ${a.title}`,
    body: `${a.kriMetric}: valor ${a.currentValue} (umbral ${a.threshold}) en ${a.process}.`,
  }, prefs?.cooldownMinutes ? `kri:${a.kriMetric}:${bucket}` : `alert:${a.id}`);
}

// -----------------------------------------------------------------------------
// Avisos por plazos (revisión periódica; la clave evita repetirlos)
// -----------------------------------------------------------------------------

export interface ScheduleData {
  users: NotifyUser[];
  actionPlans: ActionPlan[];
  surveyCampaigns: SurveyCampaign[];
  surveyResponses: SurveyResponse[];
  approvals: ApprovalRequest[];
  continuityPlans: ContinuityPlan[];
  vulnerabilities: Vulnerability[];
  risks: Risk[];
  providers: ServiceProvider[];
  documents: ControlledDocument[];
  crisisEvents?: CrisisEvent[];
  committee?: CrisisCommittee | null;
}

/**
 * Integrantes del Comité de Crisis como destinatarios: el usuario con ese nombre o, si es
 * externo a la aplicación, su correo del comité. Más quienes administran continuidad.
 */
export function crisisRecipients(committee: CrisisCommittee | null | undefined, users: NotifyUser[]): NotifyUser[] {
  const out: NotifyUser[] = [];
  for (const m of committee?.members ?? []) {
    const u = userByName(m.name, users);
    if (u) out.push(u);
    else if (m.email?.includes('@')) out.push({ name: m.name, email: m.email, permissions: {} });
  }
  return [...out, ...usersWithPermission('canManageContinuity', users)];
}

function crisisChanges(prev: CrisisEvent | null, e: CrisisEvent, ctx: ChangeContext): NotificationDraft[] {
  const to = crisisRecipients(ctx.committee, ctx.users).filter(notMe(ctx.actorName));
  const ref = { category: 'Continuidad' as const, tab: 'gestion-crisis', entityType: 'crisis-events', entityId: e.id };
  const drill = e.mode === 'Simulacro';
  if (e.status === 'Activa' && (!prev || prev.status === 'Programada')) {
    const where = [ctx.committee?.primaryRoom, ctx.committee?.virtualRoom].filter(Boolean).join(' · ');
    return forUsers(to, {
      ...ref, severity: drill ? 'aviso' : 'urgente',
      title: `${drill ? 'Simulacro iniciado' : 'Crisis declarada'}: ${e.code} · ${levelName(e.level)}`,
      body: `${e.title}. Declarada por ${e.declaredBy ?? ctx.actorName}.${where ? ` Comité: ${where}.` : ''} Revise la sala de crisis.`,
    }, `crisis-declared:${e.id}`);
  }
  if (!prev && e.status === 'Programada') {
    return forUsers(to, { ...ref, severity: 'info', title: `Simulacro programado: ${e.code}`, body: `${e.title}. Fecha: ${e.plannedDate}.` }, `crisis-planned:${e.id}:${e.plannedDate}`);
  }
  if (prev && prev.status !== 'Cerrada' && e.status === 'Cerrada') {
    return forUsers(to, {
      ...ref, severity: 'info', title: `${drill ? 'Simulacro' : 'Crisis'} cerrada: ${e.code}`, body: `${e.title}. ${e.closingSummary ?? ''}`.trim(),
    }, `crisis-closed:${e.id}`);
  }
  return [];
}

export function scheduledNotifications(d: ScheduleData, s: NotificationSettings, today: string): NotificationDraft[] {
  const data = d;
  const out: NotificationDraft[] = [];
  const users = d.users;
  const managers = usersWithPermission('canManageActionPlans', users);

  // Planes de acción por vencer, vencidos y escalados.
  for (const p of d.actionPlans) {
    if (!isOpenPlan(p) || p.status === 'Por verificar' || !p.dueDate) continue;
    const days = daysBetween(today, p.dueDate);
    const owner = userByName(p.owner, users);
    const ref = { category: 'Planes de acción' as const, tab: 'planes-accion', entityType: 'action-plans', entityId: p.id };
    if (days >= 0 && days <= s.planDueDays) {
      out.push(...forUsers([owner], {
        ...ref, severity: 'aviso', title: `${p.code} vence ${days === 0 ? 'hoy' : `en ${days} día${days === 1 ? '' : 's'}`}`,
        body: `"${p.title}" (${p.progressPct} % de avance). Plazo: ${p.dueDate}.`,
      }, `plan-due:${p.id}:${p.dueDate}`));
    } else if (days < 0) {
      out.push(...forUsers([owner], {
        ...ref, severity: 'urgente', title: `${p.code} está vencido`,
        body: `"${p.title}" venció el ${p.dueDate} (${p.progressPct} % de avance). Registre el avance o solicite reprogramarlo.`,
      }, `plan-overdue:${p.id}:${p.dueDate}`));
      if (-days >= s.escalationDays) {
        out.push(...forUsers(managers.filter(notMe(p.owner)), {
          ...ref, severity: 'urgente', title: `${p.code} lleva ${-days} días vencido`,
          body: `"${p.title}" de ${p.owner} venció el ${p.dueDate} con ${p.progressPct} % de avance.`,
        }, `plan-escalated:${p.id}:${p.dueDate}`));
      }
    }
  }

  // Autoevaluaciones por vencer o vencidas.
  const campaigns = new Map(d.surveyCampaigns.map(c => [c.id, c]));
  for (const r of d.surveyResponses) {
    const c = campaigns.get(r.campaignId);
    if (!c || c.status !== 'En curso' || !['Pendiente', 'En progreso', 'Devuelta'].includes(r.status)) continue;
    const days = daysBetween(today, r.dueDate);
    const ref = { category: 'Autoevaluaciones' as const, tab: 'autoevaluaciones', entityType: 'survey-responses', entityId: r.id };
    const who = userByName(r.respondent, users);
    if (days >= 0 && days <= s.surveyDueDays) {
      out.push(...forUsers([who], {
        ...ref, severity: 'aviso', title: `Autoevaluación por vencer: ${r.subject}`, body: `${c.code} · ${c.title}: plazo ${r.dueDate}.`,
      }, `survey-due:${r.id}:${r.dueDate}`));
    } else if (days < 0) {
      out.push(...forUsers([who], {
        ...ref, severity: 'urgente', title: `Autoevaluación vencida: ${r.subject}`, body: `${c.code} · ${c.title}: venció el ${r.dueDate}.`,
      }, `survey-overdue:${r.id}:${r.dueDate}`));
    }
  }

  // Aprobaciones sin resolver: recordatorio cada N días.
  for (const r of d.approvals) {
    if (r.status !== 'Pendiente' || s.approvalReminderDays <= 0) continue;
    const idle = daysBetween(lastActivity(r), today);
    if (idle < s.approvalReminderDays) continue;
    const n = Math.floor(idle / s.approvalReminderDays);
    out.push(...forUsers(eligibleApprovers(r, users.filter(u => u.active !== false)), {
      category: 'Aprobaciones', severity: 'urgente', tab: 'aprobaciones', entityType: 'approvals', entityId: r.id,
      title: `Recordatorio: ${r.code} espera su aprobación hace ${idle} días`, body: `${approvalSummary(r)}. Solicitado por ${r.requestedBy}.`,
    }, `approval-reminder:${r.id}:${r.currentStep}:${n}`));
  }

  // Planes de continuidad con revisión vencida o próxima.
  for (const p of d.continuityPlans) {
    if (!p.nextReviewDate) continue;
    const days = daysBetween(today, p.nextReviewDate);
    const to = [userByName(p.owner, users), ...usersWithPermission('canManageContinuity', users)];
    const ref = { category: 'Continuidad' as const, tab: 'continuidad', entityType: 'plans', entityId: p.id };
    if (days < 0) {
      out.push(...forUsers(to, { ...ref, severity: 'aviso', title: `${p.code}: revisión vencida`, body: `"${p.name}" debía revisarse el ${p.nextReviewDate}.` }, `bcp-review:${p.id}:${p.nextReviewDate}`));
    } else if (days <= 30) {
      out.push(...forUsers(to, { ...ref, severity: 'info', title: `${p.code}: revisión en ${days} días`, body: `"${p.name}" debe revisarse el ${p.nextReviewDate}.` }, `bcp-review-soon:${p.id}:${p.nextReviewDate}`));
    }
  }

  // Simulacros programados: aviso al comité una semana antes.
  for (const e of d.crisisEvents ?? []) {
    if (e.status !== 'Programada' || !e.plannedDate) continue;
    const days = daysBetween(today, e.plannedDate);
    if (days < 0 || days > 7) continue;
    out.push(...forUsers(crisisRecipients(d.committee, users), {
      category: 'Continuidad', tab: 'gestion-crisis', entityType: 'crisis-events', entityId: e.id, severity: 'aviso',
      title: `Simulacro ${e.code} ${days === 0 ? 'hoy' : `en ${days} día${days === 1 ? '' : 's'}`}`, body: `${e.title} (${e.plannedDate}).`,
    }, `crisis-drill:${e.id}:${e.plannedDate}`));
  }

  // Vulnerabilidades fuera de plazo y aceptaciones por revisar.
  const sec = usersWithPermission('canManageInfoSecurity', users);
  for (const v of d.vulnerabilities) {
    const ref = { category: 'Seguridad' as const, tab: 'seguridad-informacion', entityType: 'vulnerabilities', entityId: v.id };
    if ((v.status === 'Abierta' || v.status === 'En remediación') && v.dueDate && v.dueDate < today) {
      out.push(...forUsers([userByName(v.owner, users), ...sec], {
        ...ref, severity: v.severity === 'Crítica' || v.severity === 'Alta' ? 'urgente' : 'aviso',
        title: `${v.code} fuera de plazo (${v.severity})`, body: `"${v.title}" debía remediarse el ${v.dueDate}.`,
      }, `vuln-overdue:${v.id}:${v.dueDate}`));
    }
    if (v.status === 'Riesgo aceptado' && v.acceptance?.reviewDate && v.acceptance.reviewDate < today) {
      out.push(...forUsers(sec, {
        ...ref, severity: 'aviso', title: `${v.code}: revisar la aceptación`, body: `La aceptación de ${v.acceptance.approvedBy} venció el ${v.acceptance.reviewDate}.`,
      }, `vuln-acceptance:${v.id}:${v.acceptance.reviewDate}`));
    }
  }

  // Riesgos aceptados con revisión vencida.
  const riskOwners = usersWithPermission('canEditRisks', users);
  for (const r of d.risks) {
    if (!r.acceptance?.reviewDate || r.acceptance.reviewDate >= today) continue;
    out.push(...forUsers([userByName(r.responsible, users), ...riskOwners], {
      category: 'Riesgos', severity: 'aviso', tab: 'matriz-riesgos', entityType: 'risks', entityId: r.id,
      title: `${r.code}: revisar la aceptación del riesgo`, body: `"${r.title}" fue aceptado hasta el ${r.acceptance.reviewDate} (${r.acceptance.approvedBy}).`,
    }, `risk-acceptance:${r.id}:${r.acceptance.reviewDate}`));
  }

  // Documentos: revisión próxima o vencida, y lecturas pendientes a los 7 días.
  const docManagers = usersWithPermission('canManageDocuments', users);
  for (const doc of data.documents ?? []) {
    const d = doc;
    const v = currentVersion(d);
    if (d.status === 'Obsoleto' || !v) continue;
    const ref = { category: 'Documentos' as const, tab: 'documentos', entityType: 'documents', entityId: d.id };
    if (d.nextReviewDate) {
      const days = daysBetween(today, d.nextReviewDate);
      const to = [userByName(d.owner, users), ...docManagers];
      if (days < 0) {
        out.push(...forUsers(to, { ...ref, severity: 'urgente', title: `${d.code}: revisión vencida`, body: `"${d.title}" v${v.version} debía revisarse el ${d.nextReviewDate}.` }, `doc-review:${d.id}:${d.nextReviewDate}`));
      } else if (days <= 30) {
        out.push(...forUsers(to, { ...ref, severity: 'aviso', title: `${d.code}: revisión en ${days} días`, body: `"${d.title}" v${v.version} debe revisarse el ${d.nextReviewDate}.` }, `doc-review-soon:${d.id}:${d.nextReviewDate}`));
      }
    }
    if (daysBetween(v.effectiveDate ?? v.approvedAt ?? today, today) >= 7) {
      const pending = audienceOf(d, users.filter(u => u.active !== false)).filter(u => !hasAcknowledged(d, u.name));
      out.push(...forUsers(pending, {
        ...ref, severity: 'aviso', title: `Recordatorio: confirme la lectura de ${d.code} v${v.version}`, body: `"${d.title}" está vigente desde ${v.effectiveDate ?? v.approvedAt}.`,
      }, `doc-ack-reminder:${d.id}:${v.id}`));
    }
  }

  // Contratos de proveedores por vencer.
  const prov = usersWithPermission('canManageProviders', users);
  for (const p of d.providers) {
    if (p.status === 'En término' || !p.contractEnd) continue;
    const days = daysBetween(today, p.contractEnd);
    if (days < 0 || days > s.contractNoticeDays) continue;
    out.push(...forUsers([userByName(p.internalOwner, users), ...prov], {
      category: 'Proveedores', severity: days <= 15 ? 'urgente' : 'aviso', tab: 'proveedores', entityType: 'providers', entityId: p.id,
      title: `Contrato de ${p.name} vence en ${days} días`, body: `${p.code}: término ${p.contractEnd}. Defina renovación o salida.`,
    }, `contract:${p.id}:${p.contractEnd}`));
  }
  return out;
}

// -----------------------------------------------------------------------------
// Correo
// -----------------------------------------------------------------------------

export function deepLink(appUrl: string, n: Pick<AppNotification, 'tab' | 'entityType' | 'entityId'>): string {
  const base = appUrl.replace(/\/+$/, '');
  const q = new URLSearchParams();
  if (n.tab) q.set('tab', n.tab);
  if (n.entityType && n.entityId) q.set('ref', `${n.entityType}:${n.entityId}`);
  const qs = q.toString();
  return qs ? `${base}/?${qs}` : `${base}/`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const SEVERITY_COLOR: Record<NotificationSeverity, string> = { urgente: '#be123c', aviso: '#b45309', info: '#0f766e' };

export interface EmailContent { subject: string; text: string; html: string }

export function notificationEmail(n: AppNotification, appName: string, appUrl: string): EmailContent {
  const link = appUrl ? deepLink(appUrl, n) : '';
  const text = `Hola ${n.recipientName}:\n\n${n.title}\n${n.body}\n\n${link ? `Abrir: ${link}\n\n` : ''}` +
    `Recibes este aviso de ${appName} por la categoría "${n.category}". Puedes cambiar tus preferencias desde la campana de notificaciones.\n`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;color:#0f172a">
      <p style="margin:0 0 12px">Hola ${escapeHtml(n.recipientName)}:</p>
      <div style="border-left:4px solid ${SEVERITY_COLOR[n.severity]};background:#f8fafc;padding:12px 16px;border-radius:6px">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b">${escapeHtml(n.category)}</div>
        <div style="font-size:16px;font-weight:700;margin:4px 0 6px">${escapeHtml(n.title)}</div>
        <div style="font-size:14px;line-height:1.5;color:#334155">${escapeHtml(n.body)}</div>
      </div>
      ${link ? `<p style="margin:16px 0"><a href="${escapeHtml(link)}" style="background:#047857;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px">Abrir en ${escapeHtml(appName)}</a></p>` : ''}
      <p style="color:#64748b;font-size:12px">Puedes cambiar qué avisos recibes por correo desde la campana de notificaciones.</p>
    </div>`;
  const prefix = n.severity === 'urgente' ? '[Urgente] ' : '';
  return { subject: `${prefix}${n.title} · ${appName}`, text, html };
}

export function digestEmail(name: string, list: AppNotification[], appName: string, appUrl: string): EmailContent {
  const sorted = [...list].sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || a.createdAt.localeCompare(b.createdAt));
  const urgent = sorted.filter(n => n.severity === 'urgente').length;
  const text = `Hola ${name}:\n\nTienes ${list.length} aviso${list.length === 1 ? '' : 's'} en ${appName}${urgent ? ` (${urgent} urgente${urgent === 1 ? '' : 's'})` : ''}:\n\n` +
    sorted.map(n => `- [${n.category}] ${n.title}: ${n.body}${appUrl ? `\n  ${deepLink(appUrl, n)}` : ''}`).join('\n') + '\n';
  const rows = sorted.map(n => `
      <tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0">
        <div style="font-size:11px;color:${SEVERITY_COLOR[n.severity]};font-weight:700;text-transform:uppercase">${escapeHtml(n.category)}</div>
        <div style="font-weight:600">${appUrl ? `<a href="${escapeHtml(deepLink(appUrl, n))}" style="color:#0f172a">${escapeHtml(n.title)}</a>` : escapeHtml(n.title)}</div>
        <div style="font-size:13px;color:#475569">${escapeHtml(n.body)}</div>
      </td></tr>`).join('');
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;color:#0f172a">
      <p>Hola ${escapeHtml(name)}:</p>
      <p>Tienes <strong>${list.length}</strong> aviso${list.length === 1 ? '' : 's'} en ${escapeHtml(appName)}${urgent ? `, <strong style="color:#be123c">${urgent} urgente${urgent === 1 ? '' : 's'}</strong>` : ''}.</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="color:#64748b;font-size:12px">Resumen diario. Puedes cambiar tus preferencias desde la campana de notificaciones.</p>
    </div>`;
  return { subject: `Resumen diario: ${list.length} aviso${list.length === 1 ? '' : 's'}${urgent ? ` (${urgent} urgente${urgent === 1 ? '' : 's'})` : ''} · ${appName}`, text, html };
}

const sevRank = (s: NotificationSeverity) => (s === 'urgente' ? 0 : s === 'aviso' ? 1 : 2);
