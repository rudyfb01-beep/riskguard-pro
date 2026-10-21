import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { IndustryType, KriDefinition, BaselCategory } from '../models/risk.model';

@Component({
  selector: 'app-kri-threshold-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200">
        
        <!-- Header -->
        <div class="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center shrink-0">
              <mat-icon class="text-xl">tune</mat-icon>
            </div>
            <div>
              <h2 class="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Configuración de Umbrales & KRIs por Industria
              </h2>
              <p class="text-xs text-slate-500">
                Ajuste de límites de tolerancia, métricas clave y automatización de alertas operacionales
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

          <!-- Industry Profile Selector Selector -->
          <div class="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span class="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <mat-icon class="text-sm text-indigo-600">domain</mat-icon>
                  <span>Perfil de Industria Seleccionado</span>
                </span>
                <p class="text-xs text-slate-500 mt-0.5">
                  Carga preconfiguraciones normativas y tolerancias operacionales calibradas para tu sector
                </p>
              </div>
              <span class="text-xs font-mono px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg font-semibold border border-indigo-200 shrink-0 self-start sm:self-auto">
                {{ riskService.currentIndustry() }}
              </span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-1">
              @for (ind of industryList; track ind.name) {
                <button
                  type="button"
                  (click)="onSelectIndustry(ind.name)"
                  [class]="riskService.currentIndustry() === ind.name
                    ? 'bg-slate-900 text-white font-semibold shadow-sm'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'"
                  class="p-2.5 rounded-xl text-left transition-all duration-150 flex flex-col justify-between gap-1.5 cursor-pointer"
                >
                  <mat-icon class="text-lg" [class.text-indigo-400]="riskService.currentIndustry() === ind.name" [class.text-indigo-600]="riskService.currentIndustry() !== ind.name">
                    {{ ind.icon }}
                  </mat-icon>
                  <span class="text-xs font-medium leading-tight">{{ ind.name }}</span>
                </button>
              }
            </div>
          </div>

          <!-- Section Tabs: View & Edit Thresholds vs Add New KRI -->
          <div class="flex items-center justify-between border-b border-slate-200 pb-2">
            <div class="flex items-center gap-2">
              <button
                type="button"
                (click)="activeSection.set('list')"
                [class]="activeSection() === 'list'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'"
                class="px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <mat-icon class="text-sm">format_list_bulleted</mat-icon>
                <span>Catálogo de Umbrales Activos ({{ riskService.kriDefinitions().length }})</span>
              </button>

              <button
                type="button"
                (click)="activeSection.set('new')"
                [class]="activeSection() === 'new'
                  ? 'bg-slate-900 text-white font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'"
                class="px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <mat-icon class="text-sm text-emerald-600">add_circle</mat-icon>
                <span>Definir Nuevo KRI Personalizado</span>
              </button>
            </div>
          </div>

          <!-- SECTION 1: KRI LIST & INLINE THRESHOLD EDITOR -->
          @if (activeSection() === 'list') {
            <div class="space-y-4">
              
              @for (kri of riskService.kriDefinitions(); track kri.id) {
                <div class="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-slate-300 transition-all space-y-3">
                  
                  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {{ kri.code }}
                      </span>
                      <span class="text-xs font-bold text-slate-900">{{ kri.name }}</span>
                      
                      <!-- Status badge -->
                      <span
                        [class]="kri.status === 'Crítico' ? 'bg-rose-100 text-rose-800 border-rose-200' : kri.status === 'Advertencia' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'"
                        class="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase"
                      >
                        {{ kri.status }}
                      </span>

                      <span class="text-[11px] text-slate-500">
                        · Proceso: <strong>{{ kri.process }}</strong>
                      </span>
                    </div>

                    <div class="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                      <button
                        type="button"
                        (click)="openNotificationSettings.emit(kri)"
                        class="px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        title="Configurar canales de notificación (Email y SMS) para este KRI"
                      >
                        <mat-icon class="text-xs text-amber-700">notifications</mat-icon>
                        <span>Alertas Email/SMS</span>
                      </button>

                      <button
                        type="button"
                        (click)="startSimulateValue(kri)"
                        class="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        title="Inyectar lectura simulada de métrica para verificar disparo de alerta"
                      >
                        <mat-icon class="text-xs text-rose-600">sensors</mat-icon>
                        <span>Simular Lectura</span>
                      </button>

                      <button
                        type="button"
                        (click)="startEditing(kri)"
                        class="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="text-xs">tune</mat-icon>
                        <span>Editar Umbrales</span>
                      </button>
                    </div>
                  </div>

                  <p class="text-xs text-slate-600 leading-relaxed">
                    {{ kri.description }}
                  </p>

                  <!-- Thresholds & Parameters Grid -->
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
                    <div class="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span class="text-[10px] text-slate-500 uppercase font-semibold block">Valor Actual Registrado</span>
                      <span class="text-base font-bold font-mono" [class.text-rose-700]="kri.status === 'Crítico'" [class.text-amber-700]="kri.status === 'Advertencia'">
                        {{ kri.currentValue }} {{ kri.unit }}
                      </span>
                    </div>

                    <div class="p-2 rounded-lg bg-amber-50/50 border border-amber-200">
                      <span class="text-[10px] text-amber-800 uppercase font-semibold block">Umbral de Advertencia</span>
                      <span class="text-base font-bold font-mono text-amber-900">
                        {{ kri.direction === 'superior' ? '>=' : '<=' }} {{ kri.warningThreshold }} {{ kri.unit }}
                      </span>
                    </div>

                    <div class="p-2 rounded-lg bg-rose-50/50 border border-rose-200">
                      <span class="text-[10px] text-rose-800 uppercase font-semibold block">Umbral Crítico (Alerta)</span>
                      <span class="text-base font-bold font-mono text-rose-900">
                        {{ kri.direction === 'superior' ? '>=' : '<=' }} {{ kri.criticalThreshold }} {{ kri.unit }}
                      </span>
                    </div>

                    <div class="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span class="text-[10px] text-slate-500 uppercase font-semibold block">Frecuencia & Disparo</span>
                      <div class="text-[11px] font-semibold text-slate-700 mt-0.5">
                        {{ kri.frequency }}
                      </div>
                      <span class="text-[10px] text-emerald-700 font-medium flex items-center gap-0.5 mt-0.5">
                        <mat-icon class="text-xs">check_circle</mat-icon>
                        <span>Alerta Automática</span>
                      </span>
                    </div>
                  </div>

                  <!-- Inline Edit Drawer if selected -->
                  @if (editingKriId() === kri.id) {
                    <div class="mt-3 p-4 bg-slate-50 rounded-xl border border-indigo-200 space-y-3 animate-fadeIn">
                      <div class="flex items-center justify-between text-xs font-bold text-slate-900 border-b border-slate-200 pb-2">
                        <span class="flex items-center gap-1.5 text-indigo-700">
                          <mat-icon class="text-sm">tune</mat-icon>
                          <span>Calibrar Umbrales para {{ kri.code }}</span>
                        </span>
                        <button type="button" (click)="cancelEditing()" class="text-slate-400 hover:text-slate-600 text-xs">
                          Cancelar
                        </button>
                      </div>

                      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <label [for]="'warning-' + kri.id" class="block text-[11px] font-semibold text-slate-700 mb-1">
                            Umbral Advertencia ({{ kri.unit }})
                          </label>
                          <input
                            [id]="'warning-' + kri.id"
                            type="number"
                            step="any"
                            [value]="editWarningVal"
                            (input)="editWarningVal = +$any($event.target).value"
                            class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>

                        <div>
                          <label [for]="'critical-' + kri.id" class="block text-[11px] font-semibold text-slate-700 mb-1">
                            Umbral Crítico ({{ kri.unit }})
                          </label>
                          <input
                            [id]="'critical-' + kri.id"
                            type="number"
                            step="any"
                            [value]="editCriticalVal"
                            (input)="editCriticalVal = +$any($event.target).value"
                            class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-rose-500"
                          />
                        </div>

                        <div>
                          <label [for]="'direction-' + kri.id" class="block text-[11px] font-semibold text-slate-700 mb-1">
                            Dirección de Desviación
                          </label>
                          <select
                            [id]="'direction-' + kri.id"
                            [value]="editDirection"
                            (change)="editDirection = $any($event.target).value"
                            class="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                          >
                            <option value="superior">Superior (Alerta si Valor >= Umbral)</option>
                            <option value="inferior">Inferior (Alerta si Valor <= Umbral)</option>
                          </select>
                        </div>
                      </div>

                      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          (click)="cancelEditing()"
                          class="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg"
                        >
                          Descartar
                        </button>
                        <button
                          type="button"
                          (click)="saveEditing(kri)"
                          class="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm"
                        >
                          Guardar Umbrales
                        </button>
                      </div>
                    </div>
                  }

                  <!-- Inline Simulate Drawer if selected -->
                  @if (simulatingKriId() === kri.id) {
                    <div class="mt-3 p-4 bg-rose-50/60 rounded-xl border border-rose-200 space-y-3 animate-fadeIn">
                      <div class="flex items-center justify-between text-xs font-bold text-slate-900 border-b border-rose-200 pb-2">
                        <span class="flex items-center gap-1.5 text-rose-800">
                          <mat-icon class="text-sm">sensors</mat-icon>
                          <span>Inyección de Lectura de Sensor: {{ kri.name }}</span>
                        </span>
                        <button type="button" (click)="cancelSimulate()" class="text-slate-400 hover:text-slate-600 text-xs">
                          Cerrar
                        </button>
                      </div>

                      <div class="flex flex-col sm:flex-row items-center gap-3">
                        <div class="flex-1 w-full">
                          <label [for]="'sim-' + kri.id" class="block text-[11px] font-semibold text-slate-700 mb-1">
                            Valor de Prueba ({{ kri.unit }}):
                          </label>
                          <input
                            [id]="'sim-' + kri.id"
                            type="number"
                            step="any"
                            [value]="simValue"
                            (input)="simValue = +$any($event.target).value"
                            class="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-sm focus:ring-1 focus:ring-rose-500"
                          />
                        </div>

                        <div class="flex items-center gap-2 self-end pt-5">
                          <button
                            type="button"
                            (click)="applySimulation(kri)"
                            class="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-sm flex items-center gap-1 cursor-pointer"
                          >
                            <mat-icon class="text-sm">bolt</mat-icon>
                            <span>Evaluar & Disparar</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  }

                </div>
              }

            </div>
          }

          <!-- SECTION 2: CREATE CUSTOM KRI -->
          @if (activeSection() === 'new') {
            <form [formGroup]="kriForm" (ngSubmit)="onCreateKri()" class="space-y-4 bg-slate-50 p-5 rounded-xl border border-slate-200">
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <mat-icon class="text-sm text-emerald-600">add_chart</mat-icon>
                <span>Definir Nuevo KRI Personalizado</span>
              </h3>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label for="new-kri-name" class="block font-semibold text-slate-700 mb-1">Nombre del Indicador (KRI)</label>
                  <input
                    id="new-kri-name"
                    formControlName="name"
                    type="text"
                    placeholder="Ej. Tasa de errores en concilición de cuentas"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label for="new-kri-code" class="block font-semibold text-slate-700 mb-1">Código KRI</label>
                  <input
                    id="new-kri-code"
                    formControlName="code"
                    type="text"
                    placeholder="Ej. KRI-OPS-09"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono uppercase focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div class="sm:col-span-2">
                  <label for="new-kri-desc" class="block font-semibold text-slate-700 mb-1">Descripción y Racional de Tolerancia</label>
                  <textarea
                    id="new-kri-desc"
                    formControlName="description"
                    rows="2"
                    placeholder="Detalla cómo se calcula la métrica y por qué impacta el apetito de riesgo..."
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                  ></textarea>
                </div>

                <div>
                  <label for="new-kri-process" class="block font-semibold text-slate-700 mb-1">Proceso Asignado</label>
                  <select
                    id="new-kri-process"
                    formControlName="process"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  >
                    @for (p of processesList; track p) {
                      <option [value]="p">{{ p }}</option>
                    }
                  </select>
                </div>

                <div>
                  <label for="new-kri-category" class="block font-semibold text-slate-700 mb-1">Categoría Basilea</label>
                  <select
                    id="new-kri-category"
                    formControlName="category"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  >
                    @for (cat of categoriesList; track cat) {
                      <option [value]="cat">{{ cat }}</option>
                    }
                  </select>
                </div>

                <div>
                  <label for="new-kri-unit" class="block font-semibold text-slate-700 mb-1">Unidad de Medida</label>
                  <input
                    id="new-kri-unit"
                    formControlName="unit"
                    type="text"
                    placeholder="%, ms, USD, casos, horas, PPM"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label for="new-kri-direction" class="block font-semibold text-slate-700 mb-1">Dirección de Desviación</label>
                  <select
                    id="new-kri-direction"
                    formControlName="direction"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="superior">Superior (Alerta si Valor >= Umbral)</option>
                    <option value="inferior">Inferior (Alerta si Valor <= Umbral)</option>
                  </select>
                </div>

                <div>
                  <label for="new-kri-warn" class="block font-semibold text-slate-700 mb-1">Umbral de Advertencia</label>
                  <input
                    id="new-kri-warn"
                    formControlName="warningThreshold"
                    type="number"
                    step="any"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label for="new-kri-crit" class="block font-semibold text-slate-700 mb-1">Umbral Crítico (Disparo Alerta)</label>
                  <input
                    id="new-kri-crit"
                    formControlName="criticalThreshold"
                    type="number"
                    step="any"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label for="new-kri-freq" class="block font-semibold text-slate-700 mb-1">Frecuencia de Medición</label>
                  <select
                    id="new-kri-freq"
                    formControlName="frequency"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Continuo (Tiempo Real)">Continuo (Tiempo Real)</option>
                    <option value="Por Minuto">Por Minuto</option>
                    <option value="Horario">Horario</option>
                    <option value="Diario">Diario</option>
                    <option value="Semanal">Semanal</option>
                    <option value="Mensual">Mensual</option>
                  </select>
                </div>

                <div>
                  <label for="new-kri-resp" class="block font-semibold text-slate-700 mb-1">Responsable del Monitoreo</label>
                  <input
                    id="new-kri-resp"
                    formControlName="responsible"
                    type="text"
                    placeholder="Puesto o responsable"
                    class="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div class="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  (click)="activeSection.set('list')"
                  class="px-4 py-2 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  [disabled]="kriForm.invalid"
                  class="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm disabled:opacity-50"
                >
                  Registrar KRI & Activar Monitoreo
                </button>
              </div>
            </form>
          }

        </div>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div class="flex items-center gap-1.5 text-slate-500">
            <mat-icon class="text-sm text-emerald-600">verified</mat-icon>
            <span>Trazabilidad de umbrales auditada en Ledger SHA-256</span>
          </div>

          <button
            type="button"
            (click)="closeModal.emit()"
            class="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-300 transition-colors"
          >
            Finalizar Configuración
          </button>
        </div>

      </div>
    </div>
  `
})
export class KriThresholdModal {
  readonly riskService = inject(RiskDataService);
  private fb = inject(FormBuilder);

  readonly closeModal = output<void>();
  readonly openNotificationSettings = output<KriDefinition>();

  readonly activeSection = signal<'list' | 'new'>('list');

  readonly industryList: { name: IndustryType; icon: string }[] = [
    { name: 'Fintech & Pagos Digitales', icon: 'payments' },
    { name: 'Banca & Servicios Financieros', icon: 'account_balance' },
    { name: 'Salud & Farmacéutica', icon: 'local_hospital' },
    { name: 'Manufactura & Cadena de Suministro', icon: 'precision_manufacturing' },
    { name: 'Retail & Comercio Electrónico', icon: 'shopping_cart' },
  ];

  readonly processesList = [
    'Operaciones de Pago',
    'Tesorería',
    'Ciberseguridad & TI',
    'Infraestructura Cloud',
    'Cumplimiento Legal',
    'Gestión Humana',
    'Producción & Ensamble',
    'Operaciones Clínicas',
    'Cadena de Suministro',
    'Plataforma E-Commerce'
  ];

  readonly categoriesList: BaselCategory[] = [
    'Fallas Tecnológicas',
    'Ejecución y Procesos',
    'Fraude Interno',
    'Fraude Externo',
    'Prácticas Laborales',
    'Daño a Activos Físicos',
    'Cumplimiento Normativo'
  ];

  // Inline Editing
  readonly editingKriId = signal<string | null>(null);
  editWarningVal = 0;
  editCriticalVal = 0;
  editDirection: 'superior' | 'inferior' = 'superior';

  // Inline Simulating
  readonly simulatingKriId = signal<string | null>(null);
  simValue = 0;

  readonly kriForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(4)]],
    code: ['KRI-CUSTOM-01', [Validators.required]],
    description: ['', [Validators.required]],
    process: ['Operaciones de Pago', [Validators.required]],
    category: ['Ejecución y Procesos' as BaselCategory, [Validators.required]],
    unit: ['%', [Validators.required]],
    direction: ['superior' as const, [Validators.required]],
    warningThreshold: [5, [Validators.required]],
    criticalThreshold: [10, [Validators.required]],
    frequency: ['Diario' as const, [Validators.required]],
    responsible: ['Oficial de Riesgo Operacional', [Validators.required]]
  });

  onSelectIndustry(industry: IndustryType) {
    this.riskService.setIndustry(industry);
  }

  startEditing(kri: KriDefinition) {
    this.editingKriId.set(kri.id);
    this.editWarningVal = kri.warningThreshold;
    this.editCriticalVal = kri.criticalThreshold;
    this.editDirection = kri.direction;
    this.simulatingKriId.set(null);
  }

  cancelEditing() {
    this.editingKriId.set(null);
  }

  saveEditing(kri: KriDefinition) {
    this.riskService.updateKriThreshold(kri.id, {
      warningThreshold: this.editWarningVal,
      criticalThreshold: this.editCriticalVal,
      direction: this.editDirection
    });
    this.editingKriId.set(null);
  }

  startSimulateValue(kri: KriDefinition) {
    this.simulatingKriId.set(kri.id);
    this.simValue = kri.currentValue;
    this.editingKriId.set(null);
  }

  cancelSimulate() {
    this.simulatingKriId.set(null);
  }

  applySimulation(kri: KriDefinition) {
    this.riskService.recordKriValue(kri.id, this.simValue);
    this.simulatingKriId.set(null);
  }

  onCreateKri() {
    if (this.kriForm.invalid) return;
    const formVal = this.kriForm.value;

    this.riskService.addCustomKri({
      name: formVal.name || '',
      code: formVal.code || '',
      description: formVal.description || '',
      process: formVal.process || 'Operaciones',
      category: formVal.category as BaselCategory,
      unit: formVal.unit || '%',
      direction: formVal.direction as 'superior' | 'inferior',
      warningThreshold: formVal.warningThreshold ?? 5,
      criticalThreshold: formVal.criticalThreshold ?? 10,
      frequency: formVal.frequency as KriDefinition['frequency'],
      responsible: formVal.responsible || ''
    });

    this.kriForm.reset({
      name: '',
      code: `KRI-${Date.now().toString().slice(-4)}`,
      description: '',
      process: 'Operaciones de Pago',
      category: 'Ejecución y Procesos',
      unit: '%',
      direction: 'superior',
      warningThreshold: 5,
      criticalThreshold: 10,
      frequency: 'Diario',
      responsible: 'Oficial de Riesgo Operacional'
    });

    this.activeSection.set('list');
  }
}
