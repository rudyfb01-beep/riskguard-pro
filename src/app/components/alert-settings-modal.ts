import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { KriDefinition, KriNotificationPreferences } from '../models/risk.model';

@Component({
  selector: 'app-alert-settings-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-200 flex flex-col">
        
        <!-- Modal Header -->
        <div class="sticky top-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
              <mat-icon class="text-xl">notifications_active</mat-icon>
            </div>
            <div>
              <h2 class="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Preferencias de Notificación de Alertas & KRIs
              </h2>
              <p class="text-xs text-slate-500">
                Canales de notificación inmediata por Correo Electrónico y SMS ante brechas de umbral
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

        <!-- Modal Body Form -->
        <form [formGroup]="settingsForm" (ngSubmit)="onSave()" class="p-6 space-y-6 flex-1">

          <!-- Scope Selector: Global vs KRI Específico -->
          <div class="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span class="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <mat-icon class="text-sm text-indigo-600">tune</mat-icon>
                  <span>Ámbito de la Configuración</span>
                </span>
                <p class="text-xs text-slate-500 mt-0.5">
                  Define si estas preferencias aplican a todos los indicadores o a un KRI en particular
                </p>
              </div>

              <div class="flex items-center gap-2">
                <select
                  [value]="selectedScope()"
                  (change)="onScopeChange($event)"
                  class="bg-white border border-slate-300 text-slate-800 text-xs font-medium rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                >
                  <option value="GLOBAL">Política Global (Todos los KRIs)</option>
                  <optgroup label="KRIs Activos en Catálogo">
                    @for (k of riskService.kriDefinitions(); track k.id) {
                      <option [value]="k.id">{{ k.code }} - {{ k.name }}</option>
                    }
                  </optgroup>
                </select>
              </div>
            </div>

            <!-- Active Target Info Summary -->
            <div class="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-slate-900">
                  {{ selectedScope() === 'GLOBAL' ? 'Norma Institucional por Defecto' : 'Personalización Individual:' }}
                </span>
                @if (selectedKri(); as k) {
                  <span class="font-mono text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    {{ k.code }}
                  </span>
                  <span class="truncate max-w-xs text-slate-700">{{ k.name }}</span>
                } @else {
                  <span class="text-slate-500">Aplica a los {{ riskService.kriDefinitions().length }} KRIs activos</span>
                }
              </div>

              <span class="text-[11px] text-slate-500 hidden sm:inline">
                Sujeto a auditoría ISO 31000
              </span>
            </div>
          </div>

          <!-- Section Switcher Tabs: Canales, Reglas y Previsualización -->
          <div class="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              (click)="activeSection.set('channels')"
              [class]="activeSection() === 'channels'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'"
              class="px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <mat-icon class="text-sm">mark_email_read</mat-icon>
              <span>Canales (Email & SMS)</span>
            </button>

            <button
              type="button"
              (click)="activeSection.set('rules')"
              [class]="activeSection() === 'rules'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'"
              class="px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <mat-icon class="text-sm">rule</mat-icon>
              <span>Criterios & Cooldown</span>
            </button>

            <button
              type="button"
              (click)="activeSection.set('preview')"
              [class]="activeSection() === 'preview'
                ? 'bg-slate-900 text-white font-semibold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'"
              class="px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <mat-icon class="text-sm">visibility</mat-icon>
              <span>Previsualización & Prueba</span>
            </button>
          </div>

          <!-- TAB 1: CANALES (EMAIL & SMS) -->
          @if (activeSection() === 'channels') {
            <div class="space-y-6">

              <!-- CANAL 1: CORREO ELECTRÓNICO -->
              <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-4">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center shrink-0">
                      <mat-icon class="text-lg">mail</mat-icon>
                    </div>
                    <div>
                      <div class="flex items-center gap-2">
                        <h3 class="text-sm font-bold text-slate-900">Alertas por Correo Electrónico</h3>
                        <span
                          [class]="settingsForm.get('emailEnabled')?.value ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-100 border-slate-200'"
                          class="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                        >
                          {{ settingsForm.get('emailEnabled')?.value ? 'Canal Activo' : 'Canal Inactivo' }}
                        </span>
                      </div>
                      <p class="text-xs text-slate-500">
                        Envío de notificación formal con ficha técnica de la anomalía, contexto de proceso y acciones requeridas
                      </p>
                    </div>
                  </div>

                  <!-- Toggle Button -->
                  <button
                    type="button"
                    (click)="toggleControl('emailEnabled')"
                    [class]="settingsForm.get('emailEnabled')?.value ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'"
                    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    role="switch"
                    [attr.aria-checked]="settingsForm.get('emailEnabled')?.value"
                  >
                    <span
                      [class]="settingsForm.get('emailEnabled')?.value ? 'translate-x-5' : 'translate-x-0'"
                      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                    ></span>
                  </button>
                </div>

                @if (settingsForm.get('emailEnabled')?.value) {
                  <div class="space-y-3 pt-3 border-t border-slate-100">
                    <div>
                      <label for="email-recipients-input" class="block text-xs font-semibold text-slate-700 mb-1">
                        Destinatarios de Correo (Separados por coma o salto de línea)
                      </label>
                      <textarea
                        id="email-recipients-input"
                        formControlName="emailRecipients"
                        rows="2"
                        placeholder="ej: oficial.riesgo@cooperativa.cl, soc@cooperativa.cl"
                        class="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      ></textarea>
                      <span class="text-[11px] text-slate-400">
                        Además de estas direcciones, el aviso llega siempre a quienes atienden alertas en la aplicación (bandeja y correo).
                      </span>
                      @if (channels() && !channels()!.email) {
                        <p class="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">El servidor no tiene SMTP configurado: los avisos quedan solo en la bandeja.</p>
                      }
                    </div>

                    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                      <div>
                        <label for="email-template-select" class="block text-xs font-semibold text-slate-700 mb-0.5">Formato del Correo</label>
                        <select
                          id="email-template-select"
                          formControlName="emailTemplate"
                          class="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="completa">Completo (incluye la descripción de la alerta)</option>
                          <option value="ejecutiva">Resumen (solo indicador, valor y umbral)</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        (click)="onTestDispatch('email')"
                        [disabled]="isTestingChannel()"
                        class="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <mat-icon class="text-sm">send</mat-icon>
                        <span>Probar Envío de Correo</span>
                      </button>
                    </div>
                  </div>
                }
              </div>

              <!-- CANAL 2: SMS URGENTE (MENSAJES DE TEXTO MÓVIL) -->
              <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-4">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                      <mat-icon class="text-lg">sms</mat-icon>
                    </div>
                    <div>
                      <div class="flex items-center gap-2">
                        <h3 class="text-sm font-bold text-slate-900">Alertas por SMS (Mensajería Móvil de Guardia)</h3>
                        <span
                          [class]="settingsForm.get('smsEnabled')?.value ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-slate-500 bg-slate-100 border-slate-200'"
                          class="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                        >
                          {{ settingsForm.get('smsEnabled')?.value ? 'Canal Activo' : 'Canal Inactivo' }}
                        </span>
                      </div>
                      <p class="text-xs text-slate-500">
                        SMS a teléfonos de guardia mediante la pasarela de SMS de la cooperativa
                      </p>
                      @if (channels() && !channels()!.sms) {
                        <p class="mt-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">Requiere configurar una pasarela de SMS en el servidor (SMS_GATEWAY_URL). Mientras tanto no se envían SMS.</p>
                      }
                    </div>
                  </div>

                  <!-- Toggle Button -->
                  <button
                    type="button"
                    (click)="toggleControl('smsEnabled')"
                    [class]="settingsForm.get('smsEnabled')?.value ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'"
                    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    role="switch"
                    [attr.aria-checked]="settingsForm.get('smsEnabled')?.value"
                  >
                    <span
                      [class]="settingsForm.get('smsEnabled')?.value ? 'translate-x-5' : 'translate-x-0'"
                      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                    ></span>
                  </button>
                </div>

                @if (settingsForm.get('smsEnabled')?.value) {
                  <div class="space-y-3 pt-3 border-t border-slate-100">
                    <div>
                      <label for="sms-recipients-input" class="block text-xs font-semibold text-slate-700 mb-1">
                        Teléfonos Móviles de Guardia (Formato internacional E.164, separados por coma)
                      </label>
                      <input
                        id="sms-recipients-input"
                        type="text"
                        formControlName="smsRecipients"
                        placeholder="ej: +56 9 1234 5678, +56 9 8765 4321"
                        class="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <div class="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                        <span>Recomendado para responsables de operaciones críticas y oficiales de ciberseguridad.</span>
                        <span class="font-mono text-slate-600">{{ smsPreviewLength() }}/160 caracteres estándar</span>
                      </div>
                    </div>

                    <div class="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        (click)="onTestDispatch('sms')"
                        [disabled]="isTestingChannel()"
                        class="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <mat-icon class="text-sm">textsms</mat-icon>
                        <span>Probar Envío de SMS</span>
                      </button>
                    </div>
                  </div>
                }
              </div>

              <!-- CANAL 3: WEBHOOK CORPORATIVO (OPCIONAL ENTERPRISE) -->
              <div class="border border-slate-200 rounded-xl p-4 bg-white shadow-2xs space-y-4">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 border border-slate-300 flex items-center justify-center shrink-0">
                      <mat-icon class="text-lg">webhook</mat-icon>
                    </div>
                    <div>
                      <div class="flex items-center gap-2">
                        <h3 class="text-sm font-bold text-slate-900">Integración Webhook / SIEM / Teams / Slack</h3>
                        <span
                          [class]="settingsForm.get('webhookEnabled')?.value ? 'text-indigo-700 bg-indigo-50 border-indigo-200' : 'text-slate-500 bg-slate-100 border-slate-200'"
                          class="text-[10px] font-semibold px-2 py-0.5 rounded-full border"
                        >
                          {{ settingsForm.get('webhookEnabled')?.value ? 'Activo' : 'Opcional / Desactivado' }}
                        </span>
                      </div>
                      <p class="text-xs text-slate-500">
                        Envío de payload JSON automatizado a sistemas de telemetría, SOC o canales de mensajería empresarial
                      </p>
                    </div>
                  </div>

                  <!-- Toggle Button -->
                  <button
                    type="button"
                    (click)="toggleControl('webhookEnabled')"
                    [class]="settingsForm.get('webhookEnabled')?.value ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'"
                    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    role="switch"
                    [attr.aria-checked]="settingsForm.get('webhookEnabled')?.value"
                  >
                    <span
                      [class]="settingsForm.get('webhookEnabled')?.value ? 'translate-x-5' : 'translate-x-0'"
                      class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out"
                    ></span>
                  </button>
                </div>

                @if (settingsForm.get('webhookEnabled')?.value) {
                  <div class="space-y-3 pt-3 border-t border-slate-100">
                    <div>
                      <label for="webhook-url-input" class="block text-xs font-semibold text-slate-700 mb-1">
                        Endpoint URL (HTTPS Seguro)
                      </label>
                      <input
                        id="webhook-url-input"
                        type="url"
                        formControlName="webhookUrl"
                        placeholder="https://siem.cooperativa.cl/api/kri-events"
                        class="w-full text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                      <span class="text-[11px] text-slate-400">Se envía un POST con JSON (código, severidad, KRI, valor, umbral, proceso y texto). Solo direcciones https públicas.</span>
                    </div>
                    <div class="flex items-center justify-end pt-1">
                      <button
                        type="button"
                        (click)="onTestDispatch('webhook')"
                        [disabled]="isTestingChannel()"
                        class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <mat-icon class="text-sm">send</mat-icon>
                        <span>Probar webhook</span>
                      </button>
                    </div>
                  </div>
                }
              </div>

            </div>
          }

          <!-- TAB 2: CRITERIOS DE DISPARO & COOLDOWN -->
          @if (activeSection() === 'rules') {
            <div class="space-y-5">
              
              <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
                <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <mat-icon class="text-base text-indigo-600">tune</mat-icon>
                  <span>Eventos de Disparo de Alerta</span>
                </h3>

                <div class="space-y-3">
                  <label class="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      formControlName="notifyOnCritical"
                      class="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span class="text-xs font-bold text-slate-900 block">
                        Disparar en Umbral Crítico (Brecha Roja)
                      </span>
                      <span class="text-[11px] text-slate-500 block">
                        Avisa por los canales activos cuando el KRI supera el umbral crítico.
                      </span>
                    </div>
                  </label>

                  <label class="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      formControlName="notifyOnWarning"
                      class="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span class="text-xs font-bold text-slate-900 block">
                        Disparar en Umbral Preventivo / Advertencia (Zona Amarilla)
                      </span>
                      <span class="text-[11px] text-slate-500 block">
                        Avisa también cuando el KRI entra en la zona de advertencia.
                      </span>
                    </div>
                  </label>

                  <label class="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      formControlName="escalateToRiskOfficer"
                      class="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <div>
                      <span class="text-xs font-bold text-slate-900 block">
                        Copia a quienes gestionan riesgos
                      </span>
                      <span class="text-[11px] text-slate-500 block">
                        Agrega como destinatarios a los usuarios con permiso para editar riesgos.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Cooldown / Anti-Storm Rate Limiting -->
              <div class="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <mat-icon class="text-base text-amber-600">timer</mat-icon>
                    <span>Ventana de Enfriamiento (Anti-Tormenta de Alertas)</span>
                  </h3>
                  <span class="text-xs font-mono text-slate-500">
                    {{ settingsForm.get('cooldownMinutes')?.value }} minutos
                  </span>
                </div>

                <p class="text-xs text-slate-500">
                  Tiempo mínimo que debe transcurrir entre notificaciones consecutivas del mismo KRI para evitar spam ante sensores o métricas de alta frecuencia.
                </p>

                <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                  @for (opt of cooldownOptions; track opt.value) {
                    <button
                      type="button"
                      (click)="settingsForm.get('cooldownMinutes')?.setValue(opt.value)"
                      [class]="settingsForm.get('cooldownMinutes')?.value === opt.value
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium'"
                      class="py-2 px-3 rounded-lg text-xs transition-colors text-center cursor-pointer"
                    >
                      {{ opt.label }}
                    </button>
                  }
                </div>
              </div>

            </div>
          }

          <!-- TAB 3: PREVISUALIZACIÓN DE MENSAJES & SIMULACIÓN EN VIVO -->
          @if (activeSection() === 'preview') {
            <div class="space-y-5">
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <!-- Email Preview Card -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div class="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span class="flex items-center gap-1.5">
                      <mat-icon class="text-sm text-indigo-600">email</mat-icon>
                      <span>Vista previa del correo</span>
                    </span>
                    <span class="font-mono text-[10px] text-slate-400">HTML / UTF-8</span>
                  </div>

                  <div class="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-2 shadow-2xs font-sans">
                    <div class="text-[11px] text-slate-500 border-b border-slate-100 pb-1.5">
                      <div><strong>Para:</strong> {{ firstEmailRecipient() }}</div>
                      <div><strong>Asunto:</strong> {{ emailSubjectPreview() }}</div>
                    </div>
                    <div class="text-slate-800 space-y-1.5 text-[11px] leading-relaxed">
                      <p><strong>RISKGUARD PRO - NOTIFICACIÓN DE DESVIACIÓN KRI</strong></p>
                      <p>Se ha registrado un evento de tolerancia en el indicador clave <strong>{{ targetKriCode() }}</strong> perteneciente al proceso <strong>{{ targetKriProcess() }}</strong>.</p>
                      <div class="bg-slate-50 p-2 rounded border border-slate-200 font-mono text-[10px] space-y-0.5">
                        <div>Métrica Actual: <span class="text-rose-700 font-bold">{{ targetKriValue() }}</span></div>
                        <div>Límite Crítico: {{ targetKriThreshold() }}</div>
                        <div>Responsable: {{ targetKriResponsible() }}</div>
                      </div>
                      <p class="text-[10px] text-slate-500 italic">
                        Enviado por RiskGuard Pro al registrar una lectura fuera de umbral. Ingrese a Alertas & KRIs para gestionarla.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    (click)="onTestDispatch('email')"
                    [disabled]="isTestingChannel()"
                    class="w-full py-2 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <mat-icon class="text-sm">send</mat-icon>
                    <span>Enviar Correo de Prueba Ahora</span>
                  </button>
                </div>

                <!-- SMS Mobile Preview Card -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div class="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span class="flex items-center gap-1.5">
                      <mat-icon class="text-sm text-emerald-600">phone_android</mat-icon>
                      <span>Vista previa del SMS</span>
                    </span>
                    <span class="font-mono text-[10px] text-slate-400">{{ smsPreviewLength() }}/160 caracteres</span>
                  </div>

                  <!-- Smartphone SMS Bubble Frame -->
                  <div class="bg-white border border-slate-200 rounded-lg p-3 text-xs shadow-2xs font-sans min-h-[160px] flex flex-col justify-between">
                    <div class="text-[10px] text-slate-400 font-mono border-b border-slate-100 pb-1">
                      Destinatario: {{ firstSmsRecipient() }}
                    </div>

                    <div class="my-3 self-start max-w-[90%] bg-emerald-50 text-emerald-950 border border-emerald-200 p-2.5 rounded-xl rounded-tl-none text-[11px] font-sans leading-relaxed shadow-2xs">
                      {{ smsMessagePreview() }}
                    </div>

                    <div class="text-[9px] text-slate-400 text-right font-mono">
                      Pasarela de SMS configurada en el servidor
                    </div>
                  </div>

                  <button
                    type="button"
                    (click)="onTestDispatch('sms')"
                    [disabled]="isTestingChannel()"
                    class="w-full py-2 text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <mat-icon class="text-sm">textsms</mat-icon>
                    <span>Enviar SMS de Prueba Ahora</span>
                  </button>
                </div>

              </div>

            </div>
          }

              <!-- Test Result Notification Banner -->
          @if (testFeedback(); as fb) {
            <div class="p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs animate-in fade-in duration-200"
              [class]="fb.success ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-rose-50 text-rose-900 border-rose-200'"
            >
              <div class="flex items-center gap-2">
                <mat-icon class="text-base" [class.text-emerald-600]="fb.success" [class.text-rose-600]="!fb.success">
                  {{ fb.success ? 'check_circle' : 'error' }}
                </mat-icon>
                <span>{{ fb.message }}</span>
              </div>
              <span class="text-[10px] font-mono text-slate-500">{{ fb.timestamp }}</span>
            </div>
          }

          <!-- Footer Actions Bar -->
          <div class="pt-4 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              (click)="resetToDefaults()"
              class="w-full sm:w-auto px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Restablecer Valores Predeterminados
            </button>

            <div class="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                (click)="closeModal.emit()"
                class="flex-1 sm:flex-none px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>

              <button
                type="submit"
                [disabled]="isSaving()"
                class="flex-1 sm:flex-none px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <mat-icon class="text-sm">save</mat-icon>
                <span>Guardar Preferencias</span>
              </button>
            </div>
          </div>

        </form>

      </div>
    </div>
  `
})
export class AlertSettingsModal implements OnInit {
  readonly riskService = inject(RiskDataService);
  private readonly fb = inject(FormBuilder);

  // Optional KRI input if opened for a specific KRI
  readonly initialKri = input<KriDefinition | null>(null);

  // Modal outputs
  readonly closeModal = output<void>();
  readonly preferencesSaved = output<KriNotificationPreferences>();

  // Scope selection: 'GLOBAL' or kri.id
  readonly selectedScope = signal<string>('GLOBAL');

  // Active section tab
  readonly activeSection = signal<'channels' | 'rules' | 'preview'>('channels');

  // Status flags
  readonly isSaving = signal<boolean>(false);
  readonly isTestingChannel = signal<boolean>(false);
  readonly testFeedback = signal<{ success: boolean; message: string; timestamp: string } | null>(null);

  // Cooldown preset options
  readonly cooldownOptions = [
    { label: 'Inmediato (0m)', value: 0 },
    { label: '15 minutos', value: 15 },
    { label: '30 minutos', value: 30 },
    { label: '1 hora', value: 60 },
    { label: '24 horas', value: 1440 }
  ];

  // Form Group
  readonly settingsForm = this.fb.group({
    emailEnabled: [true],
    emailRecipients: [''],
    emailTemplate: ['completa'],
    smsEnabled: [false],
    smsRecipients: [''],
    webhookEnabled: [false],
    webhookUrl: [''],
    notifyOnWarning: [true],
    notifyOnCritical: [true],
    cooldownMinutes: [30],
    escalateToRiskOfficer: [true]
  });

  // Selected KRI computed
  readonly selectedKri = computed(() => {
    const scope = this.selectedScope();
    // Global: la vista previa usa el primer KRI como ejemplo.
    if (scope === 'GLOBAL') return this.riskService.kriDefinitions()[0] ?? null;
    return this.riskService.kriDefinitions().find(k => k.id === scope) || null;
  });

  /** Canales disponibles en el servidor (null si no se pudo consultar). */
  readonly channels = signal<{ email: boolean; sms: boolean; webhook: boolean } | null>(null);

  // Preview properties
  readonly targetKriCode = computed(() => this.selectedKri()?.code || 'KRI');
  readonly targetKriName = computed(() => this.selectedKri()?.name || 'Indicador');
  readonly targetKriProcess = computed(() => this.selectedKri()?.process || '—');
  readonly targetKriValue = computed(() => {
    const k = this.selectedKri();
    return k ? `${k.currentValue} ${k.unit}` : '—';
  });
  readonly targetKriThreshold = computed(() => {
    const k = this.selectedKri();
    return k ? `${k.direction === 'superior' ? '>=' : '<='} ${k.criticalThreshold} ${k.unit}` : '—';
  });
  readonly targetKriResponsible = computed(() => this.selectedKri()?.responsible || '—');

  readonly emailSubjectPreview = computed(() => {
    return `[ALERTA CRÍTICA] Desviación en ${this.targetKriCode()} - ${this.targetKriName()}`;
  });

  readonly smsMessagePreview = computed(() => {
    return `[RISKGUARD PRO] ALERTA KRI: ${this.targetKriCode()} sobrepasó umbral crítico (${this.targetKriValue()}). Proceso: ${this.targetKriProcess()}. Ingrese a consola.`;
  });

  readonly smsPreviewLength = computed(() => this.smsMessagePreview().length);

  readonly firstSmsRecipient = computed(() => {
    const raw = this.settingsForm.get('smsRecipients')?.value;
    return raw?.split(/[,\n]/)[0]?.trim() || '(sin teléfonos)';
  });

  readonly firstEmailRecipient = computed(() => {
    const raw = this.settingsForm.get('emailRecipients')?.value;
    return raw?.split(/[,\n]/)[0]?.trim() || 'Quienes atienden alertas';
  });

  ngOnInit() {
    void this.riskService.notificationChannels().then(c => this.channels.set(c));
    const initKri = this.initialKri();
    if (initKri) {
      this.selectedScope.set(initKri.id);
      this.loadPreferencesForScope(initKri.id);
    } else {
      this.selectedScope.set('GLOBAL');
      this.loadPreferencesForScope('GLOBAL');
    }
  }

  onScopeChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedScope.set(val);
    this.loadPreferencesForScope(val);
  }

  loadPreferencesForScope(scope: string) {
    if (scope === 'GLOBAL') {
      const global = this.riskService.globalNotificationSettings();
      this.patchFormWithPreferences(global);
    } else {
      const kri = this.riskService.kriDefinitions().find(k => k.id === scope);
      if (kri && kri.notificationPreferences) {
        this.patchFormWithPreferences(kri.notificationPreferences);
      } else {
        // Fallback to global defaults with KRI responsible email prefilled if available
        const global = this.riskService.globalNotificationSettings();
        this.patchFormWithPreferences(global);
      }
    }
  }

  private patchFormWithPreferences(prefs: KriNotificationPreferences) {
    this.settingsForm.patchValue({
      emailEnabled: prefs.emailEnabled,
      emailRecipients: prefs.emailRecipients.join(', '),
      emailTemplate: prefs.emailTemplate || 'completa',
      smsEnabled: prefs.smsEnabled,
      smsRecipients: prefs.smsRecipients.join(', '),
      webhookEnabled: prefs.webhookEnabled || false,
      webhookUrl: prefs.webhookUrl || '',
      notifyOnWarning: prefs.notifyOnWarning,
      notifyOnCritical: prefs.notifyOnCritical,
      cooldownMinutes: prefs.cooldownMinutes,
      escalateToRiskOfficer: prefs.escalateToRiskOfficer
    });
  }

  toggleControl(controlName: string) {
    const ctrl = this.settingsForm.get(controlName);
    if (ctrl) {
      ctrl.setValue(!ctrl.value);
    }
  }

  resetToDefaults() {
    const global = this.riskService.globalNotificationSettings();
    this.patchFormWithPreferences(global);
    this.testFeedback.set({
      success: true,
      message: 'Preferencias restauradas a los valores por defecto del sistema.',
      timestamp: new Date().toLocaleTimeString()
    });
  }

  async onTestDispatch(channel: 'email' | 'sms' | 'webhook') {
    const first = (v: string | null | undefined) => (v || '').split(/[,\n]/).map(x => x.trim()).find(Boolean) || '';
    const recipient = channel === 'email' ? first(this.settingsForm.get('emailRecipients')?.value)
      : channel === 'sms' ? first(this.settingsForm.get('smsRecipients')?.value)
      : (this.settingsForm.get('webhookUrl')?.value || '').trim();
    if (!recipient) {
      this.testFeedback.set({
        success: false, timestamp: new Date().toLocaleTimeString(),
        message: channel === 'email' ? 'Escriba al menos un correo destinatario para la prueba.' : channel === 'sms' ? 'Escriba al menos un teléfono para la prueba.' : 'Escriba la URL del webhook.',
      });
      return;
    }
    this.isTestingChannel.set(true);
    try {
      this.testFeedback.set(await this.riskService.testSendNotification(channel, this.targetKriCode(), recipient));
    } catch (err) {
      this.testFeedback.set({ success: false, message: (err as Error).message || `Error al enviar la prueba por ${channel}`, timestamp: new Date().toLocaleTimeString() });
    } finally {
      this.isTestingChannel.set(false);
    }
  }

  async onSave() {
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }

    this.isSaving.set(true);
    const formVal = this.settingsForm.value;

    const emailRecipientsArray = (formVal.emailRecipients || '')
      .split(/[,\n]/)
      .map((e: string) => e.trim())
      .filter((e: string) => e.length > 0);

    const smsRecipientsArray = (formVal.smsRecipients || '')
      .split(/[,\n]/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    const bad = emailRecipientsArray.find((e: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    const webhook = (formVal.webhookUrl || '').trim();
    const error = bad ? `Correo no válido: ${bad}`
      : formVal.smsEnabled && !smsRecipientsArray.length ? 'Escriba al menos un teléfono o desactive el SMS.'
      : formVal.webhookEnabled && !/^https:\/\/\S+$/.test(webhook) ? 'El webhook debe ser una dirección https://.'
      : null;
    if (error) {
      this.isSaving.set(false);
      this.testFeedback.set({ success: false, message: error, timestamp: new Date().toLocaleTimeString() });
      return;
    }

    const preferences: KriNotificationPreferences = {
      emailEnabled: !!formVal.emailEnabled,
      emailRecipients: emailRecipientsArray,
      emailTemplate: (formVal.emailTemplate as 'completa' | 'ejecutiva') || 'completa',
      smsEnabled: !!formVal.smsEnabled,
      smsRecipients: smsRecipientsArray,
      webhookEnabled: !!formVal.webhookEnabled,
      webhookUrl: webhook,
      notifyOnWarning: !!formVal.notifyOnWarning,
      notifyOnCritical: !!formVal.notifyOnCritical,
      cooldownMinutes: Number(formVal.cooldownMinutes ?? 30),
      escalateToRiskOfficer: !!formVal.escalateToRiskOfficer
    };

    try {
      await this.riskService.updateNotificationPreferences(this.selectedScope(), preferences);
      this.preferencesSaved.emit(preferences);
      this.closeModal.emit();
    } finally {
      this.isSaving.set(false);
    }
  }
}
