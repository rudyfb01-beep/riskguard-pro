import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { CatalogService } from '../services/catalog.service';
import { CatalogAdminService, CatalogValidationError } from '../services/catalog-admin.service';
import { PermissionDeniedError } from '../services/risk-data.service';
import { CAC_BUSINESS_LINES } from '../models/risk.model';
import {
  BusinessProcess, GeneralParameters, OrgArea, PROCESS_CRITICALITIES, ProcessCriticality,
} from '../models/catalog.model';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100';

type SubTab = 'procesos' | 'areas' | 'parametros';

/** Mantenedores: mapa de procesos, áreas y parámetros generales. */
@Component({
  selector: 'app-catalogs-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-indigo-100 text-indigo-800 rounded-lg"><mat-icon class="text-lg">tune</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Mantenedores</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Mapa de procesos, áreas de la cooperativa y parámetros generales. Lo que se define aquí alimenta las listas de
            riesgos, controles, incidentes, KRIs, auditorías y puestos.
          </p>
        </div>
        @switch (tab()) {
          @case ('procesos') {
            <button type="button" (click)="newProcess()" [class.perm-locked]="!canManage()"
              class="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0">
              <mat-icon class="text-sm">add</mat-icon>Nuevo proceso
            </button>
          }
          @case ('areas') {
            <button type="button" (click)="newArea()" [class.perm-locked]="!canManage()"
              class="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0">
              <mat-icon class="text-sm">add</mat-icon>Nueva área
            </button>
          }
        }
      </div>

      @if (!canManage()) {
        <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 flex items-start gap-2">
          <mat-icon class="text-sm text-slate-500 shrink-0">lock</mat-icon>
          <span>Vista de consulta: tu cargo ({{ rs.currentProfile().role }}) no tiene el permiso "Administrar mantenedores".</span>
        </div>
      }

      <!-- Sub tabs -->
      <div class="bg-white p-1.5 rounded-xl border border-slate-200 inline-flex gap-1">
        @for (t of tabs; track t.id) {
          <button type="button" (click)="tab.set(t.id)"
            [class]="tab() === t.id ? 'bg-slate-900 text-white font-semibold' : 'text-slate-600 hover:bg-slate-100'"
            class="px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer">
            <mat-icon class="text-sm">{{ t.icon }}</mat-icon>{{ t.label }}
            @if (t.count !== undefined) { <span class="text-[10px] opacity-70">({{ t.count() }})</span> }
          </button>
        }
      </div>

      <!-- PROCESOS -->
      @if (tab() === 'procesos') {
        <div class="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2">
          <input type="search" placeholder="Buscar proceso..." [value]="search()" (input)="search.set($any($event.target).value)"
            class="text-xs rounded-lg border border-slate-300 px-3 py-1.5 w-60" />
          <select [value]="areaFilter()" (change)="areaFilter.set($any($event.target).value)" class="text-xs rounded-lg border border-slate-300 px-2 py-1.5">
            <option value="">Todas las áreas</option>
            @for (a of cat.areas(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
          </select>
          <label class="text-xs text-slate-600 flex items-center gap-1.5"><input type="checkbox" [checked]="showInactive()" (change)="showInactive.set($any($event.target).checked)" class="rounded" /> Ver inactivos</label>
          <span class="text-[11px] text-slate-500 ml-auto">{{ filteredProcesses().length }} de {{ cat.processes().length }}</span>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs min-w-[900px]">
            <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <tr>
                <th class="text-left py-2.5 px-3">Código</th>
                <th class="text-left py-2.5 px-3">Proceso</th>
                <th class="text-left py-2.5 px-3">Área</th>
                <th class="text-left py-2.5 px-3">Dueño</th>
                <th class="text-left py-2.5 px-3">Línea de negocio</th>
                <th class="text-left py-2.5 px-3">Criticidad</th>
                <th class="text-center py-2.5 px-3">En uso</th>
                <th class="py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (p of filteredProcesses(); track p.id) {
                @let used = admin.processUsage(p.name);
                <tr class="hover:bg-slate-50" [class.opacity-50]="!p.active">
                  <td class="py-2.5 px-3 font-mono text-slate-500">{{ p.code }}</td>
                  <td class="py-2.5 px-3">
                    <div class="font-semibold text-slate-900">{{ p.name }} @if (!p.active) { <span class="text-[10px] font-normal text-slate-500">(inactivo)</span> }</div>
                    @if (p.description) { <div class="text-[10px] text-slate-500 max-w-[320px] truncate">{{ p.description }}</div> }
                  </td>
                  <td class="py-2.5 px-3 text-slate-700">{{ cat.areaById(p.areaId)?.name || '—' }}</td>
                  <td class="py-2.5 px-3 text-slate-700">{{ p.owner || '—' }}</td>
                  <td class="py-2.5 px-3 text-slate-600">{{ p.businessLine || '—' }}</td>
                  <td class="py-2.5 px-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold border" [class]="critClass(p.criticality)">{{ p.criticality }}</span></td>
                  <td class="py-2.5 px-3 text-center font-mono" [title]="usageTitle(used)">{{ used.total || '—' }}</td>
                  <td class="py-2.5 px-3 text-right whitespace-nowrap">
                    <button type="button" (click)="editProcess(p)" class="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">{{ canManage() ? 'Editar' : 'Ver' }}</button>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="py-8 text-center text-slate-500">No hay procesos que coincidan.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- ÁREAS -->
      @if (tab() === 'areas') {
        <div class="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table class="w-full text-xs min-w-[760px]">
            <thead class="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
              <tr>
                <th class="text-left py-2.5 px-3">Área</th>
                <th class="text-left py-2.5 px-3">Responsable</th>
                <th class="text-center py-2.5 px-3">Procesos</th>
                <th class="text-center py-2.5 px-3">Puestos</th>
                <th class="text-center py-2.5 px-3">Usuarios</th>
                <th class="py-2.5 px-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (a of sortedAreas(); track a.id) {
                @let used = admin.areaUsage(a);
                <tr class="hover:bg-slate-50" [class.opacity-50]="!a.active">
                  <td class="py-2.5 px-3">
                    <div class="font-semibold text-slate-900">{{ a.name }} @if (!a.active) { <span class="text-[10px] font-normal text-slate-500">(inactiva)</span> }</div>
                    @if (a.description) { <div class="text-[10px] text-slate-500">{{ a.description }}</div> }
                  </td>
                  <td class="py-2.5 px-3 text-slate-700">{{ a.manager || '—' }}</td>
                  <td class="py-2.5 px-3 text-center font-mono">{{ used.processes || '—' }}</td>
                  <td class="py-2.5 px-3 text-center font-mono">{{ used.roles || '—' }}</td>
                  <td class="py-2.5 px-3 text-center font-mono">{{ used.users || '—' }}</td>
                  <td class="py-2.5 px-3 text-right">
                    <button type="button" (click)="editArea(a)" class="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer">{{ canManage() ? 'Editar' : 'Ver' }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- PARÁMETROS -->
      @if (tab() === 'parametros') {
        @if (paramDraft(); as pd) {
          <fieldset class="grid grid-cols-1 lg:grid-cols-2 gap-4" [disabled]="!canManage()">
            <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-emerald-600">payments</mat-icon> Moneda de registro</h2>
              <p class="text-[11px] text-slate-600">Moneda en que se ingresan pérdidas, exposiciones y costos. Cambiarla no convierte los montos ya registrados: solo cambia etiquetas, reportes y el cálculo del APR (en CLP no se aplica tipo de cambio).</p>
              <div class="flex gap-2">
                @for (c of currencies; track c.code) {
                  <label class="flex-1 p-3 rounded-xl border cursor-pointer text-xs" [class]="pd.currency === c.code ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'">
                    <input type="radio" name="currency" class="mr-1.5" [checked]="pd.currency === c.code" (change)="setParam('currency', c.code)" />
                    <strong>{{ c.code }}</strong> · {{ c.label }}
                  </label>
                }
              </div>
              @if (pd.currency !== cat.params().currency) {
                <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">Los montos existentes quedarán expresados en {{ pd.currency }} sin convertirse. Úsalo al iniciar el registro o tras convertir los datos.</p>
              }
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-sky-700">handshake</mat-icon> Proveedores</h2>
              <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Aviso de vencimiento de contrato (días antes)</span>
                <input type="number" min="1" max="365" [class]="inputCls" [value]="pd.contractExpiryWarningDays" (input)="setParam('contractExpiryWarningDays', +$any($event.target).value)" /></label>
              <span class="block text-[11px] font-medium text-slate-600">Frecuencia de evaluación según criticidad (meses)</span>
              <div class="grid grid-cols-4 gap-2">
                @for (c of criticalities; track c) {
                  <label class="block"><span class="block text-[10px] text-slate-500 mb-0.5">{{ c }}</span>
                    <input type="number" min="1" max="60" [class]="inputCls" [value]="pd.providerAssessmentMonths[c]" (input)="setAssessment(c, +$any($event.target).value)" /></label>
                }
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
              <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-rose-600">bug_report</mat-icon> Plazo para corregir vulnerabilidades (días)</h2>
              <p class="text-[11px] text-slate-600">Se usan para calcular la fecha límite de cada vulnerabilidad nueva y las alertas de atraso.</p>
              <div class="grid grid-cols-4 gap-2">
                @for (s of severities; track s) {
                  <label class="block"><span class="block text-[10px] text-slate-500 mb-0.5">{{ s }}</span>
                    <input type="number" min="1" max="730" [class]="inputCls" [value]="pd.vulnSlaDays[s]" (input)="setSla(s, +$any($event.target).value)" /></label>
                }
              </div>
            </div>

            <div class="bg-white rounded-2xl border border-slate-200 p-5 space-y-2 text-[11px] text-slate-600">
              <h2 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-slate-500">info</mat-icon> Otros parámetros</h2>
              <p>El umbral de registro de la base de pérdidas se ajusta en <strong>Incidentes y Pérdidas</strong>; los plazos de reporte a la CMF y la ANCI en <strong>Reporte CMF / ANCI</strong>; y los parámetros del APR en <strong>APR Riesgo Operacional</strong>.</p>
            </div>
          </fieldset>
          @if (canManage()) {
            <div class="flex items-center justify-end gap-2">
              <span class="text-[11px] text-slate-500 mr-auto">{{ paramsDirty() ? 'Hay cambios sin guardar.' : 'Sin cambios.' }}</span>
              <button type="button" (click)="resetParams()" [disabled]="!paramsDirty()" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50">Descartar</button>
              <button type="button" (click)="saveParams()" [disabled]="!paramsDirty()" class="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-lg cursor-pointer disabled:opacity-50">Guardar parámetros</button>
            </div>
          }
        }
      }
    </div>

    <!-- Modal proceso -->
    @if (procDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl my-6 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2"><mat-icon class="text-indigo-700">account_tree</mat-icon>{{ isNew() ? 'Nuevo proceso' : d.name }}</h2>
            <button type="button" (click)="procDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <fieldset class="p-6 grid grid-cols-1 sm:grid-cols-3 gap-3" [disabled]="!canManage()">
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Código *</span><input [class]="inputCls" [value]="d.code" (input)="setProc('code', $any($event.target).value)" /></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Nombre *</span><input [class]="inputCls" [value]="d.name" (input)="setProc('name', $any($event.target).value)" /></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Área responsable</span>
              <select [class]="inputCls" (change)="setProc('areaId', $any($event.target).value || undefined)">
                <option value="" [selected]="!d.areaId">Sin área</option>
                @for (a of cat.areas(); track a.id) { @if (a.active || a.id === d.areaId) { <option [value]="a.id" [selected]="a.id === d.areaId">{{ a.name }}</option> } }
              </select></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Criticidad</span>
              <select [class]="inputCls" (change)="setProc('criticality', $any($event.target).value)">
                @for (c of criticalities; track c) { <option [value]="c" [selected]="c === d.criticality">{{ c }}</option> }
              </select></label>
            <label class="block sm:col-span-2"><span class="block text-[11px] font-medium text-slate-600 mb-1">Dueño del proceso</span><input [class]="inputCls" [value]="d.owner" (input)="setProc('owner', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Línea de negocio (CAC)</span>
              <select [class]="inputCls" (change)="setProc('businessLine', $any($event.target).value || undefined)">
                <option value="" [selected]="!d.businessLine">—</option>
                @for (b of businessLines; track b) { <option [value]="b" [selected]="b === d.businessLine">{{ b }}</option> }
              </select></label>
            <label class="block sm:col-span-3"><span class="block text-[11px] font-medium text-slate-600 mb-1">Descripción</span><textarea rows="2" [class]="inputCls" [value]="d.description" (input)="setProc('description', $any($event.target).value)"></textarea></label>
            <label class="flex items-center gap-2 text-xs sm:col-span-3"><input type="checkbox" class="rounded" [checked]="d.active" (change)="setProc('active', $any($event.target).checked)" /> Activo (aparece en las listas para nuevos registros)</label>
            @if (!isNew() && original()?.name !== d.name.trim() && admin.processUsage(original()?.name ?? '').total > 0) {
              <p class="sm:col-span-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Al guardar, los {{ admin.processUsage(original()?.name ?? '').total }} registros que usan "{{ original()?.name }}" pasarán a "{{ d.name.trim() }}".
              </p>
            }
          </fieldset>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
            @if (!isNew() && canManage()) {
              <button type="button" (click)="removeProcess(d)" class="px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">delete</mat-icon>Eliminar</button>
            }
            <span class="text-[11px] text-rose-700 flex-1">{{ formError() }}</span>
            <button type="button" (click)="procDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
            @if (canManage()) {
              <button type="button" (click)="saveProcess()" class="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-lg cursor-pointer">Guardar proceso</button>
            }
          </div>
        </div>
      </div>
    }

    <!-- Modal área -->
    @if (areaDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg my-6 overflow-hidden">
          <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2"><mat-icon class="text-indigo-700">apartment</mat-icon>{{ isNew() ? 'Nueva área' : d.name }}</h2>
            <button type="button" (click)="areaDraft.set(null)" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer"><mat-icon>close</mat-icon></button>
          </div>
          <fieldset class="p-6 space-y-3" [disabled]="!canManage()">
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Nombre *</span><input [class]="inputCls" [value]="d.name" (input)="setArea('name', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Responsable</span><input [class]="inputCls" [value]="d.manager" (input)="setArea('manager', $any($event.target).value)" /></label>
            <label class="block"><span class="block text-[11px] font-medium text-slate-600 mb-1">Descripción</span><textarea rows="2" [class]="inputCls" [value]="d.description" (input)="setArea('description', $any($event.target).value)"></textarea></label>
            <label class="flex items-center gap-2 text-xs"><input type="checkbox" class="rounded" [checked]="d.active" (change)="setArea('active', $any($event.target).checked)" /> Activa</label>
            @if (!isNew() && originalArea()?.name !== d.name.trim() && (admin.areaUsage(originalArea()!).roles + admin.areaUsage(originalArea()!).users) > 0) {
              <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">Los puestos y usuarios de "{{ originalArea()?.name }}" pasarán a "{{ d.name.trim() }}".</p>
            }
          </fieldset>
          <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center gap-3">
            @if (!isNew() && canManage()) {
              <button type="button" (click)="removeArea(d)" class="px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer flex items-center gap-1"><mat-icon class="text-sm">delete</mat-icon>Eliminar</button>
            }
            <span class="text-[11px] text-rose-700 flex-1">{{ formError() }}</span>
            <button type="button" (click)="areaDraft.set(null)" class="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer">{{ canManage() ? 'Cancelar' : 'Cerrar' }}</button>
            @if (canManage()) {
              <button type="button" (click)="saveArea()" class="px-4 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-600 rounded-lg cursor-pointer">Guardar área</button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CatalogsPanel {
  readonly rs = inject(RiskDataService);
  readonly cat = inject(CatalogService);
  readonly admin = inject(CatalogAdminService);
  readonly notify = output<string>();

  readonly inputCls = INPUT;
  readonly criticalities = PROCESS_CRITICALITIES;
  readonly businessLines = CAC_BUSINESS_LINES;
  readonly severities = ['Crítica', 'Alta', 'Media', 'Baja'] as const;
  readonly currencies = [
    { code: 'CLP' as const, label: 'Peso chileno' },
    { code: 'USD' as const, label: 'Dólar estadounidense' },
  ];

  readonly tab = signal<SubTab>('procesos');
  readonly tabs = [
    { id: 'procesos' as SubTab, label: 'Procesos', icon: 'account_tree', count: () => this.cat.processes().length },
    { id: 'areas' as SubTab, label: 'Áreas', icon: 'apartment', count: () => this.cat.areas().length },
    { id: 'parametros' as SubTab, label: 'Parámetros generales', icon: 'settings', count: undefined },
  ];

  readonly canManage = computed(() => this.rs.hasPermission('canManageCatalogs'));

  // Procesos
  readonly search = signal('');
  readonly areaFilter = signal('');
  readonly showInactive = signal(false);
  readonly filteredProcesses = computed(() => {
    const q = this.search().toLowerCase().trim();
    const area = this.areaFilter();
    return [...this.cat.processes()]
      .filter(p => this.showInactive() || p.active)
      .filter(p => !area || p.areaId === area)
      .filter(p => !q || `${p.code} ${p.name} ${p.owner} ${p.description}`.toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code));
  });
  readonly sortedAreas = computed(() => [...this.cat.areas()].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es')));

  readonly procDraft = signal<BusinessProcess | null>(null);
  readonly areaDraft = signal<OrgArea | null>(null);
  readonly isNew = signal(false);
  readonly formError = signal('');
  readonly original = computed(() => this.cat.processes().find(p => p.id === this.procDraft()?.id));
  readonly originalArea = computed(() => this.cat.areas().find(a => a.id === this.areaDraft()?.id));

  // Parámetros: borrador editable
  private readonly paramEdits = signal<GeneralParameters | null>(null);
  readonly paramDraft = computed(() => this.paramEdits() ?? this.cat.params());
  readonly paramsDirty = computed(() => !!this.paramEdits() && JSON.stringify(this.paramEdits()) !== JSON.stringify(this.cat.params()));

  critClass(c: ProcessCriticality) {
    switch (c) {
      case 'Crítico': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Alto': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Medio': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  }

  usageTitle(u: ReturnType<CatalogAdminService['processUsage']>): string {
    return `${u.risks} riesgos, ${u.controls} controles, ${u.flaws} incidentes, ${u.kris} KRIs, ${u.alerts} alertas, ${u.findings} hallazgos`;
  }

  private gate(): boolean {
    return this.rs.requirePermission(['canManageCatalogs'], 'administrar mantenedores');
  }

  private async run(fn: () => Promise<void>, ok: string, close: () => void) {
    this.formError.set('');
    try {
      await fn();
      this.notify.emit(ok);
      close();
    } catch (err) {
      if (err instanceof CatalogValidationError) this.formError.set(err.message);
      else if (!(err instanceof PermissionDeniedError)) this.formError.set((err as Error).message);
    }
  }

  // --- Procesos
  newProcess() {
    if (!this.gate()) return;
    this.isNew.set(true);
    this.formError.set('');
    this.procDraft.set({
      id: this.admin.newId('proc'), code: this.admin.nextProcessCode(), name: '', areaId: this.areaFilter() || undefined,
      owner: '', criticality: 'Medio', description: '', active: true,
    });
  }

  editProcess(p: BusinessProcess) {
    this.isNew.set(false);
    this.formError.set('');
    this.procDraft.set({ ...p });
  }

  setProc<K extends keyof BusinessProcess>(k: K, v: BusinessProcess[K]) {
    this.procDraft.update(d => (d ? { ...d, [k]: v } : d));
  }

  saveProcess() {
    const d = this.procDraft();
    if (!d) return;
    void this.run(() => this.admin.saveProcess(d), `Proceso ${d.code.trim().toUpperCase()} guardado.`, () => this.procDraft.set(null));
  }

  removeProcess(p: BusinessProcess) {
    const orig = this.original() ?? p;
    void this.run(() => this.admin.deleteProcess(orig), `Proceso ${orig.code} eliminado.`, () => this.procDraft.set(null));
  }

  // --- Áreas
  newArea() {
    if (!this.gate()) return;
    this.isNew.set(true);
    this.formError.set('');
    this.areaDraft.set({ id: this.admin.newId('area'), name: '', manager: '', description: '', active: true });
  }

  editArea(a: OrgArea) {
    this.isNew.set(false);
    this.formError.set('');
    this.areaDraft.set({ ...a });
  }

  setArea<K extends keyof OrgArea>(k: K, v: OrgArea[K]) {
    this.areaDraft.update(d => (d ? { ...d, [k]: v } : d));
  }

  saveArea() {
    const d = this.areaDraft();
    if (!d) return;
    void this.run(() => this.admin.saveArea(d), `Área "${d.name.trim()}" guardada.`, () => this.areaDraft.set(null));
  }

  removeArea(a: OrgArea) {
    const orig = this.originalArea() ?? a;
    void this.run(() => this.admin.deleteArea(orig), `Área "${orig.name}" eliminada.`, () => this.areaDraft.set(null));
  }

  // --- Parámetros
  setParam<K extends keyof GeneralParameters>(k: K, v: GeneralParameters[K]) {
    this.paramEdits.set({ ...this.paramDraft(), [k]: v });
  }

  setAssessment(c: ProcessCriticality, v: number) {
    const d = this.paramDraft();
    this.paramEdits.set({ ...d, providerAssessmentMonths: { ...d.providerAssessmentMonths, [c]: v } });
  }

  setSla(s: keyof GeneralParameters['vulnSlaDays'], v: number) {
    const d = this.paramDraft();
    this.paramEdits.set({ ...d, vulnSlaDays: { ...d.vulnSlaDays, [s]: v } });
  }

  resetParams() {
    this.paramEdits.set(null);
  }

  async saveParams() {
    const d = this.paramEdits();
    if (!d) return;
    try {
      await this.admin.saveParameters(d);
      this.paramEdits.set(null);
      this.notify.emit('Parámetros generales guardados.');
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) this.notify.emit((err as Error).message);
    }
  }
}
