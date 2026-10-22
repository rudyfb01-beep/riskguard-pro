# Guía de instalación — RiskGuard Pro (Custodia Risk)

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

## Variables de entorno

| Variable | Descripción |
| :--- | :--- |
| `DATABASE_URL` | Cadena de conexión PostgreSQL. Sin ella, la app queda en modo demostración. |
| `SEED_DEMO_DATA` | `true` carga datos de ejemplo ficticios en una base vacía. Usar `false` en producción. |
| `ADMIN_EMAIL` | Correo del administrador inicial cuando no se cargan datos de ejemplo. |
| `DATABASE_SSL` | `true` para conectarse con SSL (bases administradas en la nube). |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false` solo si el certificado del servidor no es verificable. |
| `PORT` | Puerto HTTP (por defecto 4000; Docker usa 3000). |
| `GEMINI_API_KEY` | Opcional: habilita el análisis de incidentes con IA. |

## API

| Método y ruta | Uso |
| :--- | :--- |
| `GET /api/data` | Carga completa de la aplicación (o `{"mode":"demo"}` sin base de datos). |
| `PUT /api/data/:entidad/:id` | Guarda un objeto completo (riesgo, control, incidente, proveedor…). |
| `DELETE /api/data/:entidad/:id` | Elimina un objeto. |
| `POST /api/ledger` · `GET /api/ledger` | Agrega un bloque a la bitácora / lee la cadena completa. |
| `PUT /api/settings/:clave` | Guarda un ajuste (industria, umbral de pérdidas, notificaciones). |
| `GET /api/db/health` · `GET /api/db/stats` | Diagnóstico de la conexión y conteos. |
| `POST /api/db/init` | Vuelve a aplicar el esquema y los datos base. |

Entidades: `roles`, `users`, `controls`, `risks`, `providers`, `regulatory-milestones`, `flaws`,
`alerts`, `audits`, `kris`, `bia`, `plans`, `continuity-tests`.

## Limitaciones conocidas

- **No hay inicio de sesión.** El selector "Rol normativo" cambia de usuario sin contraseña y la
  API no verifica permisos. Antes de exponer la aplicación fuera de un entorno controlado hay que
  agregar autenticación (por ejemplo, con el directorio corporativo) y validar los permisos en el
  servidor.
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
| Ajustes | `system_settings` |

Vistas de apoyo a reportes: `v_loss_database`, `v_regulatory_deadlines`, `v_provider_rto_gaps`,
`v_provider_contract_expiry`, `v_process_risk_summary`, `v_kri_breaches`.
