import { ComplianceFrequency, ComplianceRequirement, RanChapter } from '../models/compliance.model';

/**
 * Matriz de requisitos de las RAN 20-7, 20-8, 20-9 y 20-10, por numeral, resumida a partir
 * del texto de cada capítulo. Debe ser validada por Cumplimiento contra el texto vigente.
 */
const r = (
  chapter: RanChapter, numeral: string, title: string, requirement: string,
  module: string | undefined, frequency: ComplianceFrequency, autoCheck?: string,
): ComplianceRequirement => ({
  id: `ran-${chapter.replace('-', '')}-${title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '')}`,
  chapter, numeral, title, requirement, module, autoCheck, frequency,
  status: 'Sin evaluar', evidence: '', owner: '', actionPlan: '',
});

export const RAN_REQUIREMENTS: ComplianceRequirement[] = [
  // ---------------------------------------------------------------- RAN 20-7
  r('20-7', 'I.1 / II', 'Alcance y riesgos de la externalización', 'Identificar los servicios externalizados dentro del alcance y evaluar los riesgos de concentración en un proveedor, de varios servicios críticos con un mismo proveedor y de altas barreras de salida.', 'proveedores', 'Anual', 'p7.concentration'),
  r('20-7', 'I.2', 'Actividades significativas o estratégicas', 'Calificar cada servicio externalizado según los cuatro criterios de actividad significativa o estratégica (crítica).', 'proveedores', 'Permanente', 'p7.significance'),
  r('20-7', 'III.1.a', 'Tolerancia al riesgo de externalización', 'El Consejo de Administración define su tolerancia al riesgo de externalización.', 'cumplimiento-ran', 'Anual'),
  r('20-7', 'III.1.b / III.2', 'Política de externalización', 'El Consejo aprueba una política de externalización con: gobierno y reporte, herramientas de evaluación de riesgos, umbrales de tolerancia, criterios para relacionados, criterios de actividades estratégicas, actividades que requieren aprobación del Consejo, frecuencia de revisión, contenido mínimo de contratos y autorización previa del cliente para transferir datos sujetos a reserva al exterior.', 'cumplimiento-ran', 'Anual'),
  r('20-7', 'III.1.c–e', 'Selección y monitoreo de proveedores', 'Procedimientos formales de selección, contratación y monitoreo; verificar competencia del proveedor y su personal, cumplimiento legal y laboral, y que otros clientes no afecten el servicio.', 'proveedores', 'Permanente', 'p7.assessments'),
  r('20-7', 'III.1.f', 'Catastro de servicios externalizados', 'Mantener un catastro actualizado de todos los servicios contratados, identificando los estratégicos y de alto riesgo.', 'proveedores', 'Permanente', 'p7.register'),
  r('20-7', 'III.1.h', 'Auditoría independiente del proceso', 'Auditorías independientes, con especialistas en riesgos, del proceso de selección, contratación y monitoreo.', 'auditorias', 'Anual'),
  r('20-7', 'III.1.i–j', 'Auditorías y documentación del proveedor', 'El proveedor realiza auditorías internas o revisiones independientes, comparte los hallazgos relevantes y mantiene documentados sus procedimientos a disposición de la CMF.', 'proveedores', 'Anual', 'p7.providerAudit'),
  r('20-7', 'III.1.k', 'Subcontratación', 'Los riesgos de subcontratación se abordan en el contrato y los subcontratistas cumplen las condiciones del contrato original.', 'proveedores', 'Permanente', 'p7.subcontractors'),
  r('20-7', 'III.1.l', 'Informe al Consejo', 'Los informes de riesgo operacional al Consejo incluyen la gestión de la externalización, cambios en el perfil de riesgo de los proveedores y la exposición a servicios críticos.', 'reportes-pdf', 'Semestral'),
  r('20-7', 'III.1.m', 'Sitios de procesamiento conocidos', 'Datos, plataformas y aplicaciones en sitios de procesamiento identificados; en el exterior, jurisdicción y ciudad del centro de datos conocidas.', 'proveedores', 'Permanente', 'p7.sites'),
  r('20-7', 'Anexo 1 §3', 'Contenido mínimo de los contratos', 'Derechos y obligaciones, niveles de servicio medibles, término anticipado, método de precios, continuidad, seguridad y confidencialidad de la información, restricciones de software, eliminación segura de datos, acceso permanente de la CMF y la cooperativa, veto a subcontratistas, idoneidad del personal, programa de seguridad y contratos en español.', 'proveedores', 'Permanente', 'p7.clauses'),
  r('20-7', 'III.3', 'Continuidad de proveedores críticos', 'Los proveedores críticos (y sus subcontratistas) tienen planes de continuidad probados al menos anualmente y la cooperativa conoce los resultados; la cooperativa tiene planes probados para operar sin el servicio.', 'proveedores', 'Anual', 'p7.providerContinuity'),
  r('20-7', 'III.3', 'Planes de salida', 'Planes de salida ante incumplimiento o término anticipado, que permitan retomar el servicio internamente o con otro proveedor.', 'proveedores', 'Permanente', 'p7.exit'),
  r('20-7', 'III.4', 'Seguridad de la información del proveedor', 'Programa de seguridad del proveedor; para servicios críticos: monitoreo independiente, cifrado de comunicaciones y almacenamiento con llaves de la cooperativa, protección DDoS, evaluaciones de vulnerabilidades y pruebas de penetración periódicas, y sin retención de datos al término.', 'proveedores', 'Anual', 'p7.providerSecurity'),
  r('20-7', 'III.5', 'Riesgo país', 'No externalizar en jurisdicciones sin clasificación de grado de inversión salvo análisis documentado del Consejo sobre leyes adecuadas de protección de datos; informar a la CMF si el país pierde el grado de inversión.', 'proveedores', 'Permanente', 'p7.countryRisk'),
  r('20-7', 'III.6', 'Incidentes en servicios externalizados', 'Los incidentes operacionales significativos que afecten servicios externalizados se informan de inmediato a la CMF según el Capítulo 20-8.', 'reportes-regulatorios', 'Por evento', 'p8.providerIncidents'),
  r('20-7', 'III.7', 'Acceso del supervisor', 'La CMF tiene acceso permanente a registros y datos del servicio externalizado, en el país o en el exterior; evaluar restricciones legales del país del proveedor.', 'proveedores', 'Permanente', 'p7.regulatorAccess'),
  r('20-7', 'IV', 'Procesamiento de datos en el exterior', 'Para actividades significativas o estratégicas en el exterior: sitio de contingencia en Chile, o dispensa del Consejo con RTO aprobado según BIA/RIA, disponibilidad equivalente a la RAN 20-9, sitios en ubicaciones distintas, seguridad acorde a las políticas e informe anual de una empresa independiente.', 'proveedores', 'Anual', 'p7.abroad'),
  r('20-7', 'V', 'Servicios en la nube', 'Declaración anual del Consejo sobre tolerancia al riesgo de la nube (datos y ubicación); para servicios críticos, debida diligencia reforzada (letras a–g).', 'proveedores', 'Anual', 'p7.cloud'),

  // ---------------------------------------------------------------- RAN 20-8
  r('20-8', '1', 'Incidentes a reportar', 'Reportar a la CMF los incidentes que afecten la continuidad, los fondos o recursos propios o de clientes, la calidad del servicio o la imagen; mantener un canal de comunicación permanente e informar su evolución.', 'reportes-regulatorios', 'Por evento', 'p8.reported'),
  r('20-8', '1.1', 'Reporte inicial dentro de 30 minutos', 'Enviar el reporte inicial dentro de 30 minutos desde la ocurrencia, con los campos mínimos (identificador, descripción, inicio, causas, productos o servicios afectados, proveedor involucrado, clientes afectados, dependencias o activos afectados y medidas).', 'reportes-regulatorios', 'Por evento', 'p8.initial'),
  r('20-8', '1.1', 'Encargado de reportar', 'Designar un encargado de nivel ejecutivo (y un suplente) para enviar los reportes y responder consultas de la CMF.', 'cumplimiento-ran', 'Permanente'),
  r('20-8', '1.1', 'Reporte de cierre', 'Enviar el reporte de cierre con causas identificadas, fecha de cierre, clientes afectados y medidas adoptadas; atender informes complementarios (p. ej., forense) que solicite la CMF.', 'reportes-regulatorios', 'Por evento', 'p8.closing'),
  r('20-8', '1.2', 'Información a clientes', 'Informar oportunamente a los socios y usuarios cuando un incidente afecte la calidad o continuidad del servicio o sea de conocimiento público, y mantener la información actualizada hasta su resolución.', 'reportes-regulatorios', 'Por evento', 'p8.clientNotice'),
  r('20-8', '1.3', 'Alerta de ciberseguridad a la industria', 'Compartir con la industria los incidentes de ciberseguridad (tipo de amenaza, canales o servicios afectados, software malicioso y mecanismos de protección) lo antes posible, con acceso para la CMF.', 'reportes-regulatorios', 'Por evento', 'p8.industryAlert'),

  // ---------------------------------------------------------------- RAN 20-9
  r('20-9', 'I.1', 'Estrategia de continuidad', 'El Consejo aprueba una estrategia de continuidad acorde al volumen, complejidad y servicios comprometidos.', 'cumplimiento-ran', 'Anual'),
  r('20-9', 'I.2', 'Función de riesgos e instancias colegiadas', 'Función de riesgos que mantenga el sistema de identificación, seguimiento, control y mitigación, e instancias colegiadas de alto nivel.', 'cumplimiento-ran', 'Permanente'),
  r('20-9', 'I.3', 'Administración de crisis', 'Estructura de alto nivel aprobada por el Consejo para conocer y controlar interrupciones de alto impacto.', 'continuidad', 'Permanente', 'p9.crisisPlan'),
  r('20-9', 'I.4', 'Información al Consejo', 'Mecanismo de información periódica al Consejo sobre la gestión de continuidad.', 'reportes-pdf', 'Semestral'),
  r('20-9', 'I.5', 'Políticas de continuidad', 'Políticas aprobadas por el Consejo, comunicadas a las partes interesadas y revisadas al menos anualmente.', 'cumplimiento-ran', 'Anual'),
  r('20-9', 'I.6', 'Nuevos productos y procesos', 'Evaluar los riesgos de continuidad antes de lanzar productos, procesos o sistemas nuevos.', 'matriz-riesgos', 'Por evento'),
  r('20-9', 'I.7', 'BIA anual', 'Metodología formal de análisis de impacto (BIA) que identifica los procesos críticos, realizada al menos anualmente.', 'continuidad', 'Anual', 'p9.bia'),
  r('20-9', 'I.7', 'RTO aprobados por el Consejo', 'Los RTO de los procesos críticos son aprobados por el Consejo.', 'continuidad', 'Anual', 'p9.rtoApproved'),
  r('20-9', 'I.7', 'Análisis de riesgos (RIA) anual', 'Análisis de riesgos sobre los procesos críticos, al menos anual.', 'continuidad', 'Anual', 'p9.ria'),
  r('20-9', 'I.8', 'Escenarios mínimos', 'Considerar como mínimo: falla de sistemas, ataque a la ciberseguridad, ausencia de personal crítico, imposibilidad de acceder a instalaciones y falla de proveedores críticos; formalizados en la política.', 'continuidad', 'Anual', 'p9.scenarios'),
  r('20-9', 'I.9', 'Planes de contingencia y DRP', 'Planes documentados de contingencia operativa y de recuperación ante desastres para los procesos críticos, actualizados al menos anualmente, con procedimientos de retorno a la operación normal.', 'continuidad', 'Anual', 'p9.plans'),
  r('20-9', 'I.10', 'Pruebas anuales en todos los escenarios', 'Probar los planes en todos los escenarios al menos una vez al año, con complejidad creciente y un informe con alcance, condiciones y planes de corrección.', 'continuidad', 'Anual', 'p9.testsScenarios'),
  r('20-9', 'I.11', 'Prueba de indisponibilidad de sitios', 'Simular al menos una vez al año la indisponibilidad de los sitios de procesamiento (online y batch), con análisis de riesgos previo.', 'continuidad', 'Anual', 'p9.siteTest'),
  r('20-9', 'I.12', 'Gestión de incidentes', 'Proceso formal y sistemático de gestión de incidentes que puedan interrumpir productos o servicios.', 'incidentes-perdidas', 'Permanente', 'p9.incidents'),
  r('20-9', 'I.13', 'Información de riesgos de continuidad', 'Información suficiente y oportuna sobre los riesgos de continuidad para las instancias de decisión.', 'continuidad', 'Permanente'),
  r('20-9', 'I.14', 'Plan de comunicaciones', 'Plan de comunicaciones ante contingencias para partes internas y externas.', 'continuidad', 'Anual', 'p9.commsPlan'),
  r('20-9', 'I.15–16', 'Personal y capacitación', 'Personal con experiencia suficiente para todos los escenarios y programas de capacitación en continuidad para todos los niveles.', 'cumplimiento-ran', 'Anual'),
  r('20-9', 'I.17', 'Auditoría independiente', 'Auditorías independientes al proceso de gestión de continuidad.', 'auditorias', 'Anual'),
  r('20-9', 'II.18–22', 'Sitios de procesamiento', 'Centros principal y de contingencia homologados (preferentemente activo-activo), certificados por entidad independiente, con disponibilidad mínima de 99,98 %, redundancia de telecomunicaciones y sin exposición a los mismos riesgos.', 'cumplimiento-ran', 'Anual'),
  r('20-9', 'II.23', 'Respaldos según RPO y RTO', 'Infraestructura y procedimientos de respaldo para recuperar datos, software básico y aplicativos según los RPO y RTO definidos.', 'seguridad-informacion', 'Anual', 'p10.restoreTest'),
  r('20-9', 'III.24–27', 'Contingencias sistémicas', 'Plan de comunicación sistémica, equipos de coordinación con autoridades, ubicación y transporte del personal y medios de comunicación alternativos (p. ej., telefonía satelital).', 'continuidad', 'Anual'),
  r('20-9', 'III.28–29', 'Liquidez y alianzas', 'Planes para entregar efectivo si fallan los medios de pago de bajo monto o los cajeros, y acuerdos de cooperación con otras instituciones.', 'continuidad', 'Anual'),
  r('20-9', 'III.30–31', 'Concentración y contratos con proveedores', 'Políticas sobre concentración de servicios externalizados críticos y planes de contingencia cuando los contratos limiten el acceso a centros de datos o permitan decisiones unilaterales del proveedor.', 'proveedores', 'Anual', 'p7.concentration'),

  // ---------------------------------------------------------------- RAN 20-10
  r('20-10', '2', 'Estrategia y recursos', 'El Consejo aprueba la estrategia institucional de seguridad de la información y ciberseguridad y asigna recursos suficientes.', 'cumplimiento-ran', 'Anual'),
  r('20-10', '2', 'Estructura y encargado', 'Estructura con personal especializado, instancias colegiadas, un encargado de seguridad de la información y ciberseguridad con segregación de funciones y una función de riesgos independiente.', 'cumplimiento-ran', 'Permanente'),
  r('20-10', '2', 'Políticas de seguridad', 'Políticas aprobadas por el Consejo (alcance, tolerancia, inventario de activos, clasificación, niveles mínimos de disponibilidad), difundidas y revisadas al menos anualmente.', 'cumplimiento-ran', 'Anual'),
  r('20-10', '2', 'Información al Consejo', 'Información periódica al Consejo sobre los riesgos y el cumplimiento de políticas.', 'reportes-pdf', 'Semestral'),
  r('20-10', '2', 'Gestión de crisis', 'Órgano de alto nivel para crisis que afecten activos de información, con plan de actuación y comunicación oportuna a autoridades e interesados.', 'continuidad', 'Permanente', 'p9.crisisPlan'),
  r('20-10', '2', 'Conducta, difusión y capacitación', 'Políticas de conducta y planes de difusión, capacitación y concientización, incluido el personal de servicios externalizados.', 'cumplimiento-ran', 'Anual'),
  r('20-10', '2', 'Auditoría interna', 'Auditorías periódicas del proceso de gestión de seguridad de la información.', 'auditorias', 'Anual'),
  r('20-10', '3', 'Proceso de gestión de riesgos', 'Identificar activos, amenazas y vulnerabilidades; evaluar controles; analizar consecuencias en confidencialidad, integridad y disponibilidad; valorar; tratar (reducir, aceptar, evitar, transferir); comunicar; monitorear y revisar al menos anualmente.', 'seguridad-informacion', 'Anual', 'p10.riskProcess'),
  r('20-10', '4.1', 'Inventario de activos críticos', 'Inventario de activos críticos de ciberseguridad clasificados por confidencialidad, integridad y disponibilidad.', 'seguridad-informacion', 'Anual', 'p10.assets'),
  r('20-10', '4.1', 'Gestión de cambios, capacidad y obsolescencia', 'Cambios seguros y controlados a la infraestructura TI, gestión de capacidad, configuración, parches y obsolescencia tecnológica.', 'seguridad-informacion', 'Permanente'),
  r('20-10', '4.1', 'Protección de redes y accesos', 'Protección y segmentación de redes, gestión de identidades y accesos, monitoreo de usuarios privilegiados, control de canales electrónicos y criptografía.', 'seguridad-informacion', 'Permanente'),
  r('20-10', '4.1', 'Monitoreo y gestión de vulnerabilidades', 'Monitoreo continuo de amenazas y vulnerabilidades internas y externas (SOC 24/7 propio o externo).', 'seguridad-informacion', 'Permanente', 'p10.vulns'),
  r('20-10', '4.1', 'Pruebas de seguridad', 'Pruebas periódicas de alcance y profundidad suficientes (pruebas de penetración y/o hacking ético), con resultados informados al Consejo al menos semestralmente.', 'seguridad-informacion', 'Semestral', 'p10.pentest'),
  r('20-10', '4.1', 'Respaldos y restauración', 'Proceso de respaldo con pruebas de restauración al menos anuales.', 'seguridad-informacion', 'Anual', 'p10.restoreTest'),
  r('20-10', '4.1', 'Nuevos productos y datos personales', 'Revisar los riesgos de nuevos productos o actividades y cumplir la normativa de datos personales, exigiéndola a los proveedores.', 'matriz-riesgos', 'Por evento'),
  r('20-10', '4.2', 'Planes de respuesta probados', 'Planes de respuesta a incidentes y de crisis probados al menos anualmente, con escalamiento a la alta administración según severidad.', 'seguridad-informacion', 'Anual', 'p10.responseTest'),
  r('20-10', '4.2', 'Comunicaciones de incidentes', 'Plan de comunicaciones para incidentes de alto impacto, para partes internas y externas.', 'continuidad', 'Anual', 'p9.commsPlan'),
  r('20-10', '4.2', 'Análisis forense', 'Análisis forense independiente de los ciberincidentes relevantes, con cadena de custodia.', 'incidentes-perdidas', 'Por evento', 'p10.forensic'),
  r('20-10', '4.2', 'Base de incidentes y lecciones aprendidas', 'Base detallada de incidentes de ciberseguridad y de lecciones aprendidas para mejorar la respuesta y las pruebas.', 'incidentes-perdidas', 'Permanente', 'p10.cyberDb'),
  r('20-10', '4.2', 'Autoevaluación anual', 'Autoevaluaciones al menos anuales del cumplimiento normativo, de políticas internas y de buenas prácticas.', 'seguridad-informacion', 'Anual', 'p10.selfAssessment'),
  r('20-10', '5', 'Infraestructura crítica', 'Identificar los activos que forman parte de la infraestructura crítica de la industria financiera y del sistema de pagos.', 'seguridad-informacion', 'Anual', 'p10.criticalInfra'),
  r('20-10', '5', 'Intercambio de información', 'Compartir información técnica de incidentes con la industria (respetando reserva y confidencialidad) y participar en pruebas conjuntas.', 'reportes-regulatorios', 'Por evento', 'p8.industryAlert'),
];
