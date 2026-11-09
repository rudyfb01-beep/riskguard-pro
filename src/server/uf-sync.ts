import { getSetting, saveSetting, setInternalSetting } from './repository';
import { normalizeUfTable, parseMindicador, ufDays, UfTable } from '../app/utils/uf';
import { normalizeGeneralParameters } from '../app/models/catalog.model';

/**
 * Valores de la UF desde mindicador.cl (fuente: Banco Central de Chile).
 * UF_SOURCE_URL permite usar otra fuente con el mismo formato ({ serie: [{ fecha, valor }] }).
 */
const sourceUrl = () => (process.env['UF_SOURCE_URL'] || 'https://mindicador.cl/api/uf').replace(/\/$/, '');

export interface UfSyncResult {
  added: number;
  total: number;
  latest: { date: string; value: number } | null;
  values: UfTable;
}

async function fetchYear(year: number): Promise<UfTable> {
  const resp = await fetch(`${sourceUrl()}/${year}`, { signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error(`la fuente respondió ${resp.status}`);
  return parseMindicador(await resp.json());
}

/** Descarga los años indicados y los agrega a la tabla guardada (no borra valores existentes). */
export async function syncUf(years: number[]): Promise<UfSyncResult> {
  const current = normalizeUfTable(await getSetting('uf_values'));
  let fetched: UfTable = {};
  for (const y of [...new Set(years)].filter(y => y >= 1990 && y <= 2100)) {
    try {
      fetched = { ...fetched, ...(await fetchYear(y)) };
    } catch (err) {
      throw new Error(`No se pudo obtener la UF de ${y} desde ${new URL(sourceUrl()).host}: ${(err as Error).message}`);
    }
  }
  const added = Object.keys(fetched).filter(d => current[d] !== fetched[d]).length;
  const values = { ...current, ...fetched };
  if (added) await saveSetting('uf_values', values);
  const days = ufDays(values);
  const last = days[days.length - 1];
  return { added, total: days.length, latest: last ? { date: last, value: values[last] } : null, values };
}

/**
 * Actualización automática una vez al día (en la revisión periódica), solo con montos en pesos.
 * UF_AUTO_SYNC=false la desactiva (p. ej. servidores sin salida a internet).
 */
export async function autoSyncUf(today: string): Promise<void> {
  if (process.env['UF_AUTO_SYNC'] === 'false') return;
  if (normalizeGeneralParameters(await getSetting('general_parameters')).currency !== 'CLP') return;
  if ((await getSetting('uf_sync_last')) === today) return;
  await setInternalSetting('uf_sync_last', today);
  const year = Number(today.slice(0, 4));
  try {
    const r = await syncUf(today.slice(5, 10) <= '01-15' ? [year - 1, year] : [year]);
    if (r.added) console.log(`[UF] ${r.added} valor(es) nuevo(s); último ${r.latest?.date}: ${r.latest?.value}.`);
  } catch (err) {
    console.warn(`[UF] ${(err as Error).message}`);
  }
}
