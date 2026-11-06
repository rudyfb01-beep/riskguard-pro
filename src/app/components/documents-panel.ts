import { ChangeDetectionStrategy, Component, computed, effect, inject, output, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DocumentDraft, DocumentService } from '../services/document.service';
import { EvidenceService } from '../services/evidence.service';
import { ApprovalService } from '../services/approval.service';
import { ComplianceService } from '../services/compliance.service';
import { RiskDataService } from '../services/risk-data.service';
import { CatalogService } from '../services/catalog.service';
import { ApprovalBox } from './approval-box';
import { EvidenceFiles } from './evidence-files';
import {
  ControlledDocument, DOCUMENT_CLASSIFICATIONS, DOCUMENT_TYPES, DocumentDisplayStatus, DocumentType, DocumentVersion,
} from '../models/document.model';
import { EvidenceFile } from '../models/evidence.model';
import { downloadCsv } from '../utils/csv';
import { todayIso } from '../utils/action-plans';
import { isBoardDocument } from '../utils/documents';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500';
type View = 'biblioteca' | 'lectura' | 'obsoletos';

@Component({
  selector: 'app-documents-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, ApprovalBox, EvidenceFiles],
  template: `
    <section class="space-y-5">
      <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-wrap items-start gap-3">
        <div class="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center shrink-0"><mat-icon>description</mat-icon></div>
        <div class="flex-1 min-w-[260px]">
          <h2 class="text-lg font-bold text-slate-900">Gestión documental</h2>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Listado maestro de políticas, manuales y procedimientos. Cada versión lleva su archivo y se aprueba por el flujo de aprobaciones
            (políticas, manuales y reglamentos suman al Consejo); al aprobarse pasa a ser la vigente, se fija la próxima revisión y se pide a
            las personas que confirmen su lectura.
          </p>
        </div>
        <div class="flex gap-2">
          <button type="button" (click)="exportRegister()" class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">download</mat-icon>Listado maestro</button>
          @if (docs.canManage()) {
            <button type="button" (click)="openNew()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">add</mat-icon>Nuevo documento</button>
          }
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-6 gap-3">
        @for (k of tiles(); track k.label) {
          <button type="button" (click)="tile(k.view, k.status)" class="text-left bg-white rounded-xl border border-slate-200 p-3 cursor-pointer hover:border-slate-300">
            <div class="text-[10px] font-bold uppercase tracking-wide text-slate-500">{{ k.label }}</div>
            <div class="text-2xl font-bold mt-1" [class]="k.tone">{{ k.value }}</div>
            <div class="text-[11px] text-slate-500">{{ k.hint }}</div>
          </button>
        }
      </div>

      @if (selected(); as d) {
        <!-- ===================== DETALLE ===================== -->
        @let cur = docs.current(d);
        @let draft = docs.draft(d);
        @let st = docs.status(d);
        <div class="bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div class="p-5 border-b border-slate-100 space-y-2">
            <button type="button" (click)="selectedId.set(null)" class="text-[11px] text-emerald-700 hover:underline cursor-pointer flex items-center gap-0.5"><mat-icon class="text-[14px] w-3.5 h-3.5">arrow_back</mat-icon>Documentos</button>
            <div class="flex flex-wrap items-start gap-3">
              <div class="flex-1 min-w-[260px]">
                <div class="text-[11px] font-mono text-slate-500">{{ d.code }} · {{ d.type }} · {{ d.classification }}</div>
                <h3 class="text-base font-bold text-slate-900">{{ d.title }}</h3>
                @if (d.description) { <p class="text-xs text-slate-600 mt-1">{{ d.description }}</p> }
                <p class="text-[11px] text-slate-500 mt-1">Responsable: <strong class="text-slate-700">{{ d.owner || '—' }}</strong> · revisión cada {{ d.reviewMonths }} meses ·
                  dirigido a {{ audienceLabel(d) }}</p>
              </div>
              <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold" [class]="statusClass(st)">{{ st }}</span>
              @if (docs.canManage() && d.status === 'Activo') {
                <button type="button" (click)="openEdit(d)" class="px-2.5 py-1 text-[11px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Editar datos</button>
              }
            </div>
            @if (d.status === 'Obsoleto') { <p class="text-xs text-slate-600 bg-slate-100 rounded-lg p-2">Obsoleto: {{ d.obsoleteReason }}</p> }
          </div>

          @if (docs.mustAcknowledge(d) && cur) {
            <div class="mx-5 mt-4 p-3 rounded-xl border-2 border-sky-300 bg-sky-50 flex flex-wrap items-center gap-3 text-xs">
              <mat-icon class="text-sky-700">menu_book</mat-icon>
              <span class="flex-1 min-w-[200px] text-sky-900">Este documento le corresponde. Lea la versión {{ cur.version }} y confirme su lectura.</span>
              @if (fileOf(cur); as f) { <button type="button" (click)="evidence.open(f, true)" class="px-2.5 py-1 rounded-lg border border-sky-300 bg-white cursor-pointer">Abrir documento</button> }
              <button type="button" (click)="ack(d)" class="px-3 py-1 rounded-lg bg-sky-700 text-white font-semibold cursor-pointer">He leído y comprendo</button>
            </div>
          }

          <div class="p-5 grid lg:grid-cols-2 gap-4 text-xs">
            <!-- Versión vigente -->
            <div class="rounded-xl border border-slate-200 p-3 space-y-1.5">
              <div class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Versión vigente</div>
              @if (cur) {
                <div class="text-sm font-bold text-slate-900">Versión {{ cur.version }}</div>
                <div class="text-slate-600">Vigente desde {{ cur.effectiveDate }} · aprobada por {{ cur.approvedBy }} ({{ cur.approvalCode }})</div>
                <div [class]="d.nextReviewDate && d.nextReviewDate < today ? 'text-rose-700 font-semibold' : 'text-slate-600'">Próxima revisión: {{ d.nextReviewDate }}</div>
                @if (cur.changeSummary) { <div class="text-slate-700">{{ cur.changeSummary }}</div> }
                @if (fileOf(cur); as f) {
                  <div class="flex items-center gap-2 pt-1">
                    <button type="button" (click)="evidence.open(f, true)" class="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-semibold cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">visibility</mat-icon>Ver</button>
                    <button type="button" (click)="evidence.open(f)" class="px-2.5 py-1 rounded-lg border border-slate-300 cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">download</mat-icon>{{ f.fileName }}</button>
                    <span class="font-mono text-[10px] text-slate-400" [title]="'SHA-256 ' + f.sha256">{{ f.sha256.slice(0, 12) }}…</span>
                  </div>
                }
              } @else {
                <p class="text-slate-500">Aún no hay una versión aprobada.</p>
              }
            </div>

            <!-- Borrador / nueva versión -->
            <div class="rounded-xl border p-3 space-y-2" [class]="draft ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'">
              <div class="text-[10px] font-bold uppercase tracking-wide text-slate-500">{{ draft ? 'Borrador en preparación' : 'Nueva versión' }}</div>
              @if (draft) {
                <div class="text-sm font-bold text-slate-900">Versión {{ draft.version }} <span class="text-[11px] font-normal text-slate-500">· {{ draft.createdBy }}, {{ draft.createdAt.slice(0, 10) }}</span></div>
                @if (draft.changeSummary) { <div class="text-slate-700">{{ draft.changeSummary }}</div> }
                <app-evidence-files entity="documents" [entityId]="d.id" [context]="draft.id" [label]="d.code + ' v' + draft.version" [parent]="d"
                  [readonly]="pending(d)" title="Archivo de la versión" [withDescription]="false"
                  emptyText="Adjunte el documento (PDF o Word). El último archivo cargado queda como el de esta versión." (uploaded)="onVersionFile(d, draft, $event)" />
                @if (draft.fileName) { <p class="text-[11px] text-slate-600">Archivo de la versión: <strong>{{ draft.fileName }}</strong></p> }
                <app-approval-box kind="documento" [targetId]="d.id" [targetLabel]="d.code + ' ' + d.title" title="Aprobación de la versión"
                  requestLabel="Enviar a aprobación" [defaults]="{ versionId: draft.id, version: draft.version, docType: d.type }"
                  [hint]="!draft.fileId ? 'Adjunte el archivo antes de enviarla.' : isBoard(d.type) ? 'Por ser ' + d.type.toLowerCase() + ', la aprueba también el Consejo.' : ''"
                  (notify)="notify.emit($event)" />
                @if (docs.canManage() && !pending(d)) {
                  <button type="button" (click)="removeDraft(d, draft)" class="text-[11px] text-rose-700 hover:underline cursor-pointer">Eliminar borrador</button>
                }
              } @else if (docs.canManage() && d.status === 'Activo') {
                @if (versionForm(); as vf) {
                  <div class="grid grid-cols-3 gap-2">
                    <label class="block"><span class="block text-[10px] text-slate-600 mb-0.5">Versión</span><input [class]="inputCls" [value]="vf.version" (input)="setVf('version', $any($event.target).value)" /></label>
                    <label class="block col-span-2"><span class="block text-[10px] text-slate-600 mb-0.5">Qué cambia</span><input [class]="inputCls" [value]="vf.summary" (input)="setVf('summary', $any($event.target).value)" /></label>
                  </div>
                  <div class="flex gap-2 justify-end">
                    <button type="button" (click)="versionForm.set(null)" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white cursor-pointer">Cancelar</button>
                    <button type="button" (click)="createVersion(d)" class="px-3 py-1 rounded-lg bg-emerald-700 text-white font-semibold cursor-pointer">Crear borrador</button>
                  </div>
                } @else {
                  <p class="text-slate-600">{{ cur ? 'Para actualizar el documento, cree una nueva versión, adjunte el archivo y envíela a aprobación.' : 'Cree la primera versión, adjunte el archivo y envíela a aprobación.' }}</p>
                  <div class="flex gap-2">
                    <button type="button" (click)="startVersion(d, true)" class="px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-semibold cursor-pointer">{{ cur ? 'Nueva versión ' + docs.suggestVersion(d, true) : 'Crear versión 1.0' }}</button>
                    @if (cur) { <button type="button" (click)="startVersion(d, false)" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white cursor-pointer">Cambio menor {{ docs.suggestVersion(d, false) }}</button> }
                  </div>
                }
              } @else {
                <p class="text-slate-500">Sin borradores.</p>
              }
            </div>

            <!-- Difusión -->
            <div class="rounded-xl border border-slate-200 p-3 space-y-2">
              @let a = docs.acks(d);
              <div class="flex items-center gap-2">
                <span class="text-[10px] font-bold uppercase tracking-wide text-slate-500 flex-1">Difusión y lectura</span>
                @if (cur) { <button type="button" (click)="exportAcks(d)" class="text-[11px] text-emerald-700 hover:underline cursor-pointer">Exportar</button> }
              </div>
              @if (cur) {
                <div class="flex items-center gap-2">
                  <div class="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-sky-600" [style.width.%]="a.pct"></div></div>
                  <span class="font-semibold tabular-nums">{{ a.done }}/{{ a.total }} ({{ a.pct }} %)</span>
                </div>
                @if (a.pending.length) {
                  <details><summary class="cursor-pointer text-slate-600">Pendientes ({{ a.pending.length }})</summary>
                    <p class="mt-1 text-slate-600">{{ names(a.pending) }}</p></details>
                }
              } @else { <p class="text-slate-500">Se pide al aprobarse la primera versión.</p> }
            </div>

            <!-- Requisitos que respalda -->
            <div class="rounded-xl border border-slate-200 p-3 space-y-1.5">
              <div class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Requisitos normativos que respalda</div>
              @for (r of requirementsOf(d); track r.id) {
                <div class="text-slate-700"><span class="font-mono text-slate-500">{{ normCode(r.chapter) }} {{ r.numeral }}</span> {{ r.title }}
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{{ r.status }}</span></div>
              } @empty { <p class="text-slate-500">No está vinculado a requisitos. Vincúlelo en "Editar datos".</p> }
              @if (d.processes.length) { <p class="text-slate-600 pt-1">Procesos: {{ d.processes.join(', ') }}</p> }
            </div>
          </div>

          <!-- Historial -->
          <div class="px-5 pb-5">
            <div class="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Historial de versiones</div>
            <div class="overflow-x-auto border border-slate-200 rounded-lg">
              <table class="w-full text-[11px]">
                <thead class="bg-slate-50 text-slate-500"><tr>
                  <th class="text-left px-2 py-1.5">Versión</th><th class="text-left px-2 py-1.5">Estado</th><th class="text-left px-2 py-1.5">Cambios</th>
                  <th class="text-left px-2 py-1.5">Aprobación</th><th class="text-left px-2 py-1.5">Vigencia</th><th class="text-left px-2 py-1.5">Archivo</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-100">
                  @for (v of versionsDesc(d); track v.id) {
                    <tr>
                      <td class="px-2 py-1.5 font-mono font-semibold">{{ v.version }}</td>
                      <td class="px-2 py-1.5"><span class="px-1.5 py-0.5 rounded font-semibold" [class]="v.status === 'Vigente' ? 'bg-emerald-100 text-emerald-800' : v.status === 'Borrador' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'">{{ v.status === 'Borrador' && pending(d) ? 'En aprobación' : v.status }}</span></td>
                      <td class="px-2 py-1.5 text-slate-700">{{ v.changeSummary || '—' }}</td>
                      <td class="px-2 py-1.5 text-slate-600">{{ v.approvedBy ? v.approvedBy + ' · ' + v.approvedAt + ' (' + v.approvalCode + ')' : '—' }}</td>
                      <td class="px-2 py-1.5 text-slate-600 whitespace-nowrap">{{ v.effectiveDate ? v.effectiveDate + (v.replacedAt ? ' → ' + v.replacedAt : '') : '—' }}</td>
                      <td class="px-2 py-1.5">@if (fileOf(v); as f) { <button type="button" (click)="evidence.open(f)" class="text-emerald-700 hover:underline cursor-pointer">{{ f.fileName }}</button> } @else { — }</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            @if (docs.canManage() && d.status === 'Activo') {
              <div class="mt-3">
                @if (obsoleteFor() === d.id) {
                  <div class="flex gap-2 items-center">
                    <input [class]="inputCls" [value]="reason()" (input)="reason.set($any($event.target).value)" placeholder="Motivo (reemplazado por otro documento, proceso eliminado…)" />
                    <button type="button" (click)="obsoleteFor.set(null)" class="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white cursor-pointer">Cancelar</button>
                    <button type="button" (click)="markObsolete(d)" class="px-3 py-1 text-xs rounded-lg bg-rose-600 text-white font-semibold cursor-pointer whitespace-nowrap">Marcar obsoleto</button>
                  </div>
                } @else {
                  <button type="button" (click)="obsoleteFor.set(d.id); reason.set('')" class="text-[11px] text-rose-700 hover:underline cursor-pointer">Marcar como obsoleto</button>
                }
              </div>
            }
          </div>
        </div>
      } @else {
        <!-- ===================== LISTA ===================== -->
        <div class="bg-white rounded-2xl border border-slate-200 shadow-2xs">
          <div class="p-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
            @for (v of views; track v.id) {
              <button type="button" (click)="view.set(v.id)" class="px-3 py-1.5 text-xs rounded-lg font-semibold cursor-pointer"
                [class]="view() === v.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'">{{ v.label }}@if (v.id === 'lectura' && docs.myPending().length) { ({{ docs.myPending().length }}) }</button>
            }
            <span class="flex-1"></span>
            <input type="search" [value]="search()" (input)="search.set($any($event.target).value)" placeholder="Buscar código, título o responsable..." class="text-xs rounded-lg border border-slate-300 px-3 py-1.5 w-60" />
            <select [class]="selectCls" [value]="typeFilter()" (change)="typeFilter.set($any($event.target).value)" aria-label="Tipo">
              <option value="">Todos los tipos</option>@for (t of types; track t.id) { <option [value]="t.id">{{ t.id }}</option> }
            </select>
            <select [class]="selectCls" [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)" aria-label="Estado">
              <option value="">Todos los estados</option>@for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
            </select>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>
                <th class="text-left px-4 py-2">Código</th><th class="text-left px-3 py-2">Documento</th><th class="text-left px-3 py-2">Versión</th>
                <th class="text-left px-3 py-2">Próxima revisión</th><th class="text-left px-3 py-2">Lectura</th><th class="text-left px-3 py-2">Estado</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-100">
                @for (d of list(); track d.id) {
                  @let st = docs.status(d);
                  @let cur = docs.current(d);
                  <tr class="hover:bg-slate-50 cursor-pointer" (click)="select(d.id)">
                    <td class="px-4 py-2.5 font-mono font-semibold text-slate-700 whitespace-nowrap">{{ d.code }}</td>
                    <td class="px-3 py-2.5"><div class="font-semibold text-slate-900">{{ d.title }}</div><div class="text-[11px] text-slate-500">{{ d.type }} · {{ d.owner || '—' }}</div></td>
                    <td class="px-3 py-2.5 font-mono">{{ cur ? 'v' + cur.version : '—' }}@if (docs.draft(d); as dr) { <span class="text-amber-700"> · borrador v{{ dr.version }}</span> }</td>
                    <td class="px-3 py-2.5 font-mono whitespace-nowrap" [class.text-rose-700]="!!d.nextReviewDate && d.nextReviewDate < today">{{ d.nextReviewDate || '—' }}</td>
                    <td class="px-3 py-2.5">@if (cur) { {{ docs.acks(d).pct }} % } @else { — }@if (docs.mustAcknowledge(d)) { <span class="ml-1 px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 text-[10px] font-semibold">pendiente suya</span> }</td>
                    <td class="px-3 py-2.5"><span class="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap" [class]="statusClass(st)">{{ st }}</span></td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">{{ view() === 'lectura' ? 'No tiene lecturas pendientes.' : 'No hay documentos con estos filtros.' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>

    <!-- ===================== FORMULARIO ===================== -->
    @if (form(); as f) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Documento">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 class="text-base font-bold text-slate-900">{{ editingId() ? 'Editar documento' : 'Nuevo documento' }}</h2>
            <button type="button" (click)="form.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer" aria-label="Cerrar"><mat-icon>close</mat-icon></button>
          </div>
          <div class="p-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Título *</span><input id="doc-title" [class]="inputCls" [value]="f.title" (input)="setF('title', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Tipo</span>
              <select [class]="inputCls" (change)="setF('type', $any($event.target).value)" [disabled]="!!editingId()">@for (t of types; track t.id) { <option [value]="t.id" [selected]="t.id === f.type">{{ t.id }}</option> }</select></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Responsable</span>
              <input [class]="inputCls" list="doc-owners" [value]="f.owner" (input)="setF('owner', $any($event.target).value)" />
              <datalist id="doc-owners">@for (u of users(); track u.id) { <option [value]="u.name"></option> }</datalist></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Clasificación</span>
              <select [class]="inputCls" (change)="setF('classification', $any($event.target).value)">@for (c of classifications; track c) { <option [value]="c" [selected]="c === f.classification">{{ c }}</option> }</select></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Revisión cada (meses)</span><input type="number" min="1" max="60" [class]="inputCls" [value]="f.reviewMonths" (input)="setF('reviewMonths', +$any($event.target).value)" /></label>
            <label class="block sm:col-span-3"><span class="block text-[11px] font-medium text-slate-600 mb-1">Descripción y alcance</span><textarea rows="2" [class]="inputCls" [value]="f.description" (input)="setF('description', $any($event.target).value)"></textarea></label>

            <fieldset class="sm:col-span-3">
              <legend class="text-[11px] font-medium text-slate-600 mb-1">Deben conocerlo (sin marcar: todas las personas)</legend>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                @for (r of roles(); track r.id) {
                  <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" class="accent-emerald-600" [checked]="f.audienceRoleIds.includes(r.id)" (change)="toggle('audienceRoleIds', r.id)" />{{ r.title }}</label>
                }
              </div>
            </fieldset>

            <fieldset class="sm:col-span-3">
              <legend class="text-[11px] font-medium text-slate-600 mb-1">Requisitos normativos que respalda ({{ f.requirementIds.length }})</legend>
              <input type="search" [value]="reqSearch()" (input)="reqSearch.set($any($event.target).value)" placeholder="Buscar requisito (p. ej. política, continuidad, LA/FT)..." class="text-[11px] rounded-lg border border-slate-300 px-2 py-1 w-full mb-1.5" />
              <div class="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                @for (r of reqOptions(); track r.id) {
                  <label class="px-2.5 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-slate-50">
                    <input type="checkbox" class="accent-emerald-600" [checked]="f.requirementIds.includes(r.id)" (change)="toggle('requirementIds', r.id)" />
                    <span class="font-mono text-slate-500 w-28 shrink-0 truncate">{{ normCode(r.chapter) }} {{ r.numeral }}</span><span class="truncate">{{ r.title }}</span>
                  </label>
                }
              </div>
            </fieldset>

            <fieldset class="sm:col-span-3">
              <legend class="text-[11px] font-medium text-slate-600 mb-1">Procesos</legend>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                @for (p of processes(); track p) {
                  <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" class="accent-emerald-600" [checked]="f.processes.includes(p)" (change)="toggle('processes', p)" />{{ p }}</label>
                }
              </div>
            </fieldset>
          </div>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
            <span class="text-[11px] text-rose-700 flex-1" role="alert">{{ formError() }}</span>
            <button type="button" (click)="form.set(null)" class="px-4 py-2 text-xs rounded-lg border border-slate-300 bg-white cursor-pointer">Cancelar</button>
            <button type="button" (click)="saveForm()" class="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer">{{ editingId() ? 'Guardar' : 'Crear documento' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class DocumentsPanel {
  readonly docs = inject(DocumentService);
  readonly evidence = inject(EvidenceService);
  private readonly approvals = inject(ApprovalService);
  private readonly comp = inject(ComplianceService);
  private readonly rs = inject(RiskDataService);
  private readonly cat = inject(CatalogService);

  readonly notify = output<string>();

  readonly inputCls = INPUT;
  readonly selectCls = INPUT.replace('w-full ', '');
  readonly today = todayIso();
  readonly types = DOCUMENT_TYPES;
  readonly classifications = DOCUMENT_CLASSIFICATIONS;
  readonly statuses: DocumentDisplayStatus[] = ['Vigente', 'Revisión vencida', 'En aprobación', 'Borrador'];
  readonly views: { id: View; label: string }[] = [
    { id: 'biblioteca', label: 'Biblioteca' }, { id: 'lectura', label: 'Mis lecturas pendientes' }, { id: 'obsoletos', label: 'Obsoletos' },
  ];

  readonly view = signal<View>(this.docs.myPending().length ? 'lectura' : 'biblioteca');
  readonly search = signal('');
  readonly typeFilter = signal<DocumentType | ''>('');
  readonly statusFilter = signal<DocumentDisplayStatus | ''>('');
  readonly selectedId = signal<string | null>(null);
  readonly versionForm = signal<{ version: string; summary: string } | null>(null);
  readonly obsoleteFor = signal<string | null>(null);
  readonly reason = signal('');
  readonly form = signal<DocumentDraft | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly formError = signal('');
  readonly reqSearch = signal('');

  readonly roles = computed(() => this.rs.organizationalRoles());
  readonly users = computed(() => this.rs.userProfiles().filter(u => u.active !== false));
  readonly processes = computed(() => this.cat.processNames());

  constructor() {
    effect(() => {
      const req = this.docs.openRequest();
      if (!req) return;
      untracked(() => { this.docs.openRequest.set(null); this.select(req.id); });
    });
  }

  readonly selected = computed(() => this.docs.get(this.selectedId() ?? undefined) ?? null);

  readonly list = computed(() => {
    const q = this.search().trim().toLowerCase();
    const t = this.typeFilter();
    const s = this.statusFilter();
    const base = this.view() === 'lectura' ? this.docs.myPending()
      : this.docs.sorted().filter(d => (this.view() === 'obsoletos') === (d.status === 'Obsoleto'));
    return base.filter(d => (!t || d.type === t) && (!s || this.docs.status(d) === s)
      && (!q || `${d.code} ${d.title} ${d.owner}`.toLowerCase().includes(q)));
  });

  readonly tiles = computed(() => {
    const k = this.docs.kpis();
    return [
      { label: 'Vigentes', value: k.vigentes, hint: `${k.porVencer} por revisar en 30 días`, tone: 'text-emerald-700', view: 'biblioteca' as View, status: 'Vigente' as const },
      { label: 'Revisión vencida', value: k.vencidos, hint: 'requieren nueva versión', tone: k.vencidos ? 'text-rose-600' : 'text-slate-400', view: 'biblioteca' as View, status: 'Revisión vencida' as const },
      { label: 'En aprobación', value: k.enAprobacion, hint: 'versiones enviadas', tone: 'text-amber-600', view: 'biblioteca' as View, status: 'En aprobación' as const },
      { label: 'Borradores', value: k.borradores, hint: 'sin versión aprobada', tone: 'text-slate-900', view: 'biblioteca' as View, status: 'Borrador' as const },
      { label: 'Lectura', value: k.lectura === null ? '—' : `${k.lectura} %`, hint: 'confirmada por el público objetivo', tone: 'text-sky-700', view: 'biblioteca' as View, status: '' as const },
      { label: 'Mis pendientes', value: this.docs.myPending().length, hint: 'documentos por leer', tone: this.docs.myPending().length ? 'text-sky-700' : 'text-slate-400', view: 'lectura' as View, status: '' as const },
    ];
  });

  readonly reqOptions = computed(() => {
    const q = this.reqSearch().trim().toLowerCase();
    const selected = new Set(this.form()?.requirementIds ?? []);
    return this.comp.requirements()
      .filter(r => selected.has(r.id) || !q || `${r.numeral} ${r.title} ${this.normCode(r.chapter)}`.toLowerCase().includes(q))
      .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)))
      .slice(0, 80);
  });

  tile(v: View, s: DocumentDisplayStatus | '') {
    this.selectedId.set(null);
    this.view.set(v);
    this.statusFilter.set(s);
  }

  select(id: string) {
    this.versionForm.set(null);
    this.obsoleteFor.set(null);
    this.selectedId.set(id);
  }

  pending(d: ControlledDocument) {
    return this.docs.pendingApproval(d.id);
  }

  isBoard(t: DocumentType) {
    return isBoardDocument(t);
  }

  fileOf(v: DocumentVersion): EvidenceFile | undefined {
    return v.fileId ? this.evidence.files().find(f => f.id === v.fileId && !f.deletedAt) : undefined;
  }

  versionsDesc(d: ControlledDocument) {
    return [...d.versions].reverse();
  }

  requirementsOf(d: ControlledDocument) {
    const ids = new Set(d.requirementIds);
    return this.comp.requirements().filter(r => ids.has(r.id));
  }

  normCode(id: string) {
    return this.comp.norm(id)?.code ?? id;
  }

  audienceLabel(d: ControlledDocument) {
    if (!d.audienceRoleIds.length) return 'todas las personas';
    return d.audienceRoleIds.map(id => this.roles().find(r => r.id === id)?.title ?? id).join(', ');
  }

  names(list: { name: string }[]) {
    return list.map(u => u.name).join(', ');
  }

  statusClass(s: DocumentDisplayStatus) {
    return s === 'Vigente' ? 'bg-emerald-100 text-emerald-800' : s === 'Revisión vencida' ? 'bg-rose-100 text-rose-800'
      : s === 'En aprobación' ? 'bg-amber-100 text-amber-800' : s === 'Obsoleto' ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-700';
  }

  // --- Formulario

  openNew() {
    this.editingId.set(null);
    this.formError.set('');
    this.reqSearch.set('');
    this.form.set({
      title: '', type: 'Política', description: '', owner: this.rs.currentProfile().name, classification: 'Interna', reviewMonths: 12,
      audienceRoleIds: [], requirementIds: [], processes: [],
    });
  }

  openEdit(d: ControlledDocument) {
    this.editingId.set(d.id);
    this.formError.set('');
    this.reqSearch.set('');
    this.form.set({
      title: d.title, type: d.type, description: d.description, owner: d.owner, classification: d.classification, reviewMonths: d.reviewMonths,
      audienceRoleIds: [...d.audienceRoleIds], requirementIds: [...d.requirementIds], processes: [...d.processes],
    });
  }

  setF<K extends keyof DocumentDraft>(k: K, v: DocumentDraft[K]) {
    this.form.update(f => (f ? { ...f, [k]: v } : f));
  }

  toggle(k: 'audienceRoleIds' | 'requirementIds' | 'processes', id: string) {
    this.form.update(f => (f ? { ...f, [k]: f[k].includes(id) ? f[k].filter(x => x !== id) : [...f[k], id] } : f));
  }

  async saveForm() {
    const f = this.form();
    if (!f) return;
    if (!f.title.trim()) { this.formError.set('Indique el título.'); return; }
    if (!(f.reviewMonths >= 1 && f.reviewMonths <= 60)) { this.formError.set('La revisión debe ser entre 1 y 60 meses.'); return; }
    try {
      if (this.editingId()) {
        await this.docs.edit(this.editingId()!, f);
        this.notify.emit('Documento actualizado.');
      } else {
        const d = await this.docs.create(f);
        this.notify.emit(`${d.code} creado. Cree la primera versión y adjunte el archivo.`);
        this.select(d.id);
      }
      this.form.set(null);
    } catch (e) {
      this.formError.set((e as Error).message);
    }
  }

  // --- Versiones

  startVersion(d: ControlledDocument, major: boolean) {
    this.versionForm.set({ version: this.docs.suggestVersion(d, major), summary: '' });
  }

  setVf(k: 'version' | 'summary', v: string) {
    this.versionForm.update(f => (f ? { ...f, [k]: v } : f));
  }

  async createVersion(d: ControlledDocument) {
    const f = this.versionForm();
    if (!f) return;
    try {
      const v = await this.docs.newVersion(d.id, f.version, f.summary);
      this.versionForm.set(null);
      this.notify.emit(`Borrador v${v.version} creado: adjunte el archivo y envíelo a aprobación.`);
    } catch { /* el servicio ya avisó */ }
  }

  onVersionFile(d: ControlledDocument, v: DocumentVersion, f: EvidenceFile) {
    this.docs.setVersionFile(d.id, v.id, f);
  }

  async removeDraft(d: ControlledDocument, v: DocumentVersion) {
    try { await this.docs.removeDraft(d.id, v.id); this.notify.emit(`Borrador v${v.version} eliminado.`); } catch { /* aviso del servicio */ }
  }

  async markObsolete(d: ControlledDocument) {
    try { await this.docs.markObsolete(d.id, this.reason()); this.obsoleteFor.set(null); this.notify.emit(`${d.code} quedó obsoleto.`); } catch { /* aviso del servicio */ }
  }

  async ack(d: ControlledDocument) {
    try { await this.docs.acknowledge(d.id); this.notify.emit(`Lectura de ${d.code} registrada.`); } catch { /* aviso del servicio */ }
  }

  // --- Exportaciones

  exportRegister() {
    if (!this.rs.requirePermission(['canExportReports'], 'exportar reportes')) return;
    const rows: (string | number | undefined)[][] = [
      ['Código', 'Título', 'Tipo', 'Clasificación', 'Responsable', 'Versión vigente', 'Vigente desde', 'Aprobado por', 'Próxima revisión', 'Estado', 'Lectura %', 'Requisitos', 'Procesos'],
      ...this.docs.sorted().map(d => {
        const v = this.docs.current(d);
        return [d.code, d.title, d.type, d.classification, d.owner, v?.version ?? '', v?.effectiveDate ?? '', v?.approvedBy ?? '', d.nextReviewDate ?? '',
          this.docs.status(d), v ? this.docs.acks(d).pct : '', this.requirementsOf(d).map(r => `${this.normCode(r.chapter)} ${r.numeral}`).join('; '), d.processes.join('; ')];
      }),
    ];
    downloadCsv(`Listado_maestro_documentos_${this.today}.csv`, rows);
  }

  exportAcks(d: ControlledDocument) {
    const v = this.docs.current(d);
    if (!v) return;
    const a = this.docs.acks(d);
    const done = d.acknowledgments.filter(x => x.versionId === v.id);
    const rows: (string | number | undefined)[][] = [
      ['Documento', 'Versión', 'Persona', 'Estado', 'Fecha'],
      ...done.map(x => [d.code, v.version, x.userName, 'Leído', x.at.slice(0, 16).replace('T', ' ')]),
      ...a.pending.map(u => [d.code, v.version, u.name, 'Pendiente', '']),
    ];
    downloadCsv(`Lectura_${d.code}_v${v.version}.csv`, rows);
  }
}
