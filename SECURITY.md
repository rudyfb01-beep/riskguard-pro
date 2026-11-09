# Seguridad — RiskGuard Pro

Este documento resume el modelo de amenazas, los controles implementados, cómo se prueban y el
alcance propuesto para un **pentest externo**. Complementa [LOCAL_SETUP.md](LOCAL_SETUP.md)
(instalación) y [docs/OPERACION.md](docs/OPERACION.md) (operación y respaldos).

**Reporte de vulnerabilidades:** escriba al responsable de seguridad de la información de la
cooperativa (no abra un issue público). Incluya pasos para reproducir, impacto y versión
(`/api/health` informa la versión).

## 1. Activos y amenazas

| Activo | Amenaza principal | Control principal |
| :--- | :--- | :--- |
| Matriz de riesgos, pérdidas, incidentes reportados a la CMF/ANCI | Lectura o modificación no autorizada | Sesión obligatoria, permisos por cargo verificados en el servidor |
| Bitácora (ledger) | Alteración para ocultar cambios | Cadena SHA-256 por bloque; verificación en Operación y respaldos |
| Evidencias (archivos) | Archivos maliciosos, alteración | Lista de tipos permitidos, verificación del contenido, SHA-256, baja lógica |
| Sesiones | Robo o reutilización de la sesión | Cookie HttpOnly + SameSite, tokens aleatorios guardados como hash, expiración por inactividad y máxima |
| Códigos de acceso | Fuerza bruta, enumeración de usuarios | 6 dígitos con HMAC, 5 intentos, vigencia de 10 min, límite por IP y por usuario, misma respuesta para correos no registrados |
| Respaldos | Exfiltración o restauración de una copia alterada | Descarga solo para administración de cargos (queda en la bitácora), SHA-256 en el manifiesto, verificación antes de restaurar |
| Servidor | Denegación de servicio, fuga de información técnica | Límite de solicitudes, tamaño máximo de cuerpo, errores sin detalles internos |

Fuera de alcance de la aplicación (responsabilidad de la infraestructura): TLS, firewall/WAF,
endurecimiento del sistema operativo, cifrado del disco y de los respaldos fuera del servidor,
monitoreo del SIEM.

## 2. Controles implementados (OWASP Top 10 2021 / ASVS 4.0)

| OWASP | Control | Dónde |
| :--- | :--- | :--- |
| A01 Control de acceso | Todas las rutas de datos exigen sesión; cada escritura valida los permisos del cargo en el servidor (no solo se ocultan botones); reglas por registro (dueño del plan, comité de crisis, flujo documental); avisos solo de la persona; nombres de respaldo validados con lista blanca (sin rutas). | `src/server/api.ts` (`WRITE_PERMISSIONS`, `SETTING_PERMISSIONS`), `src/app/utils/*` (reglas compartidas) |
| A01 CSRF | Escrituras exigen `X-Requested-With: RiskGuard` (no se puede enviar desde otro sitio sin CORS) y, si traen `Origin`, debe ser el propio sitio (`APP_URL` o `ALLOWED_ORIGINS`). Cookie de sesión `SameSite=Strict`. | `src/server/auth.ts`, `src/server/security.ts` |
| A02 Criptografía | Tokens de sesión de 256 bits guardados como SHA-256; códigos con HMAC-SHA256 (`AUTH_SECRET`); bitácora y evidencias con SHA-256; HSTS con HTTPS. | `auth.ts`, `repository.ts` |
| A03 Inyección | Consultas parametrizadas en PostgreSQL y SQLite (sin concatenar valores); entidades y ajustes validados contra listas cerradas; Angular escapa el contenido; CSP sin scripts en línea. | `repository.ts`, `security.ts` |
| A04 Diseño inseguro | Edición simultánea con versión por registro (409 ante conflicto); carga masiva todo o nada en una transacción; bitácora de crisis solo de agregado. | `api.ts`, `repository.ts` |
| A05 Configuración | La aplicación no arranca en producción con una configuración insegura (códigos en el log, datos de ejemplo, `AUTH_SECRET` débil, sin SMTP, contraseña de PostgreSQL de ejemplo); PostgreSQL sin puertos publicados y la app solo en `127.0.0.1` detrás del proxy; CSP, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP, sin `X-Powered-By`, `Cache-Control: no-store` en la API; revisión de configuración en Operación y respaldos (códigos en el log, `AUTH_SECRET`, HTTPS, contraseña de PostgreSQL, SSL, respaldos). | `security.ts`, `ops.ts` |
| A06 Componentes | `bun audit --prod` en CI (falla si hay vulnerabilidades en dependencias de producción); `overrides` para dependencias transitivas. | `.github/workflows/ci.yml`, `package.json` |
| A07 Autenticación | Sin contraseñas: código de un solo uso por correo o Google (OIDC con PKCE, `state`, `nonce`, verificación de firma, emisor, audiencia y dominio); límites de intentos; sesión con vencimiento por inactividad y máximo; cierre de sesión invalida el token en la base. | `auth.ts`, `google-sso.ts` |
| A08 Integridad | Bitácora encadenada y verificable; SHA-256 de evidencias y respaldos; `bun install --frozen-lockfile`. | `repository.ts` (`verifyLedgerChain`), `backup.ts` |
| A09 Registro | Bitácora de cambios, inicios de sesión, cargas masivas, respaldos y descargas de respaldos; identificador `X-Request-Id` en cada respuesta y en el log de errores. | `repository.ts`, `security.ts` |
| A10 SSRF | El servidor solo llama a URLs configuradas (Google, mindicador.cl, SMTP, pasarela de SMS); los webhooks de alertas exigen https y se rechazan si resuelven a direcciones internas (salvo `WEBHOOK_ALLOW_PRIVATE=true`), sin seguir redirecciones; el renderizado SSR acepta solo los hosts de `NG_ALLOWED_HOSTS`/`APP_URL`; retorno tras el ingreso limitado a rutas locales. | `server.ts`, `google-sso.ts`, `uf-sync.ts` |

### Cabeceras

```
Content-Security-Policy: default-src 'self'; script-src 'self'; script-src-attr 'none';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;
  connect-src 'self'; frame-src 'self' blob:; worker-src 'self' blob:; media-src 'self' blob:;
  manifest-src 'self'; object-src 'none'; base-uri 'self';
  form-action 'self' https://accounts.google.com; frame-ancestors 'none'; upgrade-insecure-requests
Strict-Transport-Security: max-age=31536000; includeSubDomains     (solo con HTTPS)
X-Frame-Options: DENY · X-Content-Type-Options: nosniff · Referrer-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin-allow-popups · Cross-Origin-Resource-Policy: same-origin
```

`style-src 'unsafe-inline'` es necesario para los estilos de los componentes de Angular; no
permite ejecutar código. `CSP=off` desactiva la política (solo para diagnóstico).

### Variables relacionadas

| Variable | Uso |
| :--- | :--- |
| `RATE_LIMIT_PER_MINUTE` | Solicitudes a `/api` por IP y minuto (600 por defecto; `0` lo desactiva). Detrás de un proxy defina `TRUST_PROXY` para usar la IP real. |
| `JSON_LIMIT` | Tamaño máximo de un cuerpo JSON (15mb por defecto). |
| `ALLOWED_ORIGINS` | Orígenes adicionales aceptados en escrituras (separados por coma). |
| `HSTS_MAX_AGE` | Segundos de HSTS (un año por defecto). |
| `CSP` | `off` desactiva la CSP (diagnóstico). |
| `WEBHOOK_ALLOW_HTTP`, `WEBHOOK_ALLOW_PRIVATE` | Permiten webhooks de alertas por http o a la red interna. Úselos solo si el destino es de confianza. |

## 3. Pruebas de seguridad automatizadas

`tests/api/security.test.mjs` se ejecuta en cada cambio (CI, SQLite y PostgreSQL) y cubre:

- Cabeceras y CSP; el HTML no contiene scripts ni manejadores en línea.
- Cookie de sesión HttpOnly/SameSite; no enumeración de usuarios; bloqueo tras 5 códigos
  incorrectos; token inválido tras cerrar sesión; token inventado rechazado.
- CSRF sin cabecera y desde otro origen; escalamiento de privilegios (usuario y cargo propio);
  funciones de administración con un cargo operativo; avisos de otras personas.
- Salto de directorio en respaldos y evidencias; inyección SQL en identificadores y textos;
  entidad desconocida; evidencias HTML/SVG/ejecutables; JSON mal formado sin detalles internos;
  cuerpo de más de 15 MB; rutas inexistentes de la API.
- Integridad de la bitácora; límite de solicitudes (429).

`tests/e2e/smoke.test.mjs` recorre todos los módulos en Chromium y falla ante cualquier
violación de la CSP o error de consola.

Estado de dependencias al cierre de este cambio: `bun audit --prod` sin vulnerabilidades. Quedan 2
avisos moderados en herramientas de desarrollo (`glob`/`minimatch` usados por el CLI de Angular y
ESLint), que no se incluyen en el servidor.

## 4. Alcance propuesto para el pentest externo

**Objetivo:** verificar de forma independiente los controles anteriores antes de la puesta en
producción, según el requisito de pruebas de seguridad de la RAN 20-10 y la política de
seguridad de la información de la cooperativa.

**Modalidad:** caja gris, con cuentas de distintos cargos de la matriz de permisos (administración,
jefatura de riesgo, dueño de proceso, cumplimiento, auditoría interna, consejo), en un **ambiente de certificación** idéntico a
producción (misma imagen Docker, PostgreSQL, proxy HTTPS y `NODE_ENV=production`) con datos
ficticios cargados por Carga masiva. No se prueba sobre producción.

**En alcance:**

1. Aplicación web y API `https://<certificación>/` y `/api/*` (lista de rutas en LOCAL_SETUP.md, sección API).
2. Autenticación: código por correo y Google (OIDC); sesión, cierre y expiración.
3. Autorización horizontal y vertical en todas las entidades (`PUT/DELETE /api/data/:entidad/:id`),
   ajustes, carga masiva, evidencias, respaldos y operación.
4. Carga de archivos (evidencias, carga masiva Excel/CSV, importación de matriz).
5. Integridad de la bitácora y de las evidencias (intentos de alteración vía API).
6. Cabeceras, CSP, configuración TLS del proxy y del contenedor.
7. Revisión de la imagen Docker y de las dependencias (SCA).

**Fuera de alcance:** denegación de servicio volumétrica, ingeniería social, infraestructura de
Google y del proveedor de correo, otros sistemas de la cooperativa.

**Reglas de enfrentamiento:** ventana acordada; IP de origen informadas; detener ante datos reales;
sin pruebas destructivas sobre la base salvo coordinación (hay respaldo previo); hallazgos críticos
se informan de inmediato al responsable de seguridad.

**Entregables:** informe ejecutivo y técnico con hallazgos clasificados (CVSS 3.1), evidencia y
recomendación; re-test de los hallazgos críticos y altos tras la corrección. El pentest se registra
en **Seguridad de la información → Pruebas de seguridad** y cada hallazgo como **plan de acción**
para su seguimiento.

**Criterio de salida a producción:** sin hallazgos críticos ni altos abiertos; medios y bajos con
plan de acción aprobado.
