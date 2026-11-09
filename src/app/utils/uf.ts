// =============================================================================
// Unidad de Fomento (UF): valores diarios y expresión de montos en UF.
// La base de pérdidas se registra en pesos y cada evento guarda el valor de la
// UF de su fecha de referencia (contable, de descubrimiento u ocurrencia), para
// comparar montos de distintos años sin el efecto de la inflación.
// =============================================================================

import { OperationalFlaw } from '../models/risk.model';

/** Valores de la UF en pesos por fecha (AAAA-MM-DD). */
export type UfTable = Record<string, number>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validUf = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 1000 && v < 1_000_000;

/** Limpia una tabla guardada (fechas válidas y valores razonables). */
export function normalizeUfTable(raw: unknown): UfTable {
  const out: UfTable = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === 'string' ? Number(v) : v;
    if (DAY.test(k) && validUf(n)) out[k] = Math.round(n * 100) / 100;
  }
  return out;
}

/** Fechas de la tabla ordenadas (de la más antigua a la más reciente). */
export const ufDays = (t: UfTable) => Object.keys(t).sort();

/**
 * Valor de la UF para un día: el del día o, si falta, el último anterior conocido
 * (hasta 45 días antes). Devuelve también la fecha del valor usado.
 */
export function ufOn(t: UfTable, day: string | undefined): { value: number; date: string } | null {
  if (!day || !DAY.test(day.slice(0, 10))) return null;
  const d = day.slice(0, 10);
  if (t[d]) return { value: t[d], date: d };
  const limit = new Date(`${d}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - 45);
  const min = limit.toISOString().slice(0, 10);
  let best: string | null = null;
  for (const k of Object.keys(t)) if (k < d && k >= min && (!best || k > best)) best = k;
  return best ? { value: t[best], date: best } : null;
}

/** Fecha de referencia de un evento de pérdida: contable, descubrimiento, ocurrencia o registro. */
export function lossReferenceDay(f: Pick<OperationalFlaw, 'accountingDate' | 'discoveryDate' | 'occurrenceDate' | 'reportedAt'>): string | undefined {
  const d = f.accountingDate || f.discoveryDate || f.occurrenceDate || f.reportedAt?.slice(0, 10);
  return d && DAY.test(d.slice(0, 10)) ? d.slice(0, 10) : undefined;
}

/** Valor UF a guardar en el evento (si hay tabla para su fecha). */
export function ufStampFor(f: OperationalFlaw, t: UfTable): Pick<OperationalFlaw, 'ufValueClp' | 'ufDate'> {
  const hit = ufOn(t, lossReferenceDay(f));
  return hit ? { ufValueClp: hit.value, ufDate: hit.date } : { ufValueClp: undefined, ufDate: undefined };
}

/** Valor UF del evento: el guardado o, si no tiene, el de la tabla. */
export function ufForLoss(f: OperationalFlaw, t: UfTable): { value: number; date: string; stored: boolean } | null {
  if (validUf(f.ufValueClp) && f.ufDate) return { value: f.ufValueClp, date: f.ufDate, stored: true };
  const hit = ufOn(t, lossReferenceDay(f));
  return hit ? { ...hit, stored: false } : null;
}

/** Monto en pesos expresado en UF (2 decimales). */
export const toUf = (clp: number, ufValue: number) => Math.round((clp / ufValue) * 100) / 100;

export function formatUf(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `UF ${v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Lee valores pegados desde una planilla o el sitio del SII/Banco Central:
 * una fecha (DD-MM-AAAA, DD/MM/AAAA o AAAA-MM-DD) y un valor (39.485,65 o 39485.65) por línea.
 */
export function parseUfText(text: string): { values: UfTable; errors: string[] } {
  const values: UfTable = {};
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l) return;
    const m = l.match(/^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})[\s;,\t]+\$?\s*([\d.,]+)\s*$/);
    if (!m) {
      if (i > 0 || /\d/.test(l)) errors.push(`Línea ${i + 1}: "${l.slice(0, 40)}" no tiene fecha y valor.`);
      return;
    }
    const [a, b, c] = m[1].split(/[-/.]/).map(Number);
    const iso = m[1].includes('-') && String(a).length === 4
      ? `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`
      : `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    let raw = m[2];
    // 39.485,65 → 39485.65 · 39,485.65 → 39485.65 · 39485,65 → 39485.65
    if (raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(/,/g, '');
    const v = Number(raw);
    const date = new Date(`${iso}T12:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) errors.push(`Línea ${i + 1}: fecha no válida.`);
    else if (!validUf(v)) errors.push(`Línea ${i + 1}: ${m[2]} no parece un valor de UF.`);
    else values[iso] = Math.round(v * 100) / 100;
  });
  return { values, errors };
}

/** Serie de mindicador.cl ({ serie: [{ fecha, valor }] }) → tabla. */
export function parseMindicador(json: unknown): UfTable {
  const serie = (json as { serie?: { fecha?: string; valor?: number }[] })?.serie;
  const out: UfTable = {};
  if (!Array.isArray(serie)) return out;
  for (const s of serie) {
    // La fecha viene en UTC (p. ej. 2026-11-06T03:00:00.000Z = 6 de noviembre en Chile).
    const d = typeof s.fecha === 'string' ? s.fecha.slice(0, 10) : '';
    if (DAY.test(d) && validUf(s.valor)) out[d] = Math.round(s.valor * 100) / 100;
  }
  return out;
}
