import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, output, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { apiFetch, PersistenceService } from '../services/persistence.service';
import { checkPassword, PASSWORD_MIN } from '../utils/password';

/** Cambio de la propia contraseña (AUTH_PASSWORD=true). Cierra las demás sesiones de la persona. */
@Component({
  selector: 'app-change-password-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs no-print">
      <div class="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="cp-title">
        <div class="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 id="cp-title" class="text-sm font-bold text-slate-900 flex items-center gap-2"><mat-icon class="text-emerald-600">key</mat-icon>Cambiar contraseña</h2>
          <button type="button" (click)="closed.emit()" class="p-1 rounded hover:bg-slate-100 text-slate-500 cursor-pointer" aria-label="Cerrar"><mat-icon class="text-lg">close</mat-icon></button>
        </div>
        @if (done()) {
          <div class="p-5 space-y-4">
            <p class="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex gap-2">
              <mat-icon class="text-emerald-600 shrink-0">check_circle</mat-icon>
              Contraseña actualizada. Se cerraron tus sesiones en otros navegadores.
            </p>
            <button type="button" (click)="closed.emit()" class="w-full py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-700 rounded-lg cursor-pointer">Listo</button>
          </div>
        } @else {
          <form class="p-5 space-y-3.5" (submit)="$event.preventDefault(); save()">
            <input type="email" autocomplete="username" [value]="email" hidden readonly />
            <div>
              <label for="cp-current" class="block text-xs font-semibold text-slate-700 mb-1">Contraseña actual</label>
              <input #currentInput id="cp-current" [type]="show() ? 'text' : 'password'" autocomplete="current-password" required
                [value]="current()" (input)="current.set($any($event.target).value)"
                class="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label for="cp-new" class="block text-xs font-semibold text-slate-700 mb-1">Contraseña nueva</label>
              <input id="cp-new" [type]="show() ? 'text' : 'password'" autocomplete="new-password" required
                [value]="next()" (input)="next.set($any($event.target).value)"
                class="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label for="cp-new2" class="block text-xs font-semibold text-slate-700 mb-1">Repite la contraseña nueva</label>
              <input id="cp-new2" [type]="show() ? 'text' : 'password'" autocomplete="new-password" required
                [value]="next2()" (input)="next2.set($any($event.target).value)"
                class="w-full text-sm rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <label class="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                <input type="checkbox" [checked]="show()" (change)="show.set($any($event.target).checked)" /> Mostrar contraseñas
              </label>
            </div>
            <ul class="text-[11px] space-y-0.5" aria-live="polite">
              <li [class]="next().length >= minLength ? 'text-emerald-700' : 'text-slate-500'">{{ next().length >= minLength ? '✓' : '•' }} Al menos {{ minLength }} caracteres; una frase es más fácil de recordar.</li>
              @for (p of problems(); track p) { <li class="text-amber-700">• {{ p }}</li> }
              @if (next2() && next() !== next2()) { <li class="text-amber-700">• Las dos contraseñas no coinciden.</li> }
            </ul>
            @if (error()) { <p class="text-xs text-rose-700 flex items-start gap-1" role="alert"><mat-icon class="text-sm shrink-0">error</mat-icon>{{ error() }}</p> }
            <div class="flex gap-2 pt-1">
              <button type="button" (click)="closed.emit()" class="flex-1 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">Cancelar</button>
              <button type="submit" [disabled]="busy() || !valid()"
                class="flex-1 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 cursor-pointer">
                {{ busy() ? 'Guardando…' : 'Guardar' }}
              </button>
            </div>
          </form>
        }
      </div>
    </div>
  `,
})
export class ChangePasswordDialog {
  readonly closed = output<void>();
  private readonly persistence = inject(PersistenceService);
  readonly email = this.persistence.sessionUser()?.email ?? '';
  private readonly name = this.persistence.sessionUser()?.name ?? '';
  readonly minLength = PASSWORD_MIN;

  readonly current = signal('');
  readonly next = signal('');
  readonly next2 = signal('');
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly done = signal(false);

  private readonly check = computed(() => checkPassword(this.next(), { email: this.email, name: this.name, previous: this.current() }));
  readonly problems = computed(() => (this.next() ? this.check().problems.filter(p => !p.startsWith('Debe tener al menos')) : []));
  readonly valid = computed(() => !!this.current() && this.check().ok && this.next() === this.next2());

  private readonly currentInput = viewChild<ElementRef<HTMLInputElement>>('currentInput');

  constructor() {
    afterNextRender(() => this.currentInput()?.nativeElement.focus());
  }

  async save() {
    if (!this.valid()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const resp = await apiFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: this.current(), newPassword: this.next() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.status === 429 || resp.status === 401) {
        this.closed.emit();
        void this.persistence.init();
        return;
      }
      if (!resp.ok) throw new Error(data?.error || 'No se pudo cambiar la contraseña.');
      this.current.set('');
      this.next.set('');
      this.next2.set('');
      this.done.set(true);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
