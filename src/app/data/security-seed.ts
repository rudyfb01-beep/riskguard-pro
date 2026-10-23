import { InformationAsset, SecurityAssessmentItem, Vulnerability } from '../models/security.model';

type ItemDef = Pick<SecurityAssessmentItem, 'code' | 'domain' | 'requirement' | 'guidance'>;

/**
 * Lista de verificación de seguridad de la información y ciberseguridad.
 * Es REFERENCIAL: se basa en buenas prácticas (ISO/IEC 27001 y el marco que la
 * CMF aplica a la banca) y debe ajustarse al texto vigente de la RAN CACs.
 * Son datos base: se cargan en toda instalación nueva.
 */
const ITEMS: ItemDef[] = [
  { code: 'GOB-01', domain: 'Gobierno', requirement: 'Política de seguridad de la información y ciberseguridad aprobada por el Consejo de Administración', guidance: 'Aprobación formal, revisión al menos anual y difusión a todo el personal.' },
  { code: 'GOB-02', domain: 'Gobierno', requirement: 'Función de seguridad de la información (CISO) con responsabilidades y recursos definidos', guidance: 'Independiente de la operación de TI y con acceso directo a la alta administración.' },
  { code: 'GOB-03', domain: 'Gobierno', requirement: 'Reporte periódico al Consejo o Comité de Riesgos sobre seguridad, incidentes y riesgos relevantes', guidance: 'Frecuencia definida, indicadores y seguimiento de acuerdos.' },
  { code: 'RIE-01', domain: 'Gestión de riesgos', requirement: 'Inventario de activos de información con dueño, custodio y clasificación', guidance: 'Incluye activos operados por proveedores y servicios en la nube; revisión anual.' },
  { code: 'RIE-02', domain: 'Gestión de riesgos', requirement: 'Evaluación periódica de riesgos de seguridad sobre los activos críticos', guidance: 'Metodología documentada, resultados vinculados a la matriz de riesgo operacional.' },
  { code: 'RIE-03', domain: 'Gestión de riesgos', requirement: 'Tratamiento de datos personales de socios conforme a la normativa de protección de datos', guidance: 'Ley 19.628 y Ley 21.719: base de licitud, minimización, derechos de los titulares y notificación de brechas.' },
  { code: 'CTL-01', domain: 'Controles de seguridad', requirement: 'Gestión de identidades y accesos: altas, bajas y revisión periódica de privilegios', guidance: 'Autenticación de múltiples factores para accesos remotos, privilegiados y servicios en la nube.' },
  { code: 'CTL-02', domain: 'Controles de seguridad', requirement: 'Gestión de vulnerabilidades y parches con plazos según severidad', guidance: 'Escaneos periódicos, plazos de remediación definidos y aceptación formal de riesgos residuales.' },
  { code: 'CTL-03', domain: 'Controles de seguridad', requirement: 'Respaldos periódicos, protegidos y con pruebas de restauración', guidance: 'Al menos una copia aislada o inmutable frente a ransomware.' },
  { code: 'CTL-04', domain: 'Controles de seguridad', requirement: 'Cifrado de información confidencial en tránsito y en reposo', guidance: 'Protocolos vigentes (TLS 1.2 o superior) y gestión de llaves.' },
  { code: 'CTL-05', domain: 'Controles de seguridad', requirement: 'Gestión de cambios y desarrollo seguro', guidance: 'Separación de ambientes, revisión de código y pruebas de seguridad antes de pasar a producción.' },
  { code: 'CTL-06', domain: 'Controles de seguridad', requirement: 'Registro y monitoreo de eventos de seguridad con alertas', guidance: 'SOC o SIEM con cobertura de sistemas críticos y conservación de registros.' },
  { code: 'CIB-01', domain: 'Ciberseguridad', requirement: 'Plan de respuesta a incidentes con roles, escalamiento y notificación a CMF y ANCI', guidance: 'Probado al menos una vez al año; plazos de notificación definidos.' },
  { code: 'CIB-02', domain: 'Ciberseguridad', requirement: 'Pruebas de intrusión al menos anuales sobre canales expuestos a internet', guidance: 'Realizadas por terceros independientes; hallazgos registrados y remediados.' },
  { code: 'CIB-03', domain: 'Ciberseguridad', requirement: 'Programa de concientización y capacitación en ciberseguridad', guidance: 'Incluye simulaciones de phishing y capacitación específica para roles críticos.' },
  { code: 'CIB-04', domain: 'Ciberseguridad', requirement: 'Intercambio de información sobre amenazas', guidance: 'Participación en CSIRT, gremio u otras instancias de colaboración.' },
  { code: 'TER-01', domain: 'Terceros', requirement: 'Requisitos de seguridad en contratos con proveedores', guidance: 'Confidencialidad, notificación de incidentes, derecho de auditoría y ubicación de los datos.' },
  { code: 'TER-02', domain: 'Terceros', requirement: 'Evaluación de seguridad de proveedores críticos y servicios en la nube', guidance: 'Antes de contratar y periódicamente según criticidad.' },
  { code: 'CON-01', domain: 'Continuidad', requirement: 'Plan de recuperación ante desastres tecnológicos probado en los últimos 12 meses', guidance: 'Pruebas con resultados documentados y acciones de mejora.' },
  { code: 'CON-02', domain: 'Continuidad', requirement: 'Sistemas críticos con RTO y RPO definidos y capacidad de recuperación verificada', guidance: 'Coherente con el análisis de impacto (BIA) y los compromisos de proveedores.' },
];

export const BASE_ASSESSMENT_ITEMS: SecurityAssessmentItem[] = ITEMS.map(i => ({
  ...i,
  id: `sec-${i.code.toLowerCase()}`,
  status: 'Sin evaluar',
  evidence: '',
  owner: '',
  actionPlan: '',
}));

// -----------------------------------------------------------------------------
// Datos de EJEMPLO (ficticios)
// -----------------------------------------------------------------------------

export const DEMO_ASSESSMENT: Partial<Record<string, Partial<SecurityAssessmentItem>>> = {
  'GOB-01': { status: 'Cumple', evidence: 'Política v2.0 aprobada por el Consejo en sesión de marzo de 2026.', owner: 'Ing. Alejandro Vega' },
  'GOB-02': { status: 'Cumple', evidence: 'CISO designado; reporta a la Gerencia General.', owner: 'Sr. Patricio Rojas' },
  'GOB-03': { status: 'Cumple parcialmente', evidence: 'Se informa solo ante incidentes relevantes.', owner: 'Ing. Alejandro Vega', actionPlan: 'Reporte trimestral formal al Comité de Riesgos desde el primer trimestre de 2027.', dueDate: '2027-03-31' },
  'RIE-01': { status: 'Cumple parcialmente', evidence: 'Inventario iniciado; faltan activos de sucursales.', owner: 'Ing. Alejandro Vega', actionPlan: 'Completar inventario de sucursales.', dueDate: '2026-12-15' },
  'RIE-02': { status: 'No cumple', evidence: 'No hay evaluación formal de riesgos de seguridad.', owner: 'Dra. Elena Vasconcelos' },
  'CTL-01': { status: 'Cumple parcialmente', evidence: 'MFA en Google Workspace; falta en accesos remotos al core.', owner: 'Ing. Alejandro Vega', actionPlan: 'Habilitar MFA en VPN y consola del core.', dueDate: '2026-12-31' },
  'CTL-03': { status: 'Cumple', evidence: 'Respaldos diarios con prueba de restauración mensual.', owner: 'Ing. Carlos Mendoza' },
  'CIB-01': { status: 'Cumple', evidence: 'Procedimiento de respuesta a incidentes v1.3 con plazos CMF/ANCI.', owner: 'Ing. Alejandro Vega' },
  'CIB-03': { status: 'No cumple', evidence: 'Sin programa formal de capacitación.', owner: 'Sr. Patricio Rojas', actionPlan: 'Contratar plataforma de concientización con simulaciones de phishing.', dueDate: '2027-01-31' },
};

export const DEMO_ASSETS: InformationAsset[] = [
  {
    id: 'ast-1', code: 'AST-001', name: 'Base de datos del core financiero', type: 'Datos / Base de datos',
    description: 'Cuentas de ahorro, créditos, cuotas de participación y datos de socios.',
    owner: 'Ing. Carlos Mendoza', custodian: 'Núcleo Financiero SpA', classification: 'Restringida',
    cia: { confidentiality: 4, integrity: 4, availability: 4 }, handlesPersonalData: true,
    location: 'Proveedor externo', providerId: 'prv-1', biaProcessIds: ['bia-1', 'bia-2', 'bia-3'], lastReviewDate: '2026-04-20',
  },
  {
    id: 'ast-2', code: 'AST-002', name: 'Portal web y app de socios', type: 'Aplicación',
    description: 'Canal digital para consultas, transferencias y pago de créditos.',
    owner: 'Ing. Alejandro Vega', custodian: 'Equipo de canales digitales', classification: 'Confidencial',
    cia: { confidentiality: 3, integrity: 4, availability: 4 }, handlesPersonalData: true,
    location: 'Nube', providerId: 'prv-2', biaProcessIds: ['bia-3'], lastReviewDate: '2026-05-10',
  },
  {
    id: 'ast-3', code: 'AST-003', name: 'Respaldos y sitio alterno en la nube', type: 'Servicio en la nube',
    description: 'Copias de respaldo y ambiente de recuperación ante desastres.',
    owner: 'Ing. Alejandro Vega', custodian: 'NubeSur Cloud Services', classification: 'Restringida',
    cia: { confidentiality: 4, integrity: 4, availability: 3 }, handlesPersonalData: true,
    location: 'Nube', providerId: 'prv-2', biaProcessIds: ['bia-2', 'bia-3'], lastReviewDate: '2026-05-10',
  },
  {
    id: 'ast-4', code: 'AST-004', name: 'Plataforma de cajas de sucursales', type: 'Aplicación',
    description: 'Depósitos, retiros y pagos presenciales.',
    owner: 'Ing. Carlos Mendoza', custodian: 'Soporte TI sucursales', classification: 'Confidencial',
    cia: { confidentiality: 3, integrity: 4, availability: 4 }, handlesPersonalData: true,
    location: 'Instalaciones propias', biaProcessIds: ['bia-2', 'bia-7'], lastReviewDate: '2025-07-01',
  },
  {
    id: 'ast-5', code: 'AST-005', name: 'Correo y cuentas de usuario (Google Workspace)', type: 'Servicio en la nube',
    description: 'Correo corporativo, documentos compartidos e identidades de los colaboradores.',
    owner: 'Sr. Patricio Rojas', custodian: 'Ing. Alejandro Vega', classification: 'Confidencial',
    cia: { confidentiality: 3, integrity: 3, availability: 3 }, handlesPersonalData: true,
    location: 'Nube', biaProcessIds: [], lastReviewDate: '2026-02-01',
  },
  {
    id: 'ast-6', code: 'AST-006', name: 'Red corporativa y firewall perimetral', type: 'Red / Comunicaciones',
    description: 'Conectividad de casa matriz y sucursales; acceso a internet.',
    owner: 'Ing. Carlos Mendoza', custodian: '', classification: 'Interna',
    cia: { confidentiality: 2, integrity: 4, availability: 4 }, handlesPersonalData: false,
    location: 'Instalaciones propias', biaProcessIds: ['bia-2', 'bia-3', 'bia-7'], lastReviewDate: '2026-03-15',
  },
  {
    id: 'ast-7', code: 'AST-007', name: 'Expedientes físicos de crédito y pagarés', type: 'Documento físico',
    description: 'Documentación original de créditos, garantías y mandatos.',
    owner: 'Ing. Carlos Mendoza', custodian: 'Archivo central', classification: 'Confidencial',
    cia: { confidentiality: 3, integrity: 4, availability: 2 }, handlesPersonalData: true,
    location: 'Instalaciones propias', biaProcessIds: ['bia-1'], lastReviewDate: '2026-01-20',
  },
  {
    id: 'ast-8', code: 'AST-008', name: 'Plataforma de recaudación PAC/PAT', type: 'Servicio en la nube',
    description: 'Cobro de cuotas por cargo automático en cuentas y tarjetas.',
    owner: 'Ing. Carlos Mendoza', custodian: 'Pagos Andinos S.A.', classification: 'Confidencial',
    cia: { confidentiality: 3, integrity: 4, availability: 3 }, handlesPersonalData: true,
    location: 'Proveedor externo', providerId: 'prv-3', biaProcessIds: ['bia-4'], lastReviewDate: '2026-05-02',
  },
];

export const DEMO_VULNERABILITIES: Vulnerability[] = [
  {
    id: 'vul-1', code: 'VUL-001', title: 'Protocolos TLS 1.0/1.1 habilitados en el portal de socios',
    description: 'El escaneo externo detectó versiones obsoletas de TLS aceptadas por el balanceador.',
    assetId: 'ast-2', source: 'Escaneo automatizado', severity: 'Alta', cvssScore: 7.4,
    detectedDate: '2026-09-01', dueDate: '2026-10-01', status: 'En remediación', owner: 'Ing. Alejandro Vega',
    remediation: 'Deshabilitar TLS < 1.2 en el balanceador; coordinar con NubeSur.',
  },
  {
    id: 'vul-2', code: 'VUL-002', title: 'Inyección SQL en el simulador de créditos',
    description: 'La prueba de intrusión logró extraer datos de prueba mediante un parámetro sin validar.',
    assetId: 'ast-2', source: 'Prueba de intrusión', severity: 'Crítica', cvssScore: 9.1,
    detectedDate: '2026-10-12', dueDate: '2026-10-27', status: 'Abierta', owner: 'Ing. Alejandro Vega',
    remediation: 'Consultas parametrizadas y WAF con regla virtual mientras se corrige.',
  },
  {
    id: 'vul-3', code: 'VUL-003', title: 'Parches de seguridad pendientes en servidores de cajas',
    description: 'Tres servidores de sucursales sin las actualizaciones críticas de agosto.',
    assetId: 'ast-4', source: 'Escaneo automatizado', severity: 'Alta', cvssScore: 8.1,
    detectedDate: '2026-08-15', dueDate: '2026-09-14', status: 'Abierta', owner: 'Ing. Carlos Mendoza',
    remediation: 'Ventana de mantenimiento nocturna por sucursal.',
  },
  {
    id: 'vul-4', code: 'VUL-004', title: 'Cuentas genéricas compartidas en la mesa de dinero',
    description: 'Relacionada con el incidente inc-1: credenciales maestras usadas por varios analistas.',
    assetId: 'ast-1', source: 'Auditoría', severity: 'Media',
    detectedDate: '2026-10-17', dueDate: '2027-01-15', status: 'En remediación', owner: 'Ing. Carlos Mendoza',
    remediation: 'Eliminar usuarios genéricos y exigir cuentas nominativas con token.',
  },
  {
    id: 'vul-5', code: 'VUL-005', title: 'Reglas de firewall "any-any" heredadas',
    description: 'Reglas permisivas antiguas entre la red de sucursales y la red de servidores.',
    assetId: 'ast-6', source: 'Auditoría', severity: 'Media',
    detectedDate: '2026-06-02', dueDate: '2026-08-31', status: 'Riesgo aceptado', owner: 'Ing. Carlos Mendoza',
    remediation: 'Segmentación prevista con el recambio de equipos.',
    acceptance: { justification: 'Recambio de firewall planificado; controles compensatorios con monitoreo del SOC.', approvedBy: 'Sr. Patricio Rojas', approvedDate: '2026-07-01', reviewDate: '2026-10-01' },
  },
  {
    id: 'vul-6', code: 'VUL-006', title: 'Cifrado débil en respaldos antiguos',
    description: 'Respaldos anteriores a 2025 usaban un algoritmo de cifrado obsoleto.',
    assetId: 'ast-3', source: 'Aviso de proveedor', severity: 'Alta',
    detectedDate: '2026-05-05', dueDate: '2026-06-04', status: 'Mitigada', owner: 'Ing. Alejandro Vega',
    remediation: 'Recifrado con AES-256 y destrucción de copias antiguas.', closedDate: '2026-05-28',
  },
  {
    id: 'vul-7', code: 'VUL-007', title: 'Administradores de Google Workspace sin verificación en dos pasos',
    description: 'Dos cuentas con privilegios de administrador no tenían segundo factor.',
    assetId: 'ast-5', source: 'Reporte interno', severity: 'Alta',
    detectedDate: '2026-04-10', dueDate: '2026-05-10', status: 'Cerrada', owner: 'Ing. Alejandro Vega',
    remediation: 'Verificación en dos pasos obligatoria con llaves de seguridad para administradores.', closedDate: '2026-04-30',
  },
];

/** Pruebas de seguridad de ejemplo (fechas relativas a hoy). */
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
export const DEMO_SECURITY_TESTS: import('../models/compliance.model').SecurityTest[] = [
  { id: 'stest-1', date: ago(120), type: 'Prueba de penetración', scope: 'Canales digitales (web y app de socios) y perímetro', executedBy: 'Empresa externa especializada', result: 'Con observaciones', findings: '2 vulnerabilidades altas en la API de la app; corregidas en 30 días.', reportedToBoardDate: ago(100) },
  { id: 'stest-2', date: ago(200), type: 'Prueba de restauración de respaldos', scope: 'Core financiero y base de datos de socios', executedBy: 'Equipo de infraestructura', result: 'Satisfactoria', findings: 'Restauración dentro del RPO de 1 hora.' },
  { id: 'stest-3', date: ago(420), type: 'Prueba del plan de respuesta a incidentes', scope: 'Escenario de ransomware en estaciones de sucursales', executedBy: 'CISO y comité de crisis', result: 'Con observaciones', findings: 'Escalamiento a la gerencia tardó 50 minutos; se ajustó el árbol de llamadas.' },
];
