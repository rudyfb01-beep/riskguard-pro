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

Los usuarios entran con su **cuenta de Google** de la organización (si está configurado, ver
"Ingreso con Google") o con su **correo electrónico** y un **código de 6 dígitos** que se les envía
por email. No hay contraseñas.

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

### Ingreso con Google (Google Workspace)

El botón "Continuar con Google" usa OpenID Connect, con el flujo de código de autorización y PKCE.

**Qué verifica el servidor**
- **El token:** su firma (claves públicas de Google), el emisor, la audiencia, la vigencia y el `nonce`.
- **La cuenta:** que el correo esté verificado y que el dominio esté permitido (claim `hd`, que solo traen las cuentas de Google Workspace).
- **Quién entra:** solo personas **ya registradas y activas** en "Puestos & Permisos"; no se crean usuarios automáticamente.
- **Vínculo con la cuenta:** la primera vez queda vinculada la cuenta de Google de la persona. Si después alguien entra con otra cuenta que tenga el mismo correo (por ejemplo, un correo reasignado), se rechaza. Un administrador puede **desvincularla** en "Puestos & Permisos" (chip "Google vinculado" → Desvincular), y en el siguiente ingreso se vincula la cuenta que use.

**Configuración**

1. En [Google Cloud Console](https://console.cloud.google.com/), dentro del proyecto de la organización:
   - **APIs y servicios → Pantalla de consentimiento de OAuth:** tipo de usuario **Interno**, para que solo entren cuentas de su Google Workspace.
   - **Credenciales → Crear credenciales → ID de cliente de OAuth:**
     - tipo **Aplicación web**;
     - **URI de redireccionamiento autorizado:** `https://SU_DOMINIO/api/auth/google/callback` (la misma dirección de `APP_URL`).
2. Configure en el servidor:

   ```bash
   GOOGLE_CLIENT_ID="123456-abc.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="GOCSPX-..."
   GOOGLE_ALLOWED_DOMAINS="tucooperativa.cl"   # uno o varios, separados por coma
   APP_URL="https://grc.tucooperativa.cl"      # define la dirección de retorno
   AUTH_EMAIL_CODE="admins"                     # true | false | admins
   ```
3. Reinicie el servidor. La pantalla de acceso mostrará "Continuar con Google".

**`AUTH_EMAIL_CODE`: qué pasa con el código por correo cuando Google está activo**

| Valor | Efecto |
| :--- | :--- |
| `true` (por defecto) | Siguen disponibles las dos formas de ingreso. |
| `false` | Solo se entra con Google; el servidor rechaza pedir o usar códigos. |
| `admins` | El código queda solo como **acceso de emergencia** para quienes administran cargos (por ejemplo, si Google no está disponible). A las demás personas no se les envía código; la respuesta es la misma, para no revelar quién es administrador. |

**Comportamiento**
- **Sesión:** es la misma que con el código: cookie `HttpOnly`, vencimiento por inactividad y bitácora ("Inicio de sesión con Google").
- **Sesión vencida mientras se trabaja:** el ingreso con Google se abre en una ventana emergente y los cambios pendientes se guardan al volver.
- **Enlaces de correo:** un enlace (por ejemplo, a una aprobación) se abre en el registro después de ingresar.

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

Con HTTPS la aplicación envía HSTS. Las cabeceras de seguridad (CSP y otras), el límite de
solicitudes y el alcance para un pentest externo están en [SECURITY.md](SECURITY.md).

## Operación, respaldos y monitoreo

- **Respaldo automático** diario de la base (SQLite: copia `.db`; PostgreSQL: `pg_dump`), con
  manifiesto y SHA-256, en `BACKUP_DIR` (volumen `backups` en Docker); se conservan los últimos
  `BACKUP_KEEP`. Copie esa carpeta fuera del servidor.
- **Restaurar:** con la aplicación detenida, `node scripts/restaurar.mjs <respaldo>` (verifica el
  SHA-256 antes de restaurar).
- **Monitoreo:** `GET /api/health` (vivo) y `GET /api/ready` (base disponible; lo usa el
  `HEALTHCHECK` de Docker).
- **Panel Operación y respaldos** (Configuración): estado del servicio y la base, respaldos
  (respaldar, verificar, descargar), integridad de la bitácora, correo y una revisión de la
  configuración con lo que conviene corregir antes de producción.

Detalle, objetivos de recuperación y respuesta ante fallas: [docs/OPERACION.md](docs/OPERACION.md).
Pruebas automatizadas e integración continua: [docs/PRUEBAS.md](docs/PRUEBAS.md). Plan de
validación de usuario y acta: [docs/VALIDACION-UAT.md](docs/VALIDACION-UAT.md).

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

## Carga masiva (Excel o CSV)

En **Configuración → Carga masiva** se cargan de una vez los datos de la organización desde una
planilla (.xlsx o .csv, hasta 5.000 filas por archivo). Cada tipo exige el permiso que corresponde:

| Tipo | Se reconoce por | Permiso |
| :--- | :--- | :--- |
| Áreas | Nombre | Mantenedores |
| Procesos | Código (o nombre) | Mantenedores |
| Usuarios | Correo | Administrar cargos |
| Controles | Código | Evaluar controles o editar riesgos |
| Proveedores | Código o RUT | Proveedores |
| Activos de información | Código | Seguridad de la información |
| Incidentes y pérdidas (base histórica) | — (siempre nuevos) | Reportes regulatorios o convertir incidencias |

La matriz de riesgos y los requisitos normativos tienen sus importadores propios (ver arriba y en
Cumplimiento normativo); la pantalla los enlaza.

- **Plantilla Excel**: hoja *Datos* con los encabezados (los obligatorios en verde) y una fila de
  ejemplo, hoja *Instrucciones* con el formato de cada columna y hoja *Listas* con los valores
  permitidos (procesos, áreas, puestos, categorías…), que en *Datos* aparecen como listas desplegables.
- También sirve una planilla propia: se detecta la hoja y la fila de encabezado (aunque haya un título
  arriba) y las columnas por su nombre o sinónimos (p. ej. *Cargo* → Puesto, *Email* → Correo). Cada
  asociación se puede corregir antes de cargar.
- Valores: fechas como fecha de Excel, `AAAA-MM-DD` o `DD-MM-AAAA`; montos con o sin separador de
  miles (`1.200.000`, `$ 2.500.000`); Sí/No; las listas aceptan mayúsculas, tildes y abreviaturas
  (*prev* → Preventivo). Los procesos se asocian al más parecido con un aviso.
- **Actualizar los existentes** (opción activa por defecto): si la clave coincide, se actualiza el
  registro y las celdas vacías conservan el valor actual. Si se desactiva, esas filas se omiten. Los
  códigos que faltan se asignan en orden (CTR-, PRV-, AST-, PRC-).
- Reglas: en usuarios los permisos vienen del puesto (un cambio de puesto aplica los del nuevo); no se
  puede desactivar el propio usuario ni dejar el sistema sin un administrador de cargos activo. Un
  proceso no se renombra por carga (se hace en Mantenedores, que actualiza las referencias). En
  controles, una nueva efectividad agrega una prueba al historial. Los incidentes cargados no generan
  avisos por correo y se advierten los posibles duplicados.
- **Vista previa** con lo que se crea, se actualiza, se omite o tiene errores, y avisos (RUT con dígito
  verificador inválido, montos recuperados mayores a la pérdida, fechas futuras…). **Resultado (.xlsx)**
  descarga el archivo original con el resultado y las observaciones de cada fila, para corregir y
  volver a cargar.
- Las filas con errores no se cargan. El resto se guarda **en una sola transacción** (si algo falla,
  no se guarda nada) junto con un bloque `CARGA_MASIVA` en la bitácora con el archivo y los totales.

## Gestión de crisis

En **Resiliencia & Terceros → Gestión de Crisis** está la sala del Comité de Crisis (RAN 20-9 I.3,
RAN 20-10 §2, ISO 22301/22361):

- **Comité de Crisis** (pestaña Comité): integrantes con rol (presidente, coordinador, vocero, TI,
  operaciones, legal…), teléfono, correo y suplente; sala principal, alternativa y virtual; protocolo
  de convocatoria y aprobación. Se advierte si falta presidente, vocero, teléfonos o sala alternativa.
  Lo define quien tiene el permiso "Continuidad". Puede incluir personas sin usuario (reciben los avisos
  por correo).
- **Escenarios de desastre y crisis**: amenaza, categoría (las 5 mínimas de la RAN 20-9 más desastre
  natural y crisis reputacional o de liquidez), probabilidad × impacto, criterio de activación, primeras
  acciones, mensajes clave, procesos del BIA afectados y planes que se activan. Toda instalación parte
  con 6 escenarios de referencia para ajustar. Se muestra cuáles de los 5 mínimos se ejercitaron en los
  últimos 12 meses.
- **Declarar una crisis o iniciar un simulacro**: lo hace quien integra el comité (o su suplente) o
  administra continuidad, aunque su cargo no tenga otros permisos. Se elige escenario, nivel
  (1 Alerta · 2 Crisis · 3 Crisis mayor), incidente vinculado, procesos y planes. Al declarar una crisis
  real se avisa de inmediato al comité por la aplicación y por correo (urgente) y aparece un aviso en
  toda la aplicación hasta que se cierra.
- **Sala de crisis**: tiempo transcurrido, bitácora de situación, decisiones y acciones (cada entrada
  con hora y autor; no se edita ni se borra), tareas cargadas desde el escenario, comunicaciones
  emitidas (a socios, colaboradores, CMF, ANCI, medios…), procesos afectados con la hora en que vence su
  RTO, planes activados y el comité con teléfonos y correo a todos. Se cambia el nivel, se marca
  estabilizada y se cierra con un resumen.
- **Cierre y lecciones aprendidas**: los planes de acción que nacen de la revisión quedan vinculados a
  la crisis. Un simulacro cerrado se registra como **prueba de continuidad** del plan activado (con
  resultado y RTO logrado), así entra en el programa de pruebas y en los controles de la RAN 20-9.
- **Programa de simulacros**: se programan con fecha y escenario; el comité recibe aviso al programarse
  y una semana antes, y se inician desde el listado.
- El control normativo "Administración de crisis" (RAN 20-9 I.3 y 20-10 §2) considera el plan de
  crisis vigente, el comité completo y los escenarios ejercitados.

## Edición simultánea y permisos en pantalla

**Edición simultánea:** cada registro tiene un número de versión. La aplicación guarda indicando la
versión que estaba editando; si otra persona lo guardó (o eliminó) antes, el servidor rechaza el
cambio (409) en vez de pisarlo y la pantalla avisa quién lo cambió y a qué hora, con su versión ya
cargada. Se puede **mantener su versión** (lo propio se descarta) o **guardar la mía encima**
(reemplaza su cambio de forma consciente). La comparación y el aumento de versión ocurren en la misma
operación de base de datos, así que de varios guardados simultáneos sobre la misma versión solo
uno gana. Las cargas masivas, las aprobaciones (que actualizan el registro de origen), los cambios de
nombre de procesos y áreas y la conversión de moneda también suben la versión de lo que modifican.
Las integraciones que llaman a la API sin la cabecera `X-Base-Version` siguen funcionando sin control.

**Permisos en pantalla:** las acciones que el cargo no puede usar no se muestran (crear, editar,
importar, configurar, resolver alertas, simular, Puestos & Permisos, Carga masiva…). Quien solo
consulta ve los registros con "Ver" en lugar de "Editar" y los formularios sin botón de guardar. El
servidor sigue validando cada permiso.

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

Una instalación nueva (con o sin datos de ejemplo) parte con 10 áreas y 14 procesos de referencia
para una cooperativa y con la moneda en CLP; las instalaciones existentes conservan su moneda (si
están en USD, la base de pérdidas lo advierte y se convierten desde Parámetros generales).

**Unidad de Fomento (UF):** con montos en pesos, la base de pérdidas también se expresa en UF.
Cada evento guarda el valor de la UF de su fecha de referencia (contable; si falta, de
descubrimiento, de ocurrencia o de registro; si ese día no tiene valor, el último anterior hasta 45
días), así la pérdida de un año se compara con la de otro sin el efecto de la inflación. Se ve en la
columna *Neta UF* y el total de la base de pérdidas, en el umbral de registro, en el formulario del
incidente y en la exportación (valor y fecha UF, y montos bruto, recuperado y neto en UF).

- **Valores de la UF** (Mantenedores → Parámetros generales): con base de datos el servidor los
  descarga una vez al día desde [mindicador.cl](https://mindicador.cl) (serie del Banco Central) y
  también se pueden descargar a pedido por año. Sin salida a internet se pegan desde una planilla
  (una fecha y un valor por línea) o se apunta `UF_SOURCE_URL` a otra fuente con el mismo formato.
- **Asignar la UF a eventos sin valor:** los eventos registrados antes de tener la tabla, o
  convertidos desde USD, se completan con un botón (permiso "Reportes regulatorios").
- Al cambiar las fechas de un evento se toma el valor UF de la nueva fecha de referencia.

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

## Evidencias (archivos)

Los módulos que piden respaldo permiten adjuntar archivos reales (clic o arrastrar):

| Módulo | Dónde |
| :--- | :--- |
| Controles | "Probar y Adjuntar": los archivos quedan en el control y asociados a la prueba registrada |
| Matriz de riesgos | Documentos de respaldo del riesgo |
| Planes de acción | "Evidencias del plan": el responsable adjunta mientras el plan está abierto; puede enviarlo a verificación solo con archivos |
| Cumplimiento | Al evaluar un requisito |
| Auditorías | Informe y papeles de trabajo (tarjeta) y evidencia de cada hallazgo |
| Incidentes | Al editar el incidente (capturas, logs, informes, comunicaciones) |
| Continuidad | Documento del plan y anexos; informe de cada prueba (tabla de pruebas) |
| Seguridad de la información | Vulnerabilidades y pruebas de seguridad (informe del pentest) |
| Autoevaluaciones | En cada pregunta de evidencia y como anexos; quien responde adjunta mientras la encuesta está abierta |
| Aprobaciones | Respaldos de la solicitud; además se ven los archivos del registro que se aprueba |
| Proveedores | Contrato, anexos de servicio, certificaciones y debida diligencia |

- **Formatos:** PDF, Word, Excel, PowerPoint, imágenes (PNG, JPG, GIF), CSV, texto, correo (.msg, .eml) y ZIP. El servidor comprueba que el contenido corresponda a la extensión (un ejecutable renombrado a .pdf se rechaza) y no acepta HTML ni SVG.
- **Tamaño:** máximo `EVIDENCE_MAX_MB` por archivo (15 MB por defecto).
- **Integridad:** el servidor calcula el SHA-256 y registra la carga en la bitácora criptográfica en la misma transacción. El botón "Verificar" recalcula el hash del contenido guardado.
- **Descarga:** siempre como descarga, salvo la vista de PDF e imágenes, que se abren con una política de seguridad que bloquea scripts.
- **Bajas:** exigen un motivo y quedan en la bitácora. El archivo deja de mostrarse, pero el contenido se conserva en la base para auditoría.
- **Permisos:** los del módulo (por ejemplo, evaluar controles o administrar cumplimiento). El responsable de un plan o quien responde una autoevaluación también puede adjuntar en lo suyo.
- **Almacenamiento:** los archivos se guardan en la base de datos (tabla `evidence_files`), así que el respaldo de la base incluye las evidencias. Considere el tamaño al dimensionar la base.
- **Archivos anteriores:** los adjuntos de la versión previa eran solo nombres, sin contenido; se muestran como "registros anteriores sin archivo".

## Gestión documental

En **Supervisión & Auditoría → Gestión Documental** se lleva el listado maestro de políticas, manuales, reglamentos, procedimientos, instructivos, planes y formularios:

- **Documento:** código por tipo (POL-001, MAN-001, PRO-001…), responsable, clasificación (pública, interna, confidencial), frecuencia de revisión, a quién va dirigido (cargos, o todas las personas), requisitos normativos que respalda y procesos.
- **Versiones:** se crea un borrador (versión mayor o cambio menor), se adjunta su archivo (PDF o Word; queda en las evidencias con su SHA-256) y se envía a aprobación con el tipo **"Aprobación de documento"**.
  - Por defecto aprueba la Gerencia General. Las políticas, manuales y reglamentos suman al Consejo de Administración como nivel adicional (configurable en Mantenedores → Aprobaciones y avisos).
  - Al aprobarse el último nivel, la versión pasa a **vigente**, la anterior queda **reemplazada**, se registran quién aprobó y la fecha, y se fija la próxima revisión.
  - Nadie puede marcar una versión como vigente a mano: el servidor lo rechaza.
- **Difusión:** cuando una versión queda vigente, cada persona del público objetivo recibe un aviso. Confirma su lectura con "He leído y comprendo", que queda en la bitácora. El panel muestra el avance y quiénes faltan, y se puede exportar. A los 7 días se envía un recordatorio a quienes no han leído.
- **Revisión:** avisos 30 días antes de la próxima revisión y al vencer. El documento figura como "Revisión vencida" hasta que se apruebe una nueva versión.
- **Cumplimiento:** cada requisito muestra los documentos que lo respaldan. Si no tiene una verificación automática ni controles vinculados, sugiere su estado según los documentos ("Cumple" si todos están vigentes).
- **Obsoletos:** un documento se marca obsoleto con un motivo, y sus versiones se conservan.
- **Exportaciones:** listado maestro y registro de lecturas en CSV. El informe ejecutivo incluye una sección de gestión documental.
- **Permisos:**
  - Crear documentos, versiones y solicitudes exige el permiso **"Administrar Gestión Documental"** (Jefe de Riesgo Operacional y Oficial de Cumplimiento por defecto).
  - Cualquier persona puede confirmar su propia lectura de la versión vigente.

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
| `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` | Credenciales de OAuth de Google Cloud. Con ambas se activa "Continuar con Google". |
| `GOOGLE_ALLOWED_DOMAINS` | Dominios de Google Workspace permitidos, separados por coma (recomendado). |
| `AUTH_EMAIL_CODE` | Con Google activo: `true` (código también disponible), `false` (solo Google) o `admins` (código solo como acceso de emergencia de administradores). |
| `GOOGLE_REDIRECT_URI` | Opcional: dirección de retorno si no es `APP_URL` + `/api/auth/google/callback`. |
| `UF_AUTO_SYNC` | `false` desactiva la descarga diaria de la UF (servidores sin salida a internet). |
| `UF_SOURCE_URL` | Fuente de la UF con el formato de mindicador.cl (por defecto `https://mindicador.cl/api/uf`; se agrega `/AAAA`). |
| `EVIDENCE_MAX_MB` | Tamaño máximo por archivo de evidencia (15 por defecto). Detrás de un proxy, ajuste también su límite de carga (p. ej. `client_max_body_size` en nginx). |
| `TZ` | Zona horaria del servidor (p. ej. `America/Santiago`): define la hora del resumen diario y el día de los plazos. |
| `AUTH_SECRET` | Clave para firmar los códigos. Recomendada; obligatoria con varias instancias. |
| `SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS` | Vigencia de la sesión (60 minutos de inactividad y 10 horas en total por defecto). |
| `TRUST_PROXY`, `COOKIE_SECURE` | Configuración detrás de un proxy HTTPS. |
| `PORT` | Puerto HTTP (por defecto 4000; Docker y el paquete SQLite usan 3000). |
| `NG_ALLOWED_HOSTS` | Nombres o IP con que se accede a la app además de `localhost` y `APP_URL` (separados por coma). |
| `GEMINI_API_KEY` | Opcional: habilita el análisis de incidentes con IA. |
| `GEMINI_MODEL` | Modelo de Gemini (por defecto `gemini-3.8-flash`). Si el servicio falla se usa el análisis calculado. |
| `SMS_GATEWAY_URL`, `SMS_GATEWAY_TOKEN`, `SMS_FROM` | Pasarela HTTP de SMS para las alertas de KRI: recibe `POST {to, message, from}` con `Authorization: Bearer <token>`. Sin ella no se envían SMS. |
| `WEBHOOK_ALLOW_HTTP`, `WEBHOOK_ALLOW_PRIVATE` | `true` permite webhooks de alertas por http o hacia direcciones internas (por defecto solo https públicas). |
| `BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP`, `BACKUP_DIR` | Respaldo automático: cada 24 h, se conservan 14, carpeta `backups/` (ver docs/OPERACION.md). `BACKUP_INTERVAL_HOURS=0` lo desactiva. |
| `BACKUP_FIRST_DELAY_SECONDS`, `PG_DUMP_PATH`, `PG_RESTORE_PATH` | Espera inicial del respaldo (120 s) y ejecutables de PostgreSQL. |
| `APP_VERSION` | Versión informada en `/api/health`, el panel y los manifiestos de respaldo. |
| `RATE_LIMIT_PER_MINUTE` | Solicitudes a la API por IP y minuto (600; `0` lo desactiva). |
| `JSON_LIMIT`, `ALLOWED_ORIGINS`, `HSTS_MAX_AGE`, `CSP` | Tamaño máximo de JSON (15mb), orígenes adicionales para escrituras, duración de HSTS y `CSP=off` para diagnóstico (ver SECURITY.md). |

## API

Todas las rutas (salvo `/api/auth/*`, `/api/health`, `/api/ready` y `/api/db/health`) requieren
sesión. Las escrituras deben enviar la cabecera `X-Requested-With: RiskGuard` y, si traen `Origin`,
venir del propio sitio (protección CSRF). Cada respuesta lleva `X-Request-Id`; los errores 500 no
muestran detalles internos.

| Método y ruta | Uso |
| :--- | :--- |
| `POST /api/auth/request-code` · `POST /api/auth/verify` | Pide el código por correo / lo verifica y abre la sesión. |
| `GET /api/auth/me` · `POST /api/auth/logout` | Usuario de la sesión / cierre de sesión. |
| `GET /api/auth/config` | Formas de ingreso disponibles (Google, código y dominios). |
| `GET /api/auth/google/start` · `GET /api/auth/google/callback` | Ingreso con Google (redirección y retorno). |
| `POST /api/admin/users/:id/google-unlink` | Desvincula la cuenta de Google de una persona (administradores). |
| `GET /api/data` | Carga completa de la aplicación (o `{"mode":"demo"}` sin base de datos). |
| `PUT /api/data/:entidad/:id` | Guarda un objeto completo (riesgo, control, incidente, proveedor…). Con `X-Base-Version` responde 409 si otra persona lo cambió; devuelve la nueva `version`. |
| `DELETE /api/data/:entidad/:id` | Elimina un objeto. |
| `POST /api/ledger` · `GET /api/ledger` | Agrega un bloque a la bitácora / lee la cadena completa. |
| `PUT /api/settings/:clave` | Guarda un ajuste (industria, umbral de pérdidas, notificaciones, matriz de aprobación). |
| `GET /api/notifications` · `POST /api/notifications/read` | Avisos de la persona de la sesión / marcarlos como leídos (`{ids}` o `{all:true}`). |
| `GET/PUT /api/notifications/preferences` | Preferencia de correo de la persona (`inmediato`, `resumen`, `ninguno` y categorías). |
| `POST /api/notifications/test` | Envía un correo de prueba a la persona de la sesión. |
| `GET /api/notifications/outbox` · `POST /api/notifications/run` | Registro de envíos / revisar plazos ahora (Mantenedores). |
| `GET /api/health` · `GET /api/ready` | Vivo / listo (públicas, para monitoreo). |
| `GET /api/admin/ops` | Estado para el panel Operación y respaldos. |
| `POST /api/admin/backups` · `POST /api/admin/backups/:archivo/verify` · `GET /api/admin/backups/:archivo` | Respaldar ahora / verificar / descargar (administración de cargos). |
| `GET /api/notifications/channels` · `POST /api/notifications/kri-test` | Canales de aviso de KRIs disponibles / envío de prueba real `{channel: email\|sms\|webhook, to, kriCode}`. |
| `POST /api/admin/uf-sync` | Descarga los valores de la UF (`{years}`) y los agrega a la tabla. |
| `POST /api/import/:tipo` | Carga masiva `{records, fileName}` (`areas`, `processes`, `users`, `controls`, `providers`, `info-assets`, `flaws`): valida y guarda todo en una transacción. |
| `POST /api/evidence?entityType=&entityId=&context=&description=` | Carga un archivo (cuerpo binario, nombre en `X-File-Name`). |
| `GET /api/evidence/:id` · `GET /api/evidence/:id/verify` · `DELETE /api/evidence/:id` | Descarga (`?inline=1` para ver PDF/imágenes) / verifica el SHA-256 / baja con `{reason}`. |
| `GET /api/db/health` · `GET /api/db/stats` | Diagnóstico de la conexión y conteos. |
| `POST /api/db/init` | Vuelve a aplicar el esquema y los datos base. |

Entidades: `roles`, `users`, `controls`, `risks`, `providers`, `regulatory-milestones`, `flaws`,
`alerts`, `audits`, `kris`, `bia`, `plans`, `continuity-tests`, `info-assets`, `vulnerabilities`,
`security-assessment`, `norms`, `compliance`, `security-tests`, `action-plans`, `survey-campaigns`,
`survey-responses`, `documents`, `approvals`, `crisis-scenarios`, `crisis-events`.

## Limitaciones conocidas

- La edición simultánea se controla por registro (ver "Edición simultánea"); los ajustes generales
  (escala, apetito, parámetros) se guardan completos y prevalece el último guardado.
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
| Gestión de crisis | `crisis_scenarios`, `crisis_events` (bitácora, tareas y comunicaciones) y el ajuste `crisis_committee` |
| Seguridad de la información | `info_assets`, `vulnerabilities`, `security_assessment_items`, `security_tests` |
| Cumplimiento normativo | `compliance_norms`, `compliance_requirements` (y columnas `ran207`, `ran209`, `cyber` en proveedores, continuidad e incidentes) |
| Planes de acción | `action_plans` |
| Autoevaluaciones | `survey_campaigns`, `survey_responses` |
| Aprobaciones y avisos | `approval_requests`, `notifications`, `notification_preferences` (y la columna `acceptance` en `risks`) |
| Evidencias | `evidence_files` (contenido y SHA-256) |
| Gestión documental | `controlled_documents` (versiones y lecturas) |
| Edición simultánea | `record_versions` (versión, fecha y autor del último guardado de cada registro) |
| Ajustes | `system_settings` (incluye `uf_values`, la tabla de la UF) |

Vistas de apoyo a reportes: `v_loss_database`, `v_regulatory_deadlines`, `v_provider_rto_gaps`,
`v_provider_contract_expiry`, `v_overdue_vulnerabilities`, `v_process_risk_summary`, `v_kri_breaches`.
