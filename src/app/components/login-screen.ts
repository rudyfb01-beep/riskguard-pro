import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { apiFetch } from '../services/persistence.service';
import { UserProfile } from '../models/risk.model';
import { checkPassword, PASSWORD_MIN } from '../utils/password';

interface AuthConfig { google: boolean; emailCode: 'true' | 'false' | 'admins'; domains: string[]; password?: boolean }

/**
 * Pantalla de acceso. Según la configuración del servidor: correo y contraseña (AUTH_PASSWORD=true,
 * con cambio obligatorio de la contraseña temporal), código de 6 dígitos por correo y/o Google.
 * Se usa como pantalla inicial y, si la sesión vence durante el trabajo, como ventana superpuesta.
 */
@Component({
  selector: 'app-login-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 no-print"
      [class]="overlay() ? 'bg-slate-900/60 backdrop-blur-xs' : 'bg-slate-100'">
      <div class="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div class="px-6 pt-6 pb-4 border-b border-slate-100">
          <div class="flex items-center gap-2.5">
            <span class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><mat-icon>shield</mat-icon></span>
            <div>
              <h1 class="text-base font-bold text-slate-900 leading-tight">RiskGuard Pro</h1>
              <p class="text-[11px] text-slate-500">Gestión de riesgo operacional</p>
            </div>
          </div>
          @if (overlay()) {
            <p class="mt-3 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
              Tu sesión venció. Vuelve a ingresar para seguir; tus cambios pendientes se guardarán al entrar.
            </p>
          }
        </div>

        @if (!loaded()) {
          <div class="p-8 flex justify-center"><span class="w-6 h-6 rounded-full border-2 border-slate-200 border-t-emerald-600 animate-spin" aria-label="Cargando"></span></div>
        } @else {
        @if (cfg().google && step() === 'email') {
          <div class="px-6 pt-6 space-y-3">
            <button type="button" (click)="google()" [disabled]="googleBusy()"
              class="w-full py-2.5 text-sm font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2 shadow-2xs">
              @if (googleBusy()) { <span class="w-4 h-4 rounded-full border-2 border-slate-300 border-t-slate-700 animate-spin"></span> }
              @else { <mat-icon class="text-lg text-slate-600">account_circle</mat-icon> }
              <span>{{ googleBusy() ? 'Esperando a Google…' : 'Continuar con Google' }}</span>
            </button>
            <p class="text-[11px] text-slate-500 text-center">
              @if (cfg().domains.length) { Con tu cuenta de {{ cfg().domains.join(' o ') }}. } @else { Con la cuenta de Google de tu organización. }
            </p>
            @if (error() && !showCodeForm()) { <p class="text-xs text-rose-700 flex items-start gap-1" role="alert"><mat-icon class="text-sm shrink-0">error</mat-icon>{{ error() }}</p> }
            @if (cfg().password) {
              <div class="flex items-center gap-2 text-[11px] text-slate-400"><span class="flex-1 h-px bg-slate-200"></span>o con tu correo y contraseña<span class="flex-1 h-px bg-slate-200"></span></div>
            } @else if (cfg().emailCode === 'true') {
              <div class="flex items-center gap-2 text-[11px] text-slate-400"><span class="flex-1 h-px bg-slate-200"></span>o con un código por correo<span class="flex-1 h-px bg-slate-200"></span></div>
            } @else if (cfg().emailCode === 'admins' && !emergency()) {
              <p class="text-center pb-4"><button type="button" (click)="emergency.set(true)" class="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer">Acceso de emergencia (administradores)</button></p>
            }
          </div>
        }

        @if (cfg().password && step() === 'change') {
          <form class="p-6 space-y-4" (submit)="$event.preventDefault(); changeTemporary()">
            <div class="text-xs text-slate-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
              Hola{{ changeName() ? ', ' + changeName() : '' }}. Estás usando una <strong>contraseña temporal</strong>: crea una propia para continuar.
            </div>
            <div>
              <label for="login-new" class="block text-xs font-semibold text-slate-700 mb-1">Contraseña nueva</label>
              <input #newInput id="login-new" [type]="showPw() ? 'text' : 'password'" autocomplete="new-password" required
                [value]="newPw()" (input)="newPw.set($any($event.target).value)"
                class="w-full text-sm rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label for="login-new2" class="block text-xs font-semibold text-slate-700 mb-1">Repite la contraseña nueva</label>
              <input id="login-new2" [type]="showPw() ? 'text' : 'password'" autocomplete="new-password" required
                [value]="newPw2()" (input)="newPw2.set($any($event.target).value)"
                class="w-full text-sm rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <label class="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                <input type="checkbox" [checked]="showPw()" (change)="showPw.set($any($event.target).checked)" /> Mostrar contraseñas
              </label>
            </div>
            <ul class="text-[11px] space-y-0.5" aria-live="polite">
              <li [class]="newPw().length >= minLength ? 'text-emerald-700' : 'text-slate-500'">{{ newPw().length >= minLength ? '✓' : '•' }} Al menos {{ minLength }} caracteres (una frase sirve: «lluvia sobre el puerto 2026»)</li>
              @for (p of newProblems(); track p) { <li class="text-amber-700">• {{ p }}</li> }
              @if (newPw2() && newPw() !== newPw2()) { <li class="text-amber-700">• Las dos contraseñas no coinciden.</li> }
            </ul>
            @if (error()) { <p class="text-xs text-rose-700 flex items-start gap-1" role="alert"><mat-icon class="text-sm shrink-0">error</mat-icon>{{ error() }}</p> }
            <button type="submit" [disabled]="busy() || !newValid()"
              class="w-full py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
              @if (busy()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
              <span>Guardar e ingresar</span>
            </button>
            <p class="text-center"><button type="button" (click)="backToEmail()" class="text-xs text-slate-600 hover:text-slate-900 cursor-pointer">← Volver</button></p>
          </form>
        } @else if (cfg().password) {
          <form class="p-6 space-y-4" [class.pt-3]="cfg().google" (submit)="$event.preventDefault(); passwordLogin()">
            <div>
              <label for="login-email" class="block text-xs font-semibold text-slate-700 mb-1">Correo electrónico</label>
              <input #emailInput id="login-email" type="email" autocomplete="username" required
                [value]="email()" (input)="email.set($any($event.target).value)"
                placeholder="nombre@cooperativa.cl"
                class="w-full text-sm rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label for="login-password" class="block text-xs font-semibold text-slate-700 mb-1">Contraseña</label>
              <input #passwordInput id="login-password" [type]="showPw() ? 'text' : 'password'" autocomplete="current-password" required
                [value]="password()" (input)="password.set($any($event.target).value)"
                class="w-full text-sm rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <div class="mt-1.5 flex items-center justify-between gap-2">
                <label class="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                  <input type="checkbox" [checked]="showPw()" (change)="showPw.set($any($event.target).checked)" /> Mostrar
                </label>
                <span class="text-[11px] text-slate-500 text-right">¿Primera vez u olvidaste la contraseña? Pide una temporal al administrador.</span>
              </div>
            </div>
            @if (error()) { <p class="text-xs text-rose-700 flex items-start gap-1" role="alert"><mat-icon class="text-sm shrink-0">error</mat-icon>{{ error() }}</p> }
            <button type="submit" [disabled]="busy() || !email().trim() || !password()"
              class="w-full py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
              @if (busy()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
              <span>Ingresar</span>
            </button>
          </form>
        } @else if (!showCodeForm()) {
          <div class="pb-2"></div>
        } @else if (step() === 'email') {
          <form class="p-6 space-y-4" [class.pt-3]="cfg().google" (submit)="$event.preventDefault(); requestCode()">
            <div>
              <label for="login-email" class="block text-xs font-semibold text-slate-700 mb-1">Correo electrónico</label>
              <input #emailInput id="login-email" type="email" autocomplete="email" required
                [value]="email()" (input)="email.set($any($event.target).value)"
                placeholder="nombre@cooperativa.cl"
                class="w-full text-sm rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <p class="text-[11px] text-slate-500 mt-1.5">Te enviaremos un código de acceso de 6 dígitos.</p>
            </div>
            @if (error()) { <p class="text-xs text-rose-700 flex items-start gap-1" role="alert"><mat-icon class="text-sm shrink-0">error</mat-icon>{{ error() }}</p> }
            <button type="submit" [disabled]="busy() || !email().trim()"
              class="w-full py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
              @if (busy()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
              <span>Enviarme un código</span>
            </button>
          </form>
        } @else {
          <form class="p-6 space-y-4" (submit)="$event.preventDefault(); verify()">
            <p class="text-xs text-slate-600">
              {{ info() }} <strong class="text-slate-900">{{ email() }}</strong>
            </p>
            <div>
              <label for="login-code" class="block text-xs font-semibold text-slate-700 mb-1">Código de acceso</label>
              <input #codeInput id="login-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
                [value]="code()" (input)="onCodeInput($event)"
                placeholder="••••••"
                class="w-full text-center text-2xl tracking-[0.5em] font-mono rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              <p class="text-[11px] text-slate-500 mt-1.5">Vence en 10 minutos. Revisa también la carpeta de correo no deseado. Si no llega en unos minutos, avisa al administrador del sistema.</p>
            </div>
            @if (error()) { <p class="text-xs text-rose-700 flex items-start gap-1" role="alert"><mat-icon class="text-sm shrink-0">error</mat-icon>{{ error() }}</p> }
            <button type="submit" [disabled]="busy() || code().length !== 6"
              class="w-full py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
              @if (busy()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
              <span>Ingresar</span>
            </button>
            <div class="flex items-center justify-between text-xs">
              <button type="button" (click)="backToEmail()" class="text-slate-600 hover:text-slate-900 cursor-pointer">← Usar otro correo</button>
              <button type="button" (click)="requestCode()" [disabled]="cooldown() > 0 || busy()"
                class="text-emerald-700 font-semibold hover:underline disabled:text-slate-400 disabled:no-underline cursor-pointer">
                {{ cooldown() > 0 ? 'Reenviar en ' + cooldown() + ' s' : 'Reenviar código' }}
              </button>
            </div>
          </form>
        }
        }
      </div>
    </div>
  `,
})
export class LoginScreen {
  /** true cuando se muestra sobre la aplicación porque la sesión venció. */
  readonly overlay = input(false);
  readonly presetEmail = input<string>('');
  readonly loggedIn = output<UserProfile>();

  readonly step = signal<'email' | 'code' | 'change'>('email');
  readonly loaded = signal(false);
  readonly password = signal('');
  readonly showPw = signal(false);
  readonly newPw = signal('');
  readonly newPw2 = signal('');
  readonly changeName = signal('');
  private ticket = '';
  readonly minLength = PASSWORD_MIN;
  readonly newProblems = computed(() => {
    const p = this.newPw();
    if (!p) return [];
    return checkPassword(p, { email: this.email(), name: this.changeName() }).problems.filter(x => !x.startsWith('Debe tener al menos'));
  });
  readonly newValid = computed(() => checkPassword(this.newPw(), { email: this.email(), name: this.changeName() }).ok && this.newPw() === this.newPw2());
  readonly email = signal('');
  readonly code = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal('');
  readonly cooldown = signal(0);
  readonly cfg = signal<AuthConfig>({ google: false, emailCode: 'true', domains: [] });
  readonly emergency = signal(false);
  readonly googleBusy = signal(false);
  /** El formulario de código se muestra si la política lo permite (o en acceso de emergencia). */
  showCodeForm() {
    const c = this.cfg();
    return !c.password && (!c.google || c.emailCode === 'true' || (c.emailCode === 'admins' && this.emergency()));
  }

  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  private readonly passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  private readonly newInput = viewChild<ElementRef<HTMLInputElement>>('newInput');
  private timer: ReturnType<typeof setInterval> | null = null;

  private popupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.timer) clearInterval(this.timer);
      if (this.popupTimer) clearInterval(this.popupTimer);
    });
    // Error devuelto por el ingreso con Google (?login_error=...): se muestra y se limpia la dirección.
    const q = new URLSearchParams(location.search);
    const loginError = q.get('login_error');
    if (loginError) {
      this.error.set(loginError.slice(0, 200));
      q.delete('login_error');
      q.delete('popup_login');
      history.replaceState(null, '', location.pathname + (q.toString() ? `?${q}` : ''));
    }
    void apiFetch('/api/auth/config').then(r => (r.ok ? r.json() : null)).then((c: AuthConfig | null) => { if (c) this.cfg.set(c); })
      .catch(() => undefined)
      .finally(() => {
        this.loaded.set(true);
        setTimeout(() => (this.presetEmail() && this.cfg().password ? this.passwordInput() : this.emailInput())?.nativeElement.focus());
      });
    afterNextRender(() => {
      if (this.presetEmail()) this.email.set(this.presetEmail());
    });
  }

  /**
   * Ingreso con Google. En la pantalla inicial se redirige; si la sesión venció en medio del
   * trabajo se usa una ventana emergente para no perder los cambios pendientes.
   */
  google() {
    this.error.set(null);
    const hint = this.email().trim() || this.presetEmail();
    const hintQ = hint ? `&hint=${encodeURIComponent(hint)}` : '';
    if (!this.overlay()) {
      this.googleBusy.set(true);
      location.href = `/api/auth/google/start?return=${encodeURIComponent(location.pathname + location.search)}${hintQ}`;
      return;
    }
    const w = window.open(`/api/auth/google/start?popup=1${hintQ}`, 'rg-google-login', 'width=520,height=680');
    if (!w) { this.error.set('El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio.'); return; }
    this.googleBusy.set(true);
    if (this.popupTimer) clearInterval(this.popupTimer);
    this.popupTimer = setInterval(async () => {
      const resp = await apiFetch('/api/auth/me').catch(() => null);
      if (resp?.ok) {
        const data = await resp.json().catch(() => null);
        if (data?.user) {
          clearInterval(this.popupTimer!);
          this.popupTimer = null;
          this.googleBusy.set(false);
          try { w.close(); } catch { /* ya cerrada */ }
          this.loggedIn.emit(data.user as UserProfile);
          return;
        }
      }
      if (w.closed) {
        clearInterval(this.popupTimer!);
        this.popupTimer = null;
        this.googleBusy.set(false);
      }
    }, 1500);
  }

  async passwordLogin() {
    this.busy.set(true);
    this.error.set(null);
    try {
      const resp = await apiFetch('/api/auth/password-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email().trim(), password: this.password() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'No se pudo iniciar sesión.');
      this.password.set('');
      if (data.mustChange) {
        this.ticket = data.ticket;
        this.changeName.set(data.name ?? '');
        this.newPw.set('');
        this.newPw2.set('');
        this.step.set('change');
        setTimeout(() => this.newInput()?.nativeElement.focus());
        return;
      }
      this.loggedIn.emit(data.user as UserProfile);
    } catch (err) {
      this.error.set((err as Error).message);
      this.password.set('');
      this.passwordInput()?.nativeElement.focus();
    } finally {
      this.busy.set(false);
    }
  }

  async changeTemporary() {
    if (!this.newValid()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const resp = await apiFetch('/api/auth/password-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket: this.ticket, newPassword: this.newPw() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 401) this.backToEmail();
        throw new Error(data?.error || 'No se pudo guardar la contraseña.');
      }
      this.ticket = '';
      this.newPw.set('');
      this.newPw2.set('');
      this.loggedIn.emit(data.user as UserProfile);
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async requestCode() {
    this.busy.set(true);
    this.error.set(null);
    try {
      const resp = await apiFetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email().trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'No se pudo solicitar el código.');
      this.info.set('Si el correo está registrado, enviamos un código a');
      this.step.set('code');
      this.code.set('');
      this.startCooldown(60);
      setTimeout(() => this.codeInput()?.nativeElement.focus());
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  async verify() {
    if (this.code().length !== 6) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const resp = await apiFetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email().trim(), code: this.code() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || 'No se pudo verificar el código.');
      this.loggedIn.emit(data.user as UserProfile);
    } catch (err) {
      this.error.set((err as Error).message);
      this.code.set('');
      this.codeInput()?.nativeElement.focus();
    } finally {
      this.busy.set(false);
    }
  }

  onCodeInput(e: Event) {
    const el = e.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, 6);
    el.value = digits;
    this.code.set(digits);
    if (digits.length === 6 && !this.busy()) this.verify();
  }

  backToEmail() {
    this.step.set('email');
    this.error.set(null);
    this.code.set('');
    this.ticket = '';
    this.newPw.set('');
    this.newPw2.set('');
  }

  private startCooldown(seconds: number) {
    this.cooldown.set(seconds);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.cooldown.update(s => Math.max(0, s - 1));
      if (this.cooldown() === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 1000);
  }
}
