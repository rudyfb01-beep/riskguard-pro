import { ChangeDetectionStrategy, Component, HostListener, OnInit, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PermissionDeniedError } from '../services/risk-data.service';
import { ComplianceService } from '../services/compliance.service';
import {
  ComplianceNorm, NORM_APPLICABILITY, NORM_KINDS, NORM_STATUSES, NormApplicability, NormKind, NormStatus,
} from '../models/compliance.model';

const INPUT = 'w-full text-xs rounded-lg border border-slate-300 px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500';

interface NormForm {
  code: string; title: string; kind: NormKind; issuer: string; source: string; url: string; version: string;
  effectiveDate: string; status: NormStatus; applicability: NormApplicability; applicabilityNote: string; owner: string; notes: string;
}

/** Alta y edición de una norma de la biblioteca normativa. */
@Component({
  selector: 'app-compliance-norm-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[94vh] flex flex-col overflow-hidden my-4"
        role="dialog" aria-modal="true" [attr.aria-label]="norm() ? 'Editar norma' : 'Nueva norma'">
        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <mat-icon class="text-emerald-600">{{ norm() ? 'edit_note' : 'library_add' }}</mat-icon>
              <span>{{ norm() ? 'Editar ' + norm()!.code : 'Nueva norma' }}</span>
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">
              @if (norm()) { Para registrar un cambio de texto de la norma use "Nueva versión"; así queda el historial y se marcan los requisitos por revisar. }
              @else { Ley, norma de la CMF, circular, estándar o política interna. Después podrá agregar o importar sus requisitos. }
            </p>
          </div>
          <button type="button" (click)="closeModal.emit()" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50 cursor-pointer" aria-label="Cerrar">
            <mat-icon class="text-lg">close</mat-icon>
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
          <label class="block"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Código *</span>
            <input [class]="inputCls" [value]="f().code" (input)="set('code', $any($event.target).value)" placeholder="Ley 21.719" /></label>
          <label class="block md:col-span-3"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Título *</span>
            <input [class]="inputCls" [value]="f().title" (input)="set('title', $any($event.target).value)" placeholder="Protección de datos personales" /></label>

          <label class="block"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Tipo</span>
            <select [class]="inputCls" (change)="set('kind', $any($event.target).value)">
              @for (k of kinds; track k) { <option [value]="k" [selected]="k === f().kind">{{ k }}</option> }
            </select></label>
          <label class="block"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Emisor</span>
            <input [class]="inputCls" [value]="f().issuer" (input)="set('issuer', $any($event.target).value)" placeholder="CMF, Congreso, UAF, la cooperativa" /></label>
          <label class="block"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Estado</span>
            <select [class]="inputCls" (change)="set('status', $any($event.target).value)">
              @for (s of statuses; track s) { <option [value]="s" [selected]="s === f().status">{{ s }}</option> }
            </select></label>
          <label class="block"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Vigencia desde</span>
            <input type="date" [class]="inputCls" [value]="f().effectiveDate" (input)="set('effectiveDate', $any($event.target).value)" /></label>

          <label class="block md:col-span-3"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Fuente oficial</span>
            <input [class]="inputCls" [value]="f().source" (input)="set('source', $any($event.target).value)" placeholder="Publicada en el Diario Oficial el ..., Circular N° ..." /></label>
          <label class="block"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Versión{{ norm() ? ' vigente' : ' inicial' }}</span>
            <input [class]="inputCls" [value]="f().version" [disabled]="!!norm()" (input)="set('version', $any($event.target).value)" placeholder="1" /></label>

          <label class="block md:col-span-2"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Enlace al texto</span>
            <input type="url" [class]="inputCls" [value]="f().url" (input)="set('url', $any($event.target).value)" placeholder="https://www.bcn.cl/leychile/..." /></label>
          <label class="block md:col-span-2"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Responsable en la cooperativa</span>
            <input [class]="inputCls" [value]="f().owner" (input)="set('owner', $any($event.target).value)" placeholder="Oficial de Cumplimiento" /></label>

          <label class="block"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Aplicabilidad</span>
            <select [class]="inputCls" (change)="set('applicability', $any($event.target).value)">
              @for (a of applicability; track a) { <option [value]="a" [selected]="a === f().applicability">{{ a }}</option> }
            </select></label>
          <label class="block md:col-span-3"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Por qué aplica (o no)</span>
            <input [class]="inputCls" [value]="f().applicabilityNote" (input)="set('applicabilityNote', $any($event.target).value)" placeholder="Sujeto obligado según el art. ..." /></label>

          <label class="block md:col-span-4"><span class="block text-[11px] font-semibold text-slate-700 mb-1">Notas</span>
            <textarea rows="2" [class]="inputCls" [value]="f().notes" (input)="set('notes', $any($event.target).value)" placeholder="Modificaciones en trámite, interpretación de Cumplimiento, etc."></textarea></label>

          @if (error()) {
            <div class="md:col-span-4 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800" role="alert">{{ error() }}</div>
          }
        </div>

        <div class="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          <button type="button" (click)="closeModal.emit()" class="px-3.5 py-2 text-xs rounded-lg bg-white border border-slate-300 hover:bg-slate-50 cursor-pointer">Cancelar</button>
          <button type="button" (click)="save()" [disabled]="saving()" class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-600 cursor-pointer disabled:opacity-60">
            {{ norm() ? 'Guardar cambios' : 'Agregar norma' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ComplianceNormModal implements OnInit {
  private readonly comp = inject(ComplianceService);
  readonly norm = input<ComplianceNorm | null>(null);
  readonly closeModal = output<void>();
  readonly saved = output<ComplianceNorm>();

  readonly inputCls = INPUT;
  readonly kinds = NORM_KINDS;
  readonly statuses = NORM_STATUSES;
  readonly applicability = NORM_APPLICABILITY;
  readonly error = signal('');
  readonly saving = signal(false);
  readonly f = signal<NormForm>({
    code: '', title: '', kind: 'Ley', issuer: '', source: '', url: '', version: '1', effectiveDate: '', status: 'Vigente',
    applicability: 'Aplica', applicabilityNote: '', owner: '', notes: '',
  });

  ngOnInit() {
    const n = this.norm();
    if (n) {
      this.f.set({
        code: n.code, title: n.title, kind: n.kind, issuer: n.issuer, source: n.source, url: n.url ?? '', version: n.version,
        effectiveDate: n.effectiveDate ?? '', status: n.status, applicability: n.applicability, applicabilityNote: n.applicabilityNote,
        owner: n.owner, notes: n.notes,
      });
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeModal.emit();
  }

  set<K extends keyof NormForm>(k: K, v: NormForm[K]) {
    this.f.update(x => ({ ...x, [k]: v }));
  }

  async save() {
    const v = this.f();
    this.error.set('');
    if (v.url.trim() && !/^https?:\/\//i.test(v.url.trim())) {
      this.error.set('El enlace debe comenzar con http:// o https://');
      return;
    }
    this.saving.set(true);
    try {
      const prev = this.norm();
      const norm = await this.comp.saveNorm({
        ...(prev ?? {}), id: prev?.id,
        code: v.code, title: v.title, kind: v.kind, issuer: v.issuer.trim(), source: v.source.trim(), url: v.url.trim() || undefined,
        version: v.version, effectiveDate: v.effectiveDate || undefined, status: v.status, applicability: v.applicability,
        applicabilityNote: v.applicabilityNote.trim(), owner: v.owner.trim(), notes: v.notes.trim(),
        referential: prev?.referential,
      });
      this.saved.emit(norm);
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) this.error.set((err as Error).message);
      else this.error.set(err.message);
    } finally {
      this.saving.set(false);
    }
  }
}
