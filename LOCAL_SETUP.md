# Guía de instalación — RiskGuard Pro

Aplicación de gestión de riesgo operacional para cooperativas de ahorro y crédito:
Angular 21 en el navegador, servidor Express (Node 22.16 o superior) y base de datos **PostgreSQL 16**
o **SQLite** (un archivo local, sin servidor de base de datos).

## Cómo se guardan los datos

- Todo lo que se registra en pantalla se guarda en la base de datos (**PostgreSQL** o **SQLite**) a través de la API del
  servidor. El indicador de la esquina inferior izquierda muestra "Guardando…", "Guardado" o un
  error con el botón **Reintentar**.
- Al arrancar, el servidor **aplica el esquema automáticamente** (`database/schema.sql` en
  PostgreSQL, `database/schema.sqlite.sql` en SQLite). Los scripts son idempotentes, así que
  también actualizan bases creadas con versiones anteriores.
- En una base vacía se cargan los **datos base**: los cargos de gobierno cooperativo, los plazos
  regulatorios CMF/ANCI y un usuario administrador.
- Con `SEED_DEMO_DATA=true` se cargan además los **datos de ejemplo ficticios** (riesgos,
  incidentes, proveedores, etc.), útiles para evaluar la aplicación.
- **Motor de base de datos** (`DB_CLIENT`): con `DATABASE_URL` o `POSTGRES_HOST` se usa
  PostgreSQL; sin ellos, **SQLite** en `data/riskguard.db` (ruta configurable con `SQLITE_PATH`).
  `DB_CLIENT=none` deja la aplicación en **modo demostración** (datos de ejemplo que se pierden al recargar).
- La bitácora inalterable la encadena el **servidor**: asigna el número de bloque, la hora y el
  hash SHA-256, y serializa las escrituras simultáneas para que la cadena no se bifurque.

## Opción 0: paquete descargable con SQLite (un equipo)

Para usar la aplicación en un solo equipo, sin Docker ni servidor de base de datos:

```bash
npm run package:sqlite        # genera release/riskguard-pro-sqlite.zip
```

El .zip trae la aplicación compilada (no necesita `npm install`), `iniciar.bat` / `iniciar.sh`,
`respaldar.bat` / `respaldar.sh`, `configuracion.env` y un `LEEME.txt` con los pasos. Solo requiere
Node.js 24 LTS (o 22.16 o superior). SQLite está pensado para un equipo o un grupo pequeño; para
uso institucional con varios usuarios simultáneos se recomienda PostgreSQL (opciones 1 y 2).

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

## Importar una matriz de riesgos desde Excel

En **Matriz 4×4 & Inventario → Importar Excel** se carga una matriz existente (.xlsx o .csv; el
formato .xls antiguo debe guardarse antes como .xlsx). Requiere el permiso de editar riesgos.

- Detecta la hoja, la fila de encabezados y las columnas por su nombre (Riesgo, Proceso,
  Probabilidad, Impacto, Categoría, Responsable, Exposición, Controles, Estado, Plan de acción…);
  cada asociación se puede corregir antes de importar. También reconoce la exportación de la propia
  aplicación, así que sirve para editar la matriz en Excel y volver a cargarla.
- Probabilidad e impacto pueden venir como número (escalas 1–3, 1–4, 1–5, 1–6 o 1–10, que se
  convierten a 1–4) o como texto (Improbable, Posible, Probable, Casi seguro; Menor, Moderado, Mayor,
  Catastrófico…). La categoría se asocia a una de las 7 de Basilea.
- Las celdas combinadas de proceso, categoría y responsable se repiten hacia abajo.
- Si un código ya existe, se puede actualizar ese riesgo u omitirlo. Los procesos que no están en
  el mantenedor se asocian al más parecido o, con permiso de mantenedores, se crean.
- Los controles se vinculan por código o nombre; el riesgo residual se calcula con ellos.
- La vista previa marca las observaciones y las filas con errores (que no se importan). La
  importación queda en la bitácora con el detalle de los riesgos creados y actualizados.
- **Descargar plantilla** entrega un CSV con los encabezados que se reconocen automáticamente.

## Mantenedores

En **Configuración → Mantenedores** (permiso "Administrar mantenedores", que por defecto tiene el
Jefe de Riesgo Operacional) se administran:

- **Procesos:** código, nombre, área, dueño, línea de negocio CAC y criticidad. Alimentan las listas
  de riesgos, controles, incidentes, KRIs, auditorías y el mapa de calor. Renombrar un proceso
  actualiza todos los registros que lo usan; un proceso en uso no se puede eliminar, solo
  desactivar (deja de aparecer para registros nuevos).
- **Áreas:** nombre, responsable y descripción. Los puestos eligen su área de esta lista;
  renombrar un área actualiza puestos y usuarios.
- **Parámetros generales:** moneda de registro (CLP o USD), días de aviso antes del vencimiento de contratos, frecuencia de evaluación de
  proveedores por criticidad y plazos para corregir vulnerabilidades por severidad.

- **Escala de riesgo:** nombre y criterio de cada nivel de probabilidad e impacto (1 a 4). Se
  muestran en el formulario de riesgos y en los mapas de calor. Los cortes del nivel son fijos
  (Bajo 1–3, Medio 4–6, Alto 8–9, Crítico 12–16).
- **Apetito y tolerancia:** declaración aprobada por el Consejo y, por categoría de Basilea, el
  puntaje residual máximo dentro del apetito y de la tolerancia, más una pérdida neta anual máxima
  opcional. El inventario de riesgos marca los que están sobre el apetito o fuera de tolerancia y el
  tablero muestra un aviso.
- **Cuentas contables:** plan de cuentas para la base de pérdidas (se puede pegar desde Excel). El
  formulario de incidentes las ofrece en una lista; una cuenta usada no se puede eliminar.
- **Catálogo de proveedores:** categorías de servicio y cláusulas mínimas de contrato (las
  marcadas como críticas generan alerta alta si faltan).

Fuera de Mantenedores, con los permisos de cada módulo:
- **Sistemas del BIA:** se eligen del inventario de activos de Seguridad de la Información
  (aplicaciones, servicios en la nube, servidores y bases de datos); los no inventariados se
  escriben aparte.
- **Lista de verificación de seguridad:** en Seguridad de la Información → Autoevaluación se
  pueden agregar, editar o quitar requisitos (permiso "Seguridad de la Información").

**Moneda:** la moneda elegida se aplica en toda la aplicación (montos en pantallas, reportes,
exportaciones, bitácora, análisis con IA y APR). Al cambiarla se puede convertir todo lo registrado
con un tipo de cambio (pesos por dólar): exposición y presupuestos de riesgos, pérdidas y recuperos,
costos de proveedores, umbral de la base de pérdidas y límites del apetito. La conversión se hace en
el servidor en una sola transacción y queda en la bitácora. También se puede cambiar sin convertir,
si los montos ya estaban expresados en la nueva moneda.

Una instalación nueva parte con 10 áreas y 14 procesos de referencia para una cooperativa y con
la moneda en CLP; las instalaciones existentes conservan USD y se cargan con los procesos que ya
usan sus datos.

Las **auditorías** (plan, alcance, hallazgos y su subsanación) se registran en Auditorías
Periódicas con el permiso "Ejecutar auditorías". El puntaje de cada auditoría se calcula de sus
hallazgos.

## Cumplimiento normativo (multinorma)

En **Gobernanza & Cumplimiento → Cumplimiento Normativo** está la biblioteca de normas de la
cooperativa. Cada norma tiene código, tipo (norma CMF, ley, circular, estándar o política interna),
emisor, fuente oficial y enlace, estado (vigente, publicada aún no vigente, en consulta, derogada),
aplicabilidad con su justificación, responsable, versión vigente e historial de versiones.

La biblioteca viene con:

| Norma | Requisitos | Verificaciones automáticas |
| :--- | :--- | :--- |
| RAN 20-7, 20-8, 20-9 y 20-10 (vía CAC-3 de la NCG 567) | 71 por numeral (20 + 6 + 23 + 22) | Con proveedores, incidentes, continuidad y seguridad |
| Ley 20.393 (modelo de prevención de delitos, texto de la Ley 21.595) | 10 | — |
| Ley 21.719 (datos personales; vigencia 01-12-2026) | 13 | Inventario de activos con datos personales, contratos con encargados, transferencias al extranjero |
| Ley 19.913 y Circulares UAF 49 y 59 (prevención LA/FT) | 14 | — |
| Ley 21.663 (Marco de Ciberseguridad, ANCI) | 6 | Alerta temprana, informes de seguimiento y final, doble reporte CMF/ANCI |

Las normas que trae la aplicación están marcadas como **referenciales**: sus requisitos están
resumidos de fuentes públicas y Cumplimiento debe validarlos contra el texto oficial vigente.

Qué se puede hacer:

- **Agregar normas** (por ejemplo, la Ley 21.643 o una política interna) y editarlas.
- **Agregar, editar o eliminar requisitos**, o **importarlos** desde Excel (copiar y pegar) o desde un
  archivo .xlsx o .csv con las columnas Numeral, Título, Detalle, Frecuencia y Responsable.
- **Evaluar** cada requisito: estado, evidencia, responsable, plan de acción y plazo, y los
  **controles de la matriz que lo cubren**. Los controles vinculados sugieren un estado (todos
  efectivos → Cumple; alguno parcial o deficiente → Cumple parcialmente; todos deficientes → No cumple).
- **Registrar una nueva versión** de una norma (fecha y qué cambió). Los requisitos evaluados con la
  versión anterior quedan marcados "por revisar" hasta que se vuelvan a evaluar.
- Ver **brechas**, revisiones vencidas según la frecuencia, requisitos por revisar por cambio de versión
  y requisitos sin controles ni verificación automática; exportar la matriz completa a Excel.

Todos los cambios quedan en la bitácora inalterable. Mantener normas y evaluar requiere el permiso
"Cumplimiento Normativo" (por defecto, Jefe de Riesgo Operacional y Oficial de Cumplimiento); el
permiso de reportes regulatorios (CMF/ANCI) también lo permite, por compatibilidad. En bases
existentes, la biblioteca y los requisitos de las leyes se agregan una sola vez al actualizar, sin
modificar las evaluaciones ya registradas.

Datos que la aplicación registra para soportar los requisitos de las RAN:

| Capítulo | Dónde | Qué se registra |
| :--- | :--- | :--- |
| 20-7 | Proveedores → Antecedentes RAN 20-7 | Criterios de actividad significativa o estratégica, centros de datos principal y de contingencia, procesamiento en el exterior (contingencia en Chile o dispensa del Consejo e informe independiente), riesgo país, subcontratistas, pruebas de continuidad y de seguridad del proveedor, auditoría, debida diligencia reforzada para la nube (a–g). Las 15 cláusulas mínimas de contrato del Anexo 1 están en el catálogo de proveedores. El catastro exportable incluye estas columnas. |
| 20-8 | Reporte CMF / ANCI, Incidentes | Reporte inicial (30 minutos desde la ocurrencia), actualizaciones y cierre; comunicación a socios con fecha y canal (§1.2); alerta a la industria de incidentes de ciberseguridad (§1.3). |
| 20-9 | Continuidad del negocio | RTO aprobado por el Consejo y análisis de riesgos (RIA) por proceso; escenarios mínimos que cubre cada plan y retorno a la normalidad; escenario probado, simulación de indisponibilidad de sitio (online/batch) y análisis previo; tabla de cobertura de los 5 escenarios. |
| 20-10 | Seguridad de la Información | Activos de infraestructura crítica; pruebas de seguridad (pentest, hacking ético, restauración, plan de respuesta, crisis) con informe al Consejo; base de incidentes de ciberseguridad con análisis forense y lecciones aprendidas; autoevaluación. |

Los requisitos de gobierno (políticas, estrategia, informes al Consejo, capacitación, auditorías,
sitios de procesamiento) se cumplen con documentos y actas de la cooperativa: la matriz registra esa
evidencia, no la reemplaza. La RAN 20-7 tiene una actualización en consulta (abril de 2026) que
agregaría el archivo I28 de servicios externalizados (semestral para cooperativas); se incorporará
cuando se publique la versión definitiva.

## Planes de acción

En **Incidentes & Seguimiento → Planes de Acción** está el registro único de planes de acción. Cada
plan nace de una brecha y queda vinculado a su origen:

| Origen | Dónde se crea |
| :--- | :--- |
| Riesgo | Matriz de riesgos → editar riesgo → "Planes de acción del tratamiento" (al crear un riesgo, el plan indicado se crea solo) |
| Control | Controles → evaluar control (en especial los deficientes o parciales) |
| Auditoría | Auditorías → hallazgo (un hallazgo nuevo con acción correctiva nace con su plan) |
| Cumplimiento | Cumplimiento Normativo → evaluar requisito |
| Autoevaluación de seguridad | Seguridad de la Información → Autoevaluación (las brechas exigen un plan abierto) |
| Continuidad | Continuidad → Pruebas con observaciones o fallidas |
| Proveedor | Proveedores → editar proveedor |
| Incidente | Incidentes y Pérdidas → editar incidente |
| Otro | "Nuevo plan" en la pestaña (acuerdos del Comité, informes externos) |

Cada plan tiene responsable, prioridad, plazo comprometido y plazo vigente, tareas, registro de
avances, reprogramaciones con motivo y un cierre en dos pasos:

1. El **responsable** marca tareas, registra avances y lo **envía a verificación** con la evidencia.
2. Una persona con el permiso **"Administrar Planes de Acción"**, distinta del responsable, **verifica
   el cierre** o lo **devuelve** indicando qué falta. Si el plan viene de un hallazgo y quien verifica
   puede registrar auditorías, el hallazgo también se cierra.

Solo quien administra planes puede reasignar, reprogramar, cancelar (con motivo) o eliminar. El
servidor aplica estas mismas reglas en cada guardado. El responsable se reconoce por su nombre de
usuario, sin considerar tratamiento (Sr., Dra., Ing.) ni acentos. El permiso se asigna por defecto a
Jefe de Riesgo Operacional, Gerente General, Auditor Interno y Oficial de Cumplimiento.

La pestaña muestra abiertos, vencidos, los que vencen en 15 días, por verificar, reprogramados y
cerrados en el año con el porcentaje cerrado dentro del plazo comprometido; tiene las vistas "Mis
planes" y "Por verificar" y exporta a Excel. El informe ejecutivo incluye un resumen y los planes
vencidos, y los tableros y reportes muestran el tratamiento de cada riesgo calculado de sus planes.

Al actualizar una base existente, una sola vez, los planes que vivían dentro de cada módulo pasan
al registro: planes de mitigación de los riesgos, acciones correctivas de los hallazgos, planes de
cumplimiento y de la autoevaluación de seguridad (sus textos se vacían porque quedan como planes) y
las acciones de las pruebas de continuidad con observaciones.

## Autoevaluaciones (RCSA, BIA y cuestionarios)

En **Gestión de Riesgo → Autoevaluaciones** se lanzan campañas que envían un cuestionario a cada
dueño de proceso. Hay cuatro tipos:

| Tipo | Qué pregunta | Dónde se aplica lo respondido |
| :--- | :--- | :--- |
| Riesgos y controles (RCSA) | Probabilidad e impacto de cada riesgo del proceso, si cada control se ejecutó y tiene evidencia, riesgos nuevos e incidentes no reportados | Matriz de riesgos |
| Análisis de impacto (BIA) | MTPD, RTO, RPO, dotación mínima, sistemas y cambios de cada proceso crítico | BIA de Continuidad |
| Cumplimiento | Estado y evidencia de los requisitos de una norma (todos o solo los que tienen brechas) | Evaluación del requisito |
| Personalizada | Preguntas propias, una por línea (`*` al inicio la hace obligatoria y `\| tipo` define la respuesta) | Solo se revisa |

El flujo es: se guarda la campaña como borrador (muestra cuántas encuestas y preguntas enviará), se
**lanza**, cada destinatario la ve en **"Mis encuestas"**, la responde (puede guardar y seguir después)
y la **envía**. Quien administra autoevaluaciones la revisa: ve las diferencias con el valor vigente
(cambios, brechas y alertas), aplica cada cambio al módulo correspondiente, crea planes de acción
desde las brechas, la devuelve con observaciones o la marca como revisada. Puede reasignar
destinatarios, cerrar la campaña y exportar las respuestas a Excel.

El servidor aplica las reglas en cada guardado: el destinatario solo puede cambiar sus respuestas y
enviarlas mientras la campaña está en curso; crear, lanzar, reasignar o revisar exige el permiso
**"Administrar Autoevaluaciones"**, asignado por defecto a Jefe de Riesgo Operacional y Oficial de
Cumplimiento. Aplicar un cambio exige además el permiso del módulo de destino. Lanzamientos, envíos,
revisiones y cambios aplicados quedan en el ledger.

## Aprobaciones

En **Estratégico & Ejecutivo → Aprobaciones** están las solicitudes que otro cargo debe aprobar antes
de aplicarse. Se envían desde el registro con "Solicitar aprobación":

| Tipo | Dónde se solicita | Al aprobarse |
| :--- | :--- | :--- |
| Aceptación de riesgo | Matriz de riesgos → editar un riesgo sobre el apetito → "5. Aceptación del riesgo" | El riesgo queda aceptado hasta la fecha de revisión (se ve en la matriz y en el informe ejecutivo) |
| Aceptación de vulnerabilidad | Seguridad de la Información → vulnerabilidad → "Solicitar aceptación" | Pasa a "Riesgo aceptado" con quien aprobó y la fecha de revisión |
| Plan de continuidad | Continuidad → Planes → editar → "Solicitar aprobación del plan" | Queda Vigente con la versión, quien aprobó, la fecha y la próxima revisión |
| Informe de auditoría | Auditorías → auditoría Finalizada → "Enviar informe a aprobación" | La auditoría pasa a Aprobada |
| Reprogramación de plan | Planes de Acción → el responsable pide "más plazo" | El plan cambia al nuevo plazo y la reprogramación queda registrada |

Los cargos que aprueban cada tipo, en orden, se configuran en **Mantenedores → Aprobaciones y avisos**
(por defecto: Gerente General para riesgos, planes de continuidad; Jefe de Riesgo Operacional y luego
Gerente General para vulnerabilidades; Junta de Vigilancia para informes de auditoría; Jefe de Riesgo
Operacional para reprogramaciones). Un riesgo fuera de la tolerancia suma un nivel (Comité de Riesgos
por defecto). Quien solicita nunca aprueba su propia solicitud. Por eso, los estados "Riesgo
aceptado", plan "Vigente" y auditoría "Aprobada" ya no se eligen a mano: se obtienen al aprobarse.

El servidor valida cada paso (quién puede solicitar, que los niveles sean los de la matriz vigente,
que solo resuelva el cargo del nivel en curso y que no se salte niveles) y, al aprobarse el último
nivel, aplica el cambio al registro en la misma transacción, aunque quien aprueba no tenga permiso
de edición en ese módulo. Cada solicitud, decisión y anulación queda en la bitácora.

## Avisos y correo

La campana de la barra superior muestra los avisos de cada persona; un clic abre el registro. Se
generan:

- **Por cambios:** plan de acción asignado, enviado a verificación, cerrado, devuelto, reprogramado o
  cancelado; autoevaluación asignada, enviada, devuelta o revisada; aprobación pendiente, aprobada por
  un nivel, aprobada, rechazada o anulada; incidente crítico o alto registrado; alerta de KRI crítica
  (según las preferencias de notificación de KRIs, que ahora sí envían correo).
- **Por plazos** (revisión cada `NOTIFY_INTERVAL_MINUTES`, 15 por defecto): planes por vencer, vencidos
  y escalados a quien administra planes; autoevaluaciones por vencer o vencidas; aprobaciones sin
  resolver (recordatorio cada N días); planes de continuidad con revisión vencida o próxima;
  vulnerabilidades fuera de plazo; aceptaciones de riesgos y vulnerabilidades por revisar; contratos de
  proveedores por vencer. Cada aviso se genera una sola vez por plazo.

Cada persona elige en la campana (engranaje) si recibe correo al momento, un **resumen diario** o
ninguno, y qué categorías. Los correos traen un enlace que abre el registro (`APP_URL`). En
**Mantenedores → Aprobaciones y avisos** se activan los correos, la hora del resumen y los días de
anticipación, se envía un correo de prueba y se ve el registro de envíos (enviado, en resumen,
omitido o con error). Sin SMTP los avisos quedan en la campana y los correos figuran como omitidos.

## Variables de entorno

| Variable | Descripción |
| :--- | :--- |
| `DB_CLIENT` | `postgres`, `sqlite` o `none` (modo demostración). Sin definir: PostgreSQL si hay `DATABASE_URL`/`POSTGRES_HOST`; si no, SQLite. |
| `DATABASE_URL` | Cadena de conexión PostgreSQL. |
| `SQLITE_PATH` | Archivo de la base SQLite (por defecto `data/riskguard.db` en la carpeta desde donde se inicia). |
| `SEED_DEMO_DATA` | `true` carga datos de ejemplo ficticios en una base vacía. Usar `false` en producción. |
| `ADMIN_EMAIL` | Correo del administrador inicial cuando no se cargan datos de ejemplo. |
| `DATABASE_SSL` | `true` para conectarse con SSL (bases administradas en la nube). |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false` solo si el certificado del servidor no es verificable. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_HELO_NAME` | Servidor de correo para los códigos de acceso y los avisos (ver Google Workspace). |
| `AUTH_DEV_LOG_CODES` | `true` muestra los códigos en el log (solo para evaluar sin SMTP). |
| `APP_URL` | Dirección pública de la aplicación (p. ej. `https://grc.tucooperativa.cl`) para los enlaces de los correos. |
| `NOTIFY_INTERVAL_MINUTES` | Cada cuántos minutos se revisan los plazos y se envían correos (15 por defecto; `0` lo desactiva). |
| `NOTIFY_DEV_LOG` | `true` escribe en el log los correos de aviso cuando no hay SMTP (solo para evaluar). |
| `TZ` | Zona horaria del servidor (p. ej. `America/Santiago`): define la hora del resumen diario y el día de los plazos. |
| `AUTH_SECRET` | Clave para firmar los códigos. Recomendada; obligatoria con varias instancias. |
| `SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS` | Vigencia de la sesión (60 minutos de inactividad y 10 horas en total por defecto). |
| `TRUST_PROXY`, `COOKIE_SECURE` | Configuración detrás de un proxy HTTPS. |
| `PORT` | Puerto HTTP (por defecto 4000; Docker y el paquete SQLite usan 3000). |
| `NG_ALLOWED_HOSTS` | Nombres o IP con que se accede a la app además de `localhost` y `APP_URL` (separados por coma). |
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
| `PUT /api/settings/:clave` | Guarda un ajuste (industria, umbral de pérdidas, notificaciones, matriz de aprobación). |
| `GET /api/notifications` · `POST /api/notifications/read` | Avisos de la persona de la sesión / marcarlos como leídos (`{ids}` o `{all:true}`). |
| `GET/PUT /api/notifications/preferences` | Preferencia de correo de la persona (`inmediato`, `resumen`, `ninguno` y categorías). |
| `POST /api/notifications/test` | Envía un correo de prueba a la persona de la sesión. |
| `GET /api/notifications/outbox` · `POST /api/notifications/run` | Registro de envíos / revisar plazos ahora (Mantenedores). |
| `GET /api/db/health` · `GET /api/db/stats` | Diagnóstico de la conexión y conteos. |
| `POST /api/db/init` | Vuelve a aplicar el esquema y los datos base. |

Entidades: `roles`, `users`, `controls`, `risks`, `providers`, `regulatory-milestones`, `flaws`,
`alerts`, `audits`, `kris`, `bia`, `plans`, `continuity-tests`, `info-assets`, `vulnerabilities`,
`security-assessment`, `norms`, `compliance`, `security-tests`, `action-plans`, `survey-campaigns`,
`survey-responses`, `approvals`.

## Limitaciones conocidas

- Si dos personas editan **el mismo** registro a la vez, prevalece el último guardado.
- SQLite usa `node:sqlite`, incluido en Node.js (en Node 22 se marca como experimental; los scripts
  de inicio ocultan ese aviso). Las escrituras se procesan de a una, lo que basta para un equipo o
  un grupo pequeño. Las vistas SQL de reportes (`v_*`) solo existen en PostgreSQL; la aplicación no
  las usa.

## Modelo de datos (principales tablas)

| Área | Tablas |
| :--- | :--- |
| Gobierno y accesos | `organizational_roles`, `user_profiles` |
| Mantenedores | `org_areas`, `business_processes`; en `system_settings`: `general_parameters`, `risk_scale`, `risk_appetite`, `accounting_accounts`, `provider_catalogs` |
| Riesgos y controles | `risks`, `risk_controls`, `controls`, `control_test_executions` |
| Incidentes y pérdidas | `operational_flaws` (con campos de base de pérdidas) |
| Reporte CMF / ANCI | `regulatory_milestone_templates`, `regulatory_reports`, `regulatory_submissions`, `regulatory_report_updates` |
| KRIs y alertas | `kri_definitions`, `anomaly_alerts` |
| Auditoría | `periodic_audits`, `audit_findings`, `crypto_audit_ledger` |
| Terceros | `service_providers` |
| Continuidad | `bia_processes`, `bia_process_providers`, `continuity_plans`, `continuity_plan_processes`, `continuity_tests` |
| Seguridad de la información | `info_assets`, `vulnerabilities`, `security_assessment_items`, `security_tests` |
| Cumplimiento normativo | `compliance_norms`, `compliance_requirements` (y columnas `ran207`, `ran209`, `cyber` en proveedores, continuidad e incidentes) |
| Planes de acción | `action_plans` |
| Autoevaluaciones | `survey_campaigns`, `survey_responses` |
| Aprobaciones y avisos | `approval_requests`, `notifications`, `notification_preferences` (y la columna `acceptance` en `risks`) |
| Ajustes | `system_settings` |

Vistas de apoyo a reportes: `v_loss_database`, `v_regulatory_deadlines`, `v_provider_rto_gaps`,
`v_provider_contract_expiry`, `v_overdue_vulnerabilities`, `v_process_risk_summary`, `v_kri_breaches`.
