import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService, formatMinutes } from '../services/risk-data.service';
import { ResilienceService } from '../services/resilience.service';
import { SecurityService } from '../services/security.service';
import { MilestoneStatus, OperationalFlaw, RAN208_CHANNELS, Ran208Details, RegulatoryMilestoneTemplate } from '../models/risk.model';

type Unit = 'min' | 'h' | 'd';
interface EditableMilestone extends RegulatoryMilestoneTemplate { amount: number; unit: Unit; }

/**
 * Seguimiento de reportes de incidentes a la CMF y a la ANCI: plazos desde la
 * toma de conocimiento, registro de envíos con folio, actualizaciones y cierre.
 */
@Component({
  selector: 'app-regulatory-reporting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-4">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-rose-100 text-rose-800 rounded-lg"><mat-icon class="text-lg">gavel</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Reporte Regulatorio de Incidentes</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            CMF: RAN CACs, CAC-3 §5.2 (remite al N°1.1 del Capítulo 20-8 de la RAN): reporte inicial dentro de 30 minutos
            desde la ocurrencia, actualizaciones mientras dure y reporte de cierre. ANCI: ciberincidentes (Ley 21.663).
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
        <button type="button" (click)="exportCsv()"
          class="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 flex items-center gap-1.5 cursor-pointer">
          <mat-icon class="text-sm text-emerald-600">download</mat-icon><span>Exportar CSV</span>
        </button>
        <button type="button" (click)="showConfig.set(!showConfig())" [class.perm-hidden]="!rs.canAny('canManageRegulatoryReports')"
          class="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 flex items-center gap-1.5 shrink-0 cursor-pointer">
          <mat-icon class="text-sm">tune</mat-icon>
          <span>{{ showConfig() ? 'Ocultar plazos' : 'Configurar plazos' }}</span>
        </button>
        </div>
      </div>

      <div class="p-3 rounded-xl border border-amber-200 bg-amber-50 text-[11px] text-amber-900 flex items-start gap-2">
        <mat-icon class="text-sm text-amber-600 shrink-0">info</mat-icon>
        <span>
          CMF: 30 minutos <strong>desde la ocurrencia</strong> según el texto del Capítulo 20-8 (si el incidente se detecta tarde,
          el plazo puede estar vencido al tomar conocimiento: documente la causa). ANCI: alerta temprana 3 h, segundo informe 72 h
          e informe final 15 días desde la toma de conocimiento (<strong>referenciales</strong>, validar con Cumplimiento).
          Todo es ajustable en "Configurar plazos".
        </span>
      </div>

      <!-- Configuración de plazos -->
      @if (showConfig()) {
        <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <h2 class="text-sm font-bold text-slate-900">Plazos de reporte (desde la toma de conocimiento)</h2>
            @if (!canManage()) {
              <span class="text-[11px] text-slate-500">Solo lectura: requiere permiso "Reporte Regulatorio CMF / ANCI".</span>
            }
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead class="text-[11px] text-slate-500 border-b border-slate-200">
                <tr>
                  <th class="text-left py-2 pr-3">Autoridad</th>
                  <th class="text-left py-2 pr-3">Hito</th>
                  <th class="text-left py-2 pr-3">Plazo</th>
                  <th class="text-left py-2 pr-3">Se cuenta desde</th>
                  <th class="text-center py-2">Activo</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (m of draftMilestones(); track m.id; let i = $index) {
                  <tr>
                    <td class="py-2 pr-3"><span class="px-2 py-0.5 rounded font-bold text-[10px]" [class]="authorityClass(m.authority)">{{ m.authority }}</span></td>
                    <td class="py-2 pr-3 text-slate-800 font-medium">{{ m.name }}</td>
                    <td class="py-2 pr-3">
                      <div class="flex items-center gap-1.5" [class.invisible]="m.dueOnClose">
                        <input type="number" min="1" [value]="m.amount" [disabled]="!canManage()"
                          (input)="patchDraft(i, { amount: +$any($event.target).value })"
                          class="w-20 text-xs rounded-lg border border-slate-300 px-2 py-1 font-mono disabled:bg-slate-100" />
                        <select [value]="m.unit" [disabled]="!canManage()"
                          (change)="patchDraft(i, { unit: $any($event.target).value })"
                          class="text-xs rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-100">
                          <option value="min">minutos</option>
                          <option value="h">horas</option>
                          <option value="d">días corridos</option>
                        </select>
                      </div>
                    </td>
                    <td class="py-2 pr-3">
                      @if (m.dueOnClose) {
                        <span class="text-[11px] text-slate-500">Al cerrar el incidente</span>
                      } @else {
                        <select [value]="m.basis || 'conocimiento'" [disabled]="!canManage()"
                          (change)="patchDraft(i, { basis: $any($event.target).value })"
                          class="text-xs rounded-lg border border-slate-300 px-2 py-1 disabled:bg-slate-100">
                          <option value="ocurrencia">Ocurrencia del incidente</option>
                          <option value="conocimiento">Toma de conocimiento</option>
                        </select>
                      }
                    </td>
                    <td class="py-2 text-center">
                      <input type="checkbox" [checked]="m.enabled" [disabled]="!canManage()"
                        (change)="patchDraft(i, { enabled: $any($event.target).checked })" class="rounded text-emerald-600" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (canManage()) {
            <div class="flex justify-end gap-2">
              <button type="button" (click)="resetDraft()" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer">Descartar</button>
              <button type="button" (click)="saveConfig()" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 cursor-pointer">Guardar plazos</button>
            </div>
          }
        </div>
      }

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200">
          <span class="text-[11px] font-semibold text-slate-500 block">Reportes abiertos</span>
          <span class="text-2xl font-bold font-mono text-slate-900">{{ summary().open }}</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30">
          <span class="text-[11px] font-semibold text-amber-800 block">Hitos pendientes</span>
          <span class="text-2xl font-bold font-mono text-amber-900">{{ summary().pending }}</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30">
          <span class="text-[11px] font-semibold text-rose-800 block">Hitos vencidos sin enviar</span>
          <span class="text-2xl font-bold font-mono text-rose-700">{{ summary().overdue }}</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30">
          <span class="text-[11px] font-semibold text-emerald-800 block">Envíos dentro de plazo</span>
          <span class="text-2xl font-bold font-mono text-emerald-700">{{ summary().onTimePct === null ? '—' : summary().onTimePct + '%' }}</span>
        </div>
      </div>

      <!-- Iniciar reporte -->
      @if (canStart() && candidates().length > 0) {
        <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-end gap-3">
          <div class="flex-1 min-w-0">
            <label for="start-incident" class="block text-[11px] font-semibold text-slate-600 mb-1">Iniciar reporte para un incidente registrado</label>
            <select id="start-incident" [value]="startIncidentId()" (change)="startIncidentId.set($any($event.target).value)"
              class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2">
              <option value="">— Seleccionar incidente —</option>
              @for (f of candidates(); track f.id) {
                <option [value]="f.id">[{{ f.severity }}] {{ f.title }}</option>
              }
            </select>
          </div>
          <div>
            <label for="start-occurred" class="block text-[11px] font-semibold text-slate-600 mb-1">Inicio del incidente</label>
            <input id="start-occurred" type="datetime-local" [value]="startOccurred()" (input)="startOccurred.set($any($event.target).value)"
              class="text-xs rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div>
            <label for="start-awareness" class="block text-[11px] font-semibold text-slate-600 mb-1">Toma de conocimiento</label>
            <input id="start-awareness" type="datetime-local" [value]="startAwareness()" (input)="startAwareness.set($any($event.target).value)"
              class="text-xs rounded-lg border border-slate-300 px-3 py-2" />
          </div>
          <div class="flex items-center gap-3 text-xs pb-2">
            <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" [checked]="startCMF()" (change)="startCMF.set($any($event.target).checked)" class="rounded text-rose-600" /> CMF</label>
            <label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" [checked]="startANCI()" (change)="startANCI.set($any($event.target).checked)" class="rounded text-rose-600" /> ANCI</label>
          </div>
          <button type="button" (click)="startReport()" [disabled]="!startIncidentId() || (!startCMF() && !startANCI())"
            class="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            <mat-icon class="text-sm">timer</mat-icon><span>Iniciar conteo</span>
          </button>
        </div>
      }

      <!-- Reportes -->
      @if (rs.regulatoryIncidents().length === 0) {
        <div class="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
          No hay incidentes con reporte regulatorio en curso.
        </div>
      }

      <div class="space-y-4">
        @for (f of rs.regulatoryIncidents(); track f.id) {
          @let r = f.regulatoryReport!;
          <div class="bg-white rounded-2xl border shadow-2xs overflow-hidden"
            [class]="r.status === 'Cerrado' ? 'border-slate-200 opacity-90' : hasOverdue(f) ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'">

            <div class="px-5 py-3.5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-2"
              [class]="r.status === 'Cerrado' ? 'bg-slate-50' : 'bg-white'">
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-mono text-[11px] text-slate-500 font-bold">{{ f.id }}</span>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold border" [class]="severityClass(f.severity)">{{ f.severity }}</span>
                  @if (r.reportableToCMF) { <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" [class]="authorityClass('CMF')">CMF</span> }
                  @if (r.reportableToANCI) { <span class="px-1.5 py-0.5 rounded text-[10px] font-bold" [class]="authorityClass('ANCI')">ANCI</span> }
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    [class]="r.status === 'Cerrado' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'">{{ r.status }}</span>
                </div>
                <h3 class="font-bold text-sm text-slate-900 mt-1 leading-snug">{{ f.title }}</h3>
                <p class="text-[11px] text-slate-500 mt-0.5">
                  Inicio: <strong class="text-slate-700">{{ (r.occurredAt || r.awarenessAt) | date:'dd-MM-yyyy HH:mm' }}</strong>
                  · Toma de conocimiento: <strong class="text-slate-700">{{ r.awarenessAt | date:'dd-MM-yyyy HH:mm' }}</strong>
                  @if (r.details?.cmfIncidentId) { · ID CMF: <span class="font-mono">{{ r.details?.cmfIncidentId }}</span> }
                  · Proceso: {{ f.process }}
                  @if (r.closedAt) { · Cerrado: {{ r.closedAt | date:'dd-MM-yyyy HH:mm' }} }
                </p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" (click)="openText(f, r.status === 'Cerrado' || !!r.details?.endedAt ? 'cierre' : 'inicial')"
                class="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1 cursor-pointer">
                <mat-icon class="text-sm">description</mat-icon><span>Texto del reporte</span>
              </button>
              @if (canStart()) {
                <button type="button" (click)="openDetails(f)"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 flex items-center gap-1 cursor-pointer">
                  <mat-icon class="text-sm">edit_note</mat-icon><span>Ficha RAN 20-8</span>
                  @if (missingDetails(f).length) { <span class="ml-0.5 px-1 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">{{ missingDetails(f).length }}</span> }
                </button>
              }
              @if (r.status === 'Abierto' && canManage()) {
                <button type="button" (click)="close(f)" [disabled]="rs.pendingClosingMilestones(r).length > 0"
                  [title]="rs.pendingClosingMilestones(r).length ? 'Registre primero el reporte de cierre' : 'Cerrar el reporte'"
                  class="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                  <mat-icon class="text-sm">task_alt</mat-icon><span>Cerrar reporte</span>
                </button>
              }
              </div>
            </div>

            <!-- Hitos -->
            <div class="px-5 py-3 overflow-x-auto">
              <table class="w-full text-xs min-w-[640px]">
                <thead class="text-[10px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th class="text-left py-1.5 pr-3">Hito</th>
                    <th class="text-left py-1.5 pr-3">Vence</th>
                    <th class="text-left py-1.5 pr-3">Estado</th>
                    <th class="text-left py-1.5">Envío</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (m of rs.milestonesFor(r); track m.id) {
                    @let st = status(f, m);
                    @let sub = submission(f, m.id);
                    <tr>
                      <td class="py-2 pr-3">
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold mr-1" [class]="authorityClass(m.authority)">{{ m.authority }}</span>
                        <span class="font-medium text-slate-800">{{ m.name }}</span>
                        <span class="text-slate-400 text-[10px] ml-1">({{ m.dueOnClose ? 'al cierre' : fmt(m.deadlineMinutes) + (m.basis === 'ocurrencia' ? ' desde ocurrencia' : ' desde conocimiento') }})</span>
                      </td>
                      <td class="py-2 pr-3 font-mono text-slate-700 whitespace-nowrap">
                        @if (m.dueOnClose) { <span class="font-sans text-[11px] text-slate-500">Al cierre</span> } @else { {{ rs.milestoneDeadline(r, m) | date:'dd-MM HH:mm' }} }
                      </td>
                      <td class="py-2 pr-3 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1" [class]="statusClass(st)">
                          @if (st === 'Pendiente') { <mat-icon class="text-[12px] w-3 h-3">timer</mat-icon> }
                          {{ st }}
                        </span>
                        @if (!sub && r.status === 'Abierto' && !m.dueOnClose) {
                          <span class="ml-1.5 font-mono text-[11px] font-bold" [class]="st === 'Vencido' ? 'text-rose-700' : remainingMs(f, m) < 10 * 60_000 ? 'text-amber-700' : 'text-slate-600'">
                            {{ st === 'Vencido' ? 'hace ' + countdown(-remainingMs(f, m)) : countdown(remainingMs(f, m)) }}
                          </span>
                        }
                      </td>
                      <td class="py-2">
                        @if (sub) {
                          <span class="text-[11px] text-slate-600">
                            {{ sub.submittedAt | date:'dd-MM HH:mm' }} · {{ sub.submittedBy }}
                            @if (sub.folio) { · <span class="font-mono text-slate-800">{{ sub.folio }}</span> }
                          </span>
                        } @else if (r.status === 'Abierto' && canManage()) {
                          <div class="flex items-center gap-1.5">
                            <input type="text" placeholder="Folio / N° de ingreso" [value]="folios()[f.id + ':' + m.id] || ''"
                              (input)="setFolio(f.id, m.id, $any($event.target).value)"
                              class="w-40 text-xs rounded-lg border border-slate-300 px-2 py-1" />
                            <button type="button" (click)="submit(f, m)"
                              class="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-700 whitespace-nowrap cursor-pointer">
                              Registrar envío
                            </button>
                          </div>
                        } @else {
                          <span class="text-[11px] text-slate-400">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Actualizaciones -->
            <div class="px-5 py-3 border-t border-slate-100 bg-slate-50/50 space-y-2">
              <span class="text-[11px] font-bold text-slate-700">Bitácora de actualizaciones al regulador</span>
              @if (r.updates.length === 0) {
                <p class="text-[11px] text-slate-400">Sin actualizaciones registradas.</p>
              }
              <ul class="space-y-1">
                @for (u of r.updates; track u.at) {
                  <li class="text-[11px] text-slate-700">
                    <span class="font-mono text-slate-500">{{ u.at | date:'dd-MM HH:mm' }}</span> · <strong>{{ u.by }}</strong>: {{ u.note }}
                  </li>
                }
              </ul>
              @if (r.status === 'Abierto' && canStart()) {
                <div class="flex items-center gap-1.5 pt-1">
                  <input type="text" placeholder="Nueva actualización (estado, causa, medidas adoptadas...)" [value]="notes()[f.id] || ''"
                    (input)="setNote(f.id, $any($event.target).value)" (keyup.enter)="addNote(f)"
                    class="flex-1 text-xs rounded-lg border border-slate-300 px-2.5 py-1.5" />
                  <button type="button" (click)="addNote(f)" [disabled]="!(notes()[f.id] || '').trim()"
                    class="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 cursor-pointer">Agregar</button>
                </div>
              }
            </div>
          </div>
        }
      </div>

    <!-- Ficha RAN 20-8 -->
    @if (detailsDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden my-6">
          <div class="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h2 class="text-base font-bold text-slate-900">Ficha del incidente · RAN 20-8 §1.1</h2>
              <p class="text-[11px] text-slate-500">Contenido mínimo del reporte inicial y de cierre a la CMF. Lo que aún no se conozca puede quedar "En evaluación".</p>
            </div>
            <button type="button" (click)="detailsDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Inicio del incidente (fecha y hora)</span><input type="datetime-local" [class]="inputCls" [value]="detailsOccurred()" (input)="detailsOccurred.set($any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Identificador asignado por la CMF</span><input [class]="inputCls" [value]="d.cmfIncidentId ?? ''" (input)="setDetail('cmfIncidentId', $any($event.target).value)" /></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Causas posibles (reporte inicial)</span><textarea rows="2" [class]="inputCls" [value]="d.possibleCauses ?? ''" (input)="setDetail('possibleCauses', $any($event.target).value)"></textarea></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Productos o servicios afectados</span><textarea rows="2" [class]="inputCls" [value]="d.affectedProducts ?? ''" (input)="setDetail('affectedProducts', $any($event.target).value)"></textarea></label>
            <div class="sm:col-span-2">
              <span class="block text-[11px] font-medium text-slate-600 mb-1">Canales afectados</span>
              <div class="flex flex-wrap gap-2">
                @for (c of channels; track c) {
                  <label class="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border border-slate-200 cursor-pointer">
                    <input type="checkbox" [checked]="(d.affectedChannels ?? []).includes(c)" (change)="toggleChannel(c, $any($event.target).checked)" class="rounded" /> {{ c }}
                  </label>
                }
              </div>
            </div>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Tipo de clientes afectados</span>
              <select [class]="inputCls" (change)="setDetail('customerType', $any($event.target).value || undefined)">
                <option value="">—</option>
                @for (t of customerTypes; track t) { <option [value]="t" [selected]="t === d.customerType">{{ t }}</option> }
              </select></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">N° estimado de socios/clientes afectados</span><input type="number" min="0" [class]="inputCls" [value]="d.estimatedAffectedMembers ?? ''" (input)="setDetail('estimatedAffectedMembers', $any($event.target).value === '' ? undefined : +$any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">N° de transacciones afectadas</span><input type="number" min="0" [class]="inputCls" [value]="d.affectedTransactions ?? ''" (input)="setDetail('affectedTransactions', $any($event.target).value === '' ? undefined : +$any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Dependencias o activos afectados</span><input [class]="inputCls" [value]="d.affectedPremises ?? ''" (input)="setDetail('affectedPremises', $any($event.target).value)" placeholder="Casa matriz, sucursal, sitio de producción…" /></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Medidas adoptadas y en curso</span><textarea rows="2" [class]="inputCls" [value]="d.measures ?? ''" (input)="setDetail('measures', $any($event.target).value)"></textarea></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Comunicación a socios y usuarios (§1.2)</span><textarea rows="2" [class]="inputCls" [value]="d.memberNotice ?? ''" (input)="setDetail('memberNotice', $any($event.target).value)" placeholder="Qué se informó, por qué medio y cuándo"></textarea></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Primera comunicación a socios (fecha y hora)</span><input type="datetime-local" [class]="inputCls" [value]="toLocal(d.memberNoticeAt)" (input)="setDetail('memberNoticeAt', isoFromLocal($any($event.target).value))" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Canal de comunicación</span><input [class]="inputCls" placeholder="Web, app, correo, sucursales, prensa…" [value]="d.memberNoticeChannel ?? ''" (input)="setDetail('memberNoticeChannel', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Informante (nombre y cargo)</span><input [class]="inputCls" [value]="d.informant ?? ''" (input)="setDetail('informant', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Otros antecedentes</span><input [class]="inputCls" [value]="d.otherInfo ?? ''" (input)="setDetail('otherInfo', $any($event.target).value)" /></label>
            <div class="sm:col-span-2 p-3 rounded-xl border border-slate-200 bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <span class="sm:col-span-2 text-xs font-bold text-slate-800">Cierre del incidente</span>
              <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Causas identificadas</span><textarea rows="2" [class]="inputCls" [value]="d.identifiedCauses ?? ''" (input)="setDetail('identifiedCauses', $any($event.target).value)"></textarea></label>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Término del incidente</span><input type="datetime-local" [class]="inputCls" [value]="toLocal(d.endedAt)" (input)="setDetail('endedAt', $any($event.target).value ? fromLocal($any($event.target).value) : undefined)" /></label>
            </div>
          </div>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" (click)="detailsDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer">Cancelar</button>
            <button type="button" (click)="saveDetails()" class="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-lg cursor-pointer">Guardar ficha</button>
          </div>
        </div>
      </div>
    }

    <!-- Texto del reporte -->
    @if (reportText(); as t) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-6">
          <div class="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between no-print">
            <div class="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg">
              <button type="button" (click)="switchText('inicial')" [class]="t.kind === 'inicial' ? 'bg-white shadow-2xs font-semibold' : 'text-slate-600'" class="px-2.5 py-1 text-xs rounded-md cursor-pointer">Reporte inicial</button>
              <button type="button" (click)="switchText('cierre')" [class]="t.kind === 'cierre' ? 'bg-white shadow-2xs font-semibold' : 'text-slate-600'" class="px-2.5 py-1 text-xs rounded-md cursor-pointer">Reporte de cierre</button>
            </div>
            <button type="button" (click)="reportText.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <pre class="flex-1 min-h-0 overflow-y-auto p-6 text-xs leading-relaxed whitespace-pre-wrap font-sans text-slate-800">{{ t.text }}</pre>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center gap-2 no-print">
            <span class="text-[11px] text-slate-500">Copie el texto en el canal de reporte de la CMF.</span>
            <div class="flex gap-2">
              <button type="button" (click)="printText()" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">print</mat-icon>Imprimir</button>
              <button type="button" (click)="copyText(t.text)" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">content_copy</mat-icon>{{ copied() ? 'Copiado' : 'Copiar' }}</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class RegulatoryReporting {
  readonly rs = inject(RiskDataService);
  readonly res = inject(ResilienceService);
  readonly sec = inject(SecurityService);
  readonly notify = output<string>();

  /** Reloj para los cronómetros (solo avanza en el navegador). */
  readonly now = signal(Date.now());

  readonly showConfig = signal(false);
  readonly draftMilestones = signal<EditableMilestone[]>([]);

  readonly inputCls = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  readonly channels = RAN208_CHANNELS;
  readonly customerTypes: NonNullable<Ran208Details['customerType']>[] = ['Personas', 'Empresas', 'Ambos', 'N/A'];

  readonly startIncidentId = signal('');
  readonly startOccurred = signal(toLocalInput(new Date().toISOString()));

  readonly detailsFlawId = signal<string | null>(null);
  readonly detailsDraft = signal<Ran208Details | null>(null);
  readonly detailsOccurred = signal('');
  readonly reportText = signal<{ flawId: string; kind: 'inicial' | 'cierre'; text: string } | null>(null);
  readonly copied = signal(false);
  readonly startAwareness = signal(toLocalInput(new Date().toISOString()));
  readonly startCMF = signal(true);
  readonly startANCI = signal(false);

  readonly folios = signal<Record<string, string>>({});
  readonly notes = signal<Record<string, string>>({});

  readonly summary = computed(() => this.rs.regulatorySummary(this.now()));
  readonly candidates = computed(() => this.rs.flaws().filter(f => !f.regulatoryReport));
  readonly canManage = computed(() => !!this.rs.currentProfile().permissions.canManageRegulatoryReports);
  readonly canStart = computed(() => {
    const p = this.rs.currentProfile().permissions;
    return !!p.canManageRegulatoryReports || p.canReportFlaws;
  });

  constructor() {
    this.resetDraft();
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.now.set(Date.now());
      const id = setInterval(() => this.now.set(Date.now()), 1000);
      destroyRef.onDestroy(() => clearInterval(id));
    });
  }

  fmt(min: number) { return formatMinutes(min); }

  status(f: OperationalFlaw, m: RegulatoryMilestoneTemplate): MilestoneStatus {
    return this.rs.milestoneStatus(f.regulatoryReport!, m, this.now());
  }

  submission(f: OperationalFlaw, milestoneId: string) {
    return f.regulatoryReport!.submissions.find(s => s.milestoneId === milestoneId);
  }

  remainingMs(f: OperationalFlaw, m: RegulatoryMilestoneTemplate): number {
    return this.rs.milestoneDeadline(f.regulatoryReport!, m).getTime() - this.now();
  }

  hasOverdue(f: OperationalFlaw): boolean {
    const r = f.regulatoryReport!;
    return r.status === 'Abierto' && this.rs.milestonesFor(r).some(m => this.status(f, m) === 'Vencido');
  }

  countdown(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  setFolio(flawId: string, milestoneId: string, value: string) {
    this.folios.update(f => ({ ...f, [`${flawId}:${milestoneId}`]: value }));
  }

  setNote(flawId: string, value: string) {
    this.notes.update(n => ({ ...n, [flawId]: value }));
  }

  async submit(f: OperationalFlaw, m: RegulatoryMilestoneTemplate) {
    const folio = this.folios()[`${f.id}:${m.id}`] || '';
    await this.rs.registerRegulatorySubmission(f.id, m.id, folio);
    const st = this.status(this.rs.flaws().find(x => x.id === f.id)!, m);
    this.notify.emit(`${m.name} registrado (${st}). Quedó en la bitácora inalterable.`);
  }

  async addNote(f: OperationalFlaw) {
    const note = (this.notes()[f.id] || '').trim();
    if (!note) return;
    await this.rs.addRegulatoryUpdate(f.id, note);
    this.setNote(f.id, '');
  }

  async close(f: OperationalFlaw) {
    try {
      await this.rs.closeRegulatoryReport(f.id);
      this.notify.emit(`Reporte regulatorio de ${f.id} cerrado.`);
    } catch (err) {
      this.notify.emit((err as Error).message);
    }
  }

  // ---- Ficha RAN 20-8 ----
  missingDetails(f: OperationalFlaw): string[] {
    const r = f.regulatoryReport;
    if (!r?.reportableToCMF) return [];
    const d = r.details ?? {};
    const miss: string[] = [];
    if (!d.possibleCauses) miss.push('Causas posibles');
    if (!d.affectedProducts) miss.push('Productos o servicios afectados');
    if (!d.customerType) miss.push('Tipo de clientes');
    if (d.estimatedAffectedMembers === undefined) miss.push('N° de afectados');
    if (!d.measures) miss.push('Medidas adoptadas');
    if (!d.informant) miss.push('Informante');
    if (r.status === 'Cerrado' || d.endedAt) {
      if (!d.identifiedCauses) miss.push('Causas identificadas');
      if (!d.endedAt) miss.push('Término del incidente');
    }
    return miss;
  }

  openDetails(f: OperationalFlaw) {
    const r = f.regulatoryReport!;
    this.detailsFlawId.set(f.id);
    this.detailsOccurred.set(toLocalInput(r.occurredAt ?? r.awarenessAt));
    this.detailsDraft.set({ ...(r.details ?? {}), affectedChannels: [...(r.details?.affectedChannels ?? [])] });
  }

  /** Valor de un campo datetime-local a ISO (o undefined si está vacío). */
  isoFromLocal(v: string): string | undefined {
    return v ? new Date(v).toISOString() : undefined;
  }

  setDetail<K extends keyof Ran208Details>(key: K, value: Ran208Details[K]) {
    this.detailsDraft.update(d => (d ? { ...d, [key]: value } : d));
  }

  toggleChannel(c: string, on: boolean) {
    this.detailsDraft.update(d => {
      if (!d) return d;
      const list = d.affectedChannels ?? [];
      return { ...d, affectedChannels: on ? [...list, c] : list.filter(x => x !== c) };
    });
  }

  async saveDetails() {
    const id = this.detailsFlawId();
    const d = this.detailsDraft();
    if (!id || !d) return;
    await this.rs.updateRegulatoryDetails(id, { occurredAt: this.detailsOccurred() ? fromLocalInput(this.detailsOccurred()) : undefined, details: d });
    this.detailsDraft.set(null);
    this.notify.emit('Ficha del incidente guardada.');
  }

  toLocal(iso?: string) { return iso ? toLocalInput(iso) : ''; }
  fromLocal(v: string) { return fromLocalInput(v); }

  // ---- Texto del reporte (RAN 20-8 §1.1 a y b) ----
  openText(f: OperationalFlaw, kind: 'inicial' | 'cierre') {
    this.copied.set(false);
    this.reportText.set({ flawId: f.id, kind, text: this.buildText(f, kind) });
  }

  switchText(kind: 'inicial' | 'cierre') {
    const cur = this.reportText();
    const f = cur && this.rs.flaws().find(x => x.id === cur.flawId);
    if (f) this.openText(f, kind);
  }

  buildText(f: OperationalFlaw, kind: 'inicial' | 'cierre'): string {
    const r = f.regulatoryReport!;
    const d = r.details ?? {};
    const pend = 'En evaluación';
    const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : pend);
    const provider = f.providerId ? this.res.providerById(f.providerId)?.name : undefined;
    const assets = (f.affectedAssetIds ?? []).map(id => this.sec.assetById(id)?.name).filter(Boolean).join('; ');
    const lines = [
      `REPORTE ${kind === 'inicial' ? 'INICIAL' : 'DE CIERRE'} DE INCIDENTE OPERACIONAL`,
      'RAN CACs, Capítulo CAC-3 N°5.2 — RAN Capítulo 20-8 N°1.1',
      '',
      `Número identificador (CMF): ${d.cmfIncidentId || 'Por asignar'}`,
      'Entidad: [nombre de la cooperativa]',
      `Referencia interna: ${f.id}`,
      '',
      `Descripción del incidente: ${f.title}. ${f.description}`,
      `Fecha y hora de inicio: ${fmt(r.occurredAt ?? r.awarenessAt)}`,
      `Toma de conocimiento: ${fmt(r.awarenessAt)}`,
      kind === 'inicial'
        ? `Causas posibles: ${d.possibleCauses || pend}`
        : `Causas identificadas: ${d.identifiedCauses || d.possibleCauses || pend}`,
      `Productos o servicios afectados: ${d.affectedProducts || pend}`,
      `Canales afectados: ${d.affectedChannels?.length ? d.affectedChannels.join(', ') : pend}`,
      `Proveedor o tercero involucrado: ${provider || 'No aplica'}`,
      `Tipo y número estimado de clientes afectados: ${d.customerType || pend}${d.estimatedAffectedMembers !== undefined ? ` · ${d.estimatedAffectedMembers.toLocaleString('es-CL')}` : ''}`,
      `Número de transacciones afectadas: ${d.affectedTransactions !== undefined ? d.affectedTransactions.toLocaleString('es-CL') : pend}`,
      `Dependencias o activos afectados: ${[d.affectedPremises, assets].filter(Boolean).join('; ') || pend}`,
      `Medidas adoptadas y en curso: ${d.measures || pend}`,
      ...(r.updates.length ? ['Actualizaciones:', ...r.updates.map(u => `  - ${fmt(u.at)} (${u.by}): ${u.note}`)] : []),
      `Comunicación a socios/usuarios (N°1.2): ${d.memberNotice || pend}${d.memberNoticeAt ? ` (desde ${fmt(d.memberNoticeAt)}${d.memberNoticeChannel ? `, vía ${d.memberNoticeChannel}` : ''})` : ''}`,
      `Otros antecedentes: ${d.otherInfo || '—'}`,
      ...(kind === 'cierre' ? [`Fecha y hora de término: ${fmt(d.endedAt ?? r.closedAt)}`] : []),
      '',
      `Informante: ${d.informant || pend}`,
    ];
    return lines.join('\n');
  }

  async copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      this.notify.emit('No se pudo copiar automáticamente; seleccione el texto y cópielo.');
    }
  }

  printText() {
    const t = this.reportText();
    if (!t) return;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.document.write(`<pre style="font:13px/1.5 system-ui,sans-serif;white-space:pre-wrap;padding:24px">${t.text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))}</pre>`);
    w.document.close();
    w.focus();
    w.print();
  }

  // ---- Exportación ----
  exportCsv() {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const ms = this.rs.regulatoryMilestones().filter(m => m.enabled);
    const header = ['ID', 'Incidente', 'Inicio', 'Toma de conocimiento', 'CMF', 'ANCI', 'Estado', 'ID CMF',
      ...ms.flatMap(m => [`${m.name} - estado`, `${m.name} - enviado`, `${m.name} - folio`]),
      'Causas', 'Productos afectados', 'Canales', 'Tipo clientes', 'N° afectados', 'N° transacciones', 'Medidas', 'Comunicación a socios', 'Término'];
    const rows = this.rs.regulatoryIncidents().map(f => {
      const r = f.regulatoryReport!;
      const d = r.details ?? {};
      const applicable = new Set(this.rs.milestonesFor(r).map(m => m.id));
      return [
        f.id, f.title, r.occurredAt ?? r.awarenessAt, r.awarenessAt, r.reportableToCMF ? 'Sí' : 'No', r.reportableToANCI ? 'Sí' : 'No', r.status, d.cmfIncidentId,
        ...ms.flatMap(m => {
          if (!applicable.has(m.id)) return ['No aplica', '', ''];
          const sub = r.submissions.find(x => x.milestoneId === m.id);
          return [this.rs.milestoneStatus(r, m, Date.now()), sub?.submittedAt ?? '', sub?.folio ?? ''];
        }),
        d.identifiedCauses || d.possibleCauses, d.affectedProducts, (d.affectedChannels ?? []).join(', '), d.customerType,
        d.estimatedAffectedMembers, d.affectedTransactions, d.measures, d.memberNotice, d.endedAt ?? r.closedAt,
      ].map(q).join(';');
    });
    const csv = '\uFEFF' + [header.map(q).join(';'), ...rows].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reportes_Regulatorios_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.rs.appendAuditLog('EXPORTACIÓN_REPORTE', 'Reporte', 'REPORTES-REGULATORIOS', 'Exportación CSV de reportes regulatorios de incidentes.');
  }

  async startReport() {
    const id = this.startIncidentId();
    if (!id) return;
    await this.rs.startRegulatoryReport(id, {
      awarenessAt: new Date(this.startAwareness()).toISOString(),
      occurredAt: this.startOccurred() ? new Date(this.startOccurred()).toISOString() : undefined,
      cmf: this.startCMF(),
      anci: this.startANCI(),
    });
    this.startIncidentId.set('');
    this.notify.emit('Conteo de plazos regulatorios iniciado.');
  }

  // ---- Configuración de plazos ----
  resetDraft() {
    this.draftMilestones.set(this.rs.regulatoryMilestones().map(m => {
      const unit: Unit = m.deadlineMinutes % 1440 === 0 ? 'd' : m.deadlineMinutes % 60 === 0 ? 'h' : 'min';
      const amount = unit === 'd' ? m.deadlineMinutes / 1440 : unit === 'h' ? m.deadlineMinutes / 60 : m.deadlineMinutes;
      return { ...m, amount, unit };
    }));
  }

  patchDraft(index: number, patch: Partial<EditableMilestone>) {
    this.draftMilestones.update(list => list.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  async saveConfig() {
    const factor: Record<Unit, number> = { min: 1, h: 60, d: 1440 };
    const list = this.draftMilestones().map(({ amount, unit, ...m }) => ({
      ...m,
      deadlineMinutes: Math.max(1, (amount || 0) * factor[unit]),
    }));
    await this.rs.updateRegulatoryMilestones(list);
    this.resetDraft();
    this.notify.emit('Plazos regulatorios actualizados.');
  }

  // ---- Estilos ----
  authorityClass(a: 'CMF' | 'ANCI') {
    return a === 'CMF' ? 'bg-indigo-100 text-indigo-800' : 'bg-cyan-100 text-cyan-800';
  }

  statusClass(st: MilestoneStatus) {
    switch (st) {
      case 'Enviado a tiempo': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Enviado fuera de plazo': return 'bg-orange-50 text-orange-800 border-orange-200';
      case 'Vencido': return 'bg-rose-100 text-rose-800 border-rose-300';
      default: return 'bg-amber-50 text-amber-800 border-amber-200';
    }
  }

  severityClass(s: string) {
    switch (s) {
      case 'Crítica': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Alta': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Media': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  }
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}
