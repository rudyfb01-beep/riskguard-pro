import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { NotificationBell } from './notification-bell';
import { RiskDataService } from '../services/risk-data.service';
import { PersistenceService } from '../services/persistence.service';

@Component({
  selector: 'app-top-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, NotificationBell],
  template: `
    <header class="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-sm no-print">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16 gap-4">
          
          <!-- Brand Zone (Single text element wordmark with subtle shield icon) -->
          <div class="flex items-center gap-3 shrink-0">
            <div class="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold shadow-sm">
              <mat-icon class="text-xl">shield</mat-icon>
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-lg font-bold tracking-tight text-white whitespace-nowrap">
                  RiskGuard Pro
                </span>
                <span class="text-[11px] font-medium uppercase tracking-wider text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">
                  ISO 31000 / Basilea III
                </span>
              </div>
            </div>
          </div>

          <!-- Compliance Role Switcher & Active Session -->
          <div class="flex items-center gap-2 shrink-0">
            
            <!-- Layout Switcher Action -->
            <button
              type="button"
              (click)="toggleLayout.emit()"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 whitespace-nowrap cursor-pointer"
              [title]="currentLayout() === 'vertical' ? 'Cambiar a menú superior horizontal' : 'Ver menú vertical a la izquierda (barra lateral)'"
            >
              <mat-icon class="text-sm text-indigo-400">
                {{ currentLayout() === 'vertical' ? 'view_day' : 'view_sidebar' }}
              </mat-icon>
              <span class="hidden 2xl:inline">
                {{ currentLayout() === 'vertical' ? 'Menú Superior' : 'Menú Vertical' }}
              </span>
            </button>

            <button
              type="button"
              (click)="openReportModal.emit()"
              class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700 whitespace-nowrap"
              title="Generar informe para el Consejo de Administración y exportar PDF/Excel"
            >
              <mat-icon class="text-sm text-emerald-400">picture_as_pdf</mat-icon>
              <span class="hidden xl:inline">Informes Ejecutivos</span>
            </button>

            <app-notification-bell [dark]="true" />

            <button
              type="button"
              (click)="openFlawModal.emit()"
              class="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors shadow-sm whitespace-nowrap"
              title="Registrar eventos de pérdida real o fallas de control operacional"
            >
              <mat-icon class="text-sm">add_alert</mat-icon>
              <span class="hidden sm:inline">Registrar Incidencia</span>
            </button>

            <!-- Role Selector Dropdown -->
            <div class="relative flex items-center pl-3 border-l border-slate-700 min-w-0">
              @if (riskService.sessionLocked()) {
              <div class="text-right hidden lg:block mr-2.5 max-w-[220px] whitespace-nowrap">
                <div class="text-xs font-semibold text-slate-200 leading-tight truncate">
                  {{ riskService.currentProfile().name }}
                </div>
                <div class="text-[11px] text-slate-400 truncate">
                  {{ riskService.currentProfile().role }}
                </div>
              </div>
              }

              @if (riskService.sessionLocked()) {
                <button
                  type="button"
                  (click)="persistence.logout()"
                  class="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-200 border border-slate-700 transition-colors cursor-pointer flex items-center gap-1 text-xs"
                  title="Cerrar sesión"
                >
                  <mat-icon class="text-sm">logout</mat-icon>
                  <span class="hidden lg:inline">Salir</span>
                </button>
              } @else {
                <select
                  [value]="riskService.currentProfile().id"
                  (change)="onRoleChange($event)"
                  class="max-w-[150px] lg:max-w-[260px] truncate bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  title="Cambiar rol normativo de cumplimiento (RBAC)"
                >
                  @for (profile of riskService.availableProfiles; track profile.id) {
                    <option [value]="profile.id">
                      {{ profile.role }} - {{ profile.name }}
                    </option>
                  }
                </select>
              }

              <button
                type="button"
                (click)="openRolesModal.emit()"
                class="ml-2 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 border border-slate-700 transition-colors cursor-pointer"
                title="Gestionar puestos reales de la organización y matriz de permisos (RBAC)"
              >
                <mat-icon class="text-sm">manage_accounts</mat-icon>
              </button>
            </div>

          </div>

        </div>
      </div>
    </header>
  `
})
export class TopBar {
  readonly riskService = inject(RiskDataService);
  readonly persistence = inject(PersistenceService);

  readonly currentLayout = input<'vertical' | 'horizontal'>('vertical');

  readonly openReportModal = output<void>();
  readonly openFlawModal = output<void>();
  readonly toggleLayout = output<void>();
  readonly openRolesModal = output<void>();

  onRoleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    if (target && target.value) {
      this.riskService.switchProfile(target.value);
    }
  }
}
