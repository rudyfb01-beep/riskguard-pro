import { ChangeDetectionStrategy, Component, inject, input, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApprovalBox } from './approval-box';
import { ApprovalService } from '../services/approval.service';
import { RiskDataService } from '../services/risk-data.service';
import { BaselCategory, Risk } from '../models/risk.model';
import { MoneyPipe } from '../utils/money.pipe';
import { ActionPlanService } from '../services/action-plan.service';
import { LinkedPlans } from './linked-plans';

@Component({
  selector: 'app-risk-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MoneyPipe, LinkedPlans, ApprovalBox],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden my-6">
        
        <!-- Modal Header -->
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <mat-icon class="text-emerald-600">shield</mat-icon>
              <span>{{ existingRisk() ? 'Modificar Riesgo Operacional' : 'Identificar Nuevo Riesgo Operacional' }}</span>
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">
              Conforme a estándares ISO 31000 y categorías de Basilea III
            </p>
          </div>
          <button
            type="button"
            (click)="closeModal.emit()"
            class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <mat-icon class="text-lg">close</mat-icon>
          </button>
        </div>

        <!-- Modal Body (Form) -->
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="flex-1 overflow-y-auto p-6 space-y-5">
          
          <!-- Title & Process -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="md:col-span-2">
              <label for="risk-title" class="block text-xs font-semibold text-slate-700 mb-1">
                Título del Evento de Riesgo *
              </label>
              <input
                id="risk-title"
                type="text"
                formControlName="title"
                placeholder="Ej. Falla en balanceador de carga durante cierre bancario"
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label for="risk-process" class="block text-xs font-semibold text-slate-700 mb-1">
                Proceso Afectado *
              </label>
              <select
                id="risk-process"
                formControlName="process"
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                @for (proc of processOptions(); track proc) {
                  <option [value]="proc">{{ proc }}</option>
                }
              </select>
            </div>
          </div>

          <!-- Description -->
          <div>
            <label for="risk-description" class="block text-xs font-semibold text-slate-700 mb-1">
              Descripción y Causa Raíz
            </label>
            <textarea
              id="risk-description"
              formControlName="description"
              rows="2"
              placeholder="Detalla cómo ocurre el riesgo, vulnerabilidades explotadas o factores operacionales desencadenantes..."
              class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            ></textarea>
          </div>

          <!-- Category & Financial Exposure -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label for="risk-category" class="block text-xs font-semibold text-slate-700 mb-1">
                Categoría Basilea *
              </label>
              <select
                id="risk-category"
                formControlName="category"
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                @for (cat of baselCategories; track cat) {
                  <option [value]="cat">{{ cat }}</option>
                }
              </select>
            </div>

            <div>
              <label for="risk-exposure" class="block text-xs font-semibold text-slate-700 mb-1">
                Exposición Estimada ({{ riskService.currencyCode() }})
              </label>
              <input
                id="risk-exposure"
                type="number"
                formControlName="financialExposureUSD"
                min="0"
                step="5000"
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label for="risk-responsible" class="block text-xs font-semibold text-slate-700 mb-1">
                Responsable del Proceso
              </label>
              <input
                id="risk-responsible"
                type="text"
                formControlName="responsible"
                placeholder="Nombre o cargo del dueño"
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <!-- Inherent Assessment (Sliders) -->
          <div class="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>1. Evaluación de Riesgo Inherente (Sin Controles)</span>
              <span class="font-mono text-emerald-700 font-semibold lowercase">
                score: {{ inherentScore }} pts
              </span>
            </h3>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="font-medium text-slate-700">Probabilidad Inherente</span>
                  <span class="font-bold font-mono text-slate-900">{{ form.get('inherentLikelihood')?.value }}/4</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  formControlName="inherentLikelihood"
                  class="w-full accent-slate-900 cursor-pointer"
                />
                <div class="flex justify-between text-[10px] text-slate-500 mt-1">
                  @for (l of riskService.catalog.riskScale().likelihood; track l.level) { <span [title]="l.criteria">{{ l.level }}. {{ l.name }}</span> }
                </div>
                <p class="text-[10px] text-slate-500 mt-1 italic">{{ criteria('likelihood', form.get('inherentLikelihood')?.value) }}</p>
              </div>

              <div>
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="font-medium text-slate-700">Impacto Inherente</span>
                  <span class="font-bold font-mono text-slate-900">{{ form.get('inherentImpact')?.value }}/4</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="4"
                  formControlName="inherentImpact"
                  class="w-full accent-slate-900 cursor-pointer"
                />
                <div class="flex justify-between text-[10px] text-slate-500 mt-1">
                  @for (l of riskService.catalog.riskScale().impact; track l.level) { <span [title]="l.criteria">{{ l.level }}. {{ l.name }}</span> }
                </div>
                <p class="text-[10px] text-slate-500 mt-1 italic">{{ criteria('impact', form.get('inherentImpact')?.value) }}</p>
              </div>
            </div>
          </div>

          <!-- Controls Application -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-slate-900 uppercase tracking-wider">
                2. Controles Operacionales Aplicados
              </span>
              <span class="text-xs text-slate-500">
                Selecciona los controles que mitigan este riesgo
              </span>
            </div>

            <div class="space-y-2 max-h-40 overflow-y-auto p-1 border border-slate-200 rounded-lg">
              @for (ctrl of riskService.controls(); track ctrl.id) {
                @let isChecked = selectedControls().includes(ctrl.id);
                <label
                  [for]="'ctrl-chk-' + ctrl.id"
                  [class]="isChecked ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200 hover:bg-slate-50'"
                  class="p-2.5 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors block"
                >
                  <div class="flex items-center gap-2">
                    <input
                      [id]="'ctrl-chk-' + ctrl.id"
                      type="checkbox"
                      [checked]="isChecked"
                      (change)="toggleControl(ctrl.id)"
                      class="rounded text-emerald-600 focus:ring-emerald-500 accent-emerald-600 cursor-pointer"
                    />
                    <div>
                      <span class="font-mono font-semibold text-slate-900">{{ ctrl.code }}</span>
                      <span class="text-slate-700 ml-1.5">{{ ctrl.name }}</span>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-[11px] font-medium text-slate-500">{{ ctrl.type }}</span>
                    <span class="text-xs font-mono font-semibold text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                      {{ ctrl.totalEffectiveness }}%
                    </span>
                  </div>
                </label>
              }
            </div>
          </div>

          <!-- Dynamic Residual Risk Preview -->
          <div class="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4">
            <div class="flex items-center justify-between text-xs font-bold text-emerald-950 uppercase tracking-wider mb-2">
              <span>3. Riesgo Residual Calculado (Post-Controles)</span>
              <span class="font-mono text-emerald-800">
                {{ calculatedResidual().residualScore }} pts ({{ calculatedResidual().residualLevel }})
              </span>
            </div>
            
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-700">
              <div>
                <span class="text-slate-500 block text-[11px]">Probabilidad Residual:</span>
                <span class="font-bold font-mono">{{ calculatedResidual().residualLikelihood }} / 4</span>
              </div>
              <div>
                <span class="text-slate-500 block text-[11px]">Impacto Residual:</span>
                <span class="font-bold font-mono">{{ calculatedResidual().residualImpact }} / 4</span>
              </div>
              <div>
                <span class="text-slate-500 block text-[11px]">Exposición Residual:</span>
                <span class="font-bold font-mono text-emerald-900">{{ calculatedResidual().residualExposureUSD | money }}</span>
              </div>
              <div>
                <span class="text-slate-500 block text-[11px]">Nivel de Tolerancia:</span>
                <span
                  class="inline-block px-2 py-0.5 rounded font-semibold text-[11px]"
                  [class]="levelBadgeClass(calculatedResidual().residualLevel)"
                >
                  {{ calculatedResidual().residualLevel }}
                </span>
              </div>
            </div>
          </div>

          <!-- Mitigation Plan -->
          <div class="border-t border-slate-200 pt-4">
            <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
              4. Planes de acción del tratamiento
            </h3>
            @if (existingRisk(); as er) {
              <app-linked-plans sourceType="Riesgo" [sourceId]="er.id" [sourceLabel]="er.code + ' ' + er.title" [process]="er.process"
                [defaultOwner]="er.responsible" [defaultPriority]="er.residualLevel === 'Crítico' || er.residualLevel === 'Alto' ? 'Alta' : er.residualLevel === 'Medio' ? 'Media' : 'Baja'"
                emptyText="El riesgo no tiene planes de acción. Cree uno para reducir su nivel residual." />
            } @else {
            <p class="text-[11px] text-slate-500 mb-2">Si indica un plan, se crea en Planes de Acción con el responsable del riesgo; después puede agregar tareas y registrar avances.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label for="risk-mitigation-title" class="block text-xs font-semibold text-slate-700 mb-1">
                  Título del Plan de Mitigación
                </label>
                <input
                  id="risk-mitigation-title"
                  type="text"
                  formControlName="mitigationTitle"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label for="risk-mitigation-due" class="block text-xs font-semibold text-slate-700 mb-1">
                  Fecha Límite de Implementación
                </label>
                <input
                  id="risk-mitigation-due"
                  type="date"
                  formControlName="mitigationDueDate"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            }
          </div>

          @if (existingRisk(); as er) {
            @let appetite = approvals.appetiteOf(er.id);
            @if (appetite !== 'Dentro del apetito' || er.acceptance || approvals.forTarget('risks', er.id).length) {
              <div class="border-t border-slate-200 pt-4 space-y-2">
                <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider">5. Aceptación del riesgo</h3>
                @if (er.acceptance; as a) {
                  <div class="p-3 rounded-xl border text-xs" [class]="a.reviewDate < today ? 'border-rose-300 bg-rose-50' : 'border-emerald-200 bg-emerald-50'">
                    <strong>Aceptado</strong> por {{ a.approvedBy }} el {{ a.approvedDate }} ({{ a.requestCode }}) · revisar el
                    <strong [class.text-rose-700]="a.reviewDate < today">{{ a.reviewDate }}</strong>.
                    <div class="text-slate-700 mt-1">{{ a.justification }}</div>
                  </div>
                }
                <app-approval-box kind="aceptacion-riesgo" [targetId]="er.id" [targetLabel]="er.code + ' ' + er.title"
                  [title]="'Riesgo residual ' + er.residualScore + ': ' + (appetite ?? '')" requestLabel="Solicitar aceptación"
                  [hint]="appetite === 'Fuera de tolerancia' ? 'Fuera de la tolerancia: la aceptación suma la aprobación del Comité de Riesgos.' : appetite === 'Sobre el apetito' ? 'El residual supera el apetito: mitíguelo con planes de acción o solicite su aceptación formal.' : ''"
                  [defaults]="{ residualScore: er.residualScore }" (notify)="riskService.permissionNotice.set({ message: $event, at: now() })" />
              </div>
            }
          }

        </form>

        <!-- Modal Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            (click)="closeModal.emit()"
            class="px-4 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          
          <button
            type="button"
            (click)="onSubmit()"
            [class.perm-locked]="!canSave()"
            [disabled]="form.invalid"
            class="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            <mat-icon class="text-sm">save</mat-icon>
            <span>{{ existingRisk() ? 'Actualizar Riesgo' : 'Guardar y Certificar Riesgo' }}</span>
          </button>
        </div>

      </div>
    </div>
  `
})
export class RiskModal implements OnInit {
  readonly riskService = inject(RiskDataService);
  readonly actionPlans = inject(ActionPlanService);
  readonly approvals = inject(ApprovalService);
  readonly today = new Date().toISOString().slice(0, 10);
  now() { return Date.now(); }

  readonly existingRisk = input<Risk | null>(null);
  readonly closeModal = output<void>();
  readonly riskSaved = output<Risk>();

  readonly selectedControls = signal<string[]>([]);

  /** Procesos del mantenedor (más el actual si fue desactivado). */
  processOptions(): string[] {
    return this.riskService.catalog.processOptions(this.form?.value.process ?? undefined);
  }

  readonly baselCategories: BaselCategory[] = [
    'Fraude Interno',
    'Fraude Externo',
    'Fallas Tecnológicas',
    'Ejecución y Procesos',
    'Prácticas Laborales',
    'Daño a Activos Físicos',
    'Cumplimiento Normativo'
  ];

  form = new FormGroup({
    title: new FormControl('', [Validators.required, Validators.minLength(5)]),
    process: new FormControl(this.riskService.catalog.processNames()[0] ?? '', [Validators.required]),
    description: new FormControl(''),
    category: new FormControl<BaselCategory>('Fallas Tecnológicas', [Validators.required]),
    financialExposureUSD: new FormControl(this.riskService.currencyCode() === 'CLP' ? 150_000_000 : 150000, [Validators.required, Validators.min(0)]),
    responsible: new FormControl(this.riskService.currentProfile().name),
    inherentLikelihood: new FormControl(3, [Validators.required]),
    inherentImpact: new FormControl(3, [Validators.required]),
    mitigationTitle: new FormControl(''),
    mitigationDueDate: new FormControl(new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10))
  });

  ngOnInit() {
    const existing = this.existingRisk();
    if (existing) {
      this.form.patchValue({
        title: existing.title,
        process: existing.process,
        description: existing.description,
        category: existing.category,
        financialExposureUSD: existing.financialExposureUSD,
        responsible: existing.responsible,
        inherentLikelihood: existing.inherentLikelihood,
        inherentImpact: existing.inherentImpact,
        mitigationTitle: existing.mitigationPlan.title,
        mitigationDueDate: existing.mitigationPlan.dueDate
      });
      this.selectedControls.set([...existing.controlIds]);
    }
  }

  toggleControl(controlId: string) {
    const current = this.selectedControls();
    if (current.includes(controlId)) {
      this.selectedControls.set(current.filter(id => id !== controlId));
    } else {
      this.selectedControls.set([...current, controlId]);
    }
  }

  calculatedResidual() {
    const likelihood = Number(this.form.get('inherentLikelihood')?.value) || 3;
    const impact = Number(this.form.get('inherentImpact')?.value) || 3;
    const exposure = Number(this.form.get('financialExposureUSD')?.value) || 100000;
    return this.riskService.calculateResidual(likelihood, impact, exposure, this.selectedControls());
  }

  get inherentScore(): number {
    const l = Number(this.form.get('inherentLikelihood')?.value) || 3;
    const i = Number(this.form.get('inherentImpact')?.value) || 3;
    return l * i;
  }

  levelBadgeClass(level: string): string {
    switch (level) {
      case 'Crítico': return 'bg-rose-100 text-rose-800';
      case 'Alto': return 'bg-orange-100 text-orange-800';
      case 'Medio': return 'bg-amber-100 text-amber-800';
      case 'Bajo':
      default: return 'bg-emerald-100 text-emerald-800';
    }
  }

  /** Permiso necesario para guardar en este formulario. */
  readonly savePerms = ['canEditRisks'] as const;

  /** Criterio de la escala vigente para el nivel elegido. */
  criteria(kind: 'likelihood' | 'impact', level: unknown): string {
    return this.riskService.catalog.riskScale()[kind].find(l => l.level === Number(level))?.criteria ?? '';
  }

  canSave(): boolean {
    return this.riskService.canAny(...this.savePerms);
  }

  async onSubmit() {
    if (this.form.invalid) return;
    if (!this.riskService.requirePermission([...this.savePerms], 'crear o editar riesgos')) return;

    const val = this.form.value;
    const existing = this.existingRisk();

    if (existing) {
      await this.riskService.updateRisk(existing.id, {
        title: val.title || '',
        process: val.process || '',
        description: val.description || '',
        category: (val.category as BaselCategory) || 'Ejecución y Procesos',
        financialExposureUSD: Number(val.financialExposureUSD) || 100000,
        responsible: val.responsible || '',
        inherentLikelihood: Number(val.inherentLikelihood) || 3,
        inherentImpact: Number(val.inherentImpact) || 3,
        controlIds: this.selectedControls(),
        mitigationPlan: {
          ...existing.mitigationPlan,
          title: val.mitigationTitle || existing.mitigationPlan.title,
          dueDate: val.mitigationDueDate || existing.mitigationPlan.dueDate
        }
      });
      this.riskSaved.emit(existing);
    } else {
      const created = await this.riskService.addRisk({
        title: val.title || '',
        process: val.process || '',
        description: val.description || '',
        category: (val.category as BaselCategory) || 'Ejecución y Procesos',
        financialExposureUSD: Number(val.financialExposureUSD) || 100000,
        responsible: val.responsible || '',
        inherentLikelihood: Number(val.inherentLikelihood) || 3,
        inherentImpact: Number(val.inherentImpact) || 3,
        controlIds: this.selectedControls(),
        mitigationPlan: {
          id: `mit-${Date.now()}`,
          title: val.mitigationTitle?.trim() || '',
          owner: val.responsible || this.riskService.currentProfile().name,
          dueDate: val.mitigationDueDate || '',
          budgetUSD: 0,
          progressPct: 0,
          status: 'No Iniciado',
          actions: []
        }
      });
      if (created && val.mitigationTitle?.trim() && val.mitigationDueDate) {
        try {
          await this.actionPlans.create({
            title: val.mitigationTitle.trim(), sourceType: 'Riesgo', sourceId: created.id, sourceLabel: `${created.code} ${created.title}`,
            process: created.process, owner: created.responsible || this.riskService.currentProfile().name, dueDate: val.mitigationDueDate,
            priority: created.residualLevel === 'Crítico' || created.residualLevel === 'Alto' ? 'Alta' : created.residualLevel === 'Medio' ? 'Media' : 'Baja',
          });
        } catch {
          // El riesgo quedó creado; el aviso de permisos ya se mostró.
        }
      }
      this.riskSaved.emit(created);
    }

    this.closeModal.emit();
  }
}
