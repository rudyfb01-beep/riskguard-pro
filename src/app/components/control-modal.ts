import { ChangeDetectionStrategy, Component, inject, input, output, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { Control, ControlAutomation, ControlEvidenceAttachment, ControlFrequency, ControlTestExecution, ControlType } from '../models/risk.model';

@Component({
  selector: 'app-control-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden my-4">
        
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <mat-icon class="text-xl">verified_user</mat-icon>
            </div>
            <div>
              <h2 class="text-base font-bold text-slate-900">
                {{ existingControl() ? 'Evaluación y Registro de Prueba de Control' : 'Registrar Nuevo Control Operacional' }}
              </h2>
              <p class="text-xs text-slate-500">
                Deje constancia de la prueba de eficacia y adjunte las evidencias documentales correspondientes
              </p>
            </div>
          </div>
          <button
            type="button"
            (click)="closeModal.emit()"
            class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <mat-icon class="text-lg">close</mat-icon>
          </button>
        </div>

        <!-- Body -->
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="flex-1 overflow-y-auto p-6 space-y-5">
          
          <!-- Section 1: Control Identification -->
          <div class="space-y-3">
            <h3 class="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <mat-icon class="text-xs text-indigo-600">tune</mat-icon>
              <span>1. Identificación y Parámetros del Control</span>
            </h3>

            <div>
              <label for="ctrl-name" class="block text-xs font-semibold text-slate-700 mb-1">
                Nombre del Control *
              </label>
              <input
                id="ctrl-name"
                type="text"
                formControlName="name"
                placeholder="Ej. Control Dual de Cuatro Ojos en Transferencias > $20,000"
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="ctrl-process" class="block text-xs font-semibold text-slate-700 mb-1">
                  Macroproceso / Departamento
                </label>
                <select
                  id="ctrl-process"
                  formControlName="process"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  @for (proc of riskService.defaultProcesses; track proc) {
                    <option [value]="proc">{{ proc }}</option>
                  }
                </select>
              </div>

              <div>
                <label for="ctrl-owner" class="block text-xs font-semibold text-slate-700 mb-1">
                  Responsable del Control
                </label>
                <input
                  id="ctrl-owner"
                  type="text"
                  formControlName="owner"
                  placeholder="Ej. Jefatura de Tesorería"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label for="ctrl-description" class="block text-xs font-semibold text-slate-700 mb-1">
                Descripción Operativa del Control
              </label>
              <textarea
                id="ctrl-description"
                formControlName="description"
                rows="2"
                placeholder="Especifica el mecanismo técnico, regla de sistema o procedimiento operativo..."
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              ></textarea>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label for="ctrl-type" class="block text-xs font-semibold text-slate-700 mb-1">Tipo de Control</label>
                <select
                  id="ctrl-type"
                  formControlName="type"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="Preventivo">Preventivo</option>
                  <option value="Detectivo">Detectivo</option>
                  <option value="Correctivo">Correctivo</option>
                </select>
              </div>

              <div>
                <label for="ctrl-automation" class="block text-xs font-semibold text-slate-700 mb-1">Automatización</label>
                <select
                  id="ctrl-automation"
                  formControlName="automation"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="Automático">Automático</option>
                  <option value="Semiautomático">Semiautomático</option>
                  <option value="Manual">Manual</option>
                </select>
              </div>

              <div>
                <label for="ctrl-frequency" class="block text-xs font-semibold text-slate-700 mb-1">Frecuencia</label>
                <select
                  id="ctrl-frequency"
                  formControlName="frequency"
                  class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="Continuo">Continuo</option>
                  <option value="Diario">Diario</option>
                  <option value="Semanal">Semanal</option>
                  <option value="Mensual">Mensual</option>
                  <option value="Por Evento">Por Evento</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Section 2: Effectiveness Evaluation Sliders -->
          <div class="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                <mat-icon class="text-xs text-indigo-600">assessment</mat-icon>
                <span>2. Calificación de Eficacia (Diseño & Operatividad)</span>
              </span>
              <span class="font-mono text-sm font-bold text-indigo-700 bg-white px-2.5 py-0.5 rounded border border-indigo-200">
                Eficacia Total: {{ calculatedTotal() }}%
              </span>
            </div>

            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="font-medium text-slate-700">Eficacia de Diseño (Ponderación 40%)</span>
                <span class="font-bold font-mono text-slate-900">{{ form.get('designEffectiveness')?.value }}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                formControlName="designEffectiveness"
                class="w-full accent-indigo-600 cursor-pointer"
              />
              <span class="text-[10px] text-slate-500 block">¿El control está diseñado para mitigar la causa raíz del evento de riesgo?</span>
            </div>

            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="font-medium text-slate-700">Eficacia Operativa (Ponderación 60%)</span>
                <span class="font-bold font-mono text-slate-900">{{ form.get('operatingEffectiveness')?.value }}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                formControlName="operatingEffectiveness"
                class="w-full accent-indigo-600 cursor-pointer"
              />
              <span class="text-[10px] text-slate-500 block">¿El control opera consistentemente sin desviaciones durante la prueba de campo?</span>
            </div>
          </div>

          <!-- Section 3: Test Execution & Attached Evidence -->
          <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <mat-icon class="text-xs text-emerald-600">attach_file</mat-icon>
                <span>3. Registro de Prueba de Control & Evidencia Documental</span>
              </span>
              <span class="text-[11px] font-mono font-medium text-slate-500">
                Norma ISO 31000 / COSO ERM
              </span>
            </div>

            <!-- Testing Methodology & Sample Size -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label for="ctrl-testMethod" class="block text-xs font-semibold text-slate-700 mb-1">
                  Método de Prueba
                </label>
                <select
                  id="ctrl-testMethod"
                  formControlName="testMethod"
                  class="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer bg-white"
                >
                  <option value="Inspección de Muestra">Inspección de Muestra</option>
                  <option value="Re-ejecución Automática">Re-ejecución Automática</option>
                  <option value="Recorrido (Walkthrough)">Recorrido (Walkthrough)</option>
                  <option value="Entrevista y Observación">Entrevista y Observación</option>
                  <option value="Auditoría Forense">Auditoría Forense</option>
                </select>
              </div>

              <div>
                <label for="ctrl-sampleDetails" class="block text-xs font-semibold text-slate-700 mb-1">
                  Tamaño de Muestra / Población
                </label>
                <input
                  id="ctrl-sampleDetails"
                  type="text"
                  formControlName="sampleDetails"
                  placeholder="Ej. Muestra de 40 transferencias de 180"
                  class="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div>
                <label for="ctrl-deviations" class="block text-xs font-semibold text-slate-700 mb-1">
                  Desviaciones Encontradas
                </label>
                <input
                  id="ctrl-deviations"
                  type="number"
                  min="0"
                  formControlName="deviationsIdentified"
                  class="w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
            </div>

            <!-- Evidence Notes / Detailed Test Findings -->
            <div>
              <label for="ctrl-evidence" class="block text-xs font-semibold text-slate-700 mb-1">
                Constancia y Hallazgos de la Prueba de Evidencia *
              </label>
              <textarea
                id="ctrl-evidence"
                formControlName="evidence"
                rows="2"
                placeholder="Detalle el resultado de la prueba, herramientas o registros consultados y sustentación del dictamen de efectividad..."
                class="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              ></textarea>
            </div>

            <!-- Upload / Attachment Zone -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="block text-xs font-semibold text-slate-700">
                  Archivos de Evidencia Adjuntos (PDF, Excel, Logs, Capturas)
                </span>
                
                <button
                  type="button"
                  (click)="attachMockSampleEvidence()"
                  class="text-[11px] text-indigo-700 hover:text-indigo-900 font-medium flex items-center gap-1"
                  title="Adjuntar plantilla de acta oficial de prueba de auditoría"
                >
                  <mat-icon class="text-xs">add_to_photos</mat-icon>
                  <span>Adjuntar Muestra Estándar</span>
                </button>
              </div>

              <!-- Dropzone File Selector -->
              <div class="border-2 border-dashed border-slate-300 hover:border-indigo-400 bg-white rounded-xl p-4 text-center transition-colors">
                <input
                  #fileInput
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.csv,.png,.jpg,.jpeg,.docx,.txt"
                  (change)="onFileSelected($event)"
                  class="hidden"
                />

                <button
                  type="button"
                  class="w-full flex flex-col items-center justify-center gap-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg p-2"
                  (click)="fileInput.click()"
                >
                  <mat-icon class="text-2xl text-slate-400">cloud_upload</mat-icon>
                  <div class="text-xs font-medium text-slate-700">
                    <span class="text-indigo-600 font-semibold underline">Haga clic para subir archivos</span> o arrástrelos aquí
                  </div>
                  <span class="text-[10px] text-slate-400">
                    Soporta PDF de auditoría, hojas de cálculo Excel/CSV, capturas de logs (Máx 15MB)
                  </span>
                </button>
              </div>

              <!-- Attached Files List -->
              @if (attachedFiles().length > 0) {
                <div class="space-y-1.5 pt-1">
                  @for (att of attachedFiles(); track att.id) {
                    <div class="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs hover:border-slate-300 transition-colors">
                      <div class="flex items-center gap-2.5 truncate mr-2">
                        <span class="p-1 rounded bg-slate-100 text-slate-700 shrink-0">
                          <mat-icon class="text-sm">{{ getFileIcon(att.fileName) }}</mat-icon>
                        </span>
                        <div class="truncate">
                          <span class="font-medium text-slate-900 block truncate" [title]="att.fileName">{{ att.fileName }}</span>
                          <span class="text-[10px] text-slate-400 block font-mono">
                            {{ att.fileSize }} · {{ att.uploadedAt }} · Por: {{ att.uploadedBy }}
                          </span>
                        </div>
                      </div>

                      <div class="flex items-center gap-1 shrink-0">
                        <!-- Download action -->
                        <button
                          type="button"
                          (click)="riskService.downloadAttachment(att)"
                          class="p-1 text-slate-500 hover:text-indigo-700 rounded hover:bg-slate-100 transition-colors"
                          title="Descargar archivo de evidencia"
                        >
                          <mat-icon class="text-sm">download</mat-icon>
                        </button>

                        <!-- Delete action -->
                        <button
                          type="button"
                          (click)="removeAttachment(att.id)"
                          class="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors"
                          title="Quitar archivo adjunto"
                        >
                          <mat-icon class="text-sm">delete</mat-icon>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="text-center py-2 text-[11px] text-slate-400 italic">
                  No hay archivos adjuntos en esta evaluación. Puede subir documentos de soporte o pulsar "Adjuntar Muestra Estándar".
                </div>
              }
            </div>

          </div>

        </form>

        <!-- Footer -->
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div class="text-[11px] text-slate-500 hidden sm:block">
            Evidencia registrada con sello criptográfico en la bitácora inalterable.
          </div>

          <div class="flex items-center gap-2">
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
              [disabled]="form.invalid"
              class="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <mat-icon class="text-sm">verified</mat-icon>
              <span>Certificar Prueba y Guardar Evidencia</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `
})
export class ControlModal implements OnInit {
  readonly riskService = inject(RiskDataService);

  readonly existingControl = input<Control | null>(null);
  readonly closeModal = output<void>();

  readonly attachedFiles = signal<ControlEvidenceAttachment[]>([]);

  form = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(4)]),
    description: new FormControl(''),
    process: new FormControl('Operaciones de Pago'),
    owner: new FormControl(''),
    type: new FormControl<ControlType>('Preventivo'),
    automation: new FormControl<ControlAutomation>('Automático'),
    frequency: new FormControl<ControlFrequency>('Continuo'),
    designEffectiveness: new FormControl(85, [Validators.required]),
    operatingEffectiveness: new FormControl(80, [Validators.required]),
    testMethod: new FormControl<'Inspección de Muestra' | 'Re-ejecución Automática' | 'Recorrido (Walkthrough)' | 'Entrevista y Observación' | 'Auditoría Forense'>('Inspección de Muestra'),
    sampleDetails: new FormControl(''),
    deviationsIdentified: new FormControl(0),
    evidence: new FormControl('', [Validators.required])
  });

  ngOnInit() {
    const existing = this.existingControl();
    if (existing) {
      this.form.patchValue({
        name: existing.name,
        description: existing.description,
        process: existing.process,
        owner: existing.owner,
        type: existing.type,
        automation: existing.automation,
        frequency: existing.frequency,
        designEffectiveness: existing.designEffectiveness,
        operatingEffectiveness: existing.operatingEffectiveness,
        sampleDetails: existing.sampleDetails || `Muestra aleatoria de operaciones evaluadas el ${existing.lastTested}`,
        deviationsIdentified: 0,
        evidence: existing.evidence
      });

      if (existing.attachments && existing.attachments.length > 0) {
        this.attachedFiles.set([...existing.attachments]);
      }
    } else {
      this.form.patchValue({
        owner: this.riskService.currentProfile().name,
        evidence: 'Prueba de efectividad de diseño y operatividad realizada sin desviaciones.',
        sampleDetails: 'Muestra de 30 transacciones operativas auditadas'
      });
    }
  }

  calculatedTotal(): number {
    const d = Number(this.form.get('designEffectiveness')?.value) || 0;
    const o = Number(this.form.get('operatingEffectiveness')?.value) || 0;
    return Math.round((d * 0.4) + (o * 0.6));
  }

  getFileIcon(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'picture_as_pdf';
    if (ext === 'xlsx' || ext === 'csv' || ext === 'xls') return 'table_view';
    if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'image';
    return 'description';
  }

  onFileSelected(event: Event) {
    const inputEl = event.target as HTMLInputElement;
    if (!inputEl.files || inputEl.files.length === 0) return;

    const newAttachments: ControlEvidenceAttachment[] = [];
    const files = Array.from(inputEl.files);

    files.forEach(f => {
      const sizeKb = Math.round(f.size / 1024);
      const sizeStr = sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

      newAttachments.push({
        id: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        fileName: f.name,
        fileSize: sizeStr,
        fileType: f.type || 'application/octet-stream',
        uploadedAt: new Date().toISOString().split('T')[0],
        uploadedBy: this.riskService.currentProfile().name,
        description: `Evidencia de prueba cargada por ${this.riskService.currentProfile().name}`,
        fileHashSha256: 'sha256-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      });
    });

    this.attachedFiles.update(list => [...list, ...newAttachments]);
    inputEl.value = '';
  }

  attachMockSampleEvidence() {
    const existing = this.existingControl();
    const ctrlCode = existing ? existing.code : 'CTR-NUEVO';
    const mockFile: ControlEvidenceAttachment = {
      id: `att-${Date.now()}`,
      fileName: `Acta_Auditoria_Prueba_${ctrlCode}_${new Date().toISOString().split('T')[0]}.pdf`,
      fileSize: '1.4 MB',
      fileType: 'application/pdf',
      uploadedAt: new Date().toISOString().split('T')[0],
      uploadedBy: this.riskService.currentProfile().name,
      description: `Acta formal de inspección y validación de muestra para el control ${ctrlCode}.`,
      fileHashSha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0'
    };

    this.attachedFiles.update(list => [...list, mockFile]);
  }

  removeAttachment(attId: string) {
    this.attachedFiles.update(list => list.filter(a => a.id !== attId));
  }

  async onSubmit() {
    if (this.form.invalid) return;

    const val = this.form.value;
    const existing = this.existingControl();
    const attachments = this.attachedFiles();

    const testExecution: Partial<ControlTestExecution> = {
      testMethod: val.testMethod || 'Inspección de Muestra',
      sampleSize: val.sampleDetails || 'Muestra de prueba',
      deviationsIdentified: Number(val.deviationsIdentified) || 0,
      evidenceNotes: val.evidence || '',
      testedBy: this.riskService.currentProfile().name,
      testerRole: this.riskService.currentProfile().role
    };

    if (existing) {
      await this.riskService.evaluateControl(
        existing.id,
        Number(val.designEffectiveness) || 85,
        Number(val.operatingEffectiveness) || 80,
        val.evidence || undefined,
        attachments,
        testExecution
      );
    } else {
      await this.riskService.addControl({
        name: val.name || '',
        description: val.description || '',
        process: val.process || 'Operaciones de Pago',
        owner: val.owner || this.riskService.currentProfile().name,
        type: (val.type as ControlType) || 'Preventivo',
        automation: (val.automation as ControlAutomation) || 'Automático',
        frequency: (val.frequency as ControlFrequency) || 'Continuo',
        designEffectiveness: Number(val.designEffectiveness) || 85,
        operatingEffectiveness: Number(val.operatingEffectiveness) || 80,
        evidence: val.evidence || '',
        sampleDetails: val.sampleDetails || 'Prueba inicial de efectividad',
        attachments
      });
    }

    this.closeModal.emit();
  }
}
