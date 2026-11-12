import { ChangeDetectionStrategy, Component, inject, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { apiFetch } from '../services/api-fetch';
import { RiskDataService } from '../services/risk-data.service';
import { OrganizationalRole, UserPermissions, UserProfile } from '../models/risk.model';

@Component({
  selector: 'app-roles-management-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
        
        <!-- Header -->
        <div class="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0">
              <mat-icon class="text-xl">manage_accounts</mat-icon>
            </div>
            <div>
              <h2 class="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Estructura Organizacional, Puestos y Matriz de Permisos (RBAC)
              </h2>
              <p class="text-xs text-slate-500">
                Define los puestos reales de tu organización, asigna colaboradores y calibra permisos normativos
              </p>
            </div>
          </div>
          
          <button
            type="button"
            (click)="closeModal.emit()"
            class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <div class="p-6 space-y-6">

          <!-- Action Toast Feedback -->
          @if (actionToast(); as toast) {
            <div class="p-3 bg-slate-900 text-white rounded-xl text-xs flex items-center justify-between gap-3 shadow-md animate-in fade-in duration-150">
              <div class="flex items-center gap-2">
                <mat-icon class="text-emerald-400 text-base">check_circle</mat-icon>
                <span>{{ toast }}</span>
              </div>
              <button type="button" (click)="actionToast.set(null)" class="text-slate-400 hover:text-white p-1 cursor-pointer">
                <mat-icon class="text-xs">close</mat-icon>
              </button>
            </div>
          }

          <!-- Current Active Session Card & Quick Switcher -->
          <div class="p-4 rounded-xl bg-slate-950 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md">
                {{ getUserInitials(riskService.currentProfile().name) }}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold text-white">{{ riskService.currentProfile().name }}</span>
                  <span class="text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full">
                    Sesión Activa
                  </span>
                </div>
                <div class="text-xs text-slate-400">
                  <span>{{ riskService.currentProfile().role }}</span>
                  <span class="mx-1.5">•</span>
                  <span>{{ riskService.currentProfile().department }}</span>
                </div>
              </div>
            </div>

            <!-- Permission Chips for active profile -->
            <div class="flex flex-wrap gap-1.5 max-w-md">
              @for (perm of activePermissionLabels(); track perm.key) {
                <span
                  [class]="perm.granted ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' : 'bg-slate-900 text-slate-500 border-slate-800 line-through'"
                  class="text-[10px] font-mono px-2 py-0.5 rounded border"
                >
                  {{ perm.label }}
                </span>
              }
            </div>
          </div>

          <!-- Section Switcher Tabs -->
          <div class="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              (click)="activeTab.set('roles')"
              [class]="activeTab() === 'roles'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'"
              class="px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <mat-icon class="text-sm">badge</mat-icon>
              <span>Catálogo de Puestos & Permisos ({{ riskService.organizationalRoles().length }})</span>
            </button>

            <button
              type="button"
              (click)="activeTab.set('users')"
              [class]="activeTab() === 'users'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'"
              class="px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <mat-icon class="text-sm">group</mat-icon>
              <span>Colaboradores & Usuarios ({{ riskService.userProfiles().length }})</span>
            </button>

            <button
              type="button"
              (click)="activeTab.set('new-role')"
              [class]="activeTab() === 'new-role'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'"
              class="px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer ml-auto"
            >
              <mat-icon class="text-sm text-emerald-600">add_moderator</mat-icon>
              <span>+ Definir Nuevo Puesto</span>
            </button>
          </div>

          <!-- TAB 1: PUESTOS & MATRIZ DE PERMISOS -->
          @if (!canManage()) {
            <div class="mb-3 p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-700 flex items-start gap-2">
              <mat-icon class="text-sm text-slate-500 shrink-0">lock</mat-icon>
              <span>Vista de consulta: tu cargo ({{ riskService.currentProfile().role }}) no tiene el permiso "Administrar puestos", así que no puede cambiar permisos, puestos ni usuarios.</span>
            </div>
          }
          @if (activeTab() === 'roles') {
            <div class="space-y-4">
              
              <div class="overflow-x-auto border border-slate-200 rounded-xl">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th class="py-3 px-4">Puesto Organizacional</th>
                      <th class="py-3 px-3">Departamento</th>
                      <th class="py-3 px-3 text-center" title="Crear y editar riesgos en matriz 4×4">Riesgos</th>
                      <th class="py-3 px-3 text-center" title="Evaluar controles y subir evidencias">Controles</th>
                      <th class="py-3 px-3 text-center" title="Registrar auditorías periódicas y hallazgos">Auditorías</th>
                      <th class="py-3 px-3 text-center" title="Reportar incidentes y pérdidas reales">Incidencias</th>
                      <th class="py-3 px-3 text-center" title="Transformar incidencias en riesgos formales">A Riesgo</th>
                      <th class="py-3 px-3 text-center" title="Investigar y resolver alertas">Alertas</th>
                      <th class="py-3 px-3 text-center" title="Configurar umbrales de KRIs por industria">KRIs</th>
                      <th class="py-3 px-3 text-center" title="Administrar puestos y permisos">Roles</th>
                      <th class="py-3 px-3 text-center" title="Exportar reportes PDF y Excel">Reportes</th>
                      <th class="py-3 px-3 text-center" title="Registrar envíos a CMF/ANCI y configurar plazos regulatorios">CMF/ANCI</th>
                      <th class="py-3 px-3 text-center" title="Registrar y evaluar proveedores">Proveed.</th>
                      <th class="py-3 px-3 text-center" title="Mantener BIA, planes y pruebas de continuidad">BCP</th>
                      <th class="py-3 px-3 text-center" title="Activos de información, vulnerabilidades y autoevaluación de seguridad">Seguridad</th>
                      <th class="py-3 px-3 text-center" title="Áreas, procesos y parámetros generales">Mantened.</th>
                      <th class="py-3 px-3 text-center" title="Biblioteca normativa y evaluación del cumplimiento">Cumplim.</th>
                      <th class="py-3 px-3 text-center" title="Asignar, reprogramar y verificar el cierre de planes de acción">Planes</th>
                      <th class="py-3 px-3 text-center" title="Crear, asignar y revisar campañas de autoevaluación">Autoev.</th>
                      <th class="py-3 px-3 text-center" title="Crear documentos, cargar versiones y enviarlas a aprobación">Docs.</th>
                      <th class="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200 font-sans">
                    @for (role of riskService.organizationalRoles(); track role.id) {
                      <tr class="hover:bg-slate-50/70 transition-colors">
                        
                        <td class="py-3 px-4">
                          <div class="font-bold text-slate-900">{{ role.title }}</div>
                          <div class="text-[11px] text-slate-500 max-w-xs line-clamp-1">{{ role.description }}</div>
                        </td>

                        <td class="py-3 px-3 whitespace-nowrap text-slate-600">
                          <span class="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {{ role.department }}
                          </span>
                        </td>

                        <!-- Permisos Toggles (Click to toggle live!) -->
                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canEditRisks')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canEditRisks ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de edición de riesgos"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canEditRisks ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canEvaluateControls')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canEvaluateControls ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de evaluación de controles"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canEvaluateControls ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canExecuteAudits')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canExecuteAudits ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de ejecución de auditorías"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canExecuteAudits ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canReportFlaws')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canReportFlaws ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de reporte de incidentes"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canReportFlaws ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canConvertFlaws')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canConvertFlaws ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de conversión a riesgo"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canConvertFlaws ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canAcknowledgeAlerts')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canAcknowledgeAlerts ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de resolución de alertas"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canAcknowledgeAlerts ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canConfigureKRIs')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canConfigureKRIs ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de configuración de KRIs"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canConfigureKRIs ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageRoles')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageRoles ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de administración de puestos y roles"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageRoles ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canExportReports')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canExportReports ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de exportación de informes"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canExportReports ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageRegulatoryReports')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageRegulatoryReports ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de reporte regulatorio CMF/ANCI"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageRegulatoryReports ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageProviders')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageProviders ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de gestión de proveedores"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageProviders ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageContinuity')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageContinuity ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de continuidad del negocio"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageContinuity ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageInfoSecurity')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageInfoSecurity ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de seguridad de la información"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageInfoSecurity ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageCatalogs')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageCatalogs ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de administrar mantenedores"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageCatalogs ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageCompliance')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageCompliance ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de cumplimiento normativo"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageCompliance ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageActionPlans')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageActionPlans ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de planes de acción"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageActionPlans ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageSurveys')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageSurveys ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de autoevaluaciones"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageSurveys ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <td class="py-3 px-3 text-center">
                          <button
                            type="button"
                            [class.perm-locked]="!canManage()" (click)="togglePermission(role, 'canManageDocuments')"
                            class="w-6 h-6 rounded flex items-center justify-center mx-auto transition-colors cursor-pointer"
                            [class]="role.permissions.canManageDocuments ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'"
                            title="Alternar permiso de gestión documental"
                          >
                            <mat-icon class="text-sm">{{ role.permissions.canManageDocuments ? 'check' : 'remove' }}</mat-icon>
                          </button>
                        </td>

                        <!-- Switch to this role action -->
                        <td class="py-3 px-4 text-right whitespace-nowrap">
                          <div class="inline-flex items-center gap-1.5 justify-end">

                            @if (!role.isSystemRole) {
                              <button
                                type="button"
                                [class.perm-hidden]="!canManage()" (click)="onDeleteRole(role.id)"
                                class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Eliminar puesto personalizado"
                              >
                                <mat-icon class="text-sm">delete_outline</mat-icon>
                              </button>
                            }
                          </div>
                        </td>

                      </tr>
                    }
                  </tbody>
                </table>
              </div>

            </div>
          }

          <!-- TAB 2: USUARIOS & COLABORADORES -->
          @if (activeTab() === 'users') {
            <div class="space-y-4">
              
              <div class="flex items-center justify-between">
                <p class="text-xs text-slate-500">
                  Colaboradores habilitados para acceder a la plataforma y puestos asignados
                </p>
                <button
                  type="button"
                  (click)="showAddUserForm.set(!showAddUserForm())"
                  class="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <mat-icon class="text-sm">{{ showAddUserForm() ? 'remove' : 'add' }}</mat-icon>
                  <span>{{ showAddUserForm() ? 'Cancelar Alta' : 'Agregar Colaborador' }}</span>
                </button>
              </div>

              <!-- Add User Inline Form -->
              @if (showAddUserForm()) {
                <form [formGroup]="userForm" (ngSubmit)="onCreateUser()" class="p-4 bg-slate-50 rounded-xl border border-slate-300 space-y-3 animate-fadeIn">
                  <h4 class="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1">
                    <mat-icon class="text-sm text-emerald-600">person_add</mat-icon>
                    <span>Alta de Nuevo Colaborador</span>
                  </h4>

                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label for="new-user-name" class="block font-semibold text-slate-700 mb-1">Nombre Completo</label>
                      <input
                        id="new-user-name"
                        formControlName="name"
                        type="text"
                        placeholder="Ej. Ing. Mariana Silva"
                        class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label for="new-user-email" class="block font-semibold text-slate-700 mb-1">Correo Institucional</label>
                      <input
                        id="new-user-email"
                        formControlName="email"
                        type="email"
                        placeholder="mariana.silva@organizacion.com"
                        class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div>
                      <label for="new-user-role" class="block font-semibold text-slate-700 mb-1">Puesto Organizacional Asignado</label>
                      <select
                        id="new-user-role"
                        formControlName="roleId"
                        class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                      >
                        @for (r of riskService.organizationalRoles(); track r.id) {
                          <option [value]="r.id">{{ r.title }} ({{ r.department }})</option>
                        }
                      </select>
                    </div>
                  </div>

                  <div class="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      (click)="showAddUserForm.set(false)"
                      class="px-3 py-1.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-lg"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit" [class.perm-hidden]="!canManage()"
                      [disabled]="userForm.invalid"
                      class="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50"
                    >
                      Dar de Alta Colaborador
                    </button>
                  </div>
                </form>
              }

              <!-- User Cards Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                @for (usr of riskService.userProfiles(); track usr.id) {
                  <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between space-y-3">
                    
                    <div class="flex items-start gap-3">
                      <div class="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {{ getUserInitials(usr.name) }}
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <h4 class="font-bold text-xs text-slate-900 truncate">{{ usr.name }}</h4>
                          @if (riskService.currentProfile().id === usr.id) {
                            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Usuario activo en esta sesión"></span>
                          }
                        </div>
                        <p class="text-[11px] text-slate-500 truncate">{{ usr.email }}</p>
                        <div class="mt-1 flex flex-wrap items-center gap-1">
                          @if (totp().enabled && canManage()) {
                            @if (totp().userIds.includes(usr.id)) {
                              <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Ingresa con el código de su aplicación autenticadora">Autenticador activo</span>
                              <button type="button" (click)="enrollTotp(usr)" class="text-[10px] text-emerald-700 hover:underline cursor-pointer" title="Nuevo QR: el registro anterior deja de servir (celular perdido o cambiado)">Restablecer</button>
                              <button type="button" (click)="removeTotp(usr)" class="text-[10px] text-slate-500 hover:underline cursor-pointer" title="Vuelve al código por correo">Quitar</button>
                            } @else {
                              <button type="button" (click)="enrollTotp(usr)" class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white text-emerald-700 border border-emerald-300 hover:bg-emerald-50 cursor-pointer" title="Mostrar el QR para Google Authenticator">Activar autenticador</button>
                            }
                          }
                          @if (usr.googleLinked) {
                            <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200" title="Ingresa con su cuenta de Google">Google vinculado</span>
                            @if (canManage()) {
                              <button type="button" (click)="unlinkGoogle(usr)" class="text-[10px] text-sky-700 hover:underline cursor-pointer" title="La próxima vez que ingrese con Google se vinculará la cuenta que use">Desvincular</button>
                            }
                          }
                        </div>
                        <div class="mt-1">
                          <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {{ usr.role }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div class="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span class="text-[11px] text-slate-400 truncate max-w-[140px]">{{ usr.department }}</span>

                      <div class="flex items-center gap-1.5">
                        <button
                          type="button"
                          (click)="promptDeleteUser(usr.id)"
                          [disabled]="riskService.userProfiles().length <= 1 || riskService.currentProfile().id === usr.id"
                          class="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          [title]="riskService.userProfiles().length <= 1 ? 'No se puede eliminar la única cuenta del sistema' : 'Eliminar cuenta de colaborador'"
                        >
                          <mat-icon class="text-base leading-none">delete_outline</mat-icon>
                        </button>

                        @if (riskService.currentProfile().id === usr.id) {
                          <span class="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-300">Tu sesión</span>
                        } @else {
                          <button
                            type="button"
                            [class.perm-hidden]="!canManage()" (click)="toggleUserActive(usr)"
                            class="px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors cursor-pointer"
                            [class]="usr.active === false
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'"
                            [title]="usr.active === false ? 'Permitir nuevamente el acceso de este usuario' : 'Impedir el acceso de este usuario (cierra sus sesiones)'"
                          >
                            {{ usr.active === false ? 'Inactivo · Reactivar' : 'Desactivar' }}
                          </button>
                        }
                      </div>
                    </div>

                    @if (userToDeleteId() === usr.id) {
                      <div class="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-2">
                        <div class="flex items-center gap-1.5 text-rose-900 font-bold text-[11px]">
                          <mat-icon class="text-xs text-rose-600">warning</mat-icon>
                          <span>¿Eliminar cuenta de {{ usr.name }}?</span>
                        </div>
                        @if (riskService.currentProfile().id === usr.id) {
                          <p class="text-[10px] text-rose-700 leading-tight">
                            Esta cuenta está activa actualmente. Se migrará la sesión al siguiente usuario disponible.
                          </p>
                        } @else {
                          <p class="text-[10px] text-slate-600 leading-tight">
                            Esta acción es irreversible y quedará registrada en el ledger de auditoría SHA-256.
                          </p>
                        }
                        <div class="flex items-center justify-end gap-1.5 pt-1">
                          <button
                            type="button"
                            (click)="cancelDeleteUser()"
                            class="px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded hover:bg-slate-50 cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            (click)="confirmDeleteUser(usr.id)"
                            class="px-2.5 py-0.5 text-[10px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded cursor-pointer"
                          >
                            Eliminar Cuenta
                          </button>
                        </div>
                      </div>
                    }

                  </div>
                }
              </div>

            </div>
          }

          <!-- TAB 3: CREATE NEW ORGANIZATIONAL POSITION (PUESTO) -->
          @if (activeTab() === 'new-role') {
            <form [formGroup]="roleForm" (ngSubmit)="onCreateRole()" class="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <mat-icon class="text-sm text-emerald-600">add_moderator</mat-icon>
                <span>Definir Puesto Organizacional & Atribuciones de Control</span>
              </h3>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label for="role-title" class="block font-semibold text-slate-700 mb-1">Título del Puesto</label>
                  <input
                    id="role-title"
                    formControlName="title"
                    type="text"
                    placeholder="Ej. Oficial de Seguridad de la Información (CISO)"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label for="role-dept" class="block font-semibold text-slate-700 mb-1">Departamento / Área de la Organización</label>
                  <select
                    id="role-dept"
                    formControlName="department"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="" disabled>Selecciona un área</option>
                    @for (a of riskService.catalog.areaOptions(roleForm.value.department ?? undefined); track a) {
                      <option [value]="a">{{ a }}</option>
                    }
                  </select>
                  <span class="block text-[10px] text-slate-500 mt-1">Las áreas se administran en Mantenedores.</span>
                </div>

                <div class="sm:col-span-2">
                  <label for="role-desc" class="block font-semibold text-slate-700 mb-1">Descripción de Responsabilidades</label>
                  <textarea
                    id="role-desc"
                    formControlName="description"
                    rows="2"
                    placeholder="Describe las funciones normativas y alcance de este puesto en el marco de riesgo operacional..."
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                  ></textarea>
                </div>
              </div>

              <!-- Permission Checkboxes Grid -->
              <div class="pt-3 border-t border-slate-200">
                <span class="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Matriz de Permisos Específicos para este Puesto
                </span>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canEditRisks" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Gestión de Riesgos 4×4</span>
                      <span class="text-[11px] text-slate-500">Crear, actualizar y ponderar riesgos en la matriz</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canEvaluateControls" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Pruebas de Control & Evidencia</span>
                      <span class="text-[11px] text-slate-500">Evaluar diseño/operación y adjuntar evidencias</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canExecuteAudits" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Auditorías Periódicas</span>
                      <span class="text-[11px] text-slate-500">Registrar programas y hallazgos de auditoría</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canReportFlaws" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Reporte de Incidentes y Pérdidas</span>
                      <span class="text-[11px] text-slate-500">Registrar fallas operacionales y pérdidas financieras</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canConvertFlaws" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Conversión Formal a Riesgo</span>
                      <span class="text-[11px] text-slate-500">Transformar eventos de pérdida en riesgos formales</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canAcknowledgeAlerts" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Gestión de Alertas KRI</span>
                      <span class="text-[11px] text-slate-500">Investigar y cerrar desviaciones en tiempo real</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canConfigureKRIs" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Configurar Umbrales de KRIs</span>
                      <span class="text-[11px] text-slate-500">Ajustar límites de advertencia y crítico por industria</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageRoles" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Administrar Puestos y Permisos</span>
                      <span class="text-[11px] text-slate-500">Alta y modificación de roles organizacionales</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canExportReports" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Descargar Reportes & PDF</span>
                      <span class="text-[11px] text-slate-500">Generar informes membretados ejecutivos</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageRegulatoryReports" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Reporte Regulatorio CMF / ANCI</span>
                      <span class="text-[11px] text-slate-500">Registrar envíos al regulador y configurar plazos</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageProviders" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Gestionar Proveedores</span>
                      <span class="text-[11px] text-slate-500">Registrar, evaluar y actualizar servicios externalizados</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageContinuity" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Continuidad del Negocio</span>
                      <span class="text-[11px] text-slate-500">Mantener BIA, planes y registrar pruebas</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageInfoSecurity" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Seguridad de la Información</span>
                      <span class="text-[11px] text-slate-500">Activos, vulnerabilidades y autoevaluación</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageCatalogs" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Administrar Mantenedores</span>
                      <span class="text-[11px] text-slate-500">Áreas, procesos y parámetros generales</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageCompliance" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Cumplimiento Normativo</span>
                      <span class="text-[11px] text-slate-500">Biblioteca de normas, requisitos y su evaluación</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageActionPlans" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Administrar Planes de Acción</span>
                      <span class="text-[11px] text-slate-500">Asignar, reprogramar, cancelar y verificar cierres</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageSurveys" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Administrar Autoevaluaciones</span>
                      <span class="text-[11px] text-slate-500">Campañas RCSA, BIA y de cumplimiento; revisión de respuestas</span>
                    </div>
                  </label>

                  <label class="p-2.5 rounded-lg bg-white border border-slate-200 flex items-start gap-2 cursor-pointer hover:border-slate-300">
                    <input type="checkbox" formControlName="canManageDocuments" class="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500" />
                    <div>
                      <span class="font-bold text-slate-900 block">Administrar Gestión Documental</span>
                      <span class="text-[11px] text-slate-500">Políticas y procedimientos: versiones, aprobación, vigencia y difusión</span>
                    </div>
                  </label>
                </div>
              </div>

              <div class="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  (click)="activeTab.set('roles')"
                  class="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit" [class.perm-hidden]="!canManage()"
                  [disabled]="roleForm.invalid"
                  class="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50"
                >
                  Crear Puesto & Registrar en Estructura
                </button>
              </div>
            </form>
          }

        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5 text-slate-500">
            <mat-icon class="text-sm text-indigo-600">security</mat-icon>
            <span>Matriz de Control de Acceso Basada en Roles (RBAC) activa</span>
          </div>

          <button
            type="button"
            (click)="closeModal.emit()"
            class="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>

    @if (totpQr(); as q) {
      <div class="fixed inset-0 z-[70] bg-slate-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="totp-title">
        <div class="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 text-xs text-slate-700">
          <div>
            <h3 id="totp-title" class="text-sm font-bold text-slate-900">Autenticador de {{ q.name }}</h3>
            <p class="text-[11px] text-slate-500">{{ q.email }}</p>
          </div>
          <img [src]="q.qr" width="240" height="240" alt="Código QR para la aplicación autenticadora" class="mx-auto border border-slate-200 rounded-lg" />
          <ol class="list-decimal pl-4 space-y-1">
            <li>Abra Google Authenticator (o Microsoft Authenticator) en el celular de {{ q.name }}.</li>
            <li>Toque <strong>+</strong> → <strong>Escanear un código QR</strong> y apunte a este QR.</li>
            <li>Para entrar: su correo y luego el número de 6 dígitos de "RiskGuard Pro".</li>
          </ol>
          <details class="text-[11px]">
            <summary class="cursor-pointer text-slate-500">¿No puede escanear? Clave para ingresar a mano</summary>
            <p class="mt-1">Cuenta: {{ q.email }} · Clave: <code class="font-mono text-slate-900 break-all select-all">{{ q.secret }}</code> · Basada en el tiempo.</p>
          </details>
          @if (q.replaced) { <p class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">El registro anterior dejó de servir.</p> }
          <p class="text-[11px] text-slate-500">Este QR es una llave de acceso: muéstrelo solo a la persona y no lo guarde. Al cerrar no se vuelve a mostrar.</p>
          <div class="flex justify-end">
            <button type="button" (click)="totpQr.set(null)" class="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-700 cursor-pointer">Listo, ya lo escaneó</button>
          </div>
        </div>
      </div>
    }
  `
})
export class RolesManagementModal {
  readonly riskService = inject(RiskDataService);
  private fb = inject(FormBuilder);

  readonly closeModal = output<void>();

  readonly activeTab = signal<'roles' | 'users' | 'new-role'>('roles');
  readonly showAddUserForm = signal<boolean>(false);
  readonly userToDeleteId = signal<string | null>(null);
  readonly actionToast = signal<string | null>(null);

  readonly roleForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    department: ['', [Validators.required]],
    description: ['', [Validators.required]],
    badge: ['Puesto Especializado'],
    canEditRisks: [true],
    canEvaluateControls: [true],
    canExecuteAudits: [false],
    canReportFlaws: [true],
    canConvertFlaws: [false],
    canAcknowledgeAlerts: [true],
    canConfigureKRIs: [false],
    canManageRoles: [false],
    canExportReports: [true],
    canManageRegulatoryReports: [false],
    canManageProviders: [false],
    canManageContinuity: [false],
    canManageInfoSecurity: [false],
    canManageCatalogs: [false],
    canManageCompliance: [false],
    canManageActionPlans: [false],
    canManageSurveys: [false],
    canManageDocuments: [false]
  });

  readonly userForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    roleId: ['', [Validators.required]]
  });

  constructor() {
    const roles = this.riskService.organizationalRoles();
    if (roles.length > 0) {
      this.userForm.patchValue({ roleId: roles[0].id });
    }
    void this.loadTotp();
  }

  activePermissionLabels() {
    const p = this.riskService.currentProfile().permissions;
    return [
      { key: 'risks', label: 'Riesgos 4×4', granted: p.canEditRisks },
      { key: 'controls', label: 'Controles', granted: p.canEvaluateControls },
      { key: 'audits', label: 'Auditorías', granted: p.canExecuteAudits },
      { key: 'flaws', label: 'Incidencias', granted: p.canReportFlaws },
      { key: 'convert', label: 'Conversión', granted: p.canConvertFlaws },
      { key: 'alerts', label: 'Alertas', granted: p.canAcknowledgeAlerts },
      { key: 'kris', label: 'KRIs', granted: p.canConfigureKRIs },
      { key: 'roles', label: 'Puestos', granted: p.canManageRoles },
      { key: 'reports', label: 'Reportes PDF', granted: p.canExportReports },
      { key: 'regulatory', label: 'CMF/ANCI', granted: !!p.canManageRegulatoryReports },
      { key: 'providers', label: 'Proveedores', granted: !!p.canManageProviders },
      { key: 'continuity', label: 'Continuidad', granted: !!p.canManageContinuity },
      { key: 'infosec', label: 'Seguridad', granted: !!p.canManageInfoSecurity },
      { key: 'catalogs', label: 'Mantenedores', granted: !!p.canManageCatalogs },
      { key: 'compliance', label: 'Cumplimiento', granted: !!p.canManageCompliance },
      { key: 'plans', label: 'Planes', granted: !!p.canManageActionPlans },
      { key: 'surveys', label: 'Autoevaluaciones', granted: !!p.canManageSurveys },
      { key: 'documents', label: 'Documentos', granted: !!p.canManageDocuments }
    ];
  }

  /** Aplicación autenticadora: si está activa en el servidor y quiénes la tienen registrada. */
  readonly totp = signal<{ enabled: boolean; userIds: string[] }>({ enabled: false, userIds: [] });
  readonly totpQr = signal<{ name: string; email: string; qr: string; secret: string; replaced: boolean } | null>(null);

  private async loadTotp() {
    if (!this.canManage()) return;
    const resp = await apiFetch('/api/admin/totp').catch(() => null);
    if (resp?.ok) this.totp.set(await resp.json());
  }

  async enrollTotp(usr: UserProfile) {
    if (!this.canManage()) return;
    if (this.totp().userIds.includes(usr.id) && !confirm(`¿Restablecer el autenticador de ${usr.name}? El registro actual de su celular dejará de servir.`)) return;
    try {
      const resp = await apiFetch(`/api/admin/users/${encodeURIComponent(usr.id)}/totp`, { method: 'POST' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      this.totp.update(t => ({ ...t, userIds: [...new Set([...t.userIds, usr.id])] }));
      this.totpQr.set({ name: usr.name, email: usr.email, qr: data.qr, secret: data.secret, replaced: !!data.replaced });
    } catch (e) {
      this.riskService.permissionNotice.set({ message: (e as Error).message, at: Date.now() });
    }
  }

  async removeTotp(usr: UserProfile) {
    if (!this.canManage() || !confirm(`¿Quitar el autenticador de ${usr.name}? Volverá a ingresar con el código por correo, si el servidor lo envía.`)) return;
    try {
      const resp = await apiFetch(`/api/admin/users/${encodeURIComponent(usr.id)}/totp`, { method: 'DELETE' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      this.totp.update(t => ({ ...t, userIds: t.userIds.filter(id => id !== usr.id) }));
      this.riskService.permissionNotice.set({ message: `Autenticador de ${usr.name} quitado.`, at: Date.now() });
    } catch (e) {
      this.riskService.permissionNotice.set({ message: (e as Error).message, at: Date.now() });
    }
  }

  /** Desvincula la cuenta de Google (cambio de cuenta o correo reasignado). */
  async unlinkGoogle(usr: UserProfile) {
    if (!this.canManage()) return;
    try {
      const resp = await apiFetch(`/api/admin/users/${encodeURIComponent(usr.id)}/google-unlink`, { method: 'POST' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `Error ${resp.status}`);
      this.riskService.userProfiles.update(l => l.map(u => (u.id === usr.id ? { ...u, googleLinked: false } : u)));
      this.riskService.permissionNotice.set({ message: `Cuenta de Google de ${usr.name} desvinculada.`, at: Date.now() });
    } catch (e) {
      this.riskService.permissionNotice.set({ message: (e as Error).message, at: Date.now() });
    }
  }

  getUserInitials(name: string): string {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  readonly canManage = computed(() => this.riskService.hasPermission('canManageRoles'));

  togglePermission(role: OrganizationalRole, permKey: keyof UserPermissions) {
    if (!this.riskService.requirePermission(['canManageRoles'], 'administrar puestos y permisos')) return;
    const currentVal = role.permissions[permKey];
    const newPermissions = {
      ...role.permissions,
      [permKey]: !currentVal
    };

    this.riskService.updateOrganizationalRole(role.id, {
      permissions: newPermissions
    });
  }

  toggleUserActive(usr: UserProfile) {
    if (!this.riskService.requirePermission(['canManageRoles'], 'administrar puestos y permisos')) return;
    this.riskService.updateUserProfile(usr.id, { active: usr.active === false });
  }


  onCreateRole() {
    if (!this.riskService.requirePermission(['canManageRoles'], 'administrar puestos y permisos')) return;
    if (this.roleForm.invalid) return;
    const v = this.roleForm.value;

    this.riskService.addOrganizationalRole({
      title: v.title || 'Nuevo Puesto',
      department: v.department || '',
      description: v.description || '',
      badge: v.badge || 'Puesto Personalizado',
      permissions: {
        canEditRisks: !!v.canEditRisks,
        canEvaluateControls: !!v.canEvaluateControls,
        canExecuteAudits: !!v.canExecuteAudits,
        canReportFlaws: !!v.canReportFlaws,
        canConvertFlaws: !!v.canConvertFlaws,
        canAcknowledgeAlerts: !!v.canAcknowledgeAlerts,
        canConfigureKRIs: !!v.canConfigureKRIs,
        canManageRoles: !!v.canManageRoles,
        canExportReports: !!v.canExportReports,
        canManageRegulatoryReports: !!v.canManageRegulatoryReports,
        canManageProviders: !!v.canManageProviders,
        canManageContinuity: !!v.canManageContinuity,
        canManageInfoSecurity: !!v.canManageInfoSecurity,
        canManageCatalogs: !!v.canManageCatalogs,
        canManageCompliance: !!v.canManageCompliance,
        canManageActionPlans: !!v.canManageActionPlans,
        canManageSurveys: !!v.canManageSurveys,
        canManageDocuments: !!v.canManageDocuments
      }
    });

    this.roleForm.reset({
      title: '',
      department: '',
      description: '',
      badge: 'Puesto Especializado',
      canEditRisks: true,
      canEvaluateControls: true,
      canExecuteAudits: false,
      canReportFlaws: true,
      canConvertFlaws: false,
      canAcknowledgeAlerts: true,
      canConfigureKRIs: false,
      canManageRoles: false,
      canExportReports: true,
      canManageRegulatoryReports: false,
      canManageProviders: false,
      canManageContinuity: false,
      canManageInfoSecurity: false,
      canManageCatalogs: false,
      canManageCompliance: false,
      canManageActionPlans: false,
      canManageSurveys: false,
      canManageDocuments: false
    });

    this.activeTab.set('roles');
  }

  onCreateUser() {
    if (!this.riskService.requirePermission(['canManageRoles'], 'administrar puestos y permisos')) return;
    if (this.userForm.invalid) return;
    const v = this.userForm.value;
    const selectedRole = this.riskService.organizationalRoles().find(r => r.id === v.roleId);

    this.riskService.addUserProfile({
      name: v.name || '',
      email: v.email || '',
      roleId: v.roleId || undefined,
      role: selectedRole ? selectedRole.title : 'Colaborador',
      department: selectedRole ? selectedRole.department : '',
      badge: selectedRole ? selectedRole.badge : 'Colaborador',
      permissions: selectedRole ? selectedRole.permissions : undefined
    }).then(created => {
      this.userForm.reset();
      this.showAddUserForm.set(false);
      this.showToast(`${created.name} fue agregada como ${created.role}. Ingresa con ${created.email}.`);
    }).catch((err: Error) => this.showToast(err.message));
  }

  promptDeleteUser(userId: string) {
    this.userToDeleteId.set(userId);
  }

  cancelDeleteUser() {
    this.userToDeleteId.set(null);
  }

  async confirmDeleteUser(userId: string) {
    try {
      const user = this.riskService.userProfiles().find(u => u.id === userId);
      const name = user ? user.name : 'Colaborador';
      await this.riskService.deleteUserProfile(userId);
      this.userToDeleteId.set(null);
      this.showToast(`Cuenta de "${name}" eliminada correctamente del registro.`);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Error al eliminar usuario';
      this.showToast(msg);
    }
  }

  async onDeleteRole(roleId: string) {
    if (!this.riskService.requirePermission(['canManageRoles'], 'administrar puestos y permisos')) return;
    try {
      const role = this.riskService.organizationalRoles().find(r => r.id === roleId);
      const title = role ? role.title : 'Puesto';
      await this.riskService.deleteOrganizationalRole(roleId);
      this.showToast(`Puesto personalizado "${title}" eliminado de la organización.`);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Error al eliminar puesto';
      this.showToast(msg);
    }
  }

  showToast(msg: string) {
    this.actionToast.set(msg);
    setTimeout(() => {
      if (this.actionToast() === msg) {
        this.actionToast.set(null);
      }
    }, 4500);
  }
}
