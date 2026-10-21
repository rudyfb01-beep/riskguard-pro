# 🚀 Guía de Instalación Local con Base de Datos PostgreSQL

Esta guía detalla los pasos para instalar y ejecutar **Custodia Risk Management** en tu entorno local (Windows, macOS o Linux) junto con el motor de base de datos relacional **PostgreSQL 15 / 16**.

---

## 📋 Requisitos Previos

Elige la modalidad que prefieras:

### Modalidad A: Con Docker (Recomendada - Sin instalar Postgres manualmente)
* **Docker Desktop** (versión 20+ con soporte para Docker Compose).

### Modalidad B: Instalación Nativa
* **Node.js**: versión 20.x o 22.x LTS.
* **npm**: versión 10+.
* **PostgreSQL**: versión 14, 15 o 16 en ejecución local.
* Herramienta visual SQL recomendada: DBeaver, pgAdmin 4, TablePlus o cliente CLI `psql`.

---

## ⚡ Opción 1: Despliegue Rápido con Docker Compose (1 solo comando)

Esta opción levanta automáticamente:
1. El contenedor de **PostgreSQL 16** con el esquema (`schema.sql`) y datos semilla (`seed.sql`) pre-cargados.
2. La aplicación web **Angular 21 + SSR Express** lista para producción en el puerto `3000`.
3. El administrador web **Adminer** en el puerto `8080` para consultar la base de datos visualmente.

### Pasos:

1. Abre tu terminal en la carpeta raíz del proyecto.
2. Copia el archivo de entorno:
   ```bash
   cp .env.example .env
   ```
3. Inicia todos los servicios con Docker Compose:
   ```bash
   docker compose up -d --build
   ```
4. ¡Listo! Abre en tu navegador:
   * **Aplicación Web**: [http://localhost:3000](http://localhost:3000)
   * **Adminer (Gestor SQL)**: [http://localhost:8080](http://localhost:8080)
     * *Sistema*: PostgreSQL
     * *Servidor*: `postgres`
     * *Usuario*: `postgres`
     * *Contraseña*: `postgrespassword`
     * *Base de datos*: `custodia_risk`

Para detener los contenedores:
```bash
docker compose down
```

---

## 🛠️ Opción 2: Instalación Nativa Paso a Paso

Si prefieres ejecutar Node.js y PostgreSQL directamente en tu sistema operativo:

### Paso 1: Instalar dependencias del proyecto
```bash
npm install
```

### Paso 2: Crear y poblar la Base de Datos en PostgreSQL

1. Abre una terminal y conéctate a tu servidor PostgreSQL local:
   ```bash
   psql -U postgres
   ```

2. Crea la base de datos:
   ```sql
   CREATE DATABASE custodia_risk;
   \q
   ```

3. Ejecuta el archivo DDL de esquema (tablas, relaciones, enums y triggers):
   ```bash
   psql -U postgres -d custodia_risk -f database/schema.sql
   ```

4. Ejecuta el script de datos semilla iniciales (roles, riesgos, controles, KRIs y ledger):
   ```bash
   psql -U postgres -d custodia_risk -f database/seed.sql
   ```

*(Nota en Windows: también puedes abrir `database/schema.sql` y `database/seed.sql` en pgAdmin o DBeaver y ejecutarlos secuencialmente).*

---

### Paso 3: Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:

```bash
cp .env.example .env
```

Edita `.env` con las credenciales de tu PostgreSQL:
```env
PORT=3000
DATABASE_URL=postgres://postgres:TU_CONTRASEÑA@localhost:5432/custodia_risk
GEMINI_API_KEY=tu_clave_opcional
```

---

### Paso 4: Iniciar la aplicación

#### Modo Desarrollo (con recarga en vivo):
```bash
npm run dev
```
La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

#### Modo Producción (Compilación optimizada SSR):
```bash
npm run build
npm run serve:ssr:app
```
La aplicación compilará los bundles de navegador y servidor en `dist/app/` y arrancará en [http://localhost:3000](http://localhost:3000).

---

## 🏛️ Estructura del Modelo Relacional en PostgreSQL

El archivo `database/schema.sql` define una arquitectura relacional sólida alineada con **Basilea III**, **ISO 31000** y **COSO ERM**:

| Tabla | Descripción | Llave Primaria / Foráneas |
| :--- | :--- | :--- |
| `organizational_roles` | Catálogo de puestos organizacionales y matriz de permisos JSONB | `id` (PK) |
| `user_profiles` | Colaboradores y usuarios del sistema con sesión asignada | `id` (PK), `role_id` (FK) |
| `controls` | Controles operacionales (preventivos, detectivos, correctivos) con efectividad 40/60 | `id` (PK), `code` (Unique) |
| `control_test_executions` | Pruebas de diseño y operación con anexos de evidencia y hash | `id` (PK), `control_id` (FK) |
| `risks` | Matriz 4x4 de riesgos operacionales (severidad inherente y residual) | `id` (PK), `code` (Unique) |
| `risk_controls` | Asignación de controles a riesgos (Muchos a Muchos) | `(risk_id, control_id)` (PK Compuesta) |
| `operational_flaws` | Registro de incidencias, falencias operacionales y pérdidas reales | `id` (PK), `converted_risk_id` (FK) |
| `kri_definitions` | Indicadores Clave de Riesgo por industria con umbrales y preferencias | `id` (PK), `code` (Unique) |
| `anomaly_alerts` | Alertas disparadas por brecha de umbrales en KRIs | `id` (PK), `code` (Unique) |
| `periodic_audits` | Programas periódicos de auditoría interna y regulatoria | `id` (PK), `code` (Unique) |
| `audit_findings` | Hallazgos de auditoría (no conformidades, observaciones) | `id` (PK), `audit_id` (FK) |
| `crypto_audit_ledger` | Bitácora inalterable firmada criptográficamente con SHA-256 | `id` (PK), `block_number` (Serial) |
| `system_settings` | Ajustes globales de industria y preferencias generales | `key` (PK) |

### Procedimientos y Triggers Automatizados
* **`fn_calculate_risk_matrix()`**: Calcula automáticamente `inherent_score = inherent_likelihood * inherent_impact` y asigna el nivel ('Bajo', 'Medio', 'Alto', 'Crítico') tanto para la matriz inherente como residual.
* **`fn_calculate_control_effectiveness()`**: Pondera la efectividad global del control (40% efectividad de diseño + 60% efectividad operativa) y califica su estado en 'Efectivo', 'Parcialmente Efectivo' o 'Deficiente'.
* **`fn_update_timestamp()`**: Mantiene actualizado el campo `updated_at` en todas las tablas de forma automática.
* **Vistas Ejecutivas**:
  * `v_process_risk_summary`: Agregaciones de exposición financiera y conteo por severidad por proceso de negocio.
  * `v_kri_breaches`: Listado de todos los KRIs actualmente en advertencia o estado crítico.

---

## 🔍 Endpoints de Verificación y Diagnóstico

Una vez iniciada la aplicación, puedes verificar el estado de la conexión a PostgreSQL accediendo a:

* **Salud de la Base de Datos**:
  ```bash
  curl http://localhost:3000/api/db/health
  ```
  *Respuesta:* `{"connected":true,"message":"Conectado exitosamente a PostgreSQL (custodia_risk)","version":"..."}`

* **Estadísticas de Registros**:
  ```bash
  curl http://localhost:3000/api/db/stats
  ```
  *Respuesta:* Conteo de riesgos, controles, KRIs, usuarios y bloques del ledger criptográfico.

* **Inicialización o Reinicio bajo demanda vía API**:
  ```bash
  curl -X POST http://localhost:3000/api/db/init
  ```
  Aplica el esquema y datos semilla sin necesidad de abrir la consola de PostgreSQL.

---

## 💡 Soporte y Consultas

Cualquier duda o ajuste adicional sobre el esquema o la configuración de entorno puede ser personalizado directamente modificando `database/schema.sql` y las variables de `.env`.
