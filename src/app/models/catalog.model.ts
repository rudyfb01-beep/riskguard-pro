import { CacBusinessLine } from './risk.model';
import { CONTRACT_CLAUSES, PROVIDER_SERVICE_CATEGORIES } from './resilience.model';

// =============================================================================
// MANTENEDORES: ÁREAS, PROCESOS Y PARÁMETROS GENERALES
// =============================================================================

/** Área o gerencia de la cooperativa. Los puestos y procesos se asocian a ella. */
export interface OrgArea {
  id: string;
  name: string;
  manager: string;       // responsable del área
  description: string;
  active: boolean;
}

export type ProcessCriticality = 'Crítico' | 'Alto' | 'Medio' | 'Bajo';
export const PROCESS_CRITICALITIES: ProcessCriticality[] = ['Crítico', 'Alto', 'Medio', 'Bajo'];

/**
 * Proceso del mapa de procesos. Riesgos, controles, incidentes, KRIs, alertas y
 * hallazgos lo referencian por nombre; al renombrarlo se actualizan todas las referencias.
 */
export interface BusinessProcess {
  id: string;
  code: string;
  name: string;
  areaId?: string;
  owner: string;                    // dueño del proceso
  businessLine?: CacBusinessLine;   // línea de negocio normativa (CAC)
  criticality: ProcessCriticality;
  description: string;
  active: boolean;
}

export type ReportingCurrency = 'CLP' | 'USD';

/** Parámetros generales que antes estaban fijos en el código. */
export interface GeneralParameters {
  /** Moneda en que se registran montos (pérdidas, exposición, costos). Solo cambia etiquetas y formato. */
  currency: ReportingCurrency;
  /** Días antes del vencimiento de un contrato con proveedor para generar alerta. */
  contractExpiryWarningDays: number;
  /** Frecuencia de evaluación de proveedores, en meses, según criticidad. */
  providerAssessmentMonths: Record<ProcessCriticality, number>;
  /** Plazo para corregir vulnerabilidades, en días, según severidad. */
  vulnSlaDays: { 'Crítica': number; 'Alta': number; 'Media': number; 'Baja': number };
}

export const DEFAULT_GENERAL_PARAMETERS: GeneralParameters = {
  currency: 'USD',
  contractExpiryWarningDays: 90,
  providerAssessmentMonths: { 'Crítico': 12, 'Alto': 12, 'Medio': 24, 'Bajo': 36 },
  vulnSlaDays: { 'Crítica': 15, 'Alta': 30, 'Media': 90, 'Baja': 180 },
};

const posInt = (v: unknown, fallback: number, max = 3650): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= max ? n : fallback;
};

/** Completa y valida parámetros guardados (versiones anteriores o valores fuera de rango). */
export function normalizeGeneralParameters(raw: unknown): GeneralParameters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<GeneralParameters>;
  const d = DEFAULT_GENERAL_PARAMETERS;
  const pam = (r.providerAssessmentMonths ?? {}) as Partial<Record<ProcessCriticality, number>>;
  const sla = (r.vulnSlaDays ?? {}) as Partial<GeneralParameters['vulnSlaDays']>;
  return {
    currency: r.currency === 'CLP' ? 'CLP' : 'USD',
    contractExpiryWarningDays: posInt(r.contractExpiryWarningDays, d.contractExpiryWarningDays, 365),
    providerAssessmentMonths: {
      'Crítico': posInt(pam['Crítico'], d.providerAssessmentMonths['Crítico'], 60),
      'Alto': posInt(pam['Alto'], d.providerAssessmentMonths['Alto'], 60),
      'Medio': posInt(pam['Medio'], d.providerAssessmentMonths['Medio'], 60),
      'Bajo': posInt(pam['Bajo'], d.providerAssessmentMonths['Bajo'], 60),
    },
    vulnSlaDays: {
      'Crítica': posInt(sla['Crítica'], d.vulnSlaDays['Crítica'], 365),
      'Alta': posInt(sla['Alta'], d.vulnSlaDays['Alta'], 365),
      'Media': posInt(sla['Media'], d.vulnSlaDays['Media'], 730),
      'Baja': posInt(sla['Baja'], d.vulnSlaDays['Baja'], 730),
    },
  };
}

// =============================================================================
// PRIORIDAD 2: ESCALA DE RIESGO, APETITO, CUENTAS CONTABLES Y CATÁLOGOS DE PROVEEDORES
// =============================================================================

/** Definición de un nivel (1 a 4) de la escala de probabilidad o de impacto. */
export interface ScaleLevel {
  level: 1 | 2 | 3 | 4;
  name: string;
  criteria: string;   // criterio cualitativo o cuantitativo que define el nivel
}

/** Escala 4×4 de la política de riesgos. Los cortes de nivel (Bajo/Medio/Alto/Crítico) son fijos. */
export interface RiskScale {
  likelihood: ScaleLevel[];
  impact: ScaleLevel[];
}

export const DEFAULT_RISK_SCALE: RiskScale = {
  likelihood: [
    { level: 1, name: 'Improbable', criteria: 'Podría ocurrir solo en circunstancias excepcionales (menos de una vez en 5 años).' },
    { level: 2, name: 'Posible', criteria: 'Podría ocurrir alguna vez (una vez entre 2 y 5 años).' },
    { level: 3, name: 'Probable', criteria: 'Es probable que ocurra (una vez al año).' },
    { level: 4, name: 'Frecuente', criteria: 'Ocurre varias veces al año.' },
  ],
  impact: [
    { level: 1, name: 'Menor', criteria: 'Pérdida baja, sin efecto en socios ni observaciones regulatorias.' },
    { level: 2, name: 'Moderado', criteria: 'Pérdida acotada o interrupción breve de un servicio; afecta a pocos socios.' },
    { level: 3, name: 'Mayor', criteria: 'Pérdida relevante, interrupción de un proceso crítico o reclamos masivos; requiere reporte a la CMF.' },
    { level: 4, name: 'Catastrófico', criteria: 'Pérdida que compromete la solvencia, interrupción prolongada o sanción regulatoria.' },
  ],
};

/** Cortes fijos del puntaje (probabilidad × impacto) para el nivel de riesgo. */
export const RISK_LEVEL_BANDS = [
  { level: 'Bajo', from: 1, to: 3 },
  { level: 'Medio', from: 4, to: 6 },
  { level: 'Alto', from: 8, to: 9 },
  { level: 'Crítico', from: 12, to: 16 },
] as const;

function normalizeLevels(raw: unknown, fallback: ScaleLevel[]): ScaleLevel[] {
  const list = Array.isArray(raw) ? raw as Partial<ScaleLevel>[] : [];
  return fallback.map(f => {
    const r = list.find(x => x && x.level === f.level);
    return {
      level: f.level,
      name: typeof r?.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : f.name,
      criteria: typeof r?.criteria === 'string' ? r.criteria.slice(0, 500) : f.criteria,
    };
  });
}

export function normalizeRiskScale(raw: unknown): RiskScale {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<RiskScale>;
  return {
    likelihood: normalizeLevels(r.likelihood, DEFAULT_RISK_SCALE.likelihood),
    impact: normalizeLevels(r.impact, DEFAULT_RISK_SCALE.impact),
  };
}

/**
 * Apetito y tolerancia por categoría de riesgo, expresados como puntaje residual máximo
 * (1 a 16) y, opcionalmente, como pérdida neta anual máxima.
 */
export interface AppetiteLimit {
  category: string;          // categoría de Basilea
  appetiteMaxScore: number;  // hasta este puntaje residual: dentro del apetito
  toleranceMaxScore: number; // hasta este puntaje: sobre el apetito pero dentro de la tolerancia
  annualLossLimit?: number;  // pérdida neta anual tolerada (moneda de registro)
}

export interface RiskAppetite {
  statement: string;         // declaración aprobada por el Consejo
  approvedBy: string;
  approvalDate: string;      // YYYY-MM-DD
  limits: AppetiteLimit[];
}

export type AppetiteStatus = 'Dentro del apetito' | 'Sobre el apetito' | 'Fuera de tolerancia';

export const BASEL_CATEGORIES = [
  'Fraude Interno', 'Fraude Externo', 'Fallas Tecnológicas', 'Ejecución y Procesos',
  'Prácticas Laborales', 'Daño a Activos Físicos', 'Cumplimiento Normativo',
] as const;

export const DEFAULT_RISK_APPETITE: RiskAppetite = {
  statement: 'La cooperativa acepta riesgos operacionales de nivel bajo y medio en sus procesos, y no tolera riesgos residuales críticos que comprometan la continuidad de los servicios a los socios, la seguridad de su información o el cumplimiento normativo.',
  approvedBy: '',
  approvalDate: '',
  limits: BASEL_CATEGORIES.map(category => ({
    category,
    appetiteMaxScore: category === 'Fraude Interno' || category === 'Cumplimiento Normativo' ? 3 : 6,
    toleranceMaxScore: category === 'Fraude Interno' || category === 'Cumplimiento Normativo' ? 6 : 9,
  })),
};

const score = (v: unknown, fb: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 16 ? n : fb;
};

export function normalizeRiskAppetite(raw: unknown): RiskAppetite {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<RiskAppetite>;
  const list = Array.isArray(r.limits) ? r.limits : [];
  return {
    statement: typeof r.statement === 'string' ? r.statement : DEFAULT_RISK_APPETITE.statement,
    approvedBy: typeof r.approvedBy === 'string' ? r.approvedBy : '',
    approvalDate: typeof r.approvalDate === 'string' ? r.approvalDate : '',
    limits: DEFAULT_RISK_APPETITE.limits.map(d => {
      const x = list.find(l => l?.category === d.category);
      const appetite = score(x?.appetiteMaxScore, d.appetiteMaxScore);
      const loss = Number(x?.annualLossLimit);
      return {
        category: d.category,
        appetiteMaxScore: appetite,
        toleranceMaxScore: Math.max(appetite, score(x?.toleranceMaxScore, d.toleranceMaxScore)),
        annualLossLimit: Number.isFinite(loss) && loss > 0 ? loss : undefined,
      };
    }),
  };
}

export function appetiteStatus(residualScore: number, limit: AppetiteLimit | undefined): AppetiteStatus {
  if (!limit || residualScore <= limit.appetiteMaxScore) return 'Dentro del apetito';
  return residualScore <= limit.toleranceMaxScore ? 'Sobre el apetito' : 'Fuera de tolerancia';
}

/** Cuenta del plan de cuentas donde se contabilizan pérdidas y recuperos. */
export interface AccountingAccount {
  code: string;
  name: string;
  active: boolean;
}

export const DEFAULT_ACCOUNTING_ACCOUNTS: AccountingAccount[] = [];

export function normalizeAccounts(raw: unknown): AccountingAccount[] {
  const list = Array.isArray(raw) ? raw as Partial<AccountingAccount>[] : [];
  const seen = new Set<string>();
  const out: AccountingAccount[] = [];
  for (const a of list) {
    const code = typeof a?.code === 'string' ? a.code.trim() : '';
    if (!code || seen.has(code.toLowerCase())) continue;
    seen.add(code.toLowerCase());
    out.push({ code, name: typeof a.name === 'string' ? a.name.trim() : '', active: a.active !== false });
  }
  return out.sort((x, y) => x.code.localeCompare(y.code));
}

/** Cláusula mínima que se revisa en contratos de externalización. */
export interface ClauseDefinition {
  key: string;
  label: string;
  critical: boolean;   // su ausencia genera alerta alta
}

export interface ProviderCatalogs {
  categories: string[];
  clauses: ClauseDefinition[];
}

export const DEFAULT_PROVIDER_CATALOGS: ProviderCatalogs = {
  categories: [...PROVIDER_SERVICE_CATEGORIES],
  clauses: CONTRACT_CLAUSES.map(c => ({ key: c.key, label: c.label, critical: c.key === 'regulatorAccess' })),
};

export function normalizeProviderCatalogs(raw: unknown): ProviderCatalogs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ProviderCatalogs>;
  const cats = Array.isArray(r.categories)
    ? [...new Set(r.categories.filter((c): c is string => typeof c === 'string' && !!c.trim()).map(c => c.trim()))]
    : DEFAULT_PROVIDER_CATALOGS.categories;
  const seen = new Set<string>();
  const clauses = Array.isArray(r.clauses)
    ? r.clauses.filter(c => c && typeof c.key === 'string' && typeof c.label === 'string' && c.label.trim() && !seen.has(c.key) && seen.add(c.key))
      .map(c => ({ key: c.key, label: c.label.trim(), critical: !!c.critical }))
    : DEFAULT_PROVIDER_CATALOGS.clauses;
  return { categories: cats.length ? cats : DEFAULT_PROVIDER_CATALOGS.categories, clauses };
}
