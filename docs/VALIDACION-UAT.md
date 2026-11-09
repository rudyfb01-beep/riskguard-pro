# Plan de validación de usuario (UAT) — RiskGuard Pro

Plan para que las áreas usuarias de la cooperativa validen la aplicación antes de su puesta en
producción, con trazabilidad a los requisitos normativos y un acta de aprobación.
Las pruebas automatizadas (unitarias, API, seguridad y navegador) están descritas en
[PRUEBAS.md](PRUEBAS.md); el UAT verifica que la aplicación sirve al proceso real.

## 1. Organización

| Rol | Responsabilidad |
| :--- | :--- |
| Dueño del UAT (Jefatura de Riesgo Operacional) | Aprueba el plan, prioriza defectos y firma el acta. |
| Coordinador | Prepara el ambiente y los datos, reparte casos, consolida resultados. |
| Probadores por área | Riesgo Operacional, Cumplimiento, Seguridad de la Información/CISO, Continuidad, Auditoría Interna, un dueño de proceso, Gerencia. |
| Tecnología | Instalación, correo, respaldos, corrección de defectos. |
| Auditoría Interna | Observa la ejecución y revisa la evidencia (independencia). |

**Ambiente:** certificación con la misma versión, motor (PostgreSQL) y configuración que
producción, correo real de la cooperativa y HTTPS. Datos: base vacía con los mantenedores reales
(procesos, áreas, cargos, usuarios) más un set de prueba preparado por cada área. Los datos de
ejemplo (`SEED_DEMO_DATA=true`) sirven solo para la capacitación previa.

**Calendario sugerido:** capacitación (1 día) → ciclo 1 (5 días hábiles) → corrección →
ciclo 2 / regresión (3 días) → acta.

## 2. Criterios

**Entrada:** versión candidata instalada; CI en verde (lint, unitarias, API en SQLite y
PostgreSQL, navegador); `bun audit --prod` sin vulnerabilidades; usuarios creados con sus cargos;
correo funcionando; respaldo automático activo; este plan aprobado.

**Salida (aprobación):**
- 100 % de los casos **críticos** ejecutados y aprobados.
- ≥ 95 % del total de casos aprobados.
- Sin defectos de severidad 1 o 2 abiertos; los de severidad 3 y 4 con plan de acción y fecha.
- Prueba de restauración de respaldo aprobada (OPE-03).
- Pentest externo sin hallazgos críticos/altos abiertos (ver [SECURITY.md](../SECURITY.md) §4).

**Severidad de defectos:**

| Sev. | Definición | Ejemplo |
| :--- | :--- | :--- |
| 1 Bloqueante | Impide el proceso o compromete integridad/seguridad/cumplimiento | Un cargo sin permiso modifica la matriz; reporte CMF con plazo mal calculado |
| 2 Mayor | Función incorrecta sin alternativa razonable | El cálculo residual no considera un control |
| 3 Menor | Función incorrecta con alternativa | Un filtro no incluye un estado |
| 4 Cosmético | Texto, alineación, ortografía | — |

Cada defecto se registra con: ID, caso, pasos, resultado esperado y obtenido, evidencia
(captura), severidad, responsable y estado (Abierto → En corrección → Listo para re-test →
Cerrado). Puede usarse el módulo **Planes de acción** (origen "Otro") para su seguimiento.

## 3. Casos de prueba

Columna **C** = crítico. Cada caso registra: probador, fecha, resultado (Aprobado / Rechazado /
Bloqueado), evidencia y defecto asociado.

### Acceso y permisos

| ID | C | Caso | Resultado esperado | Referencia |
| :--- | :-: | :--- | :--- | :--- |
| ACC-01 | ✔ | Ingresar con código por correo | Llega el código; abre sesión; 5 intentos fallidos lo invalidan | RAN 20-10 (control de acceso) |
| ACC-02 | | Ingresar con Google (si aplica) | Solo cuentas del dominio de la cooperativa registradas como usuarias | RAN 20-10 |
| ACC-03 | ✔ | Ingresar con cada cargo y recorrer el menú | Solo se ven las acciones permitidas por la matriz de permisos | RAN 20-10 |
| ACC-04 | ✔ | Sesión inactiva > 60 min | Pide ingresar de nuevo sin perder lo que se estaba editando | RAN 20-10 |
| ACC-05 | | Dos personas editan el mismo riesgo | La segunda recibe aviso de conflicto con la versión vigente y elige qué conservar | — |
| ACC-06 | ✔ | Desactivar a una persona | No puede ingresar; sus registros históricos se conservan | RAN 20-10 |

### Riesgos y controles

| ID | C | Caso | Resultado esperado | Referencia |
| :--- | :-: | :--- | :--- | :--- |
| RSG-01 | ✔ | Crear un riesgo con probabilidad, impacto, proceso y dueño | Nivel inherente según la escala 4×4 configurada | Cap. 1-13 RAN (gestión de riesgo operacional) |
| RSG-02 | ✔ | Asociar controles y evaluarlos (diseño y operación) | Riesgo residual recalculado; comparado con el apetito | Cap. 1-13 RAN |
| RSG-03 | | Importar la matriz actual desde Excel | Vista previa con errores por fila; se cargan solo las válidas | — |
| RSG-04 | | Cargar evidencia de una prueba de control (PDF) | Se guarda con SHA-256; verificar integridad responde "íntegro" | — |
| RSG-05 | | Riesgo residual fuera de apetito | Se destaca en el tablero y en la matriz frente al apetito aprobado | Cap. 1-13 RAN |

### Incidentes, pérdidas y reporte regulatorio

| ID | C | Caso | Resultado esperado | Referencia |
| :--- | :-: | :--- | :--- | :--- |
| INC-01 | ✔ | Registrar un evento de pérdida en CLP | Se guarda el valor de la UF del día; aparece en la base de pérdidas | Basilea III / CAC-20 (APR) |
| INC-02 | ✔ | Marcar un incidente como reportable a la CMF | Plazo de reporte inicial de 30 min desde la ocurrencia; aviso urgente | RAN 20-8 vía CAC-3 (NCG 567) |
| INC-03 | ✔ | Generar el texto del reporte inicial, de actualización y de cierre | Contiene los campos del Capítulo 20-8 | RAN 20-8 |
| INC-04 | ✔ | Incidente de ciberseguridad reportable a la ANCI | Alerta temprana 3 h, segundo informe 72 h, final 15 días desde la detección | Ley 21.663 |
| INC-05 | | Convertir un incidente en riesgo con controles sugeridos | Riesgo creado y vinculado al incidente | — |
| INC-06 | | Exportar la base de pérdidas a CSV | Columnas en CLP y UF; abre en Excel con acentos correctos | — |

### Proveedores, continuidad y crisis

| ID | C | Caso | Resultado esperado | Referencia |
| :--- | :-: | :--- | :--- | :--- |
| PRV-01 | ✔ | Registrar un servicio externalizado material con su evaluación | Aparece en el registro de servicios externalizados exportable | RAN 20-7 |
| PRV-02 | | Contrato por vencer | Aviso al responsable con la anticipación configurada | RAN 20-7 |
| BCP-01 | ✔ | BIA de un proceso crítico (RTO, RPO, MTPD) | Plan de continuidad asociado; brechas destacadas | RAN 20-9 |
| BCP-02 | | Registrar una prueba de continuidad con hallazgos | Hallazgos generan planes de acción | RAN 20-9 |
| CRI-01 | ✔ | Declarar una crisis desde un escenario | Solo el comité puede; aviso urgente a sus integrantes; bitácora de la crisis solo de agregado | RAN 20-9 |
| CRI-02 | | Simulacro y cierre con lecciones aprendidas | Queda registrado como prueba; lecciones con responsables | RAN 20-9 |

### Seguridad de la información

| ID | C | Caso | Resultado esperado | Referencia |
| :--- | :-: | :--- | :--- | :--- |
| SEG-01 | ✔ | Inventario de activos con clasificación y datos personales | Se identifican los activos con datos personales | RAN 20-10; Ley 21.719 |
| SEG-02 | | Vulnerabilidad crítica con plazo | Aviso y seguimiento hasta el cierre | RAN 20-10 |
| SEG-03 | | Autoevaluación de seguridad | Puntaje por dominio y brechas con planes de acción | RAN 20-10 |

### Cumplimiento, planes, autoevaluaciones, aprobaciones y documentos

| ID | C | Caso | Resultado esperado | Referencia |
| :--- | :-: | :--- | :--- | :--- |
| CUM-01 | ✔ | Evaluar requisitos de la RAN 20-7 a 20-10 | Estado por numeral; verificaciones automáticas coherentes con los módulos | NCG 567 / CAC-3 |
| CUM-02 | | Agregar una norma interna e importar sus requisitos | Biblioteca actualizada con historial de versiones | — |
| PLA-01 | ✔ | Plan de acción con responsable y plazo | Avisos de vencimiento; solo el responsable o quien tenga permiso registra avances | — |
| AUT-01 | | Campaña RCSA a dueños de proceso | Cada uno responde lo suyo; resultados consolidados | Cap. 1-13 RAN |
| APR-01 | ✔ | Cambio sujeto a aprobación (p. ej. apetito) | Queda pendiente hasta la aprobación del nivel configurado | Gobierno corporativo |
| DOC-01 | | Política con flujo de revisión y aprobación | Versión vigente publicada; anteriores en el historial | — |

### Reportes, bitácora y carga masiva

| ID | C | Caso | Resultado esperado | Referencia |
| :--- | :-: | :--- | :--- | :--- |
| REP-01 | | Informe PDF para el Comité de Riesgos | Cifras coinciden con el tablero | — |
| REP-02 | | Cálculo de APR por riesgo operacional | Resultado de referencia con los parámetros vigentes | CAC-20 (en consulta) |
| BIT-01 | ✔ | Revisar la bitácora tras los casos anteriores | Cada cambio con persona, fecha, IP y hash encadenado; integridad verificada | RAN 20-10 (registro y trazabilidad) |
| CAR-01 | | Carga masiva de procesos, usuarios y controles | Todo o nada; errores por fila; queda en la bitácora | — |

### Operación (Tecnología)

| ID | C | Caso | Resultado esperado | Referencia |
| :--- | :-: | :--- | :--- | :--- |
| OPE-01 | ✔ | Respaldo automático y manual | Archivo con manifiesto y SHA-256; aparece en el panel | RAN 20-9 / 20-10 |
| OPE-02 | ✔ | Verificar y descargar un respaldo | Verificación íntegra; la descarga queda en la bitácora | RAN 20-10 |
| OPE-03 | ✔ | Restaurar el último respaldo en un servidor de pruebas | Conteos iguales al manifiesto; bitácora íntegra; tiempo dentro del RTO | RAN 20-9 |
| OPE-04 | ✔ | Revisión de la configuración del panel | Sin advertencias de severidad alta en certificación/producción | RAN 20-10 |
| OPE-05 | | `/api/ready` con la base detenida | Responde 503; el monitoreo genera alerta | RAN 20-9 |

## 4. Matriz de trazabilidad

| Requisito | Casos |
| :--- | :--- |
| RAN 20-7 Externalización de servicios | PRV-01, PRV-02, CUM-01 |
| RAN 20-8 Reporte de incidentes operacionales | INC-02, INC-03, CUM-01 |
| RAN 20-9 Continuidad del negocio | BCP-01, BCP-02, CRI-01, CRI-02, OPE-01, OPE-03, OPE-05 |
| RAN 20-10 Seguridad de la información y ciberseguridad | ACC-01…06, SEG-01…03, BIT-01, OPE-02, OPE-04 |
| Cap. 1-13 RAN (evaluación de la gestión de riesgo operacional) | RSG-01, RSG-02, RSG-05, AUT-01 |
| Ley 21.663 (ANCI) | INC-04 |
| Ley 21.719 (datos personales) | SEG-01 |
| CAC-20 / Basilea III (APR) | INC-01, REP-02 |

Las referencias normativas siguen la biblioteca de **Cumplimiento normativo** de la aplicación,
cuyos requisitos son referenciales: Cumplimiento valida su vigencia contra el texto oficial antes
de iniciar el UAT.

## 5. Acta de aprobación

> **ACTA DE APROBACIÓN DE PRUEBAS DE USUARIO — RISKGUARD PRO**
>
> Versión probada: ______________ (según `/api/health`) · Ambiente: ______________
> Período de pruebas: del ___/___/______ al ___/___/______
>
> | Indicador | Resultado |
> | :--- | :--- |
> | Casos ejecutados / total | ____ / ____ |
> | Casos críticos aprobados | ____ / ____ |
> | Defectos sev. 1-2 abiertos | ____ |
> | Defectos sev. 3-4 abiertos (con plan de acción) | ____ |
> | Prueba de restauración (OPE-03): tiempo / resultado | ________ |
> | Pentest externo: hallazgos críticos/altos abiertos | ____ |
>
> Observaciones y condiciones: ________________________________________________
>
> Con base en los resultados, se **aprueba / aprueba con condiciones / rechaza** la puesta en
> producción de la versión indicada.
>
> | Nombre | Cargo | Firma | Fecha |
> | :--- | :--- | :--- | :--- |
> | | Jefatura de Riesgo Operacional (dueño del UAT) | | |
> | | Oficial de Seguridad de la Información | | |
> | | Cumplimiento | | |
> | | Tecnología | | |
> | | Auditoría Interna (observador) | | |

El acta firmada y la evidencia de los casos se cargan en **Gestión documental** como registro
controlado, y la aprobación del paso a producción se informa al Comité de Riesgos.
