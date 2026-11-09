# Pruebas automatizadas — RiskGuard Pro

| Nivel | Qué cubre | Dónde | Comando |
| :--- | :--- | :--- | :--- |
| Unitarias | Reglas compartidas cliente/servidor (permisos, crisis, documentos, carga masiva, UF, evidencias, avisos…) | `src/**/*.spec.ts` (Vitest) | `npm test` |
| API | Servidor real sobre una base nueva: salud, datos, versiones y carreras, permisos, carga masiva, crisis, respaldos y restauración | `tests/api/core.test.mjs`, `tests/api/ops.test.mjs` | `npm run test:api` |
| Seguridad | Cabeceras/CSP, sesión, CSRF, control de acceso, inyección, rutas, tamaños, errores, límite de solicitudes (ver [SECURITY.md](../SECURITY.md) §3) | `tests/api/security.test.mjs` | `npm run test:api` |
| Navegador | Ingreso, recorrido de todos los módulos sin errores de consola ni violaciones de CSP, respaldo desde el panel, opciones ocultas según cargo | `tests/e2e/smoke.test.mjs` (Playwright + Chromium) | `npm run test:e2e` |
| Lint | ESLint + reglas de Angular | — | `npm run lint` |
| Dependencias | Vulnerabilidades conocidas en dependencias de producción | — | `npm run audit:prod` |
| Usuario (UAT) | Validación por las áreas con trazabilidad normativa | [VALIDACION-UAT.md](VALIDACION-UAT.md) | manual |

## Ejecutar localmente

```bash
bun install
npx ng build                      # las pruebas de API y navegador usan dist/
npm test                          # unitarias
npm run test:api                  # API y seguridad sobre SQLite temporal
npx playwright install chromium   # una vez
npm run test:e2e                  # navegador
```

Las pruebas de API levantan `dist/app/server/server.mjs` en un puerto libre, con una base nueva
y datos de ejemplo (`SEED_DEMO_DATA=true`), e ingresan con el flujo real de código: el servidor
escribe el código en su log (`AUTH_DEV_LOG_CODES=true`, solo en pruebas). Cada archivo usa su
propio servidor y base, y todo se borra al terminar.

**PostgreSQL:** defina `TEST_DATABASE_URL` con un usuario que pueda crear bases; cada servidor
de prueba usa una base `riskguard_test_<puerto>` que se elimina al final. Requiere `pg_dump` y
`pg_restore` de la misma versión mayor o superior al servidor.

```bash
TEST_DATABASE_URL=postgres://postgres:clave@localhost:5432/postgres npm run test:api
```

**Navegador:** con un Chrome/Chromium ya instalado, `CHROME_PATH=/ruta/a/chrome npm run test:e2e`.

## Integración continua

`.github/workflows/ci.yml` se ejecuta en cada pull request y en `main`:

1. **Lint, unitarias y build** (publica `dist/` para los pasos siguientes).
2. **Auditoría de dependencias:** falla si hay vulnerabilidades en producción (`bun audit --prod`);
   las de herramientas de desarrollo se informan.
3. **API (SQLite)** y **API (PostgreSQL 16)**: la segunda aplica además `database/schema.sql`
   dos veces para comprobar que el esquema es idempotente.
4. **Navegador (Playwright).**

Un pull request se fusiona solo con todos los pasos en verde.

## Agregar pruebas

- Regla de negocio nueva → función pura en `src/app/utils` con su `.spec.ts` (se usa en el
  cliente y en el servidor).
- Ruta o permiso nuevo → caso en `tests/api/core.test.mjs`; si es sensible (datos de otros,
  archivos, administración), también en `security.test.mjs`.
- Pantalla nueva → agregar su pestaña a `TABS` en `tests/e2e/smoke.test.mjs`.
- Usuarios de ejemplo para las pruebas: `elena.vasconcelos` (administración), `carlos.mendoza`
  (dueño de proceso), `sofia.valenzuela` (cumplimiento), `andres.fuentes` (comité de riesgos),
  todos `@demo.riskguard.cl`.

## Demostración sin servidor

`npx ng build && npm run demo:build` genera `release/demo/`: la aplicación compilada más
`demo/demo-api.ts`, que reemplaza la API dentro del navegador con datos ficticios obtenidos del
propio servidor (`SEED_DEMO_DATA`). Sirve para mostrar el producto como página estática: entra
como la Jefa de Riesgo Operacional, permite cambiar de persona y registrar datos (duran mientras
la pestaña esté abierta). No envía correos ni hace respaldos. La aplicación de producción y la
imagen Docker no incluyen este código.
