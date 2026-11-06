import { CrisisCommittee, CrisisEvent, CrisisScenario } from '../models/crisis.model';

/**
 * Escenarios de referencia (los 5 mínimos de la RAN 20-9 más desastre natural y crisis
 * reputacional). Se cargan una vez en toda instalación; cada cooperativa los ajusta.
 */
export const BASE_SCENARIOS: CrisisScenario[] = [
  {
    id: 'esc-01', code: 'ESC-01', name: 'Caída del core financiero o del centro de datos', category: 'Falla total o parcial de sistemas tecnológicos',
    description: 'Indisponibilidad del sistema central (core) o del centro de datos que impide operar cuentas, créditos y pagos.',
    likelihood: 2, impact: 4,
    activationCriteria: 'Core o canales críticos caídos más de 1 hora, o antes si se proyecta superar el RTO de un proceso crítico.',
    initialActions: [
      'Confirmar alcance y causa probable con TI y el proveedor del core',
      'Evaluar conmutación al sitio alterno (DRP) según el RTO',
      'Activar procedimiento de operación manual en sucursales',
      'Informar a socios por canales digitales y sucursales',
      'Evaluar si corresponde aviso a la CMF (RAN 20-8)',
    ],
    communications: 'Socios: servicio interrumpido, tiempo estimado y canales alternativos. CMF: aviso de incidente operacional relevante si corresponde.',
    affectedProcessIds: [], planIds: [], owner: '', lastReviewDate: '2026-01-15', active: true,
  },
  {
    id: 'esc-02', code: 'ESC-02', name: 'Ransomware o ciberataque con compromiso de datos', category: 'Ataque malicioso a la ciberseguridad',
    description: 'Cifrado o exfiltración de información, suplantación masiva o ataque que obliga a aislar sistemas.',
    likelihood: 3, impact: 4,
    activationCriteria: 'Evidencia de cifrado, exfiltración o acceso no autorizado a sistemas con datos de socios.',
    initialActions: [
      'Aislar equipos y cuentas comprometidas; preservar evidencia',
      'Activar al proveedor de respuesta a incidentes / forense',
      'Evaluar restauración desde respaldos inmutables',
      'Preparar aviso a la ANCI / CSIRT y a la CMF dentro de plazo',
      'Definir mensaje a socios y colaboradores con el vocero',
    ],
    communications: 'ANCI/CSIRT y CMF dentro de los plazos legales. Socios afectados: qué pasó, qué datos y qué hacer.',
    affectedProcessIds: [], planIds: [], owner: '', lastReviewDate: '2026-01-15', active: true,
  },
  {
    id: 'esc-03', code: 'ESC-03', name: 'Ausencia masiva de personal crítico', category: 'Ausencia de personal crítico',
    description: 'Pandemia, paro o evento que deja sin dotación mínima a procesos críticos.',
    likelihood: 2, impact: 3,
    activationCriteria: 'Dotación bajo el mínimo del BIA en algún proceso crítico por más de un día.',
    initialActions: ['Activar reemplazos y personal entrenado de otras áreas', 'Habilitar teletrabajo para funciones remotas', 'Priorizar procesos según el BIA'],
    communications: 'Colaboradores: turnos y reemplazos. Socios: horarios reducidos si aplica.',
    affectedProcessIds: [], planIds: [], owner: '', lastReviewDate: '2026-01-15', active: true,
  },
  {
    id: 'esc-04', code: 'ESC-04', name: 'Imposibilidad de acceder a la casa matriz o sucursales', category: 'Imposibilidad de acceder a instalaciones físicas',
    description: 'Incendio, corte prolongado, estallido o cierre de accesos que impide usar las instalaciones.',
    likelihood: 2, impact: 3,
    activationCriteria: 'Instalación inaccesible o insegura por más de 4 horas.',
    initialActions: ['Evacuar y confirmar la seguridad de las personas', 'Trasladar funciones críticas al sitio alterno o teletrabajo', 'Redirigir atención a otras sucursales y canales digitales'],
    communications: 'Colaboradores: dónde presentarse. Socios: sucursales alternativas.',
    affectedProcessIds: [], planIds: [], owner: '', lastReviewDate: '2026-01-15', active: true,
  },
  {
    id: 'esc-05', code: 'ESC-05', name: 'Falla de un proveedor crítico', category: 'Falla de servicios críticos de proveedores',
    description: 'El proveedor de un servicio crítico (core, nube, medios de pago, transporte de valores) no puede prestarlo.',
    likelihood: 3, impact: 3,
    activationCriteria: 'El proveedor no cumple el RTO comprometido o anuncia una interrupción prolongada.',
    initialActions: ['Escalar con el proveedor según contrato', 'Activar el plan de salida o proveedor alternativo', 'Evaluar impacto en procesos y socios'],
    communications: 'Socios: servicios afectados. CMF: si afecta un servicio externalizado significativo (RAN 20-7).',
    affectedProcessIds: [], planIds: [], owner: '', lastReviewDate: '2026-01-15', active: true,
  },
  {
    id: 'esc-06', code: 'ESC-06', name: 'Terremoto o desastre natural', category: 'Desastre natural',
    description: 'Sismo de gran magnitud, tsunami o incendio forestal que afecta personas, instalaciones y comunicaciones.',
    likelihood: 2, impact: 4,
    activationCriteria: 'Sismo mayor a 7 o alerta de evacuación en zonas con sucursales.',
    initialActions: ['Confirmar estado de colaboradores (árbol de llamadas)', 'Evaluar daños en sucursales y centro de datos', 'Activar BCP de atención y pagos esenciales'],
    communications: 'Colaboradores y familias: estado y apoyo. Socios: sucursales operativas y medidas de apoyo.',
    affectedProcessIds: [], planIds: [], owner: '', lastReviewDate: '2026-01-15', active: true,
  },
];

/** En los datos de ejemplo los escenarios quedan ligados a los procesos del BIA y a los planes. */
const DEMO_LINKS: Record<string, Partial<CrisisScenario>> = {
  'esc-01': { affectedProcessIds: ['bia-1', 'bia-2', 'bia-3'], planIds: ['pln-2', 'pln-3'], owner: 'Ing. Alejandro Vega' },
  'esc-02': { affectedProcessIds: ['bia-2', 'bia-3'], planIds: ['pln-3', 'pln-2'], owner: 'Ing. Alejandro Vega' },
  'esc-03': { affectedProcessIds: ['bia-7'], planIds: ['pln-1'], owner: 'Sr. Patricio Rojas' },
  'esc-04': { affectedProcessIds: ['bia-7', 'bia-1'], planIds: ['pln-1', 'pln-3'], owner: 'Sr. Patricio Rojas' },
  'esc-05': { affectedProcessIds: ['bia-3', 'bia-4'], planIds: ['pln-2'], owner: 'Ing. Carlos Mendoza' },
  'esc-06': { affectedProcessIds: ['bia-7', 'bia-2'], planIds: ['pln-1', 'pln-3'], owner: 'Sr. Patricio Rojas' },
};
export const DEMO_SCENARIOS: CrisisScenario[] = BASE_SCENARIOS.map(s => ({ ...s, ...DEMO_LINKS[s.id] }));

export const DEMO_COMMITTEE: CrisisCommittee = {
  members: [
    { name: 'Sr. Patricio Rojas', role: 'Presidente del comité', phone: '+56 9 5555 0101', email: 'patricio.rojas@demo.riskguard.cl', alternate: 'Dra. Elena Vasconcelos' },
    { name: 'Dra. Elena Vasconcelos', role: 'Coordinador de crisis', phone: '+56 9 5555 0102', email: 'elena.vasconcelos@demo.riskguard.cl', alternate: 'Dra. Sofía Valenzuela' },
    { name: 'Ing. Alejandro Vega', role: 'Tecnología y seguridad', phone: '+56 9 5555 0103', email: 'alejandro.vega@demo.riskguard.cl', alternate: '' },
    { name: 'Ing. Carlos Mendoza', role: 'Operaciones', phone: '+56 9 5555 0104', email: 'carlos.mendoza@demo.riskguard.cl', alternate: '' },
    { name: 'Dra. Sofía Valenzuela', role: 'Legal y cumplimiento', phone: '+56 9 5555 0105', email: 'sofia.valenzuela@demo.riskguard.cl', alternate: '' },
    { name: 'Carmen Soto', role: 'Vocero / comunicaciones', phone: '+56 9 5555 0106', email: 'carmen.soto@demo.riskguard.cl', alternate: 'Sr. Patricio Rojas' },
  ],
  primaryRoom: 'Sala de directorio, casa matriz (piso 3)',
  alternateRoom: 'Sucursal Talca Centro, sala de reuniones',
  virtualRoom: 'Videollamada fija del comité (enlace en el plan CRI-01)',
  convocation: 'Quien detecta el evento avisa al Coordinador de crisis; este evalúa el nivel y, desde nivel 2, convoca al comité por teléfono y correo. Si no contesta, se llama al suplente. El comité sesiona en la sala principal o, si no está disponible, en la alternativa o en la videollamada.',
  approvedBy: 'Consejo de Administración', approvalDate: '2026-01-20',
};

export const DEMO_CRISIS_EVENTS: CrisisEvent[] = [
  {
    id: 'cri-demo-1', code: 'CR-2026-001', title: 'Simulacro: caída del core en cierre de mes', mode: 'Simulacro', level: 2, status: 'Cerrada',
    scenarioId: 'esc-01', declaredAt: '2026-05-28T15:00:00.000Z', declaredBy: 'Dra. Elena Vasconcelos', stabilizedAt: '2026-05-28T17:10:00.000Z',
    closedAt: '2026-05-28T18:30:00.000Z', closedBy: 'Sr. Patricio Rojas', affectedProcessIds: ['bia-1', 'bia-2', 'bia-3'], activatedPlanIds: ['pln-2', 'pln-3'],
    log: [
      { id: 'l1', at: '2026-05-28T15:00:00.000Z', by: 'Dra. Elena Vasconcelos', kind: 'Estado', text: 'Simulacro declarado (nivel 2 · Crisis).' },
      { id: 'l2', at: '2026-05-28T15:12:00.000Z', by: 'Ing. Alejandro Vega', kind: 'Situación', text: 'Proveedor del core confirma falla de almacenamiento; sin hora estimada.' },
      { id: 'l3', at: '2026-05-28T15:25:00.000Z', by: 'Sr. Patricio Rojas', kind: 'Decisión', text: 'Se activa el DRP-01 y la operación manual en sucursales.' },
      { id: 'l4', at: '2026-05-28T17:10:00.000Z', by: 'Ing. Alejandro Vega', kind: 'Estado', text: 'Core operando en el sitio alterno: crisis estabilizada.' },
      { id: 'l5', at: '2026-05-28T18:30:00.000Z', by: 'Sr. Patricio Rojas', kind: 'Estado', text: 'Simulacro cerrado.' },
    ],
    tasks: [
      { id: 't1', text: 'Confirmar alcance y causa probable con TI y el proveedor del core', owner: 'Ing. Alejandro Vega', done: true, doneAt: '2026-05-28T15:12:00.000Z', doneBy: 'Ing. Alejandro Vega' },
      { id: 't2', text: 'Evaluar conmutación al sitio alterno (DRP) según el RTO', owner: 'Ing. Alejandro Vega', done: true, doneAt: '2026-05-28T15:25:00.000Z', doneBy: 'Ing. Alejandro Vega' },
      { id: 't3', text: 'Informar a socios por canales digitales y sucursales', owner: 'Carmen Soto', done: true, doneAt: '2026-05-28T15:40:00.000Z', doneBy: 'Carmen Soto' },
    ],
    communications: [
      { id: 'c1', at: '2026-05-28T15:40:00.000Z', by: 'Carmen Soto', audience: 'Socios', channel: 'Banner en app y sitio web (simulado)', summary: 'Servicio intermitente; usar sucursales para giros urgentes.' },
    ],
    closingSummary: 'Conmutación al sitio alterno en 2 h 10 min (RTO de 4 h cumplido). Operación manual en sucursales funcionó con demoras.',
    lessons: 'El árbol de llamadas tenía 2 teléfonos desactualizados. La plantilla de mensaje a socios no estaba aprobada de antemano.',
    createdBy: 'Dra. Elena Vasconcelos', createdAt: '2026-05-20T12:00:00.000Z',
  },
  {
    id: 'cri-demo-2', code: 'CR-2026-002', title: 'Simulacro de escritorio: ransomware en estaciones de sucursal', mode: 'Simulacro', level: 3, status: 'Programada',
    scenarioId: 'esc-02', plannedDate: '2026-11-26', affectedProcessIds: ['bia-2', 'bia-3'], activatedPlanIds: ['pln-3', 'pln-2'],
    log: [], tasks: [], communications: [], createdBy: 'Dra. Elena Vasconcelos', createdAt: '2026-10-30T12:00:00.000Z',
  },
];
