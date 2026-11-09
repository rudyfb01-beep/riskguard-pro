# Guía de operación — RiskGuard Pro

Para quien administra el servidor: monitoreo, respaldos, restauración y respuesta ante fallas.
La instalación está en [LOCAL_SETUP.md](../LOCAL_SETUP.md) y la seguridad en [SECURITY.md](../SECURITY.md).

## 1. Monitoreo

| Ruta | Uso | Respuesta |
| :--- | :--- | :--- |
| `GET /api/health` | **Vivo**: el proceso responde. Para reiniciar el contenedor si deja de responder. | `200 {"status":"ok","version":…,"uptimeSeconds":…}` |
| `GET /api/ready` | **Listo**: hay base de datos y responde. Para el balanceador y el `HEALTHCHECK` de Docker. | `200 {"status":"ready"}` o `503 {"status":"not-ready"}` |

Ambas son públicas, no muestran datos y no cuentan para el límite de solicitudes. El
`HEALTHCHECK` de la imagen Docker usa `/api/ready`.

Qué vigilar (monitoreo externo o SIEM):

- `/api/ready` distinto de 200 durante más de 2 minutos → **incidente** (ver §5).
- En el log: líneas `[Respaldo] Error`, `[Error <id>]`, `[Auth] Error enviando el código`.
- Cada respuesta lleva `X-Request-Id`; los errores 500 se registran en el log con ese
  identificador, que la persona usuaria ve en el mensaje de error.

## 2. Panel Operación y respaldos

Menú **Configuración → Operación y respaldos** (cargos con permiso para administrar cargos o
mantenedores). Muestra:

- **Servicio:** versión, Node.js, memoria y tiempo en línea.
- **Base de datos:** motor, tamaño, usuarios activos, sesiones vigentes y evidencias.
- **Último respaldo** (en rojo si falló o nunca se hizo) y la lista de respaldos con
  **Verificar** y **Descargar**; **Respaldar ahora** (solo administración de cargos).
- **Bitácora:** recalcula el hash de cada bloque y la cadena completa; si alguien modificó la base
  directamente, indica el primer bloque alterado.
- **Correo (24 h):** enviados, con error y pendientes.
- **Revisión de la configuración:** advertencias priorizadas (alta/media/baja) sobre lo que
  conviene corregir antes de producción (códigos en el log, `AUTH_SECRET`, SMTP, datos de
  ejemplo, HTTPS, contraseña y SSL de PostgreSQL, respaldos desactivados, dominios de Google).

## 3. Respaldos

| Variable | Por defecto | Descripción |
| :--- | :--- | :--- |
| `BACKUP_INTERVAL_HOURS` | `24` | Frecuencia del respaldo automático (`0` lo desactiva). |
| `BACKUP_KEEP` | `14` | Cuántos respaldos se conservan (los más antiguos se eliminan). |
| `BACKUP_DIR` | `backups/` junto a la base SQLite o a la aplicación; `/app/backups` en Docker | Carpeta de respaldos. Use un disco o volumen distinto del de la base. |
| `BACKUP_FIRST_DELAY_SECONDS` | `120` | Espera tras el inicio antes de revisar si corresponde un respaldo. |
| `PG_DUMP_PATH` · `PG_RESTORE_PATH` | `pg_dump` · `pg_restore` | Ejecutables de PostgreSQL (la imagen Docker incluye el cliente 16). |
| `APP_VERSION` | versión del paquete | Versión informada en `/api/health` y en los manifiestos. |

- **SQLite:** copia consistente con la API de respaldo de SQLite, en caliente; el archivo `.db`
  queda autocontenido.
- **PostgreSQL:** `pg_dump` en formato personalizado (`.dump`, comprimido), sin dueños ni permisos.
  La versión de `pg_dump` debe ser igual o superior a la del servidor.
- Cada respaldo deja un manifiesto `.json` con fecha, motor, tamaño, **SHA-256**, duración,
  conteos de las tablas principales y versión. Cada respaldo y cada descarga quedan en la bitácora
  (`RESPALDO_BASE`).
- Al iniciar, si el último respaldo es más antiguo que el intervalo, se hace uno a los pocos minutos.

**Copia fuera del servidor (obligatoria):** el respaldo local no protege ante la pérdida del
servidor. Programe una copia diaria de `BACKUP_DIR` a otro sitio (unidad de red, almacenamiento de
objetos con versión e inmutabilidad, o cinta) con acceso restringido: los respaldos contienen
todos los datos. En Docker, la carpeta es el volumen `backups`.

**Objetivos de referencia:** RPO 24 h (ajustable con `BACKUP_INTERVAL_HOURS`; para menos de 1 h
use la replicación o PITR de PostgreSQL), RTO 2 h. Ajústelos al BIA de la cooperativa: la propia
aplicación registra este sistema como activo de información y su plan de continuidad.

## 4. Restauración

Con la aplicación **detenida**:

```bash
# Comprobar un respaldo sin restaurar (SHA-256 contra el manifiesto y lectura del archivo)
node scripts/restaurar.mjs backups/riskguard-20261109-020000.db --verificar

# SQLite: la base actual se conserva como <base>.antes-de-restaurar-<fecha>
node scripts/restaurar.mjs backups/riskguard-20261109-020000.db --destino data/riskguard.db

# PostgreSQL: reemplaza los objetos de la base indicada (pg_restore --clean --single-transaction)
DATABASE_URL=postgres://usuario:clave@host:5432/riskguard node scripts/restaurar.mjs backups/riskguard-20261109-020000.dump
```

En Docker: `docker compose stop app`, luego
`docker compose run --rm --entrypoint node app scripts/restaurar.mjs /app/backups/<archivo>` y
`docker compose start app`.

Después de restaurar: inicie la aplicación, revise en **Operación y respaldos** que la bitácora
esté íntegra y que los conteos coincidan con el manifiesto, e informe a las personas usuarias
que los cambios posteriores al respaldo deben volver a ingresarse.

**Prueba de restauración:** al menos **trimestral**, en un servidor de pruebas, con el respaldo
más reciente. Registre el resultado (tiempo, conteos, bitácora íntegra) en **Continuidad →
Pruebas** de la propia aplicación.

## 5. Respuesta ante fallas

| Síntoma | Revisión | Acción |
| :--- | :--- | :--- |
| `/api/ready` = 503 | Log: `[Base de datos]`; conexión a PostgreSQL; espacio en disco | Restablecer la base; si está dañada, restaurar el último respaldo verificado. |
| `/api/health` no responde | Proceso o contenedor detenido; memoria | Reiniciar (`docker compose restart app`); revisar el log anterior a la caída. |
| Último respaldo en rojo | Mensaje en el panel; permisos y espacio de `BACKUP_DIR`; `pg_dump` | Corregir y pulsar **Respaldar ahora**. |
| Bitácora "alterada" | Bloque indicado en el panel | Tratar como **incidente de seguridad**: preservar la base actual (copia), comparar con el último respaldo íntegro, investigar accesos directos a la base. |
| Correos con error | Panel de avisos (Mantenedores) y log | Revisar SMTP (credenciales, contraseña de aplicación, puerto). |
| Muchas respuestas 429 | IP real detrás del proxy | Definir `TRUST_PROXY`; ajustar `RATE_LIMIT_PER_MINUTE`. |

Una caída que afecte la gestión de riesgos se registra como incidente en la propia aplicación
cuando vuelva a estar disponible.

## 6. Actualización de versión

1. Respaldar (**Respaldar ahora**) y verificar.
2. `git pull` y `docker compose up -d --build` (o reemplazar el paquete SQLite conservando
   `data/`, `respaldos/` y `configuracion.env`).
3. El esquema se actualiza solo al iniciar (es idempotente).
4. Revisar `/api/ready`, la versión en `/api/health` y el panel de operación.
5. Si algo falla: volver a la versión anterior y restaurar el respaldo del paso 1.
