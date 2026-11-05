import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { PersistenceService } from '../services/persistence.service';
import { ResilienceService } from '../services/resilience.service';
import { SecurityService } from '../services/security.service';
import { ActiveTab } from '../app';
import { ComplianceService } from '../services/compliance.service';
import { ActionPlanService } from '../services/action-plan.service';
import { SurveyService } from '../services/survey.service';
import { ApprovalService } from '../services/approval.service';

export interface NavGroup {
  title: string;
  items: {
    id: ActiveTab;
    label: string;
    icon: string;
    badge?: string | number;
    badgeClass?: string;
  }[];
}

@Component({
  selector: 'app-sidebar-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <aside
      class="bg-slate-950 text-slate-200 border-r border-slate-800/80 flex flex-col shrink-0 transition-all duration-300 z-40 select-none shadow-2xl h-screen sticky top-0"
      [class.w-72]="!isCollapsed()"
      [class.w-20]="isCollapsed()"
    >
      <!-- Brand & Collapse Header -->
      <div class="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 shrink-0 bg-slate-950/90 backdrop-blur-sm">
        <div class="flex items-center gap-3 overflow-hidden">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white font-bold shadow-md shadow-emerald-950/50 shrink-0">
            <mat-icon class="text-2xl">shield</mat-icon>
          </div>
          @if (!isCollapsed()) {
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="text-base font-bold tracking-tight text-white truncate">RiskGuard Pro</span>
                <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Sistema Operacional Activo"></span>
              </div>
              <div class="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span class="font-semibold text-emerald-400">ISO 31000</span>
                <span>•</span>
                <span>Basilea III</span>
              </div>
            </div>
          }
        </div>

        <!-- Collapse toggle button -->
        <button
          type="button"
          (click)="toggleCollapse.emit()"
          class="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors border border-slate-800 shrink-0"
          [title]="isCollapsed() ? 'Expandir menú lateral' : 'Colapsar menú lateral'"
        >
          <mat-icon class="text-sm">
            {{ isCollapsed() ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left' }}
          </mat-icon>
        </button>
      </div>

      <!-- Navigation Links (Scrollable) -->
      <div class="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
        
        @for (group of navGroups(); track group.title) {
          <div>
            @if (!isCollapsed()) {
              <div class="px-2.5 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                {{ group.title }}
              </div>
            } @else {
              <div class="w-full h-px bg-slate-800/60 my-2"></div>
            }

            <div class="space-y-1">
              @for (item of group.items; track item.id) {
                <button
                  type="button"
                  (click)="tabSelected.emit(item.id)"
                  [class]="activeTab() === item.id
                    ? 'bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-900/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900/80 font-medium'"
                  class="w-full text-left rounded-xl transition-all duration-150 flex items-center gap-3 px-3 py-2.5 text-xs group relative cursor-pointer"
                  [title]="item.label"
                >
                  <mat-icon
                    class="text-lg transition-transform group-hover:scale-110 shrink-0"
                    [class.text-emerald-400]="activeTab() !== item.id"
                  >
                    {{ item.icon }}
                  </mat-icon>

                  @if (!isCollapsed()) {
                    <span class="truncate flex-1">{{ item.label }}</span>

                    @if (item.badge !== undefined && item.badge !== null) {
                      <span
                        [class]="item.badgeClass || 'bg-slate-800 text-slate-300'"
                        class="text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold ml-auto shrink-0 shadow-2xs"
                      >
                        {{ item.badge }}
                      </span>
                    }
                  } @else {
                    @if (item.badge !== undefined && item.badge !== null) {
                      <span
                        [class]="item.badgeClass || 'bg-slate-800 text-slate-300'"
                        class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-slate-950"
                      ></span>
                    }
                  }
                </button>
              }
            </div>
          </div>
        }

        <!-- Quick Operational Actions Card -->
        @if (!isCollapsed()) {
          <div class="pt-2">
            <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800/90 space-y-2">
              <div class="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                <span>Acciones Rápidas</span>
                <span class="text-emerald-400 font-mono text-[10px]">OPERACIONAL</span>
              </div>

              <button
                type="button"
                (click)="openFlawModal.emit()"
                class="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <mat-icon class="text-sm">add_alert</mat-icon>
                <span>Registrar Incidencia</span>
              </button>

              <button
                type="button"
                (click)="openRiskModal.emit()"
                class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700/80 transition-colors cursor-pointer"
              >
                <mat-icon class="text-sm text-emerald-400">add_box</mat-icon>
                <span>Nuevo Riesgo 4×4</span>
              </button>

              <button
                type="button"
                (click)="simulateAnomaly.emit()"
                class="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-rose-300 rounded-lg text-[11px] font-medium border border-slate-800 transition-colors cursor-pointer"
              >
                <mat-icon class="text-sm text-rose-500">flash_on</mat-icon>
                <span>Simular Desviación KRI</span>
              </button>
            </div>
          </div>
        }

      </div>

      <!-- Footer: User Profile, Role RBAC & Layout Switcher -->
      <div class="p-3 border-t border-slate-800/80 bg-slate-950 shrink-0 space-y-2.5">
        
        <!-- Toggle back to Horizontal Navigation -->
        <button
          type="button"
          (click)="toggleLayout.emit()"
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs transition-colors cursor-pointer"
          title="Cambiar a diseño de barra de menú superior horizontal"
        >
          <mat-icon class="text-sm text-indigo-400 shrink-0">view_day</mat-icon>
          @if (!isCollapsed()) {
            <span class="truncate flex-1 text-left">Vista Menú Superior</span>
            <span class="text-[10px] text-slate-500 font-mono">Horizontal</span>
          }
        </button>

        <!-- Active User Profile Card -->
        <div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-emerald-700/60 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-600/40">
              {{ getUserInitials() }}
            </div>
            
            @if (!isCollapsed()) {
              <div class="min-w-0 flex-1">
                <div class="text-xs font-semibold text-white truncate leading-tight">
                  {{ riskService.currentProfile().name }}
                </div>
                <div class="text-[10px] text-slate-400 truncate">
                  {{ riskService.currentProfile().role }}
                </div>
              </div>
            }
          </div>

          @if (!isCollapsed()) {
            <div class="mt-2 pt-2 border-t border-slate-800/60">
              @if (riskService.sessionLocked()) {
                <button
                  type="button"
                  (click)="persistence.logout()"
                  class="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-200 hover:text-white rounded-md text-[11px] font-medium border border-slate-700/80 transition-colors cursor-pointer"
                  title="Cerrar la sesión en este navegador"
                >
                  <mat-icon class="text-xs">logout</mat-icon>
                  <span>Cerrar sesión</span>
                </button>
              } @else {
                <label for="sidebar-role-select" class="block text-[9px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Rol Normativo (RBAC)
                </label>
                <select
                  id="sidebar-role-select"
                  [value]="riskService.currentProfile().id"
                  (change)="onRoleChange($event)"
                  class="w-full bg-slate-950 border border-slate-700 text-slate-200 text-[11px] rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  @for (profile of riskService.availableProfiles; track profile.id) {
                    <option [value]="profile.id">
                      {{ profile.role }}
                    </option>
                  }
                </select>
              }

              <button
                type="button"
                (click)="openRolesModal.emit()"
                class="w-full mt-2 flex items-center justify-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white rounded-md text-[10px] font-medium border border-slate-700/80 transition-colors cursor-pointer"
                title="Definir puestos reales y matriz de permisos"
              >
                <mat-icon class="text-xs text-indigo-400">manage_accounts</mat-icon>
                <span>Puestos & Permisos (RBAC)</span>
              </button>

              <div class="mt-2 flex items-center justify-between text-[10px] text-emerald-400">
                <span class="flex items-center gap-1">
                  <mat-icon class="text-xs">verified</mat-icon>
                  <span>Ledger Criptográfico</span>
                </span>
                <span class="font-mono text-[9px] text-slate-400">SHA-256</span>
              </div>
            </div>
          }
        </div>

      </div>
    </aside>
  `
})
export class SidebarNav {
  readonly riskService = inject(RiskDataService);
  readonly persistence = inject(PersistenceService);
  readonly resilience = inject(ResilienceService);
  readonly security = inject(SecurityService);
  readonly compliance = inject(ComplianceService);
  readonly actionPlans = inject(ActionPlanService);
  readonly surveys = inject(SurveyService);
  readonly approvals = inject(ApprovalService);

  readonly activeTab = input.required<ActiveTab>();
  readonly isCollapsed = input<boolean>(false);

  readonly tabSelected = output<ActiveTab>();
  readonly toggleCollapse = output<void>();
  readonly toggleLayout = output<void>();
  readonly openRiskModal = output<void>();
  readonly openFlawModal = output<void>();
  readonly simulateAnomaly = output<void>();
  readonly openRolesModal = output<void>();

  readonly navGroups = computed<NavGroup[]>(() => {
    const risksCount = this.riskService.risks().length;
    const controlsCount = this.riskService.controls().length;
    const flawsCount = this.riskService.flaws().length;
    const activeAlerts = this.riskService.metrics().activeAlertsCount;
    const providerHigh = this.resilience.providerKpis().highAlerts;
    const continuityHigh = this.resilience.continuityKpis().highAlerts;
    const securityHigh = this.security.kpis().highAlerts;
    const cs = this.compliance.summary();
    const complianceGaps = cs.gaps + cs.overdue + cs.versionReview;
    const plansOverdue = this.actionPlans.kpis().overdue;
    const sk = this.surveys.kpis();
    const surveysBadge = sk.minePending + (this.surveys.canManage() ? sk.toReview : 0);
    const approvalsMine = this.approvals.pendingForMe().length;
    const regulatoryOpen = this.riskService.regulatoryIncidents().filter(f => f.regulatoryReport?.status === 'Abierto').length;

    return [
      {
        title: 'Estratégico & Ejecutivo',
        items: [
          { id: 'tablero', label: 'Tablero Ejecutivo', icon: 'dashboard' },
          {
            id: 'aprobaciones', label: 'Aprobaciones', icon: 'approval',
            badge: approvalsMine > 0 ? approvalsMine : undefined,
            badgeClass: 'bg-amber-500 text-slate-950 font-bold'
          },
          { id: 'tableros-departamento', label: 'Tableros por Proceso', icon: 'corporate_fare' },
          { id: 'graficos-analitica', label: 'Gráficos & Analítica', icon: 'analytics' },
        ]
      },
      {
        title: 'Gestión Operativa',
        items: [
          { id: 'matriz-riesgos', label: 'Matriz 4×4 & Inventario', icon: 'grid_view', badge: risksCount, badgeClass: 'bg-slate-800 text-slate-200' },
          { id: 'controles', label: 'Controles y Evidencias', icon: 'verified_user', badge: controlsCount, badgeClass: 'bg-slate-800 text-slate-200' },
          {
            id: 'autoevaluaciones', label: 'Autoevaluaciones', icon: 'fact_check',
            badge: surveysBadge > 0 ? surveysBadge : undefined,
            badgeClass: 'bg-sky-900/60 text-sky-200 border border-sky-700/50'
          },
        ]
      },
      {
        title: 'Incidentes & Seguimiento',
        items: [
          { id: 'incidentes-perdidas', label: 'Incidentes y Pérdidas', icon: 'report_problem', badge: flawsCount, badgeClass: 'bg-amber-900/60 text-amber-300 border border-amber-700/50' },
          {
            id: 'reportes-regulatorios',
            label: 'Reporte CMF / ANCI',
            icon: 'gavel',
            badge: regulatoryOpen > 0 ? regulatoryOpen : undefined,
            badgeClass: 'bg-indigo-900/60 text-indigo-200 border border-indigo-700/50'
          },
          {
            id: 'planes-accion',
            label: 'Planes de Acción',
            icon: 'assignment_turned_in',
            badge: plansOverdue > 0 ? plansOverdue : undefined,
            badgeClass: 'bg-rose-900/60 text-rose-200 border border-rose-700/50'
          },
          {
            id: 'alertas-kri',
            label: 'Alertas & KRIs',
            icon: 'notification_important',
            badge: activeAlerts > 0 ? activeAlerts : undefined,
            badgeClass: 'bg-rose-600 text-white animate-pulse'
          },
        ]
      },
      {
        title: 'Resiliencia & Terceros',
        items: [
          {
            id: 'proveedores',
            label: 'Proveedores',
            icon: 'handshake',
            badge: providerHigh > 0 ? providerHigh : undefined,
            badgeClass: 'bg-rose-900/60 text-rose-200 border border-rose-700/50'
          },
          {
            id: 'continuidad',
            label: 'Continuidad del Negocio',
            icon: 'restart_alt',
            badge: continuityHigh > 0 ? continuityHigh : undefined,
            badgeClass: 'bg-rose-900/60 text-rose-200 border border-rose-700/50'
          },
          {
            id: 'seguridad-informacion',
            label: 'Seguridad de la Información',
            icon: 'security',
            badge: securityHigh > 0 ? securityHigh : undefined,
            badgeClass: 'bg-rose-900/60 text-rose-200 border border-rose-700/50'
          },
        ]
      },
      {
        title: 'Supervisión & Auditoría',
        items: [
          { id: 'auditorias', label: 'Auditorías Periódicas', icon: 'fact_check' },
          { id: 'bitacora', label: 'Bitácora Inalterable', icon: 'lock', badge: 'SHA-256', badgeClass: 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' },
          { id: 'reportes-pdf', label: 'Centro de Reportes & PDF', icon: 'picture_as_pdf', badge: 'PDF', badgeClass: 'bg-rose-950 text-rose-300 border border-rose-800/40' },
          { id: 'apr-operacional', label: 'APR Riesgo Operacional', icon: 'account_balance', badge: 'CAC-20', badgeClass: 'bg-emerald-950 text-emerald-300 border border-emerald-800/40' },
          {
            id: 'cumplimiento-ran', label: 'Cumplimiento Normativo', icon: 'policy',
            badge: complianceGaps > 0 ? complianceGaps : undefined,
            badgeClass: 'bg-amber-900/60 text-amber-200 border border-amber-700/50'
          },
        ]
      },
      {
        title: 'Configuración',
        items: [
          { id: 'mantenedores', label: 'Mantenedores', icon: 'tune' },
        ]
      }
    ];
  });

  getUserInitials(): string {
    const name = this.riskService.currentProfile().name;
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  onRoleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    if (target && target.value) {
      this.riskService.switchProfile(target.value);
    }
  }
}
