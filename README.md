# RiskGuard Pro

Sistema de gestión de riesgo operacional (GRC) para cooperativas de ahorro y crédito
fiscalizadas por la CMF: matriz de riesgos y controles, incidentes y base de pérdidas, reporte de
incidentes a la CMF y la ANCI, proveedores y externalización, continuidad del negocio, seguridad de la información, KRIs,
auditorías, mantenedores (procesos, áreas y parámetros) y bitácora inalterable.

**Instalación y configuración:** ver [LOCAL_SETUP.md](LOCAL_SETUP.md).

Base de datos: PostgreSQL (instalación institucional) o SQLite (paquete descargable para un equipo:
`npm run package:sqlite`).

Inicio rápido con Docker:

```bash
docker compose up -d --build
# http://localhost:3000
```
