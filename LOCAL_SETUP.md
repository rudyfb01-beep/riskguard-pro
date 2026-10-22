# Guía de instalación — RiskGuard Pro

Aplicación de gestión de riesgo operacional para cooperativas de ahorro y crédito:
Angular 21 en el navegador, servidor Express (Node 22) y PostgreSQL 16.

## Cómo se guardan los datos

- Todo lo que se registra en pantalla se guarda en **PostgreSQL** a través de la API del
  servidor. El indicador de la esquina inferior izquierda muestra "Guardando…", "Guardado" o un
  error con el botón **Reintentar**.
- Al arrancar, el servidor **aplica `database/schema.sql` automáticamente**. El script es
  idempotente, así que también actualiza bases creadas con versiones anteriores.
- En una base vacía se cargan los **datos base**: los cargos de gobierno cooperativo, los plazos
  regulatorios CMF/ANCI y un usuario administrador.
- Con `SEED_DEMO_DATA=true` se cargan además los **datos de ejemplo ficticios** (riesgos,
  incidentes, proveedores, etc.), útiles para evaluar la aplicación.
- Sin `DATABASE_URL` la aplicación funciona en **modo demostración**: muestra datos de ejemplo y
  avisa que los cambios se pierden al recargar.
- La bitácora inalterable la encadena el **servidor**: asigna el número de bloque, la hora y el
  hash SHA-256, y serializa las escrituras simultáneas para que la cadena no se bifurque.

## Opción 1: Docker Compose (recomendada)

Requisito: Docker Desktop 20+.

```bash
git clone https://github.com/rudyfb01-beep/riskguard-pro
cd riskguard-pro
docker compose up -d --build
```

- Aplicación: http://localhost:3000
- Adminer (consultas SQL): http://localhost:8080 — servidor `postgres`, usuario `postgres`,
  contraseña `postgrespassword`, base `custodia_risk`.

Para entrar con los datos de ejemplo, escribe `elena.vasconcelos@demo.riskguard.cl` y busca el
código en `docker compose logs app` (sin SMTP configurado, los códigos se escriben ahí; ver
[Inicio de sesión](#inicio-de-sesión)). Las bases creadas antes del 22-10-2026 conservan los correos de ejemplo
anteriores, terminados en `@custodia-risk.com`.

Por defecto, Docker Compose carga los datos de ejemplo (`SEED_DEMO_DATA=true`). Para empezar sin
ellos:

```bash
SEED_DEMO_DATA=false docker compose up -d --build
```

Para borrar todos los datos y empezar de cero: `docker compose down -v`.

> Si la base se creó con una versión anterior (que usaba `database/seed.sql`), conviene
> recrearla con `docker compose down -v`, porque los datos de ejemplo antiguos no coinciden con
> los actuales.

## Opción 2: Instalación nativa

Requisitos: Node.js 22, PostgreSQL 14 o superior y [bun](https://bun.sh) (el proyecto usa
`bun.lock`; `npm install` falla con este árbol de dependencias).

```bash
bun install
createdb -U postgres custodia_risk     # solo crea la base vacía
cp .env.example .env                   # ajustar DATABASE_URL y SEED_DEMO_DATA
npm run build
npm run serve:ssr:app                  # lee .env automáticamente
```

La aplicación queda en http://localhost:3000 (o el `PORT` definido en `.env`). No es necesario
ejecutar ningún script SQL a mano: el servidor crea las tablas al arrancar.

Para desarrollo con recarga en vivo, exporta las variables antes de `npm run dev`:

```bash
set -a; source .env; set +a
npm run dev
```

## Inicio de sesión

Los usuarios entran con su **correo electrónico** y un **código de 6 dígitos** que se les envía
por email (no hay contraseñas).

- El código vence a los 10 minutos, sirve una sola vez y admite 5 intentos. Se pueden pedir
  hasta 5 códigos cada 15 minutos por usuario, y hay un límite por dirección IP.
- La respuesta es la misma exista o no el correo, así no se puede averiguar quién está
  registrado.
- La sesión se guarda en una cookie `HttpOnly` y `SameSite=Strict`. Vence tras 60 minutos sin
  actividad o 10 horas en total (`SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS`). Si vence mientras
  se trabaja, la app pide el código de nuevo y guarda los cambios pendientes al volver a entrar.
- **El servidor valida los permisos del cargo** en cada guardado. Por ejemplo, el Consejo o la
  Junta de Vigilancia no pueden modificar datos aunque lo intenten directamente contra la API.
- **La pantalla aplica los mismos permisos.** Las acciones que el cargo no tiene aparecen
  atenuadas y, al pulsarlas, la app explica qué permiso falta. Si un administrador cambia los
  permisos de un puesto, los usuarios con sesión abierta los reciben al volver a la pestaña o en
  menos de 2 minutos, sin cerrar sesión.
- El autor de cada bloque de la bitácora es siempre el usuario de la sesión. Los inicios y cierres
  de sesión también quedan registrados.
- Un administrador puede **desactivar** a un usuario en "Puestos & Permisos", lo que cierra sus
  sesiones de inmediato. El sistema impide eliminarse o desactivarse a uno mismo y dejar el
  sistema sin ningún administrador.
- En la base de datos solo se guardan hashes de los códigos y de los tokens de sesión.

### Configurar el envío de correo con Google Workspace (Gmail)

Desde el 14 de marzo de 2025, Google no acepta la contraseña normal de una cuenta para SMTP. Hay
dos opciones que funcionan con la aplicación:

**Opción A — Servicio de relay SMTP de Google Workspace (recomendada).** No depende de la
contraseña de ninguna persona.

1. En la Consola de administración: *Aplicaciones → Google Workspace → Gmail → Enrutamiento →
   Servicio de relay SMTP*.
2. Agrega una regla que permita **solo direcciones de tus dominios**, autentique por **dirección
   IP** (la IP pública fija del servidor de RiskGuard) y **exija cifrado TLS**.
3. Configura la aplicación:

   ```env
   SMTP_HOST=smtp-relay.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false            # 587 usa STARTTLS
   SMTP_FROM="RiskGuard Pro <riskguard@tudominio.cl>"
   SMTP_HELO_NAME=tudominio.cl  # Google pide un nombre propio en HELO, no 'localhost'
   # Sin SMTP_USER: la autenticación es por IP
   ```

   Conviene que `riskguard@tudominio.cl` exista como usuario o grupo del dominio, para recibir
   rebotes.

**Opción B — Cuenta dedicada con contraseña de aplicación.** Sirve si el servidor no tiene una IP
pública fija.

1. Crea una cuenta, por ejemplo `riskguard@tudominio.cl`, activa la **verificación en dos pasos** y
   genera una **contraseña de aplicación** (el administrador debe permitir su uso).
2. Configura:

   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=riskguard@tudominio.cl
   SMTP_PASS=<contraseña de aplicación de 16 caracteres>
   SMTP_FROM="RiskGuard Pro <riskguard@tudominio.cl>"
   ```

Con cualquier otro servidor de correo (Microsoft 365, Exchange, relay interno) basta con ajustar
`SMTP_HOST`, `SMTP_PORT` y, si corresponde, `SMTP_USER` y `SMTP_PASS`.

El primer administrador se define con `ADMIN_EMAIL` (por ejemplo, el correo del Jefe de Riesgo
Operacional). Ese usuario se crea al iniciar una base vacía sin datos de ejemplo, y su correo se
actualiza si cambia la variable. Desde ahí se dan de alta los demás usuarios en "Puestos &
Permisos".

**Para evaluar sin SMTP**, `AUTH_DEV_LOG_CODES=true` escribe los códigos en el log del servidor
(`docker compose logs app`). Docker Compose lo trae activado por defecto junto con los datos de
ejemplo; **en producción debe ser `false`**. Con los datos de ejemplo se puede entrar, por ejemplo,
como `elena.vasconcelos@demo.riskguard.cl` (Jefa de Riesgo Operacional) o
`carmen.soto@demo.riskguard.cl` (Consejo, solo lectura).

### Publicar con HTTPS

Detrás de un proxy inverso con HTTPS (IIS, nginx, balanceador), define `TRUST_PROXY=1` para que la
cookie se marque como segura y se registre la IP real del usuario. Define también `AUTH_SECRET`
con una cadena aleatoria larga.

## Módulos regulatorios: referencias y supuestos

- **Reporte de incidentes a la CMF:** la RAN CACs (NCG 567, Capítulo CAC-3, numeral 5.2) remite
  al numeral 1.1 del Capítulo 20-8 de la RAN de bancos. Reporte inicial dentro de **30 minutos
  desde la ocurrencia** del incidente, actualizaciones mientras dure y reporte de cierre. La
  pantalla genera el texto de cada reporte con los campos de ese capítulo.
- **ANCI (Ley 21.663):** alerta temprana a las 3 horas, segundo informe a las 72 horas e informe
  final a los 15 días. Los plazos se cuentan **desde la detección** y son configurables.
- **APR por riesgo operacional:** el Capítulo CAC-20 está en consulta desde octubre de 2026. La
  calculadora usa el método estándar que la CMF aplica a la banca (Basilea III): indicador de
  negocio de 3 años, coeficientes de 12 % hasta 25 millones de UF y 15 % sobre ese monto, e ILM
  opcional con al menos 5 años de pérdidas. Es una **referencia**: actualice los parámetros
  cuando se publique la norma definitiva.
- **Reportes:** se exportan en CSV para Excel la base de pérdidas, el registro de incidentes
  reportados, el registro de servicios externalizados (RAN 20-7), el informe de seguridad y el
  cálculo de APR. Son formatos internos; el formato oficial de archivos del MSI CACs se puede
  agregar cuando se disponga de su especificación.

## Variables de entorno

| Variable | Descripción |
| :--- | :--- |
| `DATABASE_URL` | Cadena de conexión PostgreSQL. Sin ella, la app queda en modo demostración. |
| `SEED_DEMO_DATA` | `true` carga datos de ejemplo ficticios en una base vacía. Usar `false` en producción. |
| `ADMIN_EMAIL` | Correo del administrador inicial cuando no se cargan datos de ejemplo. |
| `DATABASE_SSL` | `true` para conectarse con SSL (bases administradas en la nube). |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false` solo si el certificado del servidor no es verificable. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_HELO_NAME` | Servidor de correo para enviar los códigos de acceso (ver Google Workspace). |
| `AUTH_DEV_LOG_CODES` | `true` muestra los códigos en el log (solo para evaluar sin SMTP). |
| `AUTH_SECRET` | Clave para firmar los códigos. Recomendada; obligatoria con varias instancias. |
| `SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS` | Vigencia de la sesión (60 minutos de inactividad y 10 horas en total por defecto). |
| `TRUST_PROXY`, `COOKIE_SECURE` | Configuración detrás de un proxy HTTPS. |
| `PORT` | Puerto HTTP (por defecto 4000; Docker usa 3000). |
| `GEMINI_API_KEY` | Opcional: habilita el análisis de incidentes con IA. |

## API

Todas las rutas (salvo `/api/auth/*` y `/api/db/health`) requieren sesión. Las escrituras deben
enviar la cabecera `X-Requested-With: RiskGuard` (protección CSRF).

| Método y ruta | Uso |
| :--- | :--- |
| `POST /api/auth/request-code` · `POST /api/auth/verify` | Pide el código por correo / lo verifica y abre la sesión. |
| `GET /api/auth/me` · `POST /api/auth/logout` | Usuario de la sesión / cierre de sesión. |
| `GET /api/data` | Carga completa de la aplicación (o `{"mode":"demo"}` sin base de datos). |
| `PUT /api/data/:entidad/:id` | Guarda un objeto completo (riesgo, control, incidente, proveedor…). |
| `DELETE /api/data/:entidad/:id` | Elimina un objeto. |
| `POST /api/ledger` · `GET /api/ledger` | Agrega un bloque a la bitácora / lee la cadena completa. |
| `PUT /api/settings/:clave` | Guarda un ajuste (industria, umbral de pérdidas, notificaciones). |
| `GET /api/db/health` · `GET /api/db/stats` | Diagnóstico de la conexión y conteos. |
| `POST /api/db/init` | Vuelve a aplicar el esquema y los datos base. |

Entidades: `roles`, `users`, `controls`, `risks`, `providers`, `regulatory-milestones`, `flaws`,
`alerts`, `audits`, `kris`, `bia`, `plans`, `continuity-tests`, `info-assets`, `vulnerabilities`,
`security-assessment`.

## Limitaciones conocidas

- Algunos botones siguen visibles para cargos sin permiso (por ejemplo, "Registrar Incidencia"
  para el Consejo). El servidor rechaza el guardado y la app muestra el error, pero conviene
  ocultarlos.
- Si dos personas editan **el mismo** registro a la vez, prevalece el último guardado.
- Los montos se registran en USD.

## Modelo de datos (principales tablas)

| Área | Tablas |
| :--- | :--- |
| Gobierno y accesos | `organizational_roles`, `user_profiles` |
| Riesgos y controles | `risks`, `risk_controls`, `controls`, `control_test_executions` |
| Incidentes y pérdidas | `operational_flaws` (con campos de base de pérdidas) |
| Reporte CMF / ANCI | `regulatory_milestone_templates`, `regulatory_reports`, `regulatory_submissions`, `regulatory_report_updates` |
| KRIs y alertas | `kri_definitions`, `anomaly_alerts` |
| Auditoría | `periodic_audits`, `audit_findings`, `crypto_audit_ledger` |
| Terceros | `service_providers` |
| Continuidad | `bia_processes`, `bia_process_providers`, `continuity_plans`, `continuity_plan_processes`, `continuity_tests` |
| Seguridad de la información | `info_assets`, `vulnerabilities`, `security_assessment_items` |
| Ajustes | `system_settings` |

Vistas de apoyo a reportes: `v_loss_database`, `v_regulatory_deadlines`, `v_provider_rto_gaps`,
`v_provider_contract_expiry`, `v_overdue_vulnerabilities`, `v_process_risk_summary`, `v_kri_breaches`.
