# Configuración de Notificaciones para Umbrales KRI (AlertSettingsModal)

Componente modal interactivo de nivel empresarial (`AlertSettingsModal`) para que los oficiales de riesgo y administradores configuren canales y preferencias de notificación automática (Correo Electrónico, SMS y Webhook) ante desviaciones o brechas de umbrales en Indicadores Clave de Riesgo (KRIs).

## User Review & Critical Decisions

> [!IMPORTANT]
> El usuario descartó las preguntas preliminares sin seleccionar opciones fijas. Por consiguiente, se adoptan las mejores prácticas de la industria financiera y de gestión de riesgos operacionales (Basilea III / ISO 31000):
> 1. **Canales Primarios Requeridos**: Correo Electrónico y SMS como canales centrales con conmutadores activos/inactivos, validación de formatos (RFC 5322 y E.164) y simulación de despacho.
> 2. **Canal Secundario de Alto Valor**: Opción complementaria de Webhook/API corporativa para integración con SIEM/SOC o sistemas de mensajería (Slack/Teams).
> 3. **Segmentación por Severidad & Frecuencia**: Notificaciones diferenciadas para Umbrales Preventivos (Amarillo) y Críticos (Rojo), con ventana de enfriamiento (cooldown) para mitigar tormentas de alertas.
> 4. **Alcance Global y Específico**: Capacidad de definir una política institucional por defecto o personalizar las alertas para un KRI individual.

---

## 1. Overview & Core Concept

- **Propósito**: Proporcionar una interfaz centralizada y accesible donde los usuarios configuren cómo, cuándo y a quién se envían las alertas cuando un KRI alcanza o supera sus límites tolerables.
- **Público Objetivo**: Oficiales de Riesgo (CRO), Auditores de Control Interno, Jefes de Operaciones, CISO y Administradores de Cumplimiento.
- **Valor Agregado**: Reduce la latencia de respuesta ante eventos de riesgo operacional mediante alertas inmediatas vía SMS a personal de guardia y correos detallados con contexto de mitigación y enlace al expediente.

---

## 2. User Experience & Visual Design

### A. Puntos de Entrada Intuitivos
1. **Pestaña Alertas & KRIs**: Botón principal `"Preferencias de Notificación"` con ícono `notifications_active` en la cabecera de la sección.
2. **Tarjeta de KRI Individual**: Botón con ícono de campana/configuración en cada tarjeta para ajustar las alertas de ese KRI puntual.
3. **Modal de Umbrales**: Acceso directo desde el editor de umbrales para sincronizar parámetros y canales en un solo flujo.

### B. Estructura y Ergonomía del Modal
- **Encabezado**: Título claro `"Configuración de Notificaciones de Alertas & KRIs"`, subtítulo descriptivo y selector de ámbito (Política Global vs. KRI específico).
- **Sección 1: Canales de Notificación (Email & SMS)**:
  - **Canal Correo Electrónico**:
    - Switch interactivo Activar/Desactivar (`emailEnabled`).
    - Campo de destinatarios (correos electrónicos separados por coma) con autocompletado del responsable asignado.
    - Plantilla de asunto y selector de formato (Resumen Ejecutivo vs. Ficha Técnica Completa).
    - Botón `"Probar Envío de Correo"` con previsualización del mensaje.
  - **Canal SMS de Alta Prioridad**:
    - Switch interactivo Activar/Desactivar (`smsEnabled`).
    - Campo para números telefónicos en formato internacional (+54, +52, +1, etc.).
    - Indicador visual de longitud de caracteres (máx. 160 caracteres estándar SMS).
    - Botón `"Probar Envío de SMS"` con simulación instantánea de recepción en pantalla.
  - **Canal Opcional Webhook / Integración**:
    - Switch opcional para enviar payload JSON a URL corporativa.
- **Sección 2: Reglas de Disparo y Severidad**:
  - Casillas para activar notificación en:
    - *Umbral Preventivo / Advertencia* (por defecto: Correo Electrónico).
    - *Umbral Crítico* (por defecto: Correo Electrónico + SMS urgente).
  - Selector de *Ventana de Silencio / Enfriamiento (Cooldown)*: 15 min, 30 min, 1 hora, 4 horas, 24 horas (evita saturación ante sensores de alta frecuencia).
- **Sección 3: Pie y Confirmación**:
  - Botón `"Restablecer Predeterminados"`.
  - Botón `"Cancelar"`.
  - Botón principal `"Guardar Preferencias"` que sella el cambio con hash criptográfico en la bitácora inalterable (ledger).

### C. Lenguaje Visual y Restricciones Anti-Slop
- Tipografía limpia con contraste WCAG AA (`text-slate-900`, `text-slate-500`, fondos `bg-white` y `bg-slate-50`).
- No se utilizan píldoras estáticas decorativas ni animaciones innecesarias; los conmutadores son botones funcionales con estados activos contrastados (`bg-slate-900` / `bg-emerald-600`).
- Previsualizaciones en vivo de los mensajes de correo y SMS formateados con datos reales del KRI seleccionado.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Configuración Global vs. Específica por KRI**:
  - *Enfoque*: Se implementa una configuración global predeterminada aplicable a todos los KRIs, con la posibilidad de seleccionar cualquier KRI individual para definir excepciones personalizadas.
  - *Razón*: Facilita una gobernanza rápida sin necesidad de configurar decenas de indicadores uno por uno, pero otorgando flexibilidad para KRIs críticos de ciberseguridad o tesorería.
- **Decisión 2: Simulación de Envío Integrada**:
  - *Enfoque*: Incorporar botones de prueba directa dentro del modal que muestran un toast y una ventana de inspección del payload enviado.
  - *Razón*: Permite al auditor u oficial validar que las direcciones y números configurados generan mensajes comprensibles y accionables antes de un evento real.
- **Decisión 3: Registro en el Ledger Criptográfico**:
  - *Enfoque*: Cada guardado de preferencias de notificación genera un bloque SHA-256 en la bitácora inalterable con la acción `CONFIGURACIÓN_NOTIFICACIONES`.
  - *Razón*: Cumple con las exigencias de auditabilidad y trazabilidad regulatoria de la plataforma.

---

## 4. Technical Architecture & Data Strategy

### Component & Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        App Root Component                              │
│                                                                        │
│   [layoutMode]  [activeTab]  [isAlertSettingsModalOpen]                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ triggers
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  app-alert-settings-modal                              │
│                                                                        │
│  ┌──────────────────────┐  ┌────────────────────────────────────────┐  │
│  │ KRI Scope Selector   │  │ Channels Form (Reactive Forms)         │  │
│  │ (Global vs Specific) │  │  • emailEnabled / emailRecipients      │  │
│  └──────────────────────┘  │  • smsEnabled / smsRecipients          │  │
│                            │  • webhookEnabled / webhookUrl         │  │
│  ┌──────────────────────┐  │  • notifyOnWarning / notifyOnCritical  │  │
│  │ Live SMS/Mail Preview│  │  • cooldownMinutes                     │  │
│  │ & Test Dispatch      │  └────────────────────────────────────────┘  │
│  └──────────────────────┘                                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ saves / updates
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        RiskDataService                                 │
│                                                                        │
│   • globalNotificationSettings (Signal<KriNotificationPreferences>)    │
│   • kriDefinitions (Signal<KriDefinition[]>)                           │
│   • updateKriNotificationPreferences(kriIdOrGlobal, preferences)       │
│   • testSendNotification(channel, payload)                             │
│   • appendAuditLog('CONFIGURACIÓN_NOTIFICACIONES', ...)               │
└────────────────────────────────────────────────────────────────────────┘
```

### Model Definitions (`src/app/models/risk.model.ts`)
```typescript
export interface KriNotificationPreferences {
  emailEnabled: boolean;
  emailRecipients: string[];
  emailTemplate: 'completa' | 'ejecutiva';
  smsEnabled: boolean;
  smsRecipients: string[];
  webhookEnabled: boolean;
  webhookUrl?: string;
  notifyOnWarning: boolean;
  notifyOnCritical: boolean;
  cooldownMinutes: number; // 0, 15, 30, 60, 240, 1440
  escalateToRiskOfficer: boolean;
}
```

### Action Handlers & State Updates
1. `openAlertSettings(kri?: KriDefinition)`: Abre el modal inicializado con las preferencias del KRI seleccionado o las preferencias globales.
2. `toggleChannel(channel: 'email' | 'sms' | 'webhook')`: Actualiza los controles reactivos del formulario y recalcula validaciones.
3. `testNotification(channel: 'email' | 'sms')`: Dispara una simulación inmediata con mensaje de confirmación visible y registro de prueba.
4. `savePreferences()`: Persiste en `RiskDataService`, sincroniza con el catálogo de KRIs y sella la operación en el ledger.
