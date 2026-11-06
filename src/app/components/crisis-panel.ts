import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { CrisisService, DeclareInput } from '../services/crisis.service';
import { ResilienceService } from '../services/resilience.service';
import { RiskDataService } from '../services/risk-data.service';
import { LinkedPlans } from './linked-plans';
import {
  COMMITTEE_ROLES, CRISIS_AUDIENCES, CRISIS_LEVELS, CRISIS_LOG_KINDS, CommitteeMember, CrisisAudience, CrisisCommittee, CrisisEvent,
  CrisisLevel, CrisisLogKind, CrisisScenario, SCENARIO_CATEGORIES,
} from '../models/crisis.model';
import { ContinuityTest } from '../models/resilience.model';
import { committeeGaps, elapsedHours, isOpen, levelName, scenarioLevel, scenarioScore } from '../utils/crisis';

type SubTab = 'sala' | 'escenarios' | 'historial' | 'comite';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-100';
const LEVEL_CLS: Record<number, string> = {
  1: 'bg-amber-100 text-amber-900 border-amber-300', 2: 'bg-orange-100 text-orange-900 border-orange-300', 3: 'bg-rose-600 text-white border-rose-700',
};
const SCEN_CLS: Record<string, string> = {
  'Crítico': 'bg-rose-100 text-rose-800', 'Alto': 'bg-orange-100 text-orange-800', 'Medio': 'bg-amber-100 text-amber-800', 'Bajo': 'bg-emerald-100 text-emerald-800',
};

interface DeclareDraft extends DeclareInput { schedule: boolean; plannedDate: string }

/** Gestión de crisis: sala del Comité de Crisis, escenarios, crisis y simulacros, y el comité. */
@Component({
  selector: 'app-crisis-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, LinkedPlans],
  template: `
    <div class="space-y-4">
      <!-- Encabezado -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-rose-100 text-rose-800 rounded-lg"><mat-icon class="text-lg">crisis_alert</mat-icon></span>
            <h1 class="text-xl font-bold tracking-tight text-slate-900">Gestión de Crisis</h1>
          </div>
          <p class="text-xs text-slate-600 mt-1 max-w-3xl">
            Sala del Comité de Crisis: declarar una crisis o un simulacro, registrar decisiones, tareas y comunicaciones, y seguir los
            tiempos de recuperación. Escenarios de desastre con su respuesta prevista y programa de simulacros (RAN 20-9 y 20-10).
          </p>
        </div>
        @if (cs.canAct()) {
          <div class="flex flex-wrap gap-2 shrink-0">
            <button type="button" (click)="openDeclare('Real')" class="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl flex items-center gap-1.5 cursor-pointer">
              <mat-icon class="text-sm">campaign</mat-icon>Declarar crisis
            </button>
            <button type="button" (click)="openDeclare('Simulacro')" class="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl flex items-center gap-1.5 cursor-pointer">
              <mat-icon class="text-sm">model_training</mat-icon>Simulacro
            </button>
          </div>
        }
      </div>

      <!-- Sub pestañas -->
      <div class="flex flex-wrap gap-1 bg-white p-1.5 rounded-xl border border-slate-200 w-fit max-w-full">
        @for (t of tabs(); track t.id) {
          <button type="button" (click)="tab.set(t.id); selectedId.set(null)"
            [class]="tab() === t.id ? 'bg-slate-900 text-white font-semibold' : 'text-slate-600 hover:bg-slate-100'"
            class="px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 cursor-pointer">
            <mat-icon class="text-sm">{{ t.icon }}</mat-icon>{{ t.label }}
            @if (t.badge) { <span class="px-1.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">{{ t.badge }}</span> }
          </button>
        }
      </div>

      @if (error()) { <div class="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{{ error() }}</div> }

      <!-- ============================ SALA DE CRISIS ============================ -->
      @if (tab() === 'sala') {
        @if (detail(); as e) {
          @if (cs.open().length > 1) {
            <div class="flex flex-wrap gap-2">
              @for (o of cs.open(); track o.id) {
                <button type="button" (click)="selectedId.set(o.id)" class="px-3 py-1.5 rounded-lg border text-xs cursor-pointer"
                  [class]="o.id === e.id ? 'border-rose-500 bg-rose-50 font-semibold' : 'border-slate-200 bg-white'">{{ o.code }} · {{ o.mode }}</button>
              }
            </div>
          }
          <ng-container *ngTemplateOutlet="detailTpl" />
        } @else {
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div class="lg:col-span-2 bg-white rounded-2xl border border-emerald-200 p-6 flex items-start gap-4">
              <mat-icon class="text-emerald-600 shrink-0">verified</mat-icon>
              <div>
                <h2 class="text-base font-bold text-slate-900">Sin crisis activa</h2>
                <p class="text-xs text-slate-600 mt-1">Ante un evento que cumpla los criterios de activación de un escenario, quien integra el comité declara la crisis:
                  se avisa al comité, se cargan las primeras acciones del escenario y se lleva la bitácora de decisiones.</p>
                @if (!cs.canAct()) { <p class="text-[11px] text-slate-500 mt-2">Para declarar una crisis debes integrar el Comité de Crisis o administrar continuidad.</p> }
              </div>
            </div>
            <div class="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Próximos simulacros</h3>
              @for (u of cs.upcoming().slice(0, 4); track u.id) {
                <button type="button" (click)="tab.set('historial'); selectedId.set(u.id)" class="w-full text-left py-1.5 border-t border-slate-100 first:border-0 text-xs cursor-pointer hover:bg-slate-50">
                  <span class="font-mono text-slate-500">{{ u.plannedDate }}</span> · {{ u.title }}
                </button>
              } @empty { <p class="text-xs text-slate-500">No hay simulacros programados.</p> }
            </div>
          </div>
          <ng-container *ngTemplateOutlet="committeeCard" />
        }
      }

      <!-- ============================ ESCENARIOS ============================ -->
      @if (tab() === 'escenarios') {
        <div class="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-bold text-slate-900 flex-1">Escenarios de desastre y crisis</h2>
            @if (cs.canManage()) {
              <button type="button" (click)="editScenario(cs.newScenario())" class="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg flex items-center gap-1 cursor-pointer"><mat-icon class="text-sm">add</mat-icon>Nuevo escenario</button>
            }
          </div>
          <div class="flex flex-wrap gap-2 text-[11px]">
            @for (c of minCoverage(); track c.category) {
              <span class="px-2 py-1 rounded-lg border" [class]="c.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'"
                [title]="c.ok ? 'Ejercitado en los últimos 12 meses' : 'Sin ejercicio en los últimos 12 meses'">
                <mat-icon class="text-[13px] align-middle">{{ c.ok ? 'check_circle' : 'schedule' }}</mat-icon> {{ c.category }}
              </span>
            }
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs min-w-[760px]">
              <thead class="text-[10px] uppercase text-slate-500 bg-slate-50"><tr>
                <th class="text-left px-3 py-2">Escenario</th><th class="text-left px-3 py-2">Categoría</th><th class="text-center px-3 py-2">Nivel</th>
                <th class="text-left px-3 py-2">Procesos · planes</th><th class="text-left px-3 py-2">Último ejercicio</th><th></th></tr></thead>
              <tbody>
                @for (c of cs.coverage(); track c.scenario.id) {
                  @let s = c.scenario;
                  <tr class="border-t border-slate-100 align-top">
                    <td class="px-3 py-2"><span class="font-mono text-slate-500 mr-1.5">{{ s.code }}</span><span class="font-semibold text-slate-900">{{ s.name }}</span>
                      <div class="text-[11px] text-slate-500 line-clamp-2">{{ s.activationCriteria }}</div></td>
                    <td class="px-3 py-2 text-slate-600">{{ s.category }}</td>
                    <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded font-semibold whitespace-nowrap" [class]="scenCls(s)">{{ scenLevel(s) }} · {{ score(s) }}</span></td>
                    <td class="px-3 py-2 text-slate-600">{{ s.affectedProcessIds.length }} proceso(s) · {{ planCodes(s.planIds) || 'sin plan' }}</td>
                    <td class="px-3 py-2">
                      @if (c.last) { <span [class]="c.current ? 'text-emerald-700' : 'text-amber-700'">{{ c.last }}</span> } @else { <span class="text-amber-700">Nunca</span> }
                      @if (c.planned) { <div class="text-[11px] text-slate-500">Programado {{ c.planned }}</div> }
                    </td>
                    <td class="px-3 py-2 text-right"><button type="button" (click)="editScenario(s)" class="px-2 py-1 rounded hover:bg-slate-100 text-slate-600 cursor-pointer">{{ cs.canManage() ? 'Editar' : 'Ver' }}</button></td>
                  </tr>
                } @empty { <tr><td colspan="6" class="px-3 py-6 text-center text-slate-500">No hay escenarios activos.</td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      }

      <!-- ============================ CRISIS Y SIMULACROS ============================ -->
      @if (tab() === 'historial') {
        @if (detail(); as e) {
          <button type="button" (click)="selectedId.set(null)" class="text-xs text-slate-600 hover:underline flex items-center gap-1 cursor-pointer"><mat-icon class="text-sm">arrow_back</mat-icon>Volver al listado</button>
          <ng-container *ngTemplateOutlet="detailTpl" />
        } @else {
          <div class="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-sm font-bold text-slate-900 flex-1">Programa de simulacros</h2>
              @if (cs.canAct()) {
                <button type="button" (click)="openDeclare('Simulacro', true)" class="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 rounded-lg flex items-center gap-1 cursor-pointer"><mat-icon class="text-sm">event</mat-icon>Programar simulacro</button>
              }
            </div>
            @for (u of cs.upcoming(); track u.id) {
              <div class="flex flex-wrap items-center gap-2 py-2 border-t border-slate-100 first:border-0 text-xs">
                <span class="font-mono text-slate-500 w-24">{{ u.plannedDate }}</span>
                <button type="button" (click)="selectedId.set(u.id)" class="flex-1 text-left font-semibold text-slate-900 hover:underline cursor-pointer">{{ u.code }} · {{ u.title }}</button>
                <span class="px-2 py-0.5 rounded border text-[11px]" [class]="levelCls(u.level)">{{ lvl(u.level) }}</span>
                @if (cs.canAct()) {
                  <button type="button" (click)="run(cs.startDrill(u.id)); tab.set('sala'); selectedId.set(u.id)" class="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-semibold cursor-pointer">Iniciar</button>
                  <button type="button" (click)="cancel(u)" class="px-2.5 py-1 rounded-lg border border-slate-300 cursor-pointer">Cancelar</button>
                }
              </div>
            } @empty { <p class="text-xs text-slate-500">No hay simulacros programados.</p> }
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 p-4">
            <h2 class="text-sm font-bold text-slate-900 mb-2">Crisis y simulacros realizados</h2>
            <div class="overflow-x-auto">
              <table class="w-full text-xs min-w-[720px]">
                <thead class="text-[10px] uppercase text-slate-500 bg-slate-50"><tr>
                  <th class="text-left px-3 py-2">Código</th><th class="text-left px-3 py-2">Título</th><th class="px-3 py-2">Tipo</th><th class="px-3 py-2">Nivel</th>
                  <th class="text-left px-3 py-2">Inicio</th><th class="text-right px-3 py-2">Duración</th><th class="px-3 py-2">Estado</th></tr></thead>
                <tbody>
                  @for (h of allPast(); track h.id) {
                    <tr class="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" (click)="selectedId.set(h.id)">
                      <td class="px-3 py-2 font-mono text-slate-500">{{ h.code }}</td>
                      <td class="px-3 py-2 font-semibold text-slate-900">{{ h.title }}</td>
                      <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded text-[11px]" [class]="h.mode === 'Real' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'">{{ h.mode }}</span></td>
                      <td class="px-3 py-2 text-center">{{ lvl(h.level) }}</td>
                      <td class="px-3 py-2 font-mono text-slate-600">{{ (h.declaredAt | date:'yyyy-MM-dd HH:mm') || '—' }}</td>
                      <td class="px-3 py-2 text-right font-mono">{{ h.declaredAt ? hours(h) : '—' }}</td>
                      <td class="px-3 py-2 text-center">{{ h.status }}@if (h.testId) { <span class="text-emerald-700" title="Registrado como prueba de continuidad"> ✓ prueba</span> }</td>
                    </tr>
                  } @empty { <tr><td colspan="7" class="px-3 py-6 text-center text-slate-500">Sin registros.</td></tr> }
                </tbody>
              </table>
            </div>
          </div>
        }
      }

      <!-- ============================ COMITÉ ============================ -->
      @if (tab() === 'comite') {
        @if (committeeDraft(); as c) {
          <div class="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-sm font-bold text-slate-900 flex-1">Comité de Crisis</h2>
              @if (gaps().length) { <span class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">Por completar: {{ gaps().join(', ') }}</span> }
            </div>
            <fieldset class="space-y-3" [disabled]="!cs.canManage()">
              <div class="overflow-x-auto">
                <table class="w-full text-xs min-w-[820px]">
                  <thead class="text-[10px] uppercase text-slate-500"><tr><th class="text-left px-1 py-1">Nombre</th><th class="text-left px-1">Rol</th><th class="text-left px-1">Teléfono</th><th class="text-left px-1">Correo</th><th class="text-left px-1">Suplente</th><th></th></tr></thead>
                  <tbody>
                    @for (m of c.members; track $index; let i = $index) {
                      <tr>
                        <td class="px-1 py-0.5"><input [class]="inputCls" [value]="m.name" (input)="setMember(i, 'name', $any($event.target).value)" list="crisis-people" [attr.aria-label]="'Nombre integrante ' + (i + 1)" /></td>
                        <td class="px-1"><select [class]="inputCls" (change)="setMember(i, 'role', $any($event.target).value)">
                          @for (r of roles; track r) { <option [value]="r" [selected]="r === m.role">{{ r }}</option> }</select></td>
                        <td class="px-1"><input [class]="inputCls" [value]="m.phone" (input)="setMember(i, 'phone', $any($event.target).value)" /></td>
                        <td class="px-1"><input [class]="inputCls" [value]="m.email" (input)="setMember(i, 'email', $any($event.target).value)" /></td>
                        <td class="px-1"><input [class]="inputCls" [value]="m.alternate" (input)="setMember(i, 'alternate', $any($event.target).value)" list="crisis-people" /></td>
                        <td class="px-1"><button type="button" (click)="removeMember(i)" [class.perm-hidden]="!cs.canManage()" class="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" aria-label="Quitar"><mat-icon class="text-sm">close</mat-icon></button></td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <button type="button" (click)="addMember()" [class.perm-hidden]="!cs.canManage()" class="text-[11px] font-semibold text-rose-700 hover:underline flex items-center gap-0.5 cursor-pointer"><mat-icon class="text-sm">add</mat-icon>Agregar integrante</button>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label class="block text-[11px] text-slate-600">Sala principal<input [class]="inputCls" [value]="c.primaryRoom" (input)="setCommittee('primaryRoom', $any($event.target).value)" /></label>
                <label class="block text-[11px] text-slate-600">Sala alternativa<input [class]="inputCls" [value]="c.alternateRoom" (input)="setCommittee('alternateRoom', $any($event.target).value)" /></label>
                <label class="block text-[11px] text-slate-600">Sala virtual<input [class]="inputCls" [value]="c.virtualRoom" (input)="setCommittee('virtualRoom', $any($event.target).value)" /></label>
                <label class="block text-[11px] text-slate-600 md:col-span-2">Protocolo de convocatoria<textarea rows="3" [class]="inputCls" [value]="c.convocation" (input)="setCommittee('convocation', $any($event.target).value)"></textarea></label>
                <div class="space-y-2">
                  <label class="block text-[11px] text-slate-600">Aprobado por<input [class]="inputCls" [value]="c.approvedBy" (input)="setCommittee('approvedBy', $any($event.target).value)" /></label>
                  <label class="block text-[11px] text-slate-600">Fecha de aprobación<input type="date" [class]="inputCls" [value]="c.approvalDate ?? ''" (input)="setCommittee('approvalDate', $any($event.target).value)" /></label>
                </div>
              </div>
            </fieldset>
            @if (cs.canManage()) {
              <div class="flex justify-end gap-2">
                <button type="button" (click)="committeeDraft.set(null)" class="px-3 py-1.5 text-xs rounded-lg border border-slate-300 cursor-pointer">Descartar</button>
                <button type="button" (click)="saveCommittee()" class="px-3 py-1.5 text-xs rounded-lg bg-slate-900 text-white font-semibold cursor-pointer">Guardar comité</button>
              </div>
            }
          </div>
        } @else {
          <ng-container *ngTemplateOutlet="committeeCard" />
          @if (cs.canManage()) {
            <button type="button" (click)="committeeDraft.set(clone(cs.committee()))" class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white cursor-pointer">Editar comité</button>
          }
        }
      }
    </div>

    <datalist id="crisis-people">
      @for (u of rs.userProfiles(); track u.id) { <option [value]="u.name"></option> }
    </datalist>

    <!-- ============================ TARJETA DEL COMITÉ ============================ -->
    <ng-template #committeeCard>
      @let c = cs.committee();
      <div class="bg-white rounded-2xl border border-slate-200 p-4 space-y-2" data-testid="committee-card">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5 flex-1"><mat-icon class="text-base text-rose-600">groups</mat-icon>Comité de Crisis</h3>
          @if (allEmails()) { <a [href]="'mailto:' + allEmails()" class="text-[11px] font-semibold text-rose-700 hover:underline flex items-center gap-0.5"><mat-icon class="text-sm">mail</mat-icon>Correo a todo el comité</a> }
        </div>
        @if (c.members.length) {
          <div class="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2">
            @for (m of c.members; track $index) {
              <div class="rounded-xl border border-slate-200 p-2.5 text-xs">
                <div class="font-semibold text-slate-900">{{ m.name }}</div>
                <div class="text-[11px] text-slate-500">{{ m.role }}@if (m.alternate) { · suplente: {{ m.alternate }} }</div>
                <div class="flex flex-wrap gap-x-3 mt-1">
                  @if (m.phone) { <a [href]="'tel:' + m.phone.replace(' ', '')" class="text-rose-700 hover:underline">{{ m.phone }}</a> }
                  @if (m.email) { <a [href]="'mailto:' + m.email" class="text-slate-600 hover:underline truncate">{{ m.email }}</a> }
                </div>
              </div>
            }
          </div>
        } @else { <p class="text-xs text-amber-800">El comité no tiene integrantes. Defínelos en la pestaña Comité.</p> }
        <div class="text-[11px] text-slate-600 grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2 pt-1">
          <span><strong>Sala:</strong> {{ c.primaryRoom || '—' }}</span>
          <span><strong>Alternativa:</strong> {{ c.alternateRoom || '—' }}</span>
          <span><strong>Virtual:</strong> {{ c.virtualRoom || '—' }}</span>
        </div>
        @if (c.convocation) { <p class="text-[11px] text-slate-500"><strong>Convocatoria:</strong> {{ c.convocation }}</p> }
      </div>
    </ng-template>

    <!-- ============================ DETALLE DE UNA CRISIS ============================ -->
    <ng-template #detailTpl>
      @let e = detail()!;
      @let open = isOpen(e);
      @let act = cs.canAct() && open;
      <div class="rounded-2xl border-2 p-4 space-y-1" [class]="e.mode === 'Real' && open ? 'border-rose-500 bg-rose-50/40' : open ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200 bg-white'" data-testid="crisis-detail">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-xs text-slate-500">{{ e.code }}</span>
          <span class="px-2 py-0.5 rounded text-[11px] font-bold" [class]="e.mode === 'Real' ? 'bg-rose-600 text-white' : 'bg-amber-400 text-amber-950'">{{ e.mode === 'Real' ? 'CRISIS REAL' : 'SIMULACRO' }}</span>
          <span class="px-2 py-0.5 rounded border text-[11px] font-semibold" [class]="levelCls(e.level)">Nivel {{ e.level }} · {{ lvl(e.level) }}</span>
          <span class="px-2 py-0.5 rounded bg-white border border-slate-300 text-[11px]">{{ e.status }}</span>
          <span class="flex-1"></span>
          @if (e.declaredAt) { <span class="text-[11px] text-slate-600">Desde {{ e.declaredAt | date:'dd-MM HH:mm' }} · <strong>{{ hours(e) }}</strong></span> }
        </div>
        <h2 class="text-lg font-bold text-slate-900">{{ e.title }}</h2>
        @if (scenarioOf(e); as s) { <p class="text-[11px] text-slate-600">Escenario {{ s.code }} · {{ s.name }}</p> }
        @if (e.status === 'Programada') {
          <p class="text-xs text-slate-600">Programado para el {{ e.plannedDate }}.</p>
          @if (cs.canAct()) {
            <div class="flex gap-2 pt-1">
              <button type="button" (click)="run(cs.startDrill(e.id)); tab.set('sala')" class="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold cursor-pointer">Iniciar simulacro</button>
              <button type="button" (click)="cancel(e)" class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs cursor-pointer">Cancelar</button>
            </div>
          }
        }
        @if (act) {
          <div class="flex flex-wrap items-center gap-2 pt-2">
            <label class="text-[11px] text-slate-600 flex items-center gap-1">Nivel
              <select class="text-xs rounded-lg border border-slate-300 px-2 py-1" (change)="run(cs.setLevel(e.id, toLevel($any($event.target).value)))" aria-label="Nivel de la crisis">
                @for (l of levels; track l.level) { <option [value]="l.level" [selected]="l.level === e.level">{{ l.level }} · {{ l.name }}</option> }
              </select></label>
            @if (e.status === 'Activa') { <button type="button" (click)="run(cs.stabilize(e.id, ''))" class="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-semibold cursor-pointer">Marcar estabilizada</button> }
            @if (e.status === 'Estabilizada') { <button type="button" (click)="run(cs.reactivate(e.id, ''))" class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs cursor-pointer">Reactivar</button> }
            <button type="button" (click)="closing.set({ id: e.id, summary: '', lessons: '' })" class="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer">Cerrar {{ e.mode === 'Real' ? 'crisis' : 'simulacro' }}</button>
          </div>
        }
        @if (closing(); as cl) {
          @if (cl.id === e.id) {
            <div class="mt-2 bg-white rounded-xl border border-slate-300 p-3 space-y-2">
              <label class="block text-[11px] text-slate-600">Resumen del cierre *<textarea rows="2" [class]="inputCls" [value]="cl.summary" (input)="closing.set({ id: cl.id, summary: $any($event.target).value, lessons: cl.lessons })" placeholder="Qué pasó, cómo se resolvió, tiempos de recuperación"></textarea></label>
              <label class="block text-[11px] text-slate-600">Lecciones aprendidas<textarea rows="2" [class]="inputCls" [value]="cl.lessons" (input)="closing.set({ id: cl.id, summary: cl.summary, lessons: $any($event.target).value })"></textarea></label>
              <div class="flex justify-end gap-2">
                <button type="button" (click)="closing.set(null)" class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs cursor-pointer">Volver</button>
                <button type="button" (click)="confirmClose()" [disabled]="!cl.summary.trim()" class="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer">Confirmar cierre</button>
              </div>
            </div>
          }
        }
      </div>

      @if (e.status !== 'Programada' && e.status !== 'Cancelada') {
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div class="xl:col-span-2 space-y-4">
            <!-- Bitácora -->
            <section class="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-slate-500">history_edu</mat-icon>Bitácora de la crisis</h3>
              @if (act) {
                <div class="flex flex-col sm:flex-row gap-2">
                  <select class="text-xs rounded-lg border border-slate-300 px-2 py-1.5 sm:w-32" (change)="logKind.set($any($event.target).value)" aria-label="Tipo de entrada">
                    @for (k of logKinds; track k) { <option [value]="k" [selected]="k === logKind()">{{ k }}</option> }
                  </select>
                  <input class="flex-1 text-xs rounded-lg border border-slate-300 px-2.5 py-1.5" [value]="logText()" (input)="logText.set($any($event.target).value)" (keydown.enter)="addLog(e)" placeholder="Qué pasa, qué se decidió o qué se hizo" aria-label="Nueva entrada de bitácora" />
                  <button type="button" (click)="addLog(e)" [disabled]="!logText().trim()" class="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer">Registrar</button>
                </div>
              }
              <ol class="space-y-2">
                @for (l of reversed(e.log); track l.id) {
                  <li class="flex gap-2 text-xs">
                    <span class="font-mono text-[11px] text-slate-500 w-12 shrink-0">{{ l.at | date:'HH:mm' }}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold h-fit shrink-0" [class]="kindCls(l.kind)">{{ l.kind }}</span>
                    <span class="text-slate-800">{{ l.text }} <span class="text-slate-400">— {{ l.by }}</span></span>
                  </li>
                } @empty { <li class="text-xs text-slate-500">Sin entradas.</li> }
              </ol>
            </section>

            <!-- Comunicaciones -->
            <section class="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-slate-500">forum</mat-icon>Comunicaciones</h3>
              @if (scenarioOf(e)?.communications; as msg) { <p class="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2"><strong>Mensajes clave del escenario:</strong> {{ msg }}</p> }
              @if (e.mode === 'Real' && e.flawId) {
                <button type="button" (click)="openModule.emit('reportes-regulatorios')" class="text-[11px] text-indigo-700 hover:underline flex items-center gap-1 cursor-pointer"><mat-icon class="text-sm">gavel</mat-icon>Ver plazos de reporte a la CMF / ANCI del incidente vinculado</button>
              }
              @if (act) {
                <div class="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <select class="text-xs rounded-lg border border-slate-300 px-2 py-1.5" (change)="comAudience.set($any($event.target).value)" aria-label="Destinatario">
                    @for (a of audiences; track a) { <option [value]="a" [selected]="a === comAudience()">{{ a }}</option> }
                  </select>
                  <input class="text-xs rounded-lg border border-slate-300 px-2.5 py-1.5" [value]="comChannel()" (input)="comChannel.set($any($event.target).value)" placeholder="Canal (correo, comunicado…)" aria-label="Canal" />
                  <input class="text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 sm:col-span-2" [value]="comSummary()" (input)="comSummary.set($any($event.target).value)" placeholder="Qué se informó" aria-label="Resumen de la comunicación" />
                </div>
                <div class="flex justify-end"><button type="button" (click)="addCom(e)" [disabled]="!comSummary().trim()" class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold disabled:opacity-50 cursor-pointer">Registrar comunicación</button></div>
              }
              <ul class="divide-y divide-slate-100">
                @for (c of reversed(e.communications); track c.id) {
                  <li class="py-1.5 text-xs"><span class="font-mono text-[11px] text-slate-500">{{ c.at | date:'dd-MM HH:mm' }}</span> · <strong>{{ c.audience }}</strong>@if (c.channel) { ({{ c.channel }}) }: {{ c.summary }} <span class="text-slate-400">— {{ c.by }}</span></li>
                } @empty { <li class="text-xs text-slate-500">Sin comunicaciones registradas.</li> }
              </ul>
            </section>

            @if (!open) {
              <section class="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <h3 class="text-sm font-bold text-slate-900">Cierre y lecciones aprendidas</h3>
                @if (e.closingSummary) { <p class="text-xs text-slate-700">{{ e.closingSummary }}</p> }
                @if (cs.canManage() && e.status === 'Cerrada') {
                  <textarea rows="3" [class]="inputCls" [value]="lessonsDraft() ?? e.lessons ?? ''" (input)="lessonsDraft.set($any($event.target).value)" aria-label="Lecciones aprendidas"></textarea>
                  @if (lessonsDraft() !== null && lessonsDraft() !== (e.lessons ?? '')) {
                    <div class="flex justify-end"><button type="button" (click)="saveLessons(e)" class="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer">Guardar lecciones</button></div>
                  }
                } @else if (e.lessons) { <p class="text-xs text-slate-700"><strong>Lecciones:</strong> {{ e.lessons }}</p> }
                @if (e.status === 'Cerrada') {
                  <app-linked-plans sourceType="Continuidad" [sourceId]="e.id" [sourceLabel]="e.code + ' · ' + e.title" defaultTitle="" emptyText="Sin planes de acción por lecciones aprendidas." />
                }
                @if (e.mode === 'Simulacro' && e.status === 'Cerrada') {
                  @if (e.testId) {
                    <p class="text-xs text-emerald-700 flex items-center gap-1"><mat-icon class="text-sm">check_circle</mat-icon>Registrado como prueba de continuidad del plan {{ planCodes(e.activatedPlanIds.slice(0, 1)) }}.</p>
                  } @else if (cs.canManage() && e.activatedPlanIds.length) {
                    <div class="flex flex-wrap items-end gap-2 bg-slate-50 rounded-xl p-3">
                      <span class="text-xs text-slate-700 flex-1 min-w-[12rem]">Registrar como prueba de continuidad ({{ planCodes(e.activatedPlanIds.slice(0, 1)) }}), para el programa de pruebas y la RAN 20-9.</span>
                      <select class="text-xs rounded-lg border border-slate-300 px-2 py-1.5" (change)="testResult.set($any($event.target).value)" aria-label="Resultado">
                        @for (r of results; track r) { <option [value]="r" [selected]="r === testResult()">{{ r }}</option> }
                      </select>
                      <input type="number" min="0" step="0.5" class="w-24 text-xs rounded-lg border border-slate-300 px-2 py-1.5" placeholder="RTO logrado (h)" [value]="testRto() ?? ''" (input)="testRto.set($any($event.target).value === '' ? null : +$any($event.target).value)" aria-label="RTO logrado en horas" />
                      <button type="button" (click)="registerTest(e)" class="px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-semibold cursor-pointer">Registrar prueba</button>
                    </div>
                  }
                }
              </section>
            }
          </div>

          <div class="space-y-4">
            <!-- Tareas -->
            <section class="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-slate-500">checklist</mat-icon>Tareas ({{ doneCount(e) }}/{{ e.tasks.length }})</h3>
              @for (t of e.tasks; track t.id) {
                <label class="flex items-start gap-2 text-xs" [class.cursor-pointer]="act">
                  <input type="checkbox" class="mt-0.5" [checked]="t.done" [disabled]="!act" (change)="run(cs.toggleTask(e.id, t.id))" />
                  <span [class.line-through]="t.done" [class.text-slate-400]="t.done">{{ t.text }}@if (t.owner) { <span class="text-slate-500"> · {{ t.owner }}</span> }</span>
                </label>
              } @empty { <p class="text-xs text-slate-500">Sin tareas.</p> }
              @if (act) {
                <div class="flex gap-1.5 pt-1">
                  <input class="flex-1 min-w-0 text-xs rounded-lg border border-slate-300 px-2 py-1" [value]="taskText()" (input)="taskText.set($any($event.target).value)" placeholder="Nueva tarea" aria-label="Nueva tarea" />
                  <input class="w-28 text-xs rounded-lg border border-slate-300 px-2 py-1" [value]="taskOwner()" (input)="taskOwner.set($any($event.target).value)" list="crisis-people" placeholder="Responsable" aria-label="Responsable" />
                  <button type="button" (click)="addTask(e)" [disabled]="!taskText().trim()" class="px-2 rounded-lg bg-slate-900 text-white disabled:opacity-50 cursor-pointer" aria-label="Agregar tarea"><mat-icon class="text-sm">add</mat-icon></button>
                </div>
              }
            </section>

            <!-- Procesos y RTO -->
            <section class="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-slate-500">timer</mat-icon>Procesos afectados</h3>
              @for (p of processesOf(e); track p.id) {
                <div class="text-xs flex items-start gap-2">
                  <span class="flex-1 text-slate-800">{{ p.name }}</span>
                  <span class="text-right text-[11px] whitespace-nowrap" [class]="p.late ? 'text-rose-700 font-bold' : 'text-slate-600'">RTO {{ p.rto }} h@if (p.deadline) { <br />{{ p.late ? 'vencido' : 'vence' }} {{ p.deadline | date:'dd-MM HH:mm' }} }</span>
                </div>
              } @empty { <p class="text-xs text-slate-500">Sin procesos indicados.</p> }
            </section>

            <!-- Planes -->
            <section class="bg-white rounded-2xl border border-slate-200 p-4 space-y-1.5">
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5"><mat-icon class="text-base text-slate-500">menu_book</mat-icon>Planes activados</h3>
              @for (p of plansOf(e.activatedPlanIds); track p.id) {
                <div class="text-xs"><span class="font-mono text-slate-500 mr-1">{{ p.code }}</span>{{ p.name }} <span class="text-[11px] text-slate-500">v{{ p.version }} · {{ p.status }}</span></div>
              } @empty { <p class="text-xs text-slate-500">Sin planes.</p> }
              @if (scenarioOf(e)?.activationCriteria; as crit) { <p class="text-[11px] text-slate-500 pt-1"><strong>Criterio de activación:</strong> {{ crit }}</p> }
            </section>

            <ng-container *ngTemplateOutlet="committeeCard" />
          </div>
        </div>
      }
    </ng-template>

    <!-- ============================ DECLARAR / PROGRAMAR ============================ -->
    @if (declareDraft(); as d) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl my-6 overflow-hidden" role="dialog" aria-modal="true">
          <div class="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between" [class]="d.mode === 'Real' ? 'bg-rose-50' : 'bg-amber-50'">
            <h2 class="text-base font-bold text-slate-900">{{ d.schedule ? 'Programar simulacro' : d.mode === 'Real' ? 'Declarar crisis' : 'Iniciar simulacro' }}</h2>
            <button type="button" (click)="declareDraft.set(null)" class="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar"><mat-icon>close</mat-icon></button>
          </div>
          <div class="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
            <label class="block text-[11px] font-medium text-slate-600">Escenario
              <select [class]="inputCls" (change)="pickScenario($any($event.target).value)" aria-label="Escenario">
                <option value="" [selected]="!d.scenarioId">— Sin escenario predefinido —</option>
                @for (s of activeScenarios(); track s.id) { <option [value]="s.id" [selected]="s.id === d.scenarioId">{{ s.code }} · {{ s.name }}</option> }
              </select></label>
            @if (scenarioById(d.scenarioId)?.activationCriteria; as crit) { <p class="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2"><strong>Criterio de activación:</strong> {{ crit }}</p> }
            <label class="block text-[11px] font-medium text-slate-600">Título *<input [class]="inputCls" [value]="d.title" (input)="setDraft('title', $any($event.target).value)" aria-label="Título" /></label>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              @for (l of levels; track l.level) {
                <label class="rounded-xl border p-2 text-[11px] cursor-pointer" [class]="d.level === l.level ? 'border-rose-500 bg-rose-50' : 'border-slate-200'">
                  <input type="radio" name="crisis-level" class="mr-1" [checked]="d.level === l.level" (change)="setDraft('level', l.level)" /><strong>{{ l.level }} · {{ l.name }}</strong>
                  <span class="block text-slate-500 mt-0.5">{{ l.hint }}</span>
                </label>
              }
            </div>
            @if (d.schedule) {
              <label class="block text-[11px] font-medium text-slate-600">Fecha *<input type="date" [class]="inputCls" [value]="d.plannedDate" (input)="setDraft('plannedDate', $any($event.target).value)" aria-label="Fecha del simulacro" /></label>
            } @else {
              @if (d.mode === 'Real') {
                <label class="block text-[11px] font-medium text-slate-600">Incidente vinculado (opcional)
                  <select [class]="inputCls" (change)="setDraft('flawId', $any($event.target).value || undefined)">
                    <option value="">— Ninguno —</option>
                    @for (f of rs.flaws(); track f.id) { <option [value]="f.id" [selected]="f.id === d.flawId">{{ f.id }} · {{ f.title }}</option> }
                  </select></label>
              }
              <label class="block text-[11px] font-medium text-slate-600">Situación inicial<textarea rows="2" [class]="inputCls" [value]="d.situation" (input)="setDraft('situation', $any($event.target).value)" placeholder="Qué se sabe ahora"></textarea></label>
            }
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <fieldset class="text-[11px] text-slate-600"><legend class="font-medium mb-1">Procesos afectados</legend>
                @for (b of res.biaProcesses(); track b.id) {
                  <label class="flex items-center gap-1.5 py-0.5"><input type="checkbox" [checked]="d.affectedProcessIds.includes(b.id)" (change)="toggleIn('affectedProcessIds', b.id)" />{{ b.name }} <span class="text-slate-400">(RTO {{ b.rtoHours }} h)</span></label>
                }
              </fieldset>
              <fieldset class="text-[11px] text-slate-600"><legend class="font-medium mb-1">Planes que se activan</legend>
                @for (p of res.plans(); track p.id) {
                  <label class="flex items-center gap-1.5 py-0.5"><input type="checkbox" [checked]="d.activatedPlanIds.includes(p.id)" (change)="toggleIn('activatedPlanIds', p.id)" />{{ p.code }} · {{ p.name }}</label>
                }
              </fieldset>
            </div>
            @if (!d.schedule) {
              <p class="text-[11px] text-slate-600">{{ d.mode === 'Real' ? 'Se avisará de inmediato al Comité de Crisis por la aplicación y por correo.' : 'Se avisará al comité que comenzó el simulacro.' }}
                @if (scenarioById(d.scenarioId)?.initialActions?.length) { Se cargarán {{ scenarioById(d.scenarioId)!.initialActions.length }} tareas del escenario. }</p>
            }
            @if (formError()) { <p class="text-xs text-rose-700" role="alert">{{ formError() }}</p> }
          </div>
          <div class="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" (click)="declareDraft.set(null)" class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs cursor-pointer">Cancelar</button>
            <button type="button" (click)="submitDeclare()" [disabled]="!d.title.trim() || (d.schedule && !d.plannedDate)"
              class="px-4 py-1.5 rounded-lg text-white text-xs font-bold disabled:opacity-50 cursor-pointer" [class]="d.mode === 'Real' ? 'bg-rose-600' : 'bg-amber-600'">
              {{ d.schedule ? 'Programar' : d.mode === 'Real' ? 'Declarar crisis' : 'Iniciar simulacro' }}</button>
          </div>
        </div>
      </div>
    }

    <!-- ============================ ESCENARIO ============================ -->
    @if (scenarioDraft(); as s) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto no-print">
        <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl my-6 overflow-hidden" role="dialog" aria-modal="true">
          <div class="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h2 class="text-base font-bold text-slate-900">{{ s.code }} · {{ s.name || 'Nuevo escenario' }}</h2>
            <button type="button" (click)="scenarioDraft.set(null)" class="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="Cerrar"><mat-icon>close</mat-icon></button>
          </div>
          <fieldset class="p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 max-h-[70vh] overflow-y-auto" [disabled]="!cs.canManage()">
            <label class="block text-[11px] text-slate-600">Código<input [class]="inputCls" [value]="s.code" (input)="setScen('code', $any($event.target).value)" /></label>
            <label class="block text-[11px] text-slate-600 sm:col-span-3">Nombre *<input [class]="inputCls" [value]="s.name" (input)="setScen('name', $any($event.target).value)" aria-label="Nombre del escenario" /></label>
            <label class="block text-[11px] text-slate-600 sm:col-span-2">Categoría<select [class]="inputCls" (change)="setScen('category', $any($event.target).value)">
              @for (c of categories; track c) { <option [value]="c" [selected]="c === s.category">{{ c }}</option> }</select></label>
            <label class="block text-[11px] text-slate-600">Probabilidad (1-4)<select [class]="inputCls" (change)="setScen('likelihood', +$any($event.target).value)">
              @for (n of [1, 2, 3, 4]; track n) { <option [value]="n" [selected]="n === s.likelihood">{{ n }}</option> }</select></label>
            <label class="block text-[11px] text-slate-600">Impacto (1-4)<select [class]="inputCls" (change)="setScen('impact', +$any($event.target).value)">
              @for (n of [1, 2, 3, 4]; track n) { <option [value]="n" [selected]="n === s.impact">{{ n }}</option> }</select></label>
            <label class="block text-[11px] text-slate-600 sm:col-span-4">Descripción<textarea rows="2" [class]="inputCls" [value]="s.description" (input)="setScen('description', $any($event.target).value)"></textarea></label>
            <label class="block text-[11px] text-slate-600 sm:col-span-4">Criterio de activación<textarea rows="2" [class]="inputCls" [value]="s.activationCriteria" (input)="setScen('activationCriteria', $any($event.target).value)"></textarea></label>
            <label class="block text-[11px] text-slate-600 sm:col-span-2">Primeras acciones (una por línea; se cargan como tareas)<textarea rows="5" [class]="inputCls" [value]="s.initialActions.join('\\n')" (input)="setScen('initialActions', $any($event.target).value.split('\\n'))"></textarea></label>
            <label class="block text-[11px] text-slate-600 sm:col-span-2">Comunicaciones y mensajes clave<textarea rows="5" [class]="inputCls" [value]="s.communications" (input)="setScen('communications', $any($event.target).value)"></textarea></label>
            <fieldset class="text-[11px] text-slate-600 sm:col-span-2"><legend class="font-medium mb-1">Procesos afectados (BIA)</legend>
              @for (b of res.biaProcesses(); track b.id) {
                <label class="flex items-center gap-1.5 py-0.5"><input type="checkbox" [checked]="s.affectedProcessIds.includes(b.id)" (change)="toggleScen('affectedProcessIds', b.id)" />{{ b.name }}</label>
              }
            </fieldset>
            <fieldset class="text-[11px] text-slate-600 sm:col-span-2"><legend class="font-medium mb-1">Planes de respuesta</legend>
              @for (p of res.plans(); track p.id) {
                <label class="flex items-center gap-1.5 py-0.5"><input type="checkbox" [checked]="s.planIds.includes(p.id)" (change)="toggleScen('planIds', p.id)" />{{ p.code }} · {{ p.name }}</label>
              }
            </fieldset>
            <label class="block text-[11px] text-slate-600 sm:col-span-2">Responsable<input [class]="inputCls" [value]="s.owner" (input)="setScen('owner', $any($event.target).value)" list="crisis-people" /></label>
            <label class="block text-[11px] text-slate-600">Última revisión<input type="date" [class]="inputCls" [value]="s.lastReviewDate" (input)="setScen('lastReviewDate', $any($event.target).value)" /></label>
            <label class="flex items-center gap-1.5 text-[11px] text-slate-600 pt-5"><input type="checkbox" [checked]="s.active" (change)="setScen('active', $any($event.target).checked)" />Activo</label>
          </fieldset>
          @if (formError()) { <p class="px-5 text-xs text-rose-700" role="alert">{{ formError() }}</p> }
          <div class="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
            <button type="button" (click)="scenarioDraft.set(null)" class="px-3 py-1.5 rounded-lg border border-slate-300 text-xs cursor-pointer">{{ cs.canManage() ? 'Cancelar' : 'Cerrar' }}</button>
            @if (cs.canManage()) { <button type="button" (click)="saveScenario()" [disabled]="!s.name.trim()" class="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">Guardar escenario</button> }
          </div>
        </div>
      </div>
    }
  `,
})
export class CrisisPanel {
  readonly cs = inject(CrisisService);
  readonly res = inject(ResilienceService);
  readonly rs = inject(RiskDataService);
  readonly notify = output<string>();
  readonly openModule = output<string>();
  /** Crisis a abrir (desde un aviso). */
  readonly focusId = input<string | null>(null);

  readonly inputCls = INPUT;
  readonly levels = CRISIS_LEVELS;
  readonly logKinds = CRISIS_LOG_KINDS;
  readonly audiences = CRISIS_AUDIENCES;
  readonly categories = SCENARIO_CATEGORIES;
  readonly roles = COMMITTEE_ROLES;
  readonly results: ContinuityTest['result'][] = ['Exitosa', 'Con observaciones', 'Fallida'];
  readonly isOpen = isOpen;
  readonly clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

  readonly tab = signal<SubTab>('sala');
  readonly selectedId = signal<string | null>(null);
  readonly error = signal('');
  readonly formError = signal('');
  readonly logKind = signal<CrisisLogKind>('Situación');
  readonly logText = signal('');
  readonly comAudience = signal<CrisisAudience>('Colaboradores');
  readonly comChannel = signal('');
  readonly comSummary = signal('');
  readonly taskText = signal('');
  readonly taskOwner = signal('');
  readonly closing = signal<{ id: string; summary: string; lessons: string } | null>(null);
  readonly lessonsDraft = signal<string | null>(null);
  readonly testResult = signal<ContinuityTest['result']>('Exitosa');
  readonly testRto = signal<number | null>(null);
  readonly declareDraft = signal<DeclareDraft | null>(null);
  readonly scenarioDraft = signal<CrisisScenario | null>(null);
  readonly committeeDraft = signal<CrisisCommittee | null>(null);
  /** Reloj para el tiempo transcurrido y los RTO. */
  readonly now = signal(Date.now());

  constructor() {
    const t = setInterval(() => this.now.set(Date.now()), 30_000);
    effect(onCleanup => onCleanup(() => clearInterval(t)));
    effect(() => {
      const id = this.focusId();
      if (!id) return;
      untracked(() => {
        const e = this.cs.byId(id);
        if (!e) return;
        this.tab.set(isOpen(e) ? 'sala' : 'historial');
        this.selectedId.set(id);
      });
    });
  }

  readonly tabs = computed(() => [
    { id: 'sala' as SubTab, label: 'Sala de crisis', icon: 'crisis_alert', badge: this.cs.open().length || 0 },
    { id: 'escenarios' as SubTab, label: 'Escenarios', icon: 'thunderstorm', badge: 0 },
    { id: 'historial' as SubTab, label: 'Crisis y simulacros', icon: 'event_note', badge: 0 },
    { id: 'comite' as SubTab, label: 'Comité', icon: 'groups', badge: 0 },
  ]);

  /** Crisis a mostrar: la elegida o, en la sala, la primera abierta. */
  readonly detail = computed<CrisisEvent | null>(() => {
    const id = this.selectedId();
    const chosen = id ? this.cs.byId(id) ?? null : null;
    if (this.tab() === 'sala') return chosen && isOpen(chosen) ? chosen : this.cs.open()[0] ?? null;
    return chosen;
  });

  readonly allPast = computed(() => this.cs.history());
  readonly activeScenarios = computed(() => this.cs.scenarios().filter(s => s.active));
  readonly gaps = computed(() => committeeGaps(this.committeeDraft() ?? this.cs.committee()));
  readonly allEmails = computed(() => this.cs.committee().members.map(m => m.email).filter(e => e.includes('@')).join(','));
  /** Los 5 escenarios mínimos de la RAN 20-9: ¿alguno ejercitado en 12 meses? */
  readonly minCoverage = computed(() => SCENARIO_CATEGORIES.slice(0, 5).map(category => ({
    category, ok: this.cs.coverage().some(c => c.scenario.category === category && c.current),
  })));

  lvl(l: number) { return levelName(l); }
  toLevel(v: string): CrisisLevel { const n = Number(v); return (n === 1 || n === 3 ? n : 2) as CrisisLevel; }
  levelCls(l: number) { return LEVEL_CLS[l] ?? ''; }
  score(s: CrisisScenario) { return scenarioScore(s); }
  scenLevel(s: CrisisScenario) { return scenarioLevel(scenarioScore(s)); }
  scenCls(s: CrisisScenario) { return SCEN_CLS[this.scenLevel(s)]; }
  scenarioById(id: string | undefined) { return this.cs.scenarioById(id); }
  scenarioOf(e: CrisisEvent) { return this.cs.scenarioById(e.scenarioId); }
  reversed<T>(list: T[]) { return [...list].reverse(); }
  doneCount(e: CrisisEvent) { return e.tasks.filter(t => t.done).length; }
  plansOf(ids: string[]) { return ids.map(id => this.res.plans().find(p => p.id === id)).filter(p => !!p); }
  planCodes(ids: string[]) { return this.plansOf(ids).map(p => p.code).join(', '); }
  kindCls(k: string) {
    return k === 'Decisión' ? 'bg-indigo-100 text-indigo-800' : k === 'Acción' ? 'bg-emerald-100 text-emerald-800' : k === 'Estado' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700';
  }

  hours(e: CrisisEvent) {
    this.now();
    const h = elapsedHours(e);
    return h < 1 ? `${Math.round(h * 60)} min` : `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;
  }

  /** Procesos con su RTO y la hora en que vence desde la declaración. */
  processesOf(e: CrisisEvent) {
    const now = this.now();
    return e.affectedProcessIds.map(id => this.res.biaProcesses().find(b => b.id === id)).filter(b => !!b).map(b => {
      const deadline = e.declaredAt ? new Date(new Date(e.declaredAt).getTime() + b.rtoHours * 3_600_000) : null;
      return { id: b.id, name: b.name, rto: b.rtoHours, deadline, late: !!deadline && isOpen(e) && deadline.getTime() < now };
    });
  }

  async run(p: Promise<unknown>) {
    this.error.set('');
    try { await p; } catch (err) { this.error.set((err as Error).message); }
  }

  // ----- Declarar / programar
  openDeclare(mode: 'Real' | 'Simulacro', schedule = false) {
    this.formError.set('');
    this.declareDraft.set({
      title: '', mode, level: 2, scenarioId: undefined, flawId: undefined, affectedProcessIds: [], activatedPlanIds: [],
      situation: '', schedule, plannedDate: '',
    });
  }

  pickScenario(id: string) {
    const s = this.cs.scenarioById(id || undefined);
    this.declareDraft.update(d => d && ({
      ...d, scenarioId: s?.id, title: d.title || (s ? `${d.mode === 'Simulacro' ? 'Simulacro: ' : ''}${s.name}` : ''),
      affectedProcessIds: s ? [...s.affectedProcessIds] : d.affectedProcessIds, activatedPlanIds: s ? [...s.planIds] : d.activatedPlanIds,
      level: s && scenarioScore(s) >= 12 ? 3 : d.level,
    }));
  }

  setDraft<K extends keyof DeclareDraft>(k: K, v: DeclareDraft[K]) { this.declareDraft.update(d => d && ({ ...d, [k]: v })); }
  toggleIn(k: 'affectedProcessIds' | 'activatedPlanIds', id: string) {
    this.declareDraft.update(d => d && ({ ...d, [k]: d[k].includes(id) ? d[k].filter(x => x !== id) : [...d[k], id] }));
  }

  async submitDeclare() {
    const d = this.declareDraft();
    if (!d) return;
    this.formError.set('');
    try {
      if (d.schedule) {
        const e = await this.cs.scheduleDrill({ ...d, level: d.level as CrisisLevel });
        this.notify.emit(`Simulacro ${e.code} programado para el ${e.plannedDate}.`);
        this.tab.set('historial');
      } else {
        const e = await this.cs.declare(d);
        this.notify.emit(e.mode === 'Real' ? `Crisis ${e.code} declarada. Se avisó al comité.` : `Simulacro ${e.code} iniciado.`);
        this.tab.set('sala');
        this.selectedId.set(e.id);
      }
      this.declareDraft.set(null);
    } catch (err) {
      this.formError.set((err as Error).message);
    }
  }

  cancel(e: CrisisEvent) {
    void this.run(this.cs.cancelDrill(e.id, ''));
    this.notify.emit(`Simulacro ${e.code} cancelado.`);
  }

  // ----- Registro durante la crisis
  addLog(e: CrisisEvent) {
    if (!this.logText().trim()) return;
    void this.run(this.cs.addLog(e.id, this.logKind(), this.logText()));
    this.logText.set('');
  }

  addCom(e: CrisisEvent) {
    void this.run(this.cs.addCommunication(e.id, this.comAudience(), this.comChannel(), this.comSummary()));
    this.comSummary.set('');
  }

  addTask(e: CrisisEvent) {
    void this.run(this.cs.addTask(e.id, this.taskText(), this.taskOwner()));
    this.taskText.set('');
    this.taskOwner.set('');
  }

  async confirmClose() {
    const c = this.closing();
    if (!c) return;
    const e = this.cs.byId(c.id);
    await this.run(this.cs.close(c.id, c.summary, c.lessons));
    if (!this.error()) {
      this.closing.set(null);
      this.notify.emit(`${e?.mode === 'Simulacro' ? 'Simulacro' : 'Crisis'} ${e?.code} cerrada.`);
      this.tab.set('historial');
      this.selectedId.set(c.id);
    }
  }

  async saveLessons(e: CrisisEvent) {
    await this.run(this.cs.saveLessons(e.id, this.lessonsDraft() ?? ''));
    this.lessonsDraft.set(null);
  }

  async registerTest(e: CrisisEvent) {
    await this.run(this.cs.registerAsTest(e.id, this.testResult(), this.testRto() ?? undefined));
    if (!this.error()) this.notify.emit(`${e.code} registrado como prueba de continuidad.`);
  }

  // ----- Escenarios
  editScenario(s: CrisisScenario) { this.formError.set(''); this.scenarioDraft.set(this.clone(s)); }
  setScen<K extends keyof CrisisScenario>(k: K, v: CrisisScenario[K]) { this.scenarioDraft.update(s => s && ({ ...s, [k]: v })); }
  toggleScen(k: 'affectedProcessIds' | 'planIds', id: string) {
    this.scenarioDraft.update(s => s && ({ ...s, [k]: s[k].includes(id) ? s[k].filter(x => x !== id) : [...s[k], id] }));
  }
  async saveScenario() {
    const s = this.scenarioDraft();
    if (!s) return;
    try {
      await this.cs.saveScenario(s);
      this.scenarioDraft.set(null);
      this.notify.emit(`Escenario ${s.code} guardado.`);
    } catch (err) {
      this.formError.set((err as Error).message);
    }
  }

  // ----- Comité
  setMember(i: number, k: keyof CommitteeMember, v: string) {
    // Al elegir una persona de la aplicación se completa su correo.
    const user = k === 'name' ? this.rs.userProfiles().find(u => u.name === v) : undefined;
    this.committeeDraft.update(c => c && ({
      ...c, members: c.members.map((m, j) => (j === i ? { ...m, [k]: v, ...(user && !m.email ? { email: user.email } : {}) } : m)),
    }));
  }
  addMember() { this.committeeDraft.update(c => c && ({ ...c, members: [...c.members, { name: '', role: 'Miembro', phone: '', email: '', alternate: '' }] })); }
  removeMember(i: number) { this.committeeDraft.update(c => c && ({ ...c, members: c.members.filter((_, j) => j !== i) })); }
  setCommittee<K extends keyof CrisisCommittee>(k: K, v: CrisisCommittee[K]) { this.committeeDraft.update(c => c && ({ ...c, [k]: v })); }
  async saveCommittee() {
    const c = this.committeeDraft();
    if (!c) return;
    await this.run(this.cs.saveCommittee(c));
    if (!this.error()) { this.committeeDraft.set(null); this.notify.emit('Comité de Crisis guardado.'); }
  }
}
