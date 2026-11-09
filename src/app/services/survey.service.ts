import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { ResilienceService } from './resilience.service';
import { ComplianceService } from './compliance.service';
import { CatalogService } from './catalog.service';
import { ActionPlanService } from './action-plan.service';
import {
  SurveyAnswer, SurveyCampaign, SurveyItem, SurveyKind, SurveyResponse,
} from '../models/survey.model';
import { ActionPlanPriority } from '../models/action-plan.model';
import { ComplianceStatus } from '../models/compliance.model';
import {
  SurveyFinding, biaItems, canManageSurveys, checkResponseChange, complianceItems, isRespondent, nextCampaignCode,
  planSourceOf, rcsaItems, responseProgress, surveyFindings, validateAnswers,
} from '../utils/surveys';
import { todayIso } from '../utils/action-plans';

export interface CampaignDraft {
  id?: string;
  title: string;
  kind: SurveyKind;
  description: string;
  scope: string[];
  normId?: string;
  respondent?: string;
  customItems?: SurveyItem[];
  dueDate: string;
}

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Autoevaluaciones: campañas que envían cuestionarios a los dueños de procesos (RCSA, BIA,
 * cumplimiento o propios), seguimiento de respuestas, revisión, aplicación de las respuestas a
 * los módulos y planes de acción para las brechas.
 */
@Injectable({ providedIn: 'root' })
export class SurveyService {
  private readonly rs = inject(RiskDataService);
  private readonly res = inject(ResilienceService);
  private readonly comp = inject(ComplianceService);
  private readonly cat = inject(CatalogService);
  private readonly plans = inject(ActionPlanService);

  readonly campaigns = signal<SurveyCampaign[]>([]);
  readonly responses = signal<SurveyResponse[]>([]);

  /** Pedido de abrir una encuesta (desde un aviso). */
  readonly openRequest = signal<{ id: string; at: number } | null>(null);

  open(id: string) {
    this.openRequest.set({ id, at: Date.now() });
  }

  private actor() {
    return this.rs.currentProfile();
  }

  canManage(): boolean {
    return canManageSurveys(this.actor());
  }

  isMine(r: SurveyResponse): boolean {
    return isRespondent(this.actor(), r);
  }

  campaign(id: string): SurveyCampaign | undefined {
    return this.campaigns().find(c => c.id === id);
  }

  responsesOf(campaignId: string): SurveyResponse[] {
    return this.responses().filter(r => r.campaignId === campaignId).sort((a, b) => a.subject.localeCompare(b.subject, 'es'));
  }

  readonly sortedCampaigns = computed(() => {
    const order = { 'En curso': 0, 'Borrador': 1, 'Cerrada': 2 };
    return [...this.campaigns()].sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));
  });

  /** Encuestas asignadas a la persona actual en campañas en curso. */
  readonly mine = computed(() => this.responses()
    .filter(r => this.isMine(r) && this.campaign(r.campaignId)?.status === 'En curso')
    .sort((a, b) => Number(this.isOpen(b)) - Number(this.isOpen(a)) || a.dueDate.localeCompare(b.dueDate)));

  isOpen(r: SurveyResponse) {
    return ['Pendiente', 'En progreso', 'Devuelta'].includes(r.status);
  }

  isOverdue(r: SurveyResponse) {
    return this.isOpen(r) && r.dueDate < todayIso();
  }

  progress(r: SurveyResponse) {
    return responseProgress(r);
  }

  findings(r: SurveyResponse): SurveyFinding[] {
    return surveyFindings(r);
  }

  stats(campaignId: string) {
    const list = this.responsesOf(campaignId);
    const submitted = list.filter(r => r.status === 'Enviada' || r.status === 'Revisada').length;
    return {
      total: list.length, submitted, reviewed: list.filter(r => r.status === 'Revisada').length,
      toReview: list.filter(r => r.status === 'Enviada').length, overdue: list.filter(r => this.isOverdue(r)).length,
      pct: list.length ? Math.round((submitted / list.length) * 100) : 0,
      findings: list.filter(r => r.status === 'Enviada' || r.status === 'Revisada').reduce((s, r) => s + this.findings(r).length, 0),
    };
  }

  readonly kpis = computed(() => {
    const active = this.campaigns().filter(c => c.status === 'En curso').map(c => c.id);
    const inActive = this.responses().filter(r => active.includes(r.campaignId));
    return {
      activeCampaigns: active.length,
      pending: inActive.filter(r => this.isOpen(r)).length,
      overdue: inActive.filter(r => this.isOverdue(r)).length,
      toReview: inActive.filter(r => r.status === 'Enviada').length,
      minePending: this.mine().filter(r => this.isOpen(r)).length,
    };
  });

  // ---------------------------------------------------------------------------
  // Campañas
  // ---------------------------------------------------------------------------

  private ensureManager(action: string) {
    if (this.canManage()) return;
    const message = `Tu cargo no tiene permiso para ${action}.`;
    this.rs.permissionNotice.set({ message, at: Date.now() });
    throw new Error(message);
  }

  private log(action: 'CAMPAÑA_AUTOEVALUACION' | 'RESPUESTA_AUTOEVALUACION' | 'REVISIÓN_AUTOEVALUACION', code: string, details: string) {
    return this.rs.appendAuditLog(action, 'Autoevaluación', code, details);
  }

  async saveCampaign(d: CampaignDraft): Promise<SurveyCampaign> {
    this.ensureManager('crear campañas de autoevaluación');
    if (!d.title.trim()) throw new Error('La campaña necesita un nombre.');
    if (!d.dueDate) throw new Error('Indique el plazo para responder.');
    if (d.kind === 'Cumplimiento' && (!d.normId || !d.respondent?.trim())) throw new Error('Elija la norma y quién responde.');
    if (d.kind === 'Personalizada' && !d.customItems?.length) throw new Error('Agregue al menos una pregunta.');
    if (!d.scope.length) throw new Error(d.kind === 'Personalizada' ? 'Elija a quiénes se envía.' : 'Elija el alcance de la campaña.');
    const prev = d.id ? this.campaign(d.id) : undefined;
    if (prev && prev.status !== 'Borrador') throw new Error('Solo se edita una campaña en borrador.');
    const c: SurveyCampaign = prev
      ? { ...prev, ...d, title: d.title.trim(), description: d.description.trim(), id: prev.id }
      : {
        ...d, id: uid('ae'), code: nextCampaignCode(this.campaigns()), title: d.title.trim(), description: d.description.trim(),
        status: 'Borrador', createdBy: this.actor().name, createdAt: new Date().toISOString(),
      };
    this.campaigns.update(list => (prev ? list.map(x => (x.id === c.id ? c : x)) : [...list, c]));
    await this.log('CAMPAÑA_AUTOEVALUACION', c.code, `${prev ? 'Campaña actualizada' : 'Campaña creada'}: "${c.title}" (${c.kind}), ${c.scope.length} elementos en el alcance, plazo ${c.dueDate}.`);
    return c;
  }

  /** Cuestionarios que generará la campaña (uno por proceso, proceso BIA o persona). */
  previewResponses(c: Pick<SurveyCampaign, 'kind' | 'scope' | 'normId' | 'respondent' | 'customItems' | 'dueDate'>): Omit<SurveyResponse, 'id' | 'campaignId'>[] {
    const base = { answers: {}, status: 'Pendiente' as const, dueDate: c.dueDate, applied: [] };
    switch (c.kind) {
      case 'RCSA': {
        const procs = this.cat.processes();
        return c.scope.map(name => ({
          ...base, subject: name, respondent: procs.find(p => p.name === name)?.owner || 'Sin asignar',
          items: rcsaItems(name, this.rs.risks(), this.rs.controls(), this.cat.riskScale()),
        }));
      }
      case 'BIA':
        return c.scope.map(id => this.res.biaProcesses().find(b => b.id === id)).filter(b => !!b).map(b => ({
          ...base, subject: b!.name, respondent: b!.owner || 'Sin asignar', items: biaItems(b!),
        }));
      case 'Cumplimiento': {
        const reqs = this.comp.sorted().filter(r => c.scope.includes(r.id));
        return [{ ...base, subject: this.comp.normLabel(c.normId ?? ''), respondent: c.respondent ?? 'Sin asignar', items: complianceItems(reqs, this.comp.normLabel(c.normId ?? '')) }];
      }
      case 'Personalizada':
        return c.scope.map(person => ({ ...base, subject: person, respondent: person, items: structuredClone(c.customItems ?? []) }));
    }
  }

  async launch(id: string) {
    this.ensureManager('lanzar campañas de autoevaluación');
    const c = this.campaign(id);
    if (!c || c.status !== 'Borrador') throw new Error('Solo se lanza una campaña en borrador.');
    const drafts = this.previewResponses(c).filter(r => r.items.length);
    if (!drafts.length) throw new Error('El alcance no genera preguntas (revise que los procesos tengan riesgos o controles).');
    const responses: SurveyResponse[] = drafts.map(r => ({ ...r, id: uid('ar'), campaignId: c.id }));
    this.responses.update(list => [...list, ...responses]);
    this.campaigns.update(list => list.map(x => (x.id === id ? { ...x, status: 'En curso', launchedAt: new Date().toISOString() } : x)));
    const unassigned = responses.filter(r => !r.respondent.trim() || r.respondent === 'Sin asignar').length;
    await this.log('CAMPAÑA_AUTOEVALUACION', c.code, `Campaña lanzada: "${c.title}", ${responses.length} encuestas enviadas${unassigned ? ` (${unassigned} sin responsable)` : ''}; plazo ${c.dueDate}.`);
    return responses.length;
  }

  async close(id: string) {
    this.ensureManager('cerrar campañas de autoevaluación');
    const c = this.campaign(id);
    if (!c) return;
    const s = this.stats(id);
    this.campaigns.update(list => list.map(x => (x.id === id ? { ...x, status: 'Cerrada', closedAt: new Date().toISOString() } : x)));
    await this.log('CAMPAÑA_AUTOEVALUACION', c.code, `Campaña cerrada: ${s.submitted} de ${s.total} encuestas respondidas, ${s.reviewed} revisadas.`);
  }

  async removeCampaign(id: string) {
    this.ensureManager('eliminar campañas de autoevaluación');
    const c = this.campaign(id);
    if (!c) return;
    const n = this.responsesOf(id).length;
    this.responses.update(list => list.filter(r => r.campaignId !== id));
    this.campaigns.update(list => list.filter(x => x.id !== id));
    await this.log('CAMPAÑA_AUTOEVALUACION', c.code, `Campaña eliminada: "${c.title}" con ${n} encuestas.`);
  }

  // ---------------------------------------------------------------------------
  // Respuestas
  // ---------------------------------------------------------------------------

  private commit(prev: SurveyResponse, next: SurveyResponse) {
    const err = checkResponseChange(prev, next, this.actor(), this.campaign(prev.campaignId));
    if (err) {
      this.rs.permissionNotice.set({ message: err, at: Date.now() });
      throw new Error(err);
    }
    this.responses.update(list => list.map(r => (r.id === next.id ? next : r)));
  }

  private requireResponse(id: string) {
    const r = this.responses().find(x => x.id === id);
    if (!r) throw new Error('Encuesta no encontrada.');
    return r;
  }

  /** Guarda el avance o envía (submit) las respuestas de la persona asignada. */
  async saveAnswers(id: string, answers: Record<string, SurveyAnswer>, submit: boolean) {
    const prev = this.requireResponse(id);
    if (submit) {
      const errors = validateAnswers({ items: prev.items, answers });
      if (errors.length) throw new Error(errors.length === 1 ? errors[0] : `${errors[0]} (y ${errors.length - 1} más)`);
    }
    const now = new Date().toISOString();
    const next: SurveyResponse = {
      ...prev, answers, status: submit ? 'Enviada' : 'En progreso', startedAt: prev.startedAt ?? now, ...(submit ? { submittedAt: now } : {}),
    };
    this.commit(prev, next);
    if (submit) {
      const c = this.campaign(prev.campaignId);
      await this.log('RESPUESTA_AUTOEVALUACION', c?.code ?? '', `Encuesta enviada por ${this.actor().name} (${prev.subject}); ${this.findings(next).length} observaciones para revisar.`);
    }
  }

  async reassign(id: string, respondent: string) {
    this.ensureManager('reasignar encuestas');
    const prev = this.requireResponse(id);
    if (!respondent.trim()) throw new Error('Indique a quién se asigna.');
    this.commit(prev, { ...prev, respondent: respondent.trim() });
    await this.log('CAMPAÑA_AUTOEVALUACION', this.campaign(prev.campaignId)?.code ?? '', `Encuesta de ${prev.subject} reasignada de ${prev.respondent} a ${respondent.trim()}.`);
  }

  async returnResponse(id: string, note: string) {
    this.ensureManager('devolver encuestas');
    const prev = this.requireResponse(id);
    if (!note.trim()) throw new Error('Indique qué debe corregir o completar.');
    this.commit(prev, { ...prev, status: 'Devuelta', returnedNote: note.trim() });
    await this.log('REVISIÓN_AUTOEVALUACION', this.campaign(prev.campaignId)?.code ?? '', `Encuesta de ${prev.subject} devuelta a ${prev.respondent}: ${note.trim()}`);
  }

  async markReviewed(id: string, note: string) {
    this.ensureManager('revisar encuestas');
    const prev = this.requireResponse(id);
    this.commit(prev, { ...prev, status: 'Revisada', reviewedBy: this.actor().name, reviewedAt: new Date().toISOString(), reviewNote: note.trim() || undefined });
    await this.log('REVISIÓN_AUTOEVALUACION', this.campaign(prev.campaignId)?.code ?? '', `Encuesta de ${prev.subject} revisada.${note.trim() ? ` ${note.trim()}` : ''}`);
  }

  // ---------------------------------------------------------------------------
  // Aplicar respuestas y crear planes
  // ---------------------------------------------------------------------------

  isApplied(r: SurveyResponse, f: SurveyFinding) {
    return r.applied.includes(f.itemId);
  }

  /** Qué hará "Aplicar" con un cambio propuesto (o null si no se puede aplicar). */
  applyLabel(f: SurveyFinding): string | null {
    if (f.kind !== 'cambio' || !f.ref) return null;
    switch (f.ref.kind) {
      case 'risk': return 'Aplicar a la matriz';
      case 'bia': return 'Aplicar al BIA';
      case 'requirement': return 'Aplicar a la evaluación';
      default: return null;
    }
  }

  async apply(responseId: string, f: SurveyFinding) {
    this.ensureManager('aplicar respuestas de autoevaluación');
    const r = this.requireResponse(responseId);
    const ref = f.ref;
    if (!ref) return;
    if (ref.kind === 'risk') {
      const risk = this.rs.risks().find(x => x.id === ref.id);
      if (!risk) throw new Error('El riesgo ya no existe.');
      await this.rs.updateRisk(risk.id, ref.field === 'likelihood' ? { inherentLikelihood: Number(f.proposed) } : { inherentImpact: Number(f.proposed) });
    } else if (ref.kind === 'bia') {
      this.rs.ensure(['canManageContinuity'], 'actualizar el BIA');
      const b = this.res.biaProcesses().find(x => x.id === ref.id);
      if (!b) throw new Error('El proceso BIA ya no existe.');
      const value = ref.field === 'systems'
        ? String(f.proposed).split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
        : Number(f.proposed);
      await this.res.saveBiaProcess({ ...b, [ref.field!]: value, lastReviewDate: todayIso() });
    } else if (ref.kind === 'requirement') {
      const req = this.comp.requirements().find(x => x.id === ref.id);
      if (!req) throw new Error('El requisito ya no existe.');
      const ev = r.answers[`req:${ref.id}:evidence`];
      await this.comp.evaluate({ ...req, status: f.proposed as ComplianceStatus, evidence: ev ? String(ev) : req.evidence, owner: req.owner || r.respondent });
    }
    this.responses.update(list => list.map(x => (x.id === r.id ? { ...x, applied: [...x.applied, f.itemId] } : x)));
    await this.log('REVISIÓN_AUTOEVALUACION', this.campaign(r.campaignId)?.code ?? '', `Aplicado desde la encuesta de ${r.subject}: ${f.section} · ${f.text}`);
  }

  /** Crea un plan de acción para una brecha de la encuesta, vinculado a su registro de origen. */
  async createPlan(responseId: string, f: SurveyFinding, draft: { title: string; owner: string; dueDate: string; priority: ActionPlanPriority }) {
    const r = this.requireResponse(responseId);
    const c = this.campaign(r.campaignId);
    const src = planSourceOf(f);
    return this.plans.create({
      ...draft, description: `Desde la autoevaluación ${c?.code ?? ''} (${r.subject}): ${f.text}`, sourceType: src.sourceType, sourceId: src.sourceId ?? `${r.id}::${f.itemId}`,
      sourceLabel: src.sourceType === 'Otro' ? `Autoevaluación ${c?.code ?? ''} · ${r.subject} · ${f.section}` : f.section,
      process: c?.kind === 'RCSA' ? r.subject : undefined,
    });
  }

  // ---------------------------------------------------------------------------
  // Datos de ejemplo
  // ---------------------------------------------------------------------------

}
