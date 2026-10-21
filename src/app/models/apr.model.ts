/**
 * Insumos y cálculo de referencia del APR por riesgo operacional (método
 * estándar de Basilea III). El CAC-20 de la RAN CACs está en consulta: esto es
 * una simulación, no el cálculo normativo. Montos del BI en millones de pesos (MM$).
 */

export interface AprYear {
  year: number;
  interestIncome: number;          // ingresos por intereses
  interestExpense: number;         // gastos por intereses
  interestEarningAssets: number;   // activos que devengan intereses
  dividendIncome: number;
  feeIncome: number;               // ingresos por comisiones
  feeExpense: number;              // gastos por comisiones
  otherOpIncome: number;           // otros ingresos operacionales
  otherOpExpense: number;          // otros gastos operacionales
  netTradingPL: number;            // resultado neto cartera de negociación
  netBankingBookPL: number;        // resultado neto cartera bancaria (instrumentos)
}

/** Tramo del indicador de negocio con su coeficiente marginal. `upToUF` vacío = sin límite. */
export interface BiBucket {
  upToUF: number | null;
  coefficient: number;
}

/**
 * Tramos del método estándar que la CMF aplica a la banca (APR por riesgo
 * operacional): 12 % hasta 25 millones de UF y 15 % sobre ese monto.
 */
export const DEFAULT_BI_BUCKETS: BiBucket[] = [
  { upToUF: 25_000_000, coefficient: 0.12 },
  { upToUF: null, coefficient: 0.15 },
];

export interface AprInputs {
  years: AprYear[];
  buckets: BiBucket[];
  ufValueClp: number;              // valor de la UF para expresar el BI en UF
  useIlm: boolean;                 // false: ILM = 1
  minLossYears: number;            // años mínimos de pérdidas para usar ILM (5 en transición)
  usdToClp: number;                // para convertir la base de pérdidas (USD) a pesos
  capitalRatio: number;            // patrimonio efectivo mínimo / APR (10,5 %, Ley 21.641)
  leverageRatio: number;           // patrimonio efectivo mínimo / activos totales (5 %)
  // Suficiencia patrimonial (opcional, MM$)
  effectiveEquityMM?: number;      // patrimonio efectivo
  otherRwaMM?: number;             // APR por riesgo de crédito y de mercado
  totalAssetsMM?: number;          // activos totales
  /** @deprecated versiones anteriores usaban un único coeficiente. */
  bicCoefficient?: number;
  /** @deprecated */
  firstBucketLimitMM?: number;
}

const lastYears = (n: number) => {
  const y = new Date().getFullYear() - 1;
  return Array.from({ length: n }, (_, i) => y - (n - 1) + i);
};

export const EMPTY_APR_INPUTS: AprInputs = {
  years: lastYears(3).map(year => ({
    year, interestIncome: 0, interestExpense: 0, interestEarningAssets: 0, dividendIncome: 0, feeIncome: 0,
    feeExpense: 0, otherOpIncome: 0, otherOpExpense: 0, netTradingPL: 0, netBankingBookPL: 0,
  })),
  buckets: DEFAULT_BI_BUCKETS.map(b => ({ ...b })),
  ufValueClp: 40_000,
  useIlm: false,
  minLossYears: 5,
  usdToClp: 950,
  capitalRatio: 0.105,
  leverageRatio: 0.05,
};

/** Cifras ficticias de una cooperativa mediana (MM$), solo para demostración. */
export const DEMO_APR_INPUTS: AprInputs = {
  ...EMPTY_APR_INPUTS,
  years: lastYears(3).map((year, i) => ({
    year,
    interestIncome: 82_000 + i * 4_500,
    interestExpense: 30_500 + i * 2_100,
    interestEarningAssets: 690_000 + i * 35_000,
    dividendIncome: 120,
    feeIncome: 6_200 + i * 300,
    feeExpense: 1_150 + i * 60,
    otherOpIncome: 850 + i * 40,
    otherOpExpense: 420 + i * 25,
    netTradingPL: 0,
    netBankingBookPL: 310 + i * 30,
  })),
  effectiveEquityMM: 98_000,
  otherRwaMM: 640_000,
  totalAssetsMM: 860_000,
};

/** Completa insumos guardados por versiones anteriores con los valores por defecto. */
export function normalizeAprInputs(inp: Partial<AprInputs> | null | undefined): AprInputs {
  const base = structuredClone(EMPTY_APR_INPUTS);
  const merged = { ...base, ...(inp ?? {}) } as AprInputs;
  if (!Array.isArray(merged.buckets) || merged.buckets.length === 0) merged.buckets = base.buckets;
  if (!merged.years?.length) merged.years = base.years;
  return merged;
}

/** Coeficiente marginal por tramos: suma de cada tramo × su coeficiente (montos en UF). */
export function marginalBic(biUF: number, buckets: BiBucket[]): number {
  let remaining = Math.max(0, biUF);
  let lower = 0;
  let total = 0;
  for (const b of buckets) {
    const width = b.upToUF === null ? Infinity : Math.max(0, b.upToUF - lower);
    const slice = Math.min(remaining, width);
    total += slice * b.coefficient;
    remaining -= slice;
    if (b.upToUF !== null) lower = b.upToUF;
    if (remaining <= 0) break;
  }
  return total;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Simulación del método estándar (Basilea III, OPE25; misma estructura que el
 * método de la CMF para la banca): BI → BIC por tramos → ILM → requerimiento → APR.
 * `lossHistory` son las pérdidas netas anuales en USD (de la base de pérdidas).
 */
export function computeApr(raw: AprInputs, lossHistory: { net: number }[]) {
  const inp = normalizeAprInputs(raw);
  const ys = inp.years;
  // ILDC = mín(prom. |ingresos − gastos por intereses|, 2,25 % × prom. activos que devengan) + prom. dividendos
  const ildc = Math.min(avg(ys.map(y => Math.abs(y.interestIncome - y.interestExpense))), 0.0225 * avg(ys.map(y => y.interestEarningAssets)))
    + avg(ys.map(y => y.dividendIncome));
  // SC = máx(prom. otros ingresos, prom. otros gastos) + máx(prom. comisiones ganadas, prom. pagadas)
  const sc = Math.max(avg(ys.map(y => y.otherOpIncome)), avg(ys.map(y => y.otherOpExpense)))
    + Math.max(avg(ys.map(y => y.feeIncome)), avg(ys.map(y => y.feeExpense)));
  // FC = prom. |resultado cartera de negociación| + prom. |resultado cartera bancaria|
  const fc = avg(ys.map(y => Math.abs(y.netTradingPL))) + avg(ys.map(y => Math.abs(y.netBankingBookPL)));
  const bi = ildc + sc + fc;

  // BIC por tramos en UF, expresado nuevamente en MM$.
  const uf = inp.ufValueClp > 0 ? inp.ufValueClp : 1;
  const biUF = (bi * 1_000_000) / uf;
  const bic = (marginalBic(biUF, inp.buckets) * uf) / 1_000_000;
  const bicEffectivePct = bi > 0 ? bic / bi : inp.buckets[0]?.coefficient ?? 0;
  const firstLimit = inp.buckets[0]?.upToUF ?? null;

  // Componente de pérdidas: 15 × pérdida neta anual promedio (MM$).
  const lossYears = lossHistory.length;
  const avgNetLossMM = lossYears ? avg(lossHistory.map(h => h.net)) * inp.usdToClp / 1_000_000 : 0;
  const lc = 15 * avgNetLossMM;
  const ilmAllowed = inp.useIlm && lossYears >= inp.minLossYears;
  const ilm = ilmAllowed && bic > 0 ? Math.log(Math.E - 1 + Math.pow(lc / bic, 0.8)) : 1;

  const orc = bic * ilm;
  const apr = 12.5 * orc;

  // Suficiencia patrimonial (si se informan los datos).
  const totalRwa = inp.otherRwaMM !== undefined ? apr + inp.otherRwaMM : undefined;
  const pe = inp.effectiveEquityMM;
  const solvency = pe !== undefined && totalRwa
    ? {
        totalRwa,
        peToRwa: pe / totalRwa,
        requiredByRwa: totalRwa * inp.capitalRatio,
        peToAssets: inp.totalAssetsMM ? pe / inp.totalAssetsMM : undefined,
        requiredByAssets: inp.totalAssetsMM ? inp.totalAssetsMM * inp.leverageRatio : undefined,
        aprOpShareOfRwa: apr / totalRwa,
      }
    : null;

  return {
    ildc, sc, fc, bi, biUF, bic, bicEffectivePct, avgNetLossMM, lc, ilm, orc, apr,
    capitalForApr: apr * inp.capitalRatio,
    exceedsFirstBucket: firstLimit !== null && biUF > firstLimit,
    lossYears,
    ilmRequestedButBlocked: inp.useIlm && !ilmAllowed,
    solvency,
  };
}
