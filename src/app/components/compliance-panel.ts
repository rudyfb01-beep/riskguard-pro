import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { EvidenceFiles } from './evidence-files';
import { EvidenceService } from '../services/evidence.service';
import { PermissionDeniedError, RiskDataService } from '../services/risk-data.service';
import { ComplianceService } from '../services/compliance.service';
import {
  COMPLIANCE_FREQUENCIES, COMPLIANCE_STATUSES, ComplianceFrequency, ComplianceNorm, ComplianceRequirement, ComplianceStatus,
} from '../models/compliance.model';
import { Control } from '../models/risk.model';
import { downloadCsv } from '../utils/csv';
import { ParseResult, evaluatedVersion, parseRequirementRows } from '../utils/compliance';
import { ComplianceNormModal } from './compliance-norm-modal';
import { ActionPlanService } from '../services/action-plan.service';
import { LinkedPlans, PlanChips } from './linked-plans';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';
const BTN = 'px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border flex items-center gap-1 cursor-pointer';

const MODULE_LABELS: Record<string, string> = {
  'proveedores': 'Proveedores', 'continuidad': 'Continuidad', 'seguridad-informacion': 'Seguridad de la Información',
  'reportes-regulatorios': 'Reporte CMF / ANCI', 'incidentes-perdidas': 'Incidentes y Pérdidas', 'auditorias': 'Auditorías',
  'reportes-pdf': 'Reportes', 'matriz-riesgos': 'Matriz de riesgos', 'controles': 'Controles', 'cumplimiento-ran': 'Evidencia documental',
};

interface RequirementForm {
  id?: string;
  chapter: string;
  numeral: string;
  title: string;
  requirement: string;
  frequency: ComplianceFrequency;
  module: string;
}

/** Cumplimiento normativo multinorma: biblioteca de normas, requisitos, controles vinculados y brechas. */
@Component({
  selector: 'app-compliance-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, ComplianceNormModal, LinkedPlans, PlanChips, EvidenceFiles],
  template: `
    <div class="space-y-4">
      <!-- Encabezado -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg"><mat-icon class="text-lg">policy</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Cumplimiento normativo</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Biblioteca de normas que aplican a la cooperativa (RAN de la CMF, leyes, circulares y políticas internas), cada una con su
            versión vigente y sus requisitos. Cada requisito se vincula con los controles que lo cubren, la evidencia y el plan de acción.
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          @if (canManage()) {
            <button type="button" (click)="openNormModal(null)" class="px-3.5 py-2.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 rounded-xl flex items-center gap-1.5 cursor-pointer">
              <mat-icon class="text-sm">library_add</mat-icon>Nueva norma
            </button>
          }
          <button type="button" (click)="exportCsv()" [class.perm-locked]="!rs.canAny('canExportReports')"
            class="px-3.5 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl flex items-center gap-1.5 cursor-pointer">
            <mat-icon class="text-sm text-emerald-600">download</mat-icon>Exportar matriz
          </button>
        </div>
      </div>

      <div class="p-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex items-start gap-2">
        <mat-icon class="text-sm text-amber-600 shrink-0">info</mat-icon>
        <span>Las normas marcadas como <strong>referencial</strong> traen requisitos resumidos de fuentes públicas para empezar; Cumplimiento
          debe validarlos contra el texto oficial vigente y ajustarlos a la cooperativa.</span>
      </div>

      <!-- Resumen general -->
      @let s = comp.summary();
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div class="bg-white p-3 rounded-xl border border-slate-200">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cumplimiento</span>
          <span class="text-2xl font-bold font-mono" [class]="pctClass(s.pct)">{{ s.pct === null ? '—' : s.pct + '%' }}</span>
          <span class="block text-[10px] text-slate-500">{{ s.norms }} {{ s.norms === 1 ? 'norma aplicable' : 'normas aplicables' }}</span>
        </div>
        <button type="button" (click)="quickFilter('brechas')" class="text-left bg-white p-3 rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Brechas</span>
          <span class="text-2xl font-bold font-mono" [class]="s.gaps ? 'text-rose-700' : 'text-slate-400'">{{ s.gaps }}</span>
          <span class="block text-[10px] text-slate-500">no cumple o parcial</span>
        </button>
        <button type="button" (click)="quickFilter('Sin evaluar')" class="text-left bg-white p-3 rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sin evaluar</span>
          <span class="text-2xl font-bold font-mono text-slate-700">{{ s.unevaluated }}</span>
          <span class="block text-[10px] text-slate-500">de {{ s.total }} requisitos</span>
        </button>
        <button type="button" (click)="quickFilter('vencidas')" class="text-left bg-white p-3 rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Revisión vencida</span>
          <span class="text-2xl font-bold font-mono" [class]="s.overdue ? 'text-rose-700' : 'text-slate-400'">{{ s.overdue }}</span>
          <span class="block text-[10px] text-slate-500">según su frecuencia</span>
        </button>
        <button type="button" (click)="quickFilter('version')" class="text-left bg-white p-3 rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cambio de versión</span>
          <span class="text-2xl font-bold font-mono" [class]="s.versionReview ? 'text-amber-700' : 'text-slate-400'">{{ s.versionReview }}</span>
          <span class="block text-[10px] text-slate-500">evaluados con versión anterior</span>
        </button>
        <button type="button" (click)="quickFilter('sin-controles')" class="text-left bg-white p-3 rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer">
          <span class="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sin respaldo</span>
          <span class="text-2xl font-bold font-mono text-slate-700">{{ s.withoutControls }}</span>
          <span class="block text-[10px] text-slate-500">sin controles ni verificación</span>
        </button>
      </div>

      <!-- Biblioteca normativa -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-xs font-bold text-slate-800 uppercase tracking-wide">Biblioteca normativa</h2>
          @if (selectedNorm()) {
            <button type="button" (click)="selectNorm('')" class="text-[11px] text-emerald-700 hover:underline cursor-pointer">Ver todas las normas</button>
          }
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
          @for (c of comp.byNorm(); track c.norm.id) {
            <button type="button" (click)="selectNorm(selected() === c.norm.id ? '' : c.norm.id)"
              class="text-left bg-white p-3 rounded-xl border cursor-pointer min-w-0"
              [class]="selected() === c.norm.id ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'"
              [class.opacity-60]="c.norm.applicability === 'No aplica' || c.norm.status === 'Derogada'">
              <span class="flex items-center justify-between gap-1">
                <span class="text-[11px] font-bold text-slate-900 truncate">{{ c.norm.code }}</span>
                <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" [class]="normStatusClass(c.norm)">{{ normBadge(c.norm) }}</span>
              </span>
              <span class="text-[10px] text-slate-500 block truncate" [title]="c.norm.title">{{ c.norm.title }}</span>
              <span class="text-2xl font-bold font-mono" [class]="pctClass(c.pct)">{{ c.pct === null ? '—' : c.pct + '%' }}</span>
              <span class="block text-[10px] text-slate-500">{{ c.rated }} de {{ c.total }} evaluados · {{ c.gaps }} {{ c.gaps === 1 ? 'brecha' : 'brechas' }}</span>
              @if (c.overdue || c.versionReview) {
                <span class="block text-[10px] font-semibold mt-0.5">
                  @if (c.overdue) { <span class="text-rose-700">{{ c.overdue }} {{ c.overdue === 1 ? 'vencida' : 'vencidas' }}</span> }
                  @if (c.overdue && c.versionReview) { <span class="text-slate-400"> · </span> }
                  @if (c.versionReview) { <span class="text-amber-700">{{ c.versionReview }} por revisar</span> }
                </span>
              }
            </button>
          }
        </div>
      </div>

      <!-- Ficha de la norma seleccionada -->
      @if (selectedNorm(); as n) {
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div class="px-5 py-4 flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div class="min-w-0 space-y-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-bold text-slate-900">{{ n.code }}</h2>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{{ n.kind }}</span>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" [class]="normStatusClass(n)">{{ n.status }}</span>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" [class]="applicabilityClass(n)">{{ n.applicability }}</span>
                @if (n.referential) { <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Referencial</span> }
              </div>
              <p class="text-sm text-slate-800">{{ n.title }}</p>
              <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-slate-600">
                <div><dt class="inline font-semibold text-slate-700">Versión vigente:</dt> <dd class="inline ml-1">{{ n.version }}@if (n.effectiveDate) { · vigencia {{ n.effectiveDate }} }</dd></div>
                @if (n.issuer) { <div><dt class="inline font-semibold text-slate-700">Emisor:</dt> <dd class="inline ml-1">{{ n.issuer }}</dd></div> }
                @if (n.source) { <div class="md:col-span-2"><dt class="inline font-semibold text-slate-700">Fuente:</dt> <dd class="inline ml-1">{{ n.source }}@if (n.url) { · <a [href]="n.url" target="_blank" rel="noopener noreferrer" class="text-emerald-700 hover:underline">ver texto</a> }</dd></div> }
                @if (n.applicabilityNote) { <div class="md:col-span-2"><dt class="inline font-semibold text-slate-700">Aplicabilidad:</dt> <dd class="inline ml-1">{{ n.applicabilityNote }}</dd></div> }
                <div><dt class="inline font-semibold text-slate-700">Responsable:</dt> <dd class="inline ml-1">{{ n.owner || 'Sin asignar' }}</dd></div>
                @if (n.notes) { <div class="md:col-span-2"><dt class="inline font-semibold text-slate-700">Notas:</dt> <dd class="inline ml-1">{{ n.notes }}</dd></div> }
              </dl>
            </div>
            <div class="flex flex-wrap gap-1.5 shrink-0">
              <button type="button" (click)="toggle('history')" [class]="btnCls + ' bg-white border-slate-300 text-slate-700 hover:bg-slate-50'">
                <mat-icon class="text-sm">history</mat-icon>Historial ({{ n.versions.length }})
              </button>
              @if (canManage()) {
                <button type="button" (click)="openNormModal(n)" [class]="btnCls + ' bg-white border-slate-300 text-slate-700 hover:bg-slate-50'"><mat-icon class="text-sm">edit</mat-icon>Editar</button>
                <button type="button" (click)="toggle('version')" [class]="btnCls + ' bg-white border-slate-300 text-slate-700 hover:bg-slate-50'"><mat-icon class="text-sm">update</mat-icon>Nueva versión</button>
                <button type="button" (click)="newRequirement(n)" [class]="btnCls + ' bg-emerald-700 border-emerald-700 text-white hover:bg-emerald-600'"><mat-icon class="text-sm">add</mat-icon>Requisito</button>
                <button type="button" (click)="toggle('import')" [class]="btnCls + ' bg-white border-slate-300 text-slate-700 hover:bg-slate-50'"><mat-icon class="text-sm">upload_file</mat-icon>Importar</button>
                <button type="button" (click)="toggle('delete')" [class]="btnCls + ' bg-white border-rose-200 text-rose-700 hover:bg-rose-50'" aria-label="Eliminar norma"><mat-icon class="text-sm">delete</mat-icon></button>
              }
            </div>
          </div>

          @switch (section()) {
            @case ('history') {
              <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/60">
                <ol class="space-y-2">
                  @for (v of historyOf(n); track v.version + v.registeredAt; let first = $first) {
                    <li class="text-[11px] flex gap-3">
                      <span class="font-mono text-slate-500 w-20 shrink-0">{{ v.date }}</span>
                      <span class="min-w-0"><strong class="text-slate-900">{{ v.version }}</strong>@if (first) { <span class="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">vigente</span> }
                        <span class="text-slate-700"> · {{ v.summary || 'Sin descripción' }}</span>
                        <span class="block text-[10px] text-slate-400">Registrada por {{ v.registeredBy }} el {{ v.registeredAt | date: 'dd-MM-yyyy' }}</span></span>
                    </li>
                  }
                </ol>
              </div>
            }
            @case ('version') {
              <div class="px-5 py-3 border-t border-slate-100 bg-emerald-50/40 grid grid-cols-1 md:grid-cols-6 gap-2.5">
                <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Versión nueva *</span>
                  <input [class]="inputCls" [value]="versionForm().version" (input)="setVersion('version', $any($event.target).value)" placeholder="Circular N° ..." /></label>
                <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Fecha</span>
                  <input type="date" [class]="inputCls" [value]="versionForm().date" (input)="setVersion('date', $any($event.target).value)" /></label>
                <label class="block md:col-span-4"><span class="block text-[10px] text-slate-600 mb-0.5">Qué cambió</span>
                  <input [class]="inputCls" [value]="versionForm().summary" (input)="setVersion('summary', $any($event.target).value)" placeholder="Numerales modificados, nuevas obligaciones, plazos..." /></label>
                <p class="md:col-span-4 text-[10px] text-slate-600 self-center">Los requisitos ya evaluados quedarán marcados "por revisar" hasta que se evalúen con la nueva versión. Agregue o edite los requisitos que cambiaron.</p>
                <div class="md:col-span-2 flex justify-end gap-2">
                  <button type="button" (click)="section.set('')" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
                  <button type="button" (click)="saveVersion(n)" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer">Registrar versión</button>
                </div>
              </div>
            }
            @case ('import') {
              <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/60 space-y-2.5">
                <p class="text-[11px] text-slate-600">
                  Pegue filas copiadas desde Excel o cargue un archivo .xlsx o .csv con las columnas <strong>Numeral, Título, Detalle, Frecuencia, Responsable</strong>
                  (con o sin encabezado; solo el título es obligatorio). Se omiten los requisitos que ya existen con el mismo numeral y título.
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <label class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer flex items-center gap-1">
                    <mat-icon class="text-sm text-slate-500">attach_file</mat-icon>Cargar archivo
                    <input type="file" accept=".xlsx,.csv,.txt" class="hidden" (change)="onImportFile($event)" />
                  </label>
                  @if (importFile()) { <span class="text-[11px] text-slate-500">{{ importFile() }}</span> }
                </div>
                <textarea rows="5" [class]="inputCls + ' font-mono'" [value]="importText()" (input)="setImportText($any($event.target).value)"
                  placeholder="Numeral&#9;Título&#9;Detalle&#9;Frecuencia"></textarea>
                @if (importParsed(); as p) {
                  <div class="text-[11px]">
                    <span class="font-semibold text-slate-800">{{ p.rows.length }} requisitos listos</span>
                    @if (p.errors.length) { <span class="text-rose-700"> · {{ p.errors.length }} filas con error</span> }
                    @if (p.errors.length) { <ul class="mt-1 text-rose-700 list-disc pl-4 max-h-24 overflow-y-auto">@for (e of p.errors; track e) { <li>{{ e }}</li> }</ul> }
                    @if (p.rows.length) {
                      <div class="mt-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
                        @for (r of p.rows.slice(0, 50); track r.line) {
                          <div class="px-2.5 py-1 flex gap-2"><span class="font-mono text-slate-400 w-16 shrink-0 truncate">{{ r.numeral || '—' }}</span><span class="text-slate-900 truncate">{{ r.title }}</span><span class="ml-auto text-slate-500 shrink-0">{{ r.frequency }}</span></div>
                        }
                      </div>
                    }
                  </div>
                }
                <div class="flex justify-end gap-2">
                  <button type="button" (click)="section.set('')" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
                  <button type="button" (click)="runImport(n)" [disabled]="!importParsed()?.rows?.length" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer disabled:opacity-50">Importar a {{ n.code }}</button>
                </div>
              </div>
            }
            @case ('delete') {
              <div class="px-5 py-3 border-t border-rose-100 bg-rose-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span class="text-xs text-rose-900">¿Eliminar {{ n.code }} y sus {{ itemsOf(n.id, true).length }} requisitos? Sus evaluaciones se pierden (la bitácora conserva el registro).
                  Si la norma dejó de aplicar, puede marcarla como "No aplica" o "Derogada" en lugar de eliminarla.</span>
                <div class="flex gap-2 shrink-0">
                  <button type="button" (click)="section.set('')" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
                  <button type="button" (click)="removeNorm(n)" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-700 text-white hover:bg-rose-600 cursor-pointer">Eliminar norma</button>
                </div>
              </div>
            }
          }
        </div>
      }

      @if (!canManage()) {
        <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 flex items-start gap-2">
          <mat-icon class="text-sm text-slate-500 shrink-0">lock</mat-icon>
          <span>Vista de consulta: mantener normas y evaluar requisitos requiere el permiso de cumplimiento normativo.</span>
        </div>
      }

      <!-- Filtros -->
      <div class="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
        <input type="search" placeholder="Buscar requisito, numeral o evidencia..." [value]="search()" (input)="search.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-3 py-1.5 w-64" />
        <select [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-2 py-1.5" aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="brechas">Solo brechas</option>
          <option value="sugerencia">Con sugerencia distinta</option>
          <option value="vencidas">Revisión vencida</option>
          <option value="version">Por revisar (cambio de versión)</option>
          <option value="sin-controles">Sin controles ni verificación</option>
          <option value="sin-plan">Brechas sin plan de acción</option>
          @for (st of statuses; track st) { <option [value]="st">{{ st }}</option> }
        </select>
        <span class="text-[11px] text-slate-500 ml-auto">{{ filtered().length }} de {{ comp.requirements().length }}</span>
      </div>

      <!-- Requisito nuevo -->
      @if (reqForm(); as rf) {
        @if (!rf.id) {
          <div class="bg-white rounded-2xl border border-emerald-300 p-4">
            <h3 class="text-xs font-bold text-slate-900 mb-2.5">Nuevo requisito · {{ comp.normLabel(rf.chapter) }}</h3>
            <ng-container *ngTemplateOutlet="reqFormTpl" />
          </div>
        }
      }

      <!-- Requisitos por norma -->
      @for (c of visibleNorms(); track c.norm.id) {
        @let items = itemsOf(c.norm.id);
        @if (items.length) {
          <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div class="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between gap-3">
              <span class="truncate">{{ c.norm.code }} · {{ c.norm.title }}</span><span class="font-normal text-[10px] text-slate-500 shrink-0">versión {{ c.norm.version }}</span>
            </div>
            <div class="divide-y divide-slate-100">
              @for (i of items; track i.id) {
                @let auto = comp.autoCheck(i.autoCheck);
                @let cov = comp.coverage(i);
                <div class="px-4 py-3">
                  @if (reqForm()?.id === i.id) {
                    <ng-container *ngTemplateOutlet="reqFormTpl" />
                  } @else {
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-xs font-semibold text-slate-900"><span class="font-mono text-[10px] text-slate-400 mr-1.5">{{ i.numeral }}</span>{{ i.title }}</div>
                      <div class="text-[11px] text-slate-600 mt-0.5">{{ i.requirement }}</div>
                      <div class="flex flex-wrap items-center gap-2 mt-1.5 text-[10px]">
                        @if (i.module) {
                          <button type="button" (click)="openModule.emit(i.module)" class="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer flex items-center gap-0.5"><mat-icon class="text-[12px] w-3 h-3">open_in_new</mat-icon>{{ moduleLabel(i.module) }}</button>
                        }
                        <span class="text-slate-500">{{ i.frequency }}</span>
                        @if (i.lastReviewDate) {
                          <span [class]="comp.isReviewOverdue(i) ? 'text-rose-700 font-bold' : 'text-slate-400'">Revisado {{ i.lastReviewDate }}@if (comp.nextReview(i)) { · próxima {{ comp.nextReview(i) }} }</span>
                        }
                        @if (comp.needsVersionReview(i)) {
                          <span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold flex items-center gap-0.5"><mat-icon class="text-[12px] w-3 h-3">update</mat-icon>Evaluado con la versión {{ evaluatedWith(i) }}: revisar</span>
                        }
                      </div>
                      @if (linkedControls(i).length) {
                        <div class="flex flex-wrap items-center gap-1 mt-1.5">
                          <span class="text-[10px] text-slate-500 mr-0.5">Controles:</span>
                          @for (ctl of linkedControls(i); track ctl.id) {
                            <span class="text-[10px] px-1.5 py-0.5 rounded font-mono" [class]="controlClass(ctl)" [title]="ctl.name + ' · ' + ctl.status + ' (' + ctl.totalEffectiveness + ' %)'">{{ ctl.code }}</span>
                          }
                        </div>
                      }
                      @if (auto || cov) {
                        <div class="mt-1.5 text-[11px] text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 inline-flex items-start gap-1">
                          <mat-icon class="text-[14px] w-3.5 h-3.5 text-indigo-500 shrink-0">insights</mat-icon>
                          <span>
                            @if (auto) { {{ auto.text }} }
                            @if (auto && cov) { <br /> }
                            @if (cov) { {{ cov.text }} }
                            @if (comp.suggestedStatus(i); as sug) { @if (sug !== i.status) { <strong> Sugerido: {{ sug }}.</strong> } }
                          </span>
                        </div>
                      }
                      @if (editing()?.id !== i.id) { <div class="mt-1.5"><app-plan-chips sourceType="Cumplimiento" [sourceId]="i.id" /></div> }
                      @if (editing()?.id !== i.id && evidence.count('compliance', i.id)) {
                        <div class="mt-1.5"><app-evidence-files entity="compliance" [entityId]="i.id" [label]="i.numeral || i.title" [parent]="i" [readonly]="true" title="Archivos de evidencia" /></div>
                      }
                      @if (editing()?.id !== i.id && (i.evidence || i.actionPlan)) {
                        <div class="mt-1.5 text-[11px] text-slate-600 space-y-0.5">
                          @if (i.evidence) { <div><strong>Evidencia:</strong> {{ i.evidence }}</div> }
                          @if (i.actionPlan) { <div><strong>Plan de acción (texto anterior):</strong> {{ i.actionPlan }}@if (i.dueDate) { <span class="font-mono" [class.text-rose-700]="isPastDue(i)"> (hasta {{ i.dueDate }})</span> }@if (i.owner) { · {{ i.owner }} }</div> }
                        </div>
                      }
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" [class]="statusClass(i.status)">{{ i.status }}</span>
                      @if (canManage() && editing()?.id !== i.id) {
                        <button type="button" (click)="edit(i)" class="px-2 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">Evaluar</button>
                        <button type="button" (click)="editRequirement(i)" class="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer" aria-label="Editar texto del requisito" title="Editar texto del requisito"><mat-icon class="text-[16px] w-4 h-4">edit</mat-icon></button>
                        <button type="button" (click)="removeRequirement(i)" class="p-1 rounded-lg cursor-pointer" [class]="confirmDelete() === i.id ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-rose-700 hover:bg-rose-50'"
                          [attr.aria-label]="confirmDelete() === i.id ? 'Confirmar eliminación' : 'Eliminar requisito'" [title]="confirmDelete() === i.id ? 'Clic otra vez para eliminar' : 'Eliminar requisito'"><mat-icon class="text-[16px] w-4 h-4">{{ confirmDelete() === i.id ? 'delete_forever' : 'delete' }}</mat-icon></button>
                      }
                    </div>
                  </div>
                  }
                  @if (editing(); as e) {
                    @if (e.id === i.id) {
                      <div class="mt-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 grid grid-cols-1 md:grid-cols-4 gap-2.5">
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Estado</span>
                          <select [class]="inputCls" (change)="set('status', $any($event.target).value)">@for (st of statuses; track st) { <option [value]="st" [selected]="st === e.status">{{ st }}</option> }</select></label>
                        <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Responsable</span><input [class]="inputCls" [value]="e.owner" (input)="set('owner', $any($event.target).value)" /></label>
                        <label class="block md:col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Evidencia (documento, acta, sesión del Consejo, enlace)</span><input [class]="inputCls" [value]="e.evidence" (input)="set('evidence', $any($event.target).value)" /></label>
                        <div class="md:col-span-4">
                          <app-evidence-files entity="compliance" [entityId]="e.id" [label]="e.numeral || e.title" [parent]="e" title="Archivos de evidencia (actas, políticas aprobadas, informes)"
                            emptyText="Sin archivos: adjunte el respaldo del cumplimiento." />
                        </div>
                        @if (e.actionPlan) {
                          <label class="block md:col-span-4"><span class="block text-[10px] text-slate-600 mb-0.5">Plan de acción (texto anterior; conviértalo en un plan con seguimiento)</span><input [class]="inputCls" [value]="e.actionPlan" (input)="set('actionPlan', $any($event.target).value)" /></label>
                        }

                        <div class="md:col-span-4">
                          <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <span class="text-[10px] text-slate-600">Controles que cubren el requisito ({{ e.controlIds?.length ?? 0 }} seleccionados)</span>
                            <input type="search" placeholder="Buscar control por código, nombre o proceso..." [value]="controlSearch()" (input)="controlSearch.set($any($event.target).value)" class="text-[11px] rounded-lg border border-slate-300 px-2 py-1 w-64" />
                          </div>
                          <div class="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                            @for (ctl of controlOptions(); track ctl.id) {
                              <label class="px-2.5 py-1.5 flex items-center gap-2 text-[11px] cursor-pointer hover:bg-slate-50">
                                <input type="checkbox" class="rounded text-emerald-600 focus:ring-emerald-500" [checked]="e.controlIds?.includes(ctl.id)" (change)="toggleControl(ctl.id)" />
                                <span class="font-mono text-slate-500 w-20 shrink-0">{{ ctl.code }}</span>
                                <span class="text-slate-900 truncate">{{ ctl.name }}</span>
                                <span class="text-slate-400 truncate hidden md:inline">{{ ctl.process }}</span>
                                <span class="ml-auto px-1.5 py-0.5 rounded text-[10px] shrink-0" [class]="controlClass(ctl)">{{ ctl.status }}</span>
                              </label>
                            } @empty {
                              <div class="px-2.5 py-2 text-[11px] text-slate-500">{{ rs.controls().length ? 'Ningún control coincide con la búsqueda.' : 'No hay controles en la matriz.' }}</div>
                            }
                          </div>
                          @if (editCoverage(); as ec) { <p class="text-[10px] text-indigo-800 mt-1">{{ ec.text }}@if (ec.suggested) { Sugerido: {{ ec.suggested }}. }</p> }
                        </div>

                        <div class="md:col-span-4">
                          <app-linked-plans sourceType="Cumplimiento" [sourceId]="e.id" [sourceLabel]="comp.normLabel(e.chapter) + ' ' + e.numeral + ' ' + e.title"
                            [defaultTitle]="e.actionPlan" [defaultOwner]="e.owner" [defaultDueDate]="e.dueDate ?? ''" [defaultPriority]="e.status === 'No cumple' ? 'Alta' : 'Media'"
                            [emptyText]="e.status === 'No cumple' || e.status === 'Cumple parcialmente' ? 'La brecha aún no tiene plan de acción.' : 'Sin planes de acción.'" />
                        </div>

                        <div class="md:col-span-4 flex justify-end gap-2">
                          <button type="button" (click)="editing.set(null)" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
                          <button type="button" (click)="save()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer">Guardar evaluación</button>
                        </div>
                      </div>
                    }
                  }
                </div>
              }
            </div>
          </div>
        }
      } @empty {
        <div class="p-6 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">No hay normas en la biblioteca.</div>
      }
      @if (!filtered().length && comp.norms().length) {
        <div class="p-6 text-center text-xs text-slate-500 bg-white rounded-2xl border border-slate-200">
          Ningún requisito coincide con el filtro.@if (selectedNorm() && !itemsOf(selected(), true).length) { Esta norma aún no tiene requisitos: agréguelos o impórtelos desde Excel. }
        </div>
      }
    </div>

    <ng-template #reqFormTpl>
      @if (reqForm(); as rf) {
        <div class="grid grid-cols-1 md:grid-cols-6 gap-2.5">
          <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Numeral</span>
            <input [class]="inputCls" [value]="rf.numeral" (input)="setReq('numeral', $any($event.target).value)" placeholder="art. 4" /></label>
          <label class="block md:col-span-3"><span class="block text-[10px] text-slate-600 mb-0.5">Título *</span>
            <input [class]="inputCls" [value]="rf.title" (input)="setReq('title', $any($event.target).value)" /></label>
          <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Frecuencia</span>
            <select [class]="inputCls" (change)="setReq('frequency', $any($event.target).value)">@for (fq of frequencies; track fq) { <option [value]="fq" [selected]="fq === rf.frequency">{{ fq }}</option> }</select></label>
          <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Módulo que lo soporta</span>
            <select [class]="inputCls" (change)="setReq('module', $any($event.target).value)">
              <option value="" [selected]="!rf.module">Ninguno</option>
              @for (m of moduleOptions; track m.id) { <option [value]="m.id" [selected]="m.id === rf.module">{{ m.label }}</option> }
            </select></label>
          <label class="block md:col-span-6"><span class="block text-[10px] text-slate-600 mb-0.5">Detalle de la obligación</span>
            <textarea rows="2" [class]="inputCls" [value]="rf.requirement" (input)="setReq('requirement', $any($event.target).value)"></textarea></label>
          @if (reqError()) { <div class="md:col-span-6 text-[11px] text-rose-700" role="alert">{{ reqError() }}</div> }
          <div class="md:col-span-6 flex justify-end gap-2">
            <button type="button" (click)="reqForm.set(null)" class="px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
            <button type="button" (click)="saveRequirement()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer">{{ rf.id ? 'Guardar requisito' : 'Agregar requisito' }}</button>
          </div>
        </div>
      }
    </ng-template>

    @if (normModal(); as m) {
      <app-compliance-norm-modal [norm]="m.norm" (closeModal)="normModal.set(null)" (saved)="onNormSaved($event, !m.norm)" />
    }
  `,
})
export class CompliancePanel {
  readonly rs = inject(RiskDataService);
  readonly comp = inject(ComplianceService);
  readonly evidence = inject(EvidenceService);
  readonly actionPlans = inject(ActionPlanService);
  readonly notify = output<string>();
  readonly openModule = output<string>();

  readonly inputCls = INPUT;
  readonly btnCls = BTN;
  readonly statuses = COMPLIANCE_STATUSES;
  readonly frequencies = COMPLIANCE_FREQUENCIES;
  readonly moduleOptions = Object.entries(MODULE_LABELS).map(([id, label]) => ({ id, label }));
  readonly canManage = computed(() => this.comp.canManage());

  readonly selected = signal('');
  readonly search = signal('');
  readonly statusFilter = signal('');
  readonly editing = signal<ComplianceRequirement | null>(null);
  readonly controlSearch = signal('');
  readonly section = signal<'' | 'history' | 'version' | 'import' | 'delete'>('');
  readonly normModal = signal<{ norm: ComplianceNorm | null } | null>(null);
  readonly versionForm = signal({ version: '', date: '', summary: '' });
  readonly reqForm = signal<RequirementForm | null>(null);
  readonly reqError = signal('');
  readonly confirmDelete = signal<string | null>(null);
  readonly importText = signal('');
  readonly importFile = signal('');

  readonly selectedNorm = computed(() => (this.selected() ? this.comp.norm(this.selected()) ?? null : null));
  readonly visibleNorms = computed(() => this.comp.byNorm().filter(c => !this.selected() || c.norm.id === this.selected()));
  readonly importParsed = computed<ParseResult | null>(() => (this.importText().trim() ? parseRequirementRows(this.importText()) : null));

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    const st = this.statusFilter();
    const sel = this.selected();
    return this.comp.sorted().filter(r => {
      if (sel && r.chapter !== sel) return false;
      if (q && !`${r.numeral} ${r.title} ${r.requirement} ${r.evidence} ${r.actionPlan} ${r.owner}`.toLowerCase().includes(q)) return false;
      switch (st) {
        case '': return true;
        case 'brechas': return r.status === 'No cumple' || r.status === 'Cumple parcialmente';
        case 'vencidas': return this.comp.isReviewOverdue(r);
        case 'version': return this.comp.needsVersionReview(r);
        case 'sin-controles': return r.status !== 'No aplica' && !(r.controlIds?.length) && !r.autoCheck;
        case 'sin-plan': return (r.status === 'No cumple' || r.status === 'Cumple parcialmente') && !r.actionPlan && !this.actionPlans.openForSource('Cumplimiento', r.id).length;
        case 'sugerencia': { const sug = this.comp.suggestedStatus(r); return !!sug && sug !== r.status; }
        default: return r.status === st;
      }
    });
  });

  readonly controlOptions = computed(() => {
    const q = this.controlSearch().toLowerCase().trim();
    const selected = new Set(this.editing()?.controlIds ?? []);
    return [...this.rs.controls()]
      .filter(c => !q || `${c.code} ${c.name} ${c.process}`.toLowerCase().includes(q))
      .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || a.code.localeCompare(b.code, 'es', { numeric: true }));
  });

  readonly editCoverage = computed(() => {
    const e = this.editing();
    return e ? this.comp.coverage(e) : null;
  });

  itemsOf(normId: string, all = false) {
    return (all ? this.comp.sorted() : this.filtered()).filter(r => r.chapter === normId);
  }

  linkedControls(r: ComplianceRequirement): Control[] {
    const ids = new Set(r.controlIds ?? []);
    return ids.size ? this.rs.controls().filter(c => ids.has(c.id)) : [];
  }

  evaluatedWith(r: ComplianceRequirement) {
    return evaluatedVersion(r, this.comp.norm(r.chapter)) ?? '—';
  }

  historyOf(n: ComplianceNorm) {
    return [...n.versions].reverse();
  }

  moduleLabel(m: string) {
    return MODULE_LABELS[m] ?? m;
  }

  isPastDue(r: ComplianceRequirement) {
    return !!r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10) && r.status !== 'Cumple';
  }

  pctClass(p: number | null) {
    return p === null ? 'text-slate-400' : p >= 85 ? 'text-emerald-700' : p >= 60 ? 'text-amber-700' : 'text-rose-700';
  }

  statusClass(s: ComplianceStatus) {
    switch (s) {
      case 'Cumple': return 'bg-emerald-100 text-emerald-800';
      case 'Cumple parcialmente': return 'bg-amber-100 text-amber-800';
      case 'No cumple': return 'bg-rose-100 text-rose-800';
      case 'No aplica': return 'bg-slate-100 text-slate-500';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  controlClass(c: Control) {
    return c.status === 'Efectivo' ? 'bg-emerald-100 text-emerald-800' : c.status === 'Parcialmente Efectivo' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800';
  }

  normBadge(n: ComplianceNorm) {
    if (n.applicability === 'No aplica') return 'No aplica';
    if (n.status === 'Vigente') return n.applicability === 'Por determinar' ? 'Por determinar' : 'Vigente';
    return n.status === 'Publicada, aún no vigente' ? `Desde ${n.effectiveDate ?? '—'}` : n.status;
  }

  normStatusClass(n: ComplianceNorm) {
    if (n.applicability === 'No aplica' || n.status === 'Derogada') return 'bg-slate-100 text-slate-500';
    if (n.status === 'Vigente') return n.applicability === 'Por determinar' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800';
    return 'bg-sky-100 text-sky-800';
  }

  applicabilityClass(n: ComplianceNorm) {
    return n.applicability === 'Aplica' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
      : n.applicability === 'No aplica' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-800 border border-amber-200';
  }

  // ---------------------------------------------------------------------------
  // Navegación
  // ---------------------------------------------------------------------------

  selectNorm(id: string) {
    this.selected.set(id);
    this.section.set('');
    this.reqForm.set(null);
  }

  quickFilter(f: string) {
    this.statusFilter.set(f);
    this.selected.set('');
  }

  setVersion(k: 'version' | 'date' | 'summary', v: string) {
    this.versionForm.update(f => ({ ...f, [k]: v }));
  }

  toggle(s: 'history' | 'version' | 'import' | 'delete') {
    this.section.set(this.section() === s ? '' : s);
    if (s === 'version') this.versionForm.set({ version: '', date: new Date().toISOString().slice(0, 10), summary: '' });
    if (s === 'import') { this.importText.set(''); this.importFile.set(''); }
  }

  private fail(err: unknown) {
    if (!(err instanceof PermissionDeniedError)) this.notify.emit((err as Error).message);
  }

  // ---------------------------------------------------------------------------
  // Normas
  // ---------------------------------------------------------------------------

  openNormModal(norm: ComplianceNorm | null) {
    if (!this.rs.requirePermission(['canManageCompliance', 'canManageRegulatoryReports'], 'mantener la biblioteca normativa')) return;
    this.normModal.set({ norm });
  }

  onNormSaved(n: ComplianceNorm, created: boolean) {
    this.normModal.set(null);
    this.selected.set(n.id);
    this.notify.emit(created ? `${n.code} agregada a la biblioteca. Agregue o importe sus requisitos.` : `${n.code} actualizada.`);
  }

  async saveVersion(n: ComplianceNorm) {
    try {
      const affected = await this.comp.registerVersion(n.id, this.versionForm());
      this.section.set('history');
      this.notify.emit(`${n.code}: versión ${this.versionForm().version.trim()} registrada.${affected ? ` ${affected === 1 ? '1 requisito queda' : `${affected} requisitos quedan`} por revisar.` : ''}`);
    } catch (err) {
      this.fail(err);
    }
  }

  async removeNorm(n: ComplianceNorm) {
    try {
      await this.comp.deleteNorm(n.id);
      this.selectNorm('');
      this.notify.emit(`${n.code} eliminada de la biblioteca.`);
    } catch (err) {
      this.fail(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Requisitos
  // ---------------------------------------------------------------------------

  newRequirement(n: ComplianceNorm) {
    this.editing.set(null);
    this.reqError.set('');
    this.reqForm.set({ chapter: n.id, numeral: '', title: '', requirement: '', frequency: 'Anual', module: 'cumplimiento-ran' });
  }

  editRequirement(r: ComplianceRequirement) {
    this.editing.set(null);
    this.reqError.set('');
    this.reqForm.set({ id: r.id, chapter: r.chapter, numeral: r.numeral, title: r.title, requirement: r.requirement, frequency: r.frequency, module: r.module ?? '' });
  }

  setReq<K extends keyof RequirementForm>(k: K, v: RequirementForm[K]) {
    this.reqForm.update(f => (f ? { ...f, [k]: v } : f));
  }

  async saveRequirement() {
    const f = this.reqForm();
    if (!f) return;
    this.reqError.set('');
    try {
      const req = await this.comp.saveRequirement(f);
      this.reqForm.set(null);
      this.notify.emit(`${f.id ? 'Requisito actualizado' : 'Requisito agregado'}: ${this.comp.normLabel(req.chapter)} ${req.numeral} ${req.title}.`);
    } catch (err) {
      if (err instanceof PermissionDeniedError) return;
      this.reqError.set((err as Error).message);
    }
  }

  async removeRequirement(r: ComplianceRequirement) {
    if (this.confirmDelete() !== r.id) {
      this.confirmDelete.set(r.id);
      setTimeout(() => { if (this.confirmDelete() === r.id) this.confirmDelete.set(null); }, 4000);
      return;
    }
    this.confirmDelete.set(null);
    try {
      await this.comp.deleteRequirement(r.id);
      this.notify.emit(`Requisito eliminado: ${r.title}.`);
    } catch (err) {
      this.fail(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Importación
  // ---------------------------------------------------------------------------

  setImportText(v: string) {
    this.importText.set(v);
  }

  async onImportFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.xlsx')) {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        const sheets = await readXlsxFile(file);
        const rows = (sheets[0]?.data ?? []) as unknown[][];
        this.importText.set(rows.map(r => r.map(c => (c === null || c === undefined ? '' : String(c).replace(/[\t\r\n]+/g, ' '))).join('\t')).join('\n'));
      } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
        this.importText.set(await file.text());
      } else {
        throw new Error('Formato no admitido. Use un archivo .xlsx o .csv.');
      }
      this.importFile.set(file.name);
    } catch (err) {
      this.notify.emit((err as Error).message || 'No se pudo leer el archivo.');
    }
  }

  async runImport(n: ComplianceNorm) {
    const p = this.importParsed();
    if (!p?.rows.length) return;
    try {
      const r = await this.comp.importRequirements(n.id, p.rows);
      this.section.set('');
      this.importText.set('');
      this.notify.emit(`${r.added} requisitos importados a ${n.code}${r.skipped ? ` (${r.skipped} ya existían)` : ''}.`);
    } catch (err) {
      this.fail(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Evaluación
  // ---------------------------------------------------------------------------

  edit(i: ComplianceRequirement) {
    this.reqForm.set(null);
    this.controlSearch.set('');
    const suggested = this.comp.suggestedStatus(i);
    this.editing.set({ ...i, controlIds: [...(i.controlIds ?? [])], status: i.status === 'Sin evaluar' && suggested ? suggested : i.status });
  }

  set<K extends keyof ComplianceRequirement>(k: K, v: ComplianceRequirement[K]) {
    this.editing.update(e => (e ? { ...e, [k]: v } : e));
  }

  toggleControl(id: string) {
    this.editing.update(e => {
      if (!e) return e;
      const ids = e.controlIds ?? [];
      return { ...e, controlIds: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] };
    });
  }

  async save() {
    const e = this.editing();
    if (!e) return;
    try {
      await this.comp.evaluate(e);
      this.editing.set(null);
      this.notify.emit(`${this.comp.normLabel(e.chapter)} ${e.numeral}: ${e.status}.`);
    } catch (err) {
      this.fail(err);
    }
  }

  private plansText(r: ComplianceRequirement) {
    const linked = this.actionPlans.forSource('Cumplimiento', r.id).filter(p => p.status !== 'Cancelado');
    return [r.actionPlan, ...linked.map(p => `${p.code} ${p.title} (${p.status}, ${p.owner})`)].filter(Boolean).join(' | ');
  }

  private plansDue(r: ComplianceRequirement) {
    const open = this.actionPlans.openForSource('Cumplimiento', r.id);
    return open.length ? open.map(p => p.dueDate).sort().at(-1) : undefined;
  }

  exportCsv() {
    if (!this.rs.requirePermission(['canExportReports'], 'exportar reportes')) return;
    const controls = new Map(this.rs.controls().map(c => [c.id, c]));
    const rows: (string | number | undefined)[][] = [
      ['Matriz de cumplimiento normativo', `Generado ${new Date().toISOString().slice(0, 16)}`, this.rs.currentProfile().name],
      [],
      ['Norma', 'Versión vigente', 'Aplicabilidad', 'Numeral', 'Requisito', 'Detalle', 'Módulo', 'Frecuencia', 'Controles vinculados',
        'Evidencia automática', 'Estado sugerido', 'Estado', 'Evidencia', 'Responsable', 'Planes de acción', 'Plazo', 'Última revisión',
        'Revisado por', 'Evaluado con versión', 'Próxima revisión'],
      ...this.comp.byNorm().flatMap(c => c.items.map(r => {
        const a = this.comp.autoCheck(r.autoCheck);
        const cov = this.comp.coverage(r);
        const evidence = [a?.text, cov?.text].filter(Boolean).join(' ');
        return [c.norm.code, c.norm.version, c.norm.applicability, r.numeral, r.title, r.requirement, r.module ? this.moduleLabel(r.module) : '', r.frequency,
          (r.controlIds ?? []).map(id => controls.get(id)?.code ?? id).join(', '), evidence, this.comp.suggestedStatus(r) ?? '', r.status,
          r.evidence, r.owner, this.plansText(r), this.plansDue(r) ?? r.dueDate ?? '', r.lastReviewDate ?? '', r.reviewedBy ?? '',
          r.lastReviewDate ? (this.evaluatedWith(r)) : '', this.comp.nextReview(r) ?? ''];
      })),
    ];
    downloadCsv(`Cumplimiento_normativo_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }
}
