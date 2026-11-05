import { ComplianceFrequency, ComplianceNorm, ComplianceRequirement, RAN_CHAPTERS } from '../models/compliance.model';
import { slugify } from '../utils/compliance';

/**
 * Requisito base. Las RAN conservan su prefijo de id original (`ran-207-…`) para no
 * perder las evaluaciones ya guardadas; las demás normas usan `<id de la norma>-…`.
 */
const r = (
  chapter: string, numeral: string, title: string, requirement: string,
  module: string | undefined, frequency: ComplianceFrequency, autoCheck?: string,
): ComplianceRequirement => ({
  id: /^20-\d+$/.test(chapter) ? `ran-${chapter.replace('-', '')}-${slugify(title)}` : `${chapter}-${slugify(title)}`,
  chapter, numeral, title, requirement, module, autoCheck, frequency,
  status: 'Sin evaluar', evidence: '', owner: '', actionPlan: '', controlIds: [],
});

/**
 * Matriz de requisitos de las RAN 20-7, 20-8, 20-9 y 20-10, por numeral, resumida a partir
 * del texto de cada capítulo. Debe ser validada por Cumplimiento contra el texto vigente.
 */
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

// =============================================================================
// Biblioteca normativa base
// =============================================================================

const BASE_AT = '2026-11-05T00:00:00.000Z';
const BASE_BY = 'RiskGuard (contenido base)';

const RAN_NOTES: Record<string, string> = {
  '20-7': 'Tiene una actualización en consulta (abril de 2026) que agregaría el archivo I28 de servicios externalizados, semestral para cooperativas.',
};

/** RAN de la CMF: el id de la norma es el número del capítulo (lo usan los requisitos existentes). */
const RAN_NORMS: ComplianceNorm[] = RAN_CHAPTERS.map((c, i): ComplianceNorm => ({
  id: c.id, code: `RAN ${c.id}`, title: c.title, kind: 'Norma CMF', issuer: 'CMF', source: c.source,
  version: '1', status: 'Vigente', applicability: 'Aplica',
  applicabilityNote: 'Aplica a las cooperativas fiscalizadas por la CMF vía el Capítulo CAC-3 de la RAN CACs (NCG 567, 27-05-2026); el Consejo de Administración asume las funciones del Directorio.',
  owner: '', notes: RAN_NOTES[c.id] ?? '', order: 10 + i, referential: true,
  versions: [{ version: '1', date: '2026-05-27', summary: 'Requisitos resumidos del texto del capítulo, aplicable a las cooperativas desde la NCG 567.', registeredBy: BASE_BY, registeredAt: BASE_AT }],
}));

/**
 * Leyes y normas chilenas que aplican a una cooperativa de ahorro y crédito, con requisitos
 * resumidos de fuentes públicas. Son una base para empezar: Cumplimiento debe validarlos
 * contra el texto oficial antes de usarlos como matriz de la cooperativa.
 */
export const OTHER_BASE_NORMS: ComplianceNorm[] = [
  {
    id: 'ley-20393', code: 'Ley 20.393', title: 'Responsabilidad penal de las personas jurídicas (modelo de prevención de delitos)',
    kind: 'Ley', issuer: 'Congreso Nacional',
    source: 'Ley 20.393 (2009), modificada por la Ley 21.595 de Delitos Económicos (2023)', url: 'https://www.bcn.cl/leychile/navegar?idLey=20393',
    version: 'Ley 21.595', status: 'Vigente', applicability: 'Aplica',
    applicabilityNote: 'Aplica a las personas jurídicas de derecho privado, incluidas las cooperativas. El modelo de prevención (art. 4) permite acreditar que la cooperativa cumplió sus deberes de dirección y supervisión.',
    owner: '', notes: 'Requisitos agrupados del art. 4 en su texto modificado por la Ley 21.595; validar con el texto oficial y con el catálogo de delitos vigente.',
    order: 30, referential: true,
    versions: [
      { version: 'Texto original', date: '2009-12-02', summary: 'Publicación de la Ley 20.393.', registeredBy: BASE_BY, registeredAt: BASE_AT },
      { version: 'Ley 21.595', date: '2023-08-17', summary: 'La Ley de Delitos Económicos amplía el catálogo de delitos y reemplaza el art. 4: agrega canales seguros de denuncia y evaluaciones periódicas por terceros independientes.', registeredBy: BASE_BY, registeredAt: BASE_AT },
    ],
  },
  {
    id: 'ley-21719', code: 'Ley 21.719', title: 'Protección y tratamiento de los datos personales (crea la Agencia de Protección de Datos Personales)',
    kind: 'Ley', issuer: 'Congreso Nacional',
    source: 'Ley 21.719, publicada en el Diario Oficial el 13-12-2024; modifica la Ley 19.628', url: 'https://www.bcn.cl/leychile/navegar?idLey=21719',
    version: 'Texto publicado', effectiveDate: '2026-12-01', status: 'Publicada, aún no vigente', applicability: 'Aplica',
    applicabilityNote: 'Aplica a todo responsable de datos personales. La cooperativa trata datos de socios, incluidos datos económicos, financieros y de crédito.',
    owner: '',
    notes: 'Vigencia: 01-12-2026. El 31-08-2026 ingresó al Senado un proyecto que posterga la vigencia al 01-12-2027; mientras no se apruebe, rige la fecha original.',
    order: 40, referential: true,
    versions: [{ version: 'Texto publicado', date: '2024-12-13', summary: 'Publicación en el Diario Oficial; vigencia desde el 01-12-2026.', registeredBy: BASE_BY, registeredAt: BASE_AT }],
  },
  {
    id: 'ley-19913', code: 'Ley 19.913', title: 'Prevención del lavado de activos y del financiamiento del terrorismo (UAF)',
    kind: 'Ley', issuer: 'Congreso Nacional / UAF',
    source: 'Ley 19.913 (2003) y Circulares de la UAF (N° 49 de 2012 y sus modificaciones, entre ellas la N° 59 de 2019)', url: 'https://www.bcn.cl/leychile/navegar?idLey=19913',
    version: 'Circular UAF N° 59', status: 'Vigente', applicability: 'Aplica',
    applicabilityNote: 'Las cooperativas de ahorro y crédito son sujetos obligados a informar a la UAF (art. 3).',
    owner: '', notes: 'Los umbrales y la periodicidad de los reportes los fija la UAF por circular: validar con la versión vigente.',
    order: 50, referential: true,
    versions: [
      { version: 'Circular UAF N° 49', date: '2012-12-03', summary: 'Circular que consolida las instrucciones a los sujetos obligados.', registeredBy: BASE_BY, registeredAt: BASE_AT },
      { version: 'Circular UAF N° 59', date: '2019-05-09', summary: 'Modifica la Circular 49: debida diligencia y conocimiento del cliente, transferencias electrónicas y países de riesgo.', registeredBy: BASE_BY, registeredAt: BASE_AT },
    ],
  },
  {
    id: 'ley-21663', code: 'Ley 21.663', title: 'Ley Marco de Ciberseguridad (ANCI)',
    kind: 'Ley', issuer: 'Congreso Nacional / ANCI',
    source: 'Ley 21.663 (2024); reglamento de reporte de incidentes (D.S. N° 295) e Instrucción General N° 1 de la ANCI (2025)', url: 'https://www.bcn.cl/leychile/navegar?idLey=21663',
    version: 'Instrucción General N° 1', status: 'Vigente', applicability: 'Aplica',
    applicabilityNote: 'La banca, los servicios financieros y los medios de pago son servicios esenciales. Las obligaciones de operador de importancia vital (OIV) aplican solo si la ANCI designa a la cooperativa.',
    owner: '', notes: 'Deberes generales (art. 7), obligaciones de OIV (art. 8) y reporte al CSIRT Nacional (art. 9). Los plazos de reporte se cuentan desde que se toma conocimiento; el informe final, desde la alerta temprana.',
    order: 60, referential: true,
    versions: [
      { version: 'Texto publicado', date: '2024-04-08', summary: 'Publicación de la Ley 21.663.', registeredBy: BASE_BY, registeredAt: BASE_AT },
      { version: 'Instrucción General N° 1', date: '2025-06-04', summary: 'Inscripción de los prestadores de servicios esenciales en la plataforma de la ANCI y designación del encargado de reporte.', registeredBy: BASE_BY, registeredAt: BASE_AT },
    ],
  },
];

export const BASE_NORMS: ComplianceNorm[] = [...RAN_NORMS, ...OTHER_BASE_NORMS];

export const OTHER_BASE_REQUIREMENTS: ComplianceRequirement[] = [
  // ---------------------------------------------------------------- Ley 20.393
  r('ley-20393', 'art. 4', 'Identificación de actividades con riesgo de delito', 'Identificar las actividades o procesos, habituales o esporádicos, en cuyo contexto se genera o aumenta el riesgo de comisión de los delitos de la ley, y documentarlos en una matriz de riesgos penales.', 'matriz-riesgos', 'Anual'),
  r('ley-20393', 'art. 4', 'Protocolos y procedimientos de prevención', 'Establecer protocolos, reglas y procedimientos que permitan prevenir y detectar conductas delictivas, e incorporarlos en los contratos de trabajo y de prestación de servicios, incluidos los de los máximos ejecutivos.', 'cumplimiento-ran', 'Anual'),
  r('ley-20393', 'art. 4', 'Administración y auditoría de recursos financieros', 'Procedimientos de administración y auditoría de los recursos financieros que impidan su uso en los delitos de la ley.', 'controles', 'Anual'),
  r('ley-20393', 'art. 4', 'Sujeto responsable del modelo', 'Designar a la persona o personas responsables de aplicar y supervisar el modelo, con independencia, facultades efectivas, acceso directo al Consejo de Administración y recursos suficientes.', 'cumplimiento-ran', 'Permanente'),
  r('ley-20393', 'art. 4', 'Canales seguros de denuncia', 'Canales de denuncia seguros y confidenciales, con opción de anonimato, procedimientos de investigación y protección de los denunciantes contra represalias.', 'cumplimiento-ran', 'Permanente'),
  r('ley-20393', 'art. 4', 'Sanciones internas', 'Régimen de sanciones administrativas internas por incumplimiento del modelo, proporcionales a la falta y aplicadas de forma consistente.', 'cumplimiento-ran', 'Anual'),
  r('ley-20393', 'art. 4', 'Difusión y capacitación', 'Difundir el modelo y capacitar periódicamente a los trabajadores y a quienes prestan servicios, según los riesgos de cada función.', 'cumplimiento-ran', 'Anual'),
  r('ley-20393', 'art. 4', 'Evaluación periódica por terceros independientes', 'Evaluaciones periódicas del modelo por terceros independientes y mecanismos para perfeccionarlo y actualizarlo según sus resultados.', 'auditorias', 'Anual'),
  r('ley-20393', 'art. 4', 'Rendición de cuentas al Consejo', 'El responsable del modelo informa al Consejo de Administración sobre su gestión, los hallazgos y las mejoras, con la periodicidad que defina el modelo.', 'reportes-pdf', 'Semestral'),
  r('ley-20393', 'art. 1', 'Actualización del catálogo de delitos', 'Revisar la matriz de riesgos penales cada vez que se modifique el catálogo de delitos que generan responsabilidad para la persona jurídica.', 'matriz-riesgos', 'Por evento'),

  // ---------------------------------------------------------------- Ley 21.719
  r('ley-21719', 'Principios', 'Inventario de tratamientos de datos', 'Mantener un inventario de las bases de datos y tratamientos (finalidad, base de licitud, categorías de datos y de titulares, plazos de conservación, encargados y transferencias).', 'seguridad-informacion', 'Anual', 'p21719.inventory'),
  r('ley-21719', 'Licitud', 'Base de licitud de cada tratamiento', 'Cada tratamiento se sustenta en el consentimiento del titular o en otra base de licitud prevista por la ley (contrato, obligación legal, interés legítimo u otra).', 'cumplimiento-ran', 'Permanente'),
  r('ley-21719', 'Principios', 'Finalidad, proporcionalidad y conservación', 'Tratar solo los datos necesarios para finalidades específicas y lícitas, mantenerlos exactos y conservarlos solo por el tiempo necesario.', 'cumplimiento-ran', 'Anual'),
  r('ley-21719', 'Transparencia', 'Política de tratamiento y deber de información', 'Política de tratamiento de datos disponible de forma permanente, con la identidad del responsable, las finalidades, los derechos de los titulares y el canal para ejercerlos.', 'cumplimiento-ran', 'Anual'),
  r('ley-21719', 'Derechos', 'Atención de derechos de los titulares', 'Canal gratuito para ejercer los derechos de acceso, rectificación, supresión, oposición, portabilidad y bloqueo, con respuesta dentro del plazo legal (validar: 30 días corridos, prorrogable una vez).', 'cumplimiento-ran', 'Permanente'),
  r('ley-21719', 'Derechos', 'Decisiones automatizadas y perfilamiento', 'Informar y permitir oponerse a decisiones basadas únicamente en tratamiento automatizado, incluida la elaboración de perfiles (p. ej., evaluación crediticia automatizada).', 'cumplimiento-ran', 'Permanente'),
  r('ley-21719', 'Datos especiales', 'Datos sensibles y datos financieros', 'Aplicar el régimen reforzado a los datos sensibles y a los datos relativos a obligaciones económicas, financieras, bancarias o comerciales.', 'cumplimiento-ran', 'Permanente'),
  r('ley-21719', 'Seguridad', 'Medidas de seguridad', 'Adoptar medidas técnicas y organizativas apropiadas al riesgo para proteger los datos personales.', 'seguridad-informacion', 'Permanente'),
  r('ley-21719', 'Seguridad', 'Reporte de vulneraciones de seguridad', 'Informar a la Agencia de Protección de Datos Personales, por los medios más expeditos y sin dilaciones indebidas, las vulneraciones de seguridad que afecten datos personales, y comunicarlas a los titulares cuando involucren datos sensibles, de menores o económicos y financieros.', 'reportes-regulatorios', 'Por evento'),
  r('ley-21719', 'Encargados', 'Contratos con encargados del tratamiento', 'Los proveedores que tratan datos por cuenta de la cooperativa lo hacen bajo contrato con instrucciones, confidencialidad, medidas de seguridad y eliminación o devolución de los datos al término.', 'proveedores', 'Permanente', 'p21719.processors'),
  r('ley-21719', 'Transferencias', 'Transferencias internacionales', 'Transferir datos al extranjero solo a países con nivel adecuado de protección o con garantías suficientes (cláusulas contractuales u otras previstas por la ley).', 'proveedores', 'Permanente', 'p21719.transfers'),
  r('ley-21719', 'Evaluación de impacto', 'Evaluación de impacto en protección de datos', 'Realizar una evaluación de impacto antes de tratamientos de alto riesgo (datos sensibles a gran escala, perfilamiento, decisiones automatizadas o nuevas tecnologías).', 'matriz-riesgos', 'Por evento'),
  r('ley-21719', 'Prevención', 'Modelo de prevención de infracciones', 'Evaluar la adopción del modelo de prevención de infracciones con delegado de protección de datos (voluntario; atenúa la responsabilidad y puede certificarse).', 'cumplimiento-ran', 'Anual'),

  // ---------------------------------------------------------------- Ley 19.913
  r('ley-19913', 'art. 3', 'Inscripción como sujeto obligado', 'Mantener vigente la inscripción de la cooperativa en el registro de sujetos obligados de la UAF y sus datos de contacto actualizados.', 'cumplimiento-ran', 'Permanente'),
  r('ley-19913', 'art. 3', 'Oficial de cumplimiento', 'Designar un funcionario responsable de relacionarse con la UAF, con nivel jerárquico, independencia y recursos adecuados.', 'cumplimiento-ran', 'Permanente'),
  r('ley-19913', 'Circular 49', 'Manual de prevención LA/FT', 'Manual de prevención del lavado de activos y del financiamiento del terrorismo aprobado por el Consejo, actualizado y conocido por el personal.', 'cumplimiento-ran', 'Anual'),
  r('ley-19913', 'Circular 49', 'Evaluación de riesgos LA/FT', 'Identificar y evaluar los riesgos de lavado de activos y financiamiento del terrorismo por tipo de socio, producto, canal y zona geográfica.', 'matriz-riesgos', 'Anual'),
  r('ley-19913', 'Circular 59, tít. III', 'Debida diligencia y conocimiento del cliente', 'Identificar y verificar al socio antes o durante la relación y en operaciones ocasionales desde USD 1.000; ficha actualizada al menos anualmente; diligencia continua, reforzada para riesgo alto y simplificada solo para riesgo bajo.', 'cumplimiento-ran', 'Permanente'),
  r('ley-19913', 'Circular 49', 'Personas expuestas políticamente (PEP)', 'Identificar a los socios PEP y aplicar medidas reforzadas, incluida la aprobación de la alta administración para iniciar o mantener la relación.', 'cumplimiento-ran', 'Permanente'),
  r('ley-19913', 'art. 3', 'Reporte de operaciones sospechosas (ROS)', 'Informar sin demora a la UAF las operaciones sospechosas y mantener la reserva (no informar al socio ni a terceros que se reportó).', 'reportes-regulatorios', 'Por evento'),
  r('ley-19913', 'art. 5', 'Registro y reporte de operaciones en efectivo', 'Registrar las operaciones en efectivo sobre el umbral normativo y reportarlas a la UAF con la periodicidad que fija la circular vigente.', 'reportes-regulatorios', 'Permanente'),
  r('ley-19913', 'art. 38', 'Listas del Consejo de Seguridad de la ONU', 'Revisar a los socios contra las listas de sanciones del Consejo de Seguridad de la ONU (terrorismo y proliferación) y reportar de inmediato las coincidencias.', 'cumplimiento-ran', 'Permanente'),
  r('ley-19913', 'Circular 59, tít. V', 'Transferencias electrónicas de fondos', 'En transferencias desde USD 1.000, incorporar y verificar la información del ordenante y del beneficiario, gestionar las transferencias incompletas y conservar la información al menos 5 años.', 'cumplimiento-ran', 'Permanente'),
  r('ley-19913', 'Circular 59, tít. IX', 'Países y jurisdicciones de riesgo', 'Aplicar diligencia reforzada a operaciones con países en seguimiento del GAFI y contramedidas cuando el GAFI lo solicite.', 'cumplimiento-ran', 'Permanente'),
  r('ley-19913', 'Circular 49', 'Conservación de registros', 'Conservar los registros de identificación y de operaciones por al menos 5 años.', 'cumplimiento-ran', 'Permanente'),
  r('ley-19913', 'Circular 49', 'Capacitación en prevención LA/FT', 'Capacitar al menos una vez al año al personal, según su exposición a los riesgos de lavado de activos y financiamiento del terrorismo.', 'cumplimiento-ran', 'Anual'),
  r('ley-19913', 'Circular 49', 'Revisión independiente del sistema de prevención', 'Auditoría interna o revisión independiente del sistema de prevención, con seguimiento de sus hallazgos.', 'auditorias', 'Anual'),

  // ---------------------------------------------------------------- Ley 21.663
  r('ley-21663', 'Instr. Gral. N° 1', 'Inscripción en la plataforma de la ANCI', 'Inscribir a la cooperativa como prestador de servicios esenciales en la plataforma de la ANCI e informar al encargado de reporte (con formación o experiencia en ciberseguridad, poder acreditado con firma electrónica avanzada y correo institucional).', 'cumplimiento-ran', 'Permanente'),
  r('ley-21663', 'art. 7', 'Medidas permanentes de ciberseguridad', 'Aplicar de forma permanente medidas tecnológicas, organizacionales, físicas e informativas para prevenir, reportar y resolver incidentes de ciberseguridad, e implementar los protocolos y estándares que fije la ANCI.', 'seguridad-informacion', 'Permanente', 'p10.vulns'),
  r('ley-21663', 'art. 9', 'Alerta temprana al CSIRT Nacional', 'Enviar una alerta temprana al CSIRT Nacional dentro de 3 horas desde que se toma conocimiento de un incidente con efectos significativos.', 'reportes-regulatorios', 'Por evento', 'p21663.earlyAlert'),
  r('ley-21663', 'art. 9', 'Segundo informe e informe final', 'Enviar la actualización dentro de 72 horas desde que se toma conocimiento (24 horas si la cooperativa es OIV y se afectan sus servicios esenciales), con evaluación de gravedad, impacto e indicadores de compromiso, y el informe final dentro de 15 días corridos desde la alerta temprana.', 'reportes-regulatorios', 'Por evento', 'p21663.followUp'),
  r('ley-21663', 'art. 9', 'Coordinación con la CMF', 'Los incidentes que también son reportables a la CMF (RAN 20-8) se informan a ambas autoridades, cada una con su propio plazo.', 'reportes-regulatorios', 'Por evento', 'p21663.dual'),
  r('ley-21663', 'art. 8 y 9', 'Obligaciones de operador de importancia vital', 'Si la ANCI designa a la cooperativa como OIV: sistema continuo de gestión de seguridad de la información con registro de acciones; planes de continuidad y ciberseguridad certificados y revisados al menos cada dos años; ejercicios y simulacros; informar a los potenciales afectados; capacitación y ciberhigiene; delegado de ciberseguridad; y plan de acción informado al CSIRT dentro de 7 días corridos desde que se conoce un incidente.', 'cumplimiento-ran', 'Anual'),
];

/** Todos los requisitos base (RAN + otras normas). */
export const BASE_REQUIREMENTS: ComplianceRequirement[] = [...RAN_REQUIREMENTS, ...OTHER_BASE_REQUIREMENTS];
