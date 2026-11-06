import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { apiFetch } from '../services/persistence.service';
import { UserProfile } from '../models/risk.model';

interface AuthConfig { google: boolean; emailCode: 'true' | 'false' | 'admins'; domains: string[] }

/**
 * Acceso sin contraseña: el usuario ingresa su correo, recibe un código de
 * 6 dígitos y lo ingresa aquí. Se usa como pantalla inicial y, si la sesión
 * vence durante el trabajo, como ventana superpuesta.
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
            @if (cfg().emailCode === 'true') {
              <div class="flex items-center gap-2 text-[11px] text-slate-400"><span class="flex-1 h-px bg-slate-200"></span>o con un código por correo<span class="flex-1 h-px bg-slate-200"></span></div>
            } @else if (cfg().emailCode === 'admins' && !emergency()) {
              <p class="text-center pb-4"><button type="button" (click)="emergency.set(true)" class="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer">Acceso de emergencia (administradores)</button></p>
            }
          </div>
        }

        @if (!showCodeForm()) {
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
      </div>
    </div>
  `,
})
export class LoginScreen {
  /** true cuando se muestra sobre la aplicación porque la sesión venció. */
  readonly overlay = input(false);
  readonly presetEmail = input<string>('');
  readonly loggedIn = output<UserProfile>();

  readonly step = signal<'email' | 'code'>('email');
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
    return !c.google || c.emailCode === 'true' || (c.emailCode === 'admins' && this.emergency());
  }

  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
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
    void apiFetch('/api/auth/config').then(r => (r.ok ? r.json() : null)).then((c: AuthConfig | null) => { if (c) this.cfg.set(c); }).catch(() => undefined);
    afterNextRender(() => {
      if (this.presetEmail()) this.email.set(this.presetEmail());
      this.emailInput()?.nativeElement.focus();
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
