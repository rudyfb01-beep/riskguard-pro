import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { EvidenceService } from '../services/evidence.service';
import { EvidenceEntity, EvidenceFile } from '../models/evidence.model';
import { EVIDENCE_ACCEPT, fileIcon, formatBytes, isPreviewable } from '../utils/evidence';

/**
 * Evidencias de un registro: cargar (clic o arrastrar), ver, descargar, verificar integridad
 * y dar de baja con motivo. Se usa en todos los módulos que piden respaldo.
 */
@Component({
  selector: 'app-evidence-files',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-2 text-xs">
      @if (title()) {
        <div class="flex items-center gap-1.5">
          <mat-icon class="text-base text-indigo-600">attach_file</mat-icon>
          <span class="font-semibold text-slate-800">{{ title() }}</span>
          <span class="text-slate-500">({{ files().length }})</span>
          @if (required() && !files().length) { <span class="text-amber-700 font-medium">· requerida</span> }
        </div>
      }

      @if (canAttach() && !readonly()) {
        <div class="rounded-xl border-2 border-dashed p-3 text-center transition-colors"
          [class]="dragging() ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:border-indigo-400'"
          (dragover)="onDrag($event, true)" (dragleave)="onDrag($event, false)" (drop)="onDrop($event)">
          <input #picker type="file" multiple class="hidden" [accept]="accept" (change)="onPick($event)" [attr.aria-label]="'Adjuntar archivos a ' + label()" />
          <button type="button" (click)="picker.click()" [disabled]="busy()" class="w-full flex flex-col items-center gap-0.5 cursor-pointer rounded-lg p-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60">
            <mat-icon class="text-xl text-slate-400">{{ busy() ? 'hourglass_top' : 'cloud_upload' }}</mat-icon>
            <span class="font-medium text-slate-700">
              @if (busy()) { Subiendo… } @else { <span class="text-indigo-600 font-semibold underline">Adjuntar archivos</span> o arrástrelos aquí }
            </span>
            <span class="text-[10px] text-slate-400">PDF, Word, Excel, PowerPoint, imágenes, CSV, texto, correo o ZIP · máx. {{ maxLabel() }} por archivo</span>
          </button>
          @if (withDescription()) {
            <input type="text" [value]="description()" (input)="description.set($any($event.target).value)" placeholder="Descripción (opcional, se aplica a los próximos archivos)"
              class="mt-2 w-full text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          }
        </div>
      }
      @for (e of errors(); track $index) { <p class="text-rose-700" role="alert">{{ e }}</p> }

      @if (files().length) {
        <ul class="space-y-1.5">
          @for (f of files(); track f.id) {
            <li class="p-2 bg-white border border-slate-200 rounded-lg hover:border-slate-300">
              <div class="flex items-center gap-2">
                <span class="p-1 rounded bg-slate-100 text-slate-700 shrink-0"><mat-icon class="text-sm">{{ icon(f) }}</mat-icon></span>
                <div class="min-w-0 flex-1">
                  <button type="button" (click)="svc.open(f, true)" class="font-medium text-slate-900 block truncate max-w-full text-left hover:text-indigo-700 hover:underline cursor-pointer" [title]="f.fileName">{{ f.fileName }}</button>
                  <span class="text-[10px] text-slate-500 block">
                    {{ size(f) }} · {{ f.uploadedAt.slice(0, 10) }} · {{ f.uploadedBy }}
                    · <span class="font-mono" [title]="'SHA-256 ' + f.sha256">{{ f.sha256.slice(0, 12) }}…</span>
                    @if (verified()[f.id] === true) { <span class="text-emerald-700 font-semibold"> · íntegro</span> }
                    @if (verified()[f.id] === false) { <span class="text-rose-700 font-semibold"> · ¡el contenido no coincide!</span> }
                  </span>
                  @if (f.description) { <span class="text-[11px] text-slate-600 block">{{ f.description }}</span> }
                </div>
                <div class="flex items-center shrink-0">
                  @if (previewable(f)) {
                    <button type="button" (click)="svc.open(f, true)" class="p-1 text-slate-500 hover:text-indigo-700 rounded hover:bg-slate-100 cursor-pointer" title="Ver" [attr.aria-label]="'Ver ' + f.fileName"><mat-icon class="text-sm">visibility</mat-icon></button>
                  }
                  <button type="button" (click)="svc.open(f)" class="p-1 text-slate-500 hover:text-indigo-700 rounded hover:bg-slate-100 cursor-pointer" title="Descargar" [attr.aria-label]="'Descargar ' + f.fileName"><mat-icon class="text-sm">download</mat-icon></button>
                  <button type="button" (click)="verify(f)" class="p-1 text-slate-500 hover:text-emerald-700 rounded hover:bg-slate-100 cursor-pointer" title="Verificar integridad (SHA-256)" [attr.aria-label]="'Verificar ' + f.fileName"><mat-icon class="text-sm">verified</mat-icon></button>
                  @if (!readonly() && svc.canRemove(f, parent())) {
                    <button type="button" (click)="startRemove(f)" class="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer" title="Dar de baja" [attr.aria-label]="'Dar de baja ' + f.fileName"><mat-icon class="text-sm">delete</mat-icon></button>
                  }
                </div>
              </div>
              @if (removing() === f.id) {
                <div class="mt-2 flex gap-2 items-center">
                  <input type="text" [value]="reason()" (input)="reason.set($any($event.target).value)" placeholder="Motivo de la baja (el archivo se conserva en el registro)"
                    class="flex-1 text-xs rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500" />
                  <button type="button" (click)="removing.set(null)" class="px-2 py-1 rounded-lg border border-slate-300 bg-white cursor-pointer">Cancelar</button>
                  <button type="button" (click)="confirmRemove(f)" class="px-2 py-1 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer">Dar de baja</button>
                </div>
              }
            </li>
          }
        </ul>
      } @else if (emptyText()) {
        <p class="text-slate-500">{{ emptyText() }}</p>
      }
    </div>
  `,
})
export class EvidenceFiles {
  readonly svc = inject(EvidenceService);

  readonly entity = input.required<EvidenceEntity>();
  readonly entityId = input.required<string>();
  readonly context = input<string | undefined>(undefined);
  /** Código o nombre del registro (bitácora). */
  readonly label = input.required<string>();
  /** Registro de origen (permisos del responsable / quien responde / quien solicita). */
  readonly parent = input<unknown>(null);
  readonly title = input('Evidencias');
  readonly emptyText = input('');
  readonly readonly = input(false);
  readonly required = input(false);
  readonly withDescription = input(true);

  readonly uploaded = output<EvidenceFile>();

  readonly accept = EVIDENCE_ACCEPT;
  readonly busy = signal(false);
  readonly dragging = signal(false);
  readonly errors = signal<string[]>([]);
  readonly description = signal('');
  readonly removing = signal<string | null>(null);
  readonly reason = signal('');
  readonly verified = signal<Record<string, boolean>>({});

  readonly files = computed(() => this.svc.forEntity(this.entity(), this.entityId(), this.context()));
  readonly canAttach = computed(() => this.svc.canAttach(this.entity(), this.parent()));
  readonly maxLabel = computed(() => formatBytes(this.svc.maxBytes()));

  icon(f: EvidenceFile) { return fileIcon(f.fileName); }
  size(f: EvidenceFile) { return formatBytes(f.sizeBytes); }
  previewable(f: EvidenceFile) { return isPreviewable(f.mimeType); }

  onDrag(e: DragEvent, over: boolean) {
    e.preventDefault();
    this.dragging.set(over);
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length) void this.uploadAll(files);
  }

  onPick(e: Event) {
    const el = e.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    if (files.length) void this.uploadAll(files);
  }

  private async uploadAll(files: File[]) {
    this.busy.set(true);
    this.errors.set([]);
    const errs: string[] = [];
    for (const file of files) {
      try {
        const f = await this.svc.upload(file, { entity: this.entity(), id: this.entityId(), context: this.context(), label: this.label() }, this.description());
        this.uploaded.emit(f);
      } catch (e) {
        errs.push((e as Error).message);
      }
    }
    this.errors.set(errs);
    this.busy.set(false);
  }

  async verify(f: EvidenceFile) {
    try {
      const ok = await this.svc.verify(f);
      this.verified.update(v => ({ ...v, [f.id]: ok }));
    } catch (e) {
      this.errors.set([(e as Error).message]);
    }
  }

  startRemove(f: EvidenceFile) {
    this.reason.set('');
    this.removing.set(f.id);
  }

  async confirmRemove(f: EvidenceFile) {
    try {
      await this.svc.remove(f, this.reason());
      this.removing.set(null);
    } catch (e) {
      this.errors.set([(e as Error).message]);
    }
  }
}
