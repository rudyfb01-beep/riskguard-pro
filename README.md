# RiskGuard Pro

Sistema de gestión de riesgo operacional (GRC) para cooperativas de ahorro y crédito
fiscalizadas por la CMF: matriz de riesgos y controles, incidentes y base de pérdidas, reporte de
incidentes a la CMF y la ANCI, proveedores y externalización, continuidad del negocio, seguridad de la información, KRIs,
auditorías, mantenedores (procesos, áreas y parámetros) y bitácora inalterable.

**Instalación y configuración:** ver [LOCAL_SETUP.md](LOCAL_SETUP.md).
**Operación y respaldos:** [docs/OPERACION.md](docs/OPERACION.md) · **Seguridad:** [SECURITY.md](SECURITY.md) ·
**Pruebas:** [docs/PRUEBAS.md](docs/PRUEBAS.md) · **Validación de usuario:** [docs/VALIDACION-UAT.md](docs/VALIDACION-UAT.md)

Base de datos: PostgreSQL (producción) o SQLite (paquete para un equipo: `npm run package:sqlite`).

Producción con Docker Compose (PostgreSQL + aplicación + proxy HTTPS):

```bash
cp .env.example .env && chmod 600 .env   # complete APP_URL, POSTGRES_PASSWORD, AUTH_SECRET, ADMIN_EMAIL y SMTP
docker compose --profile https up -d --build
```

Detalle y verificación de la instalación: [LOCAL_SETUP.md → Producción](LOCAL_SETUP.md#producción-recomendada-docker-compose-con-postgresql-y-https).
