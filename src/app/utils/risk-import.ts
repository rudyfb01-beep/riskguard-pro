// =============================================================================
// Importación de una matriz de riesgos desde Excel (.xlsx) o CSV.
// Lógica pura (sin Angular): detecta el encabezado, asocia columnas, normaliza
// valores y valida cada fila. El componente risk-import-modal la usa para la
// vista previa y RiskDataService.importRisks guarda el resultado.
// =============================================================================

import { BaselCategory, Risk } from '../models/risk.model';

export type Cell = string | number | boolean | Date | null | undefined;
export type SheetRows = Cell[][];

export type ImportField =
  | 'code' | 'title' | 'description' | 'process' | 'category' | 'responsible'
  | 'likelihood' | 'impact' | 'exposure' | 'controls' | 'status' | 'mitigation';

export const IMPORT_FIELDS: { key: ImportField; label: string; required?: boolean; hint: string }[] = [
  { key: 'title', label: 'Riesgo (título)', required: true, hint: 'Nombre o evento de riesgo' },
  { key: 'likelihood', label: 'Probabilidad inherente', required: true, hint: 'Número (1–4, 1–5…) o texto (Improbable, Posible, Probable, Frecuente…)' },
  { key: 'impact', label: 'Impacto inherente', required: true, hint: 'Número (1–4, 1–5…) o texto (Menor, Moderado, Mayor, Catastrófico…)' },
  { key: 'code', label: 'Código', hint: 'Si coincide con un riesgo existente, se puede actualizar' },
  { key: 'description', label: 'Descripción / causa', hint: '' },
  { key: 'process', label: 'Proceso', hint: 'Se asocia al proceso del mantenedor' },
  { key: 'category', label: 'Categoría (Basilea)', hint: 'Se asocia a una de las 7 categorías de Basilea' },
  { key: 'responsible', label: 'Responsable', hint: '' },
  { key: 'exposure', label: 'Exposición / monto', hint: 'Monto en la moneda de registro' },
  { key: 'controls', label: 'Controles', hint: 'Códigos o nombres de controles existentes, separados por coma' },
  { key: 'status', label: 'Estado', hint: 'Activo, Bajo Monitoreo, Mitigado o Cerrado' },
  { key: 'mitigation', label: 'Plan de mitigación', hint: 'Título o acciones del plan' },
];

/** Texto sin tildes, en minúsculas y con espacios simples. */
export function norm(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[\s_]+/g, ' ').trim();
}

const cellText = (v: Cell): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

// -----------------------------------------------------------------------------
// Asociación de columnas
// -----------------------------------------------------------------------------

/** Patrones de encabezado por campo, en orden de preferencia. Se prueban sobre el texto normalizado. */
const HEADER_PATTERNS: Record<ImportField, RegExp[]> = {
  code: [/^(codigo|cod|id|n|no|nro|numero|n°|#)( del)?( riesgo)?\.?$/, /^(codigo|id) ?(de )?riesgo/, /^codigo/],
  title: [/^(titulo|nombre)( del)?( evento)?( de)?( riesgo)?$/, /^riesgos?$/, /^(evento|descripcion corta|riesgo identificado|nombre del riesgo|evento de riesgo)/, /^(titulo|nombre)/],
  description: [/^descripcion( del riesgo)?$/, /^(detalle|causas?|descripcion|causa raiz)/],
  process: [/^(macro ?)?proceso( afectado| asociado)?$/, /^(sub ?proceso|proceso)/, /^area( responsable)?$/],
  category: [/categoria( basilea)?/, /^(tipo|clase)( de)?( evento| riesgo)/, /basilea/],
  responsible: [/^(responsable|dueno|owner|duenno)( del riesgo)?/],
  likelihood: [/^(probabilidad|frecuencia|prob|p|ocurrencia)( inherente)?( de ocurrencia)?\.?$/, /(probabilidad|frecuencia) (inherente|de ocurrencia)/, /inherente.*(prob|frec)/, /^probabilidad/],
  impact: [/^(impacto|severidad|consecuencia|i|magnitud)( inherente)?\.?$/, /(impacto|severidad|consecuencia) inherente/, /inherente.*(imp|sev)/, /^impacto(?! (economico|financiero))/],
  exposure: [/^exposicion( inherente)?( (usd|clp|\$))?$/, /(exposicion|perdida esperada|impacto (economico|financiero)|monto|valor expuesto)/],
  controls: [/^control(es)?( aplicados| asociados| existentes| mitigantes)?$/, /control/],
  status: [/^estado( del riesgo)?$/, /^estado/],
  mitigation: [/^plan( de)? (mitigacion|accion|tratamiento)/, /(mitigacion|tratamiento|plan de accion)/],
};

/** Encabezados que nunca deben tomarse como valores inherentes (residual, puntaje, nivel). */
const NOT_INHERENT = /(residual|score|puntaje|nivel|calificacion|avance|%)/;

export type ColumnMap = Partial<Record<ImportField, number>>;

/** Asocia cada campo a la mejor columna del encabezado (cada columna se usa una sola vez). */
export function guessColumns(header: Cell[]): ColumnMap {
  const names = header.map(h => norm(cellText(h)));
  const used = new Set<number>();
  const map: ColumnMap = {};
  // Primero los campos más específicos, para que "Descripción" no le gane a "Título", etc.
  const order: ImportField[] = ['likelihood', 'impact', 'code', 'title', 'process', 'category', 'responsible', 'exposure', 'status', 'mitigation', 'controls', 'description'];
  for (const field of order) {
    for (const re of HEADER_PATTERNS[field]) {
      const idx = names.findIndex((n, i) => n && !used.has(i) && re.test(n)
        && !((field === 'likelihood' || field === 'impact' || field === 'exposure') && NOT_INHERENT.test(n)));
      if (idx >= 0) { map[field] = idx; used.add(idx); break; }
    }
  }
  return map;
}

/** Fila de encabezado: la primera (de las 20 primeras) con más campos reconocidos (al menos 2). */
export function findHeaderRow(rows: SheetRows): number {
  let best = -1, bestScore = 1;
  rows.slice(0, 20).forEach((r, i) => {
    const score = Object.keys(guessColumns(r)).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

// -----------------------------------------------------------------------------
// Normalización de valores
// -----------------------------------------------------------------------------

/** Escala de la matriz de origen (máximo de probabilidad e impacto). */
export type SourceScale = 3 | 4 | 5 | 6 | 10;

const LIKELIHOOD_WORDS: [RegExp, number][] = [
  [/^(rar[oa]|remot[oa]|muy (baja|improbable)|improbable|excepcional)/, 1],
  [/^(poco probable|posible|baja|ocasional|eventual)/, 2],
  [/^(probable|media|moderada|bastante probable)/, 3],
  [/^(casi (segur[oa]|ciert[oa])|frecuente|muy (alta|probable|frecuente)|alta|cierto|segur[oa]|recurrente)/, 4],
];
const IMPACT_WORDS: [RegExp, number][] = [
  [/^(insignificante|menor|leve|baj[oa]|muy baj[oa]|minimo)/, 1],
  [/^(moderad[oa]|medi[oa]|significativ[oa])/, 2],
  [/^(mayor|alt[oa]|grave|importante|serio)/, 3],
  [/^(catastrofic[oa]|critic[oa]|severo|muy alt[oa]|extremo|desastroso)/, 4],
];

/** Lleva un valor de la escala de origen a la escala 1–4 de la aplicación. */
export function toScale4(n: number, scale: SourceScale): number {
  if (scale === 4) return Math.min(4, Math.max(1, Math.round(n)));
  const v = Math.min(scale, Math.max(1, n));
  return Math.min(4, Math.max(1, Math.round(1 + ((v - 1) * 3) / (scale - 1))));
}

/** Probabilidad o impacto: número (en la escala de origen) o texto. `names` = nombres de la escala configurada. */
export function parseLevel(v: Cell, kind: 'likelihood' | 'impact', scale: SourceScale, names: string[] = []): number | null {
  const text = cellText(v);
  if (!text) return null;
  const num = typeof v === 'number' ? v : Number(text.replace(',', '.').match(/^\d+(\.\d+)?/)?.[0]);
  if (Number.isFinite(num) && num > 0) return toScale4(num, scale);
  const t = norm(text).replace(/^\d+\s*[-.)]?\s*/, '');
  const byName = names.findIndex(n => norm(n) === t);
  if (byName >= 0) return byName + 1;
  for (const [re, level] of kind === 'likelihood' ? LIKELIHOOD_WORDS : IMPACT_WORDS) if (re.test(t)) return level;
  return null;
}

/** Máximo numérico de una columna (para detectar la escala de origen). */
export function detectScale(rows: SheetRows, cols: (number | undefined)[]): SourceScale {
  let max = 0;
  for (const r of rows) for (const c of cols) {
    if (c === undefined) continue;
    const v = r[c];
    const n = typeof v === 'number' ? v : Number(cellText(v).replace(',', '.'));
    if (Number.isFinite(n) && n > max && n <= 10) max = n;
  }
  if (max > 6) return 10;
  if (max > 5) return 6;
  if (max > 4) return 5;
  // Un máximo de 3 o menos no prueba que la escala sea 1–3 (puede no haber riesgos altos):
  // se asume 1–4 y la escala 1–3 se elige a mano.
  return 4;
}

/** Monto: acepta $1.234.567, 1,234,567.89, 1.234,5, US$ 12.000, "12 MM" no. */
export function parseAmount(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = cellText(v).replace(/[^\d.,-]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // El último separador es el decimal.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /,\d{3}(,|$)/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234.567" o "12.000": punto como separador de miles (formato chileno); "12.5" queda decimal.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const BASEL_CATEGORIES: BaselCategory[] = [
  'Fraude Interno', 'Fraude Externo', 'Fallas Tecnológicas', 'Ejecución y Procesos',
  'Prácticas Laborales', 'Daño a Activos Físicos', 'Cumplimiento Normativo',
];

const CATEGORY_WORDS: [RegExp, BaselCategory][] = [
  [/fraude interno|interno.*fraude/, 'Fraude Interno'],
  [/fraude externo|externo.*fraude|robo|hurto|estafa|suplantacion/, 'Fraude Externo'],
  [/tecnolog|sistema|informatic|ciber|\bti\b|software|hardware|interrupcion/, 'Fallas Tecnológicas'],
  [/laboral|empleo|personas|recursos humanos|rrhh|seguridad (en el|del) (trabajo|puesto)/, 'Prácticas Laborales'],
  [/activos fisicos|dano|desastre|incendio|terremoto|catastrofe/, 'Daño a Activos Físicos'],
  [/cumplimiento|normativ|legal|regulat|clientes|productos|practicas (comerciales|empresariales)|lavado/, 'Cumplimiento Normativo'],
  [/ejecucion|proceso|operativ|entrega|gestion de procesos/, 'Ejecución y Procesos'],
];

export function parseCategory(v: Cell): BaselCategory | null {
  const t = norm(cellText(v));
  if (!t) return null;
  const exact = BASEL_CATEGORIES.find(c => norm(c) === t);
  if (exact) return exact;
  if (t.includes('fraude') && !/interno|externo/.test(t)) return 'Fraude Externo';
  return CATEGORY_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
}

export function parseStatus(v: Cell): Risk['status'] | null {
  const t = norm(cellText(v));
  if (!t) return null;
  if (/cerrad/.test(t)) return 'Cerrado';
  if (/mitigad/.test(t)) return 'Mitigado';
  if (/monitore|seguimiento/.test(t)) return 'Bajo Monitoreo';
  if (/activ|vigente|abiert/.test(t)) return 'Activo';
  return null;
}

/** Proceso del mantenedor: igual (sin tildes ni mayúsculas) o el que comparte más palabras. */
export function matchProcess(name: string, processes: string[]): { name: string; exact: boolean } | null {
  const t = norm(name);
  if (!t) return null;
  const exact = processes.find(p => norm(p) === t);
  if (exact) return { name: exact, exact: true };
  const words = (s: string) => new Set(norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 3));
  const target = words(name);
  let best: string | null = null, score = 0;
  for (const p of processes) {
    const sc = [...words(p)].filter(w => target.has(w)).length;
    if (sc > score) { best = p; score = sc; }
  }
  return best ? { name: best, exact: false } : null;
}

// -----------------------------------------------------------------------------
// Construcción de filas
// -----------------------------------------------------------------------------

export interface ImportContext {
  scale: SourceScale;
  processes: string[];
  likelihoodNames: string[];
  impactNames: string[];
  controls: { id: string; code: string; name: string }[];
  /** true: los procesos que no existen se crearán en el mantenedor; false: se usa el más parecido. */
  createMissingProcesses: boolean;
  defaultProcess: string;
}

export interface ImportRow {
  rowNumber: number;            // fila en la hoja (1 = primera)
  code: string;
  title: string;
  description: string;
  process: string;
  newProcess: boolean;          // el proceso se creará en el mantenedor
  category: BaselCategory;
  responsible: string;
  likelihood: number;
  impact: number;
  exposure: number;
  controlIds: string[];
  status: Risk['status'];
  mitigation: string;
  errors: string[];
  warnings: string[];
}

const FILL_DOWN: ImportField[] = ['process', 'category', 'responsible'];

/** Convierte las filas de datos (bajo el encabezado) en filas de importación con sus observaciones. */
export function buildRows(rows: SheetRows, headerRow: number, map: ColumnMap, ctx: ImportContext): ImportRow[] {
  const out: ImportRow[] = [];
  const last: Partial<Record<ImportField, Cell>> = {};
  const get = (r: Cell[], f: ImportField): Cell => (map[f] === undefined ? null : r[map[f]!]);

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every(c => cellText(c) === '')) continue;
    const title = cellText(get(r, 'title'));
    if (!title && !cellText(get(r, 'likelihood')) && !cellText(get(r, 'impact'))) continue; // fila de notas o totales

    // Celdas combinadas en Excel: proceso, categoría y responsable se repiten hacia abajo.
    const val = (f: ImportField): Cell => {
      const v = get(r, f);
      if (cellText(v)) { last[f] = v; return v; }
      return FILL_DOWN.includes(f) ? last[f] ?? null : v;
    };

    const errors: string[] = [], warnings: string[] = [];
    if (!title) errors.push('Falta el título del riesgo.');

    const likelihood = parseLevel(val('likelihood'), 'likelihood', ctx.scale, ctx.likelihoodNames);
    const impact = parseLevel(val('impact'), 'impact', ctx.scale, ctx.impactNames);
    if (likelihood === null) errors.push(`Probabilidad no reconocida ("${cellText(val('likelihood'))}").`);
    if (impact === null) errors.push(`Impacto no reconocido ("${cellText(val('impact'))}").`);

    const rawProcess = cellText(val('process'));
    let process = ctx.defaultProcess, newProcess = false;
    if (!rawProcess) {
      warnings.push(`Sin proceso: se asigna "${ctx.defaultProcess}".`);
    } else {
      const m = matchProcess(rawProcess, ctx.processes);
      if (m?.exact) process = m.name;
      else if (ctx.createMissingProcesses) { process = rawProcess.replace(/\s+/g, ' ').trim(); newProcess = true; }
      else if (m) { process = m.name; warnings.push(`Proceso "${rawProcess}" asociado a "${m.name}".`); }
      else warnings.push(`Proceso "${rawProcess}" no existe: se asigna "${ctx.defaultProcess}".`);
    }

    const rawCategory = cellText(val('category'));
    let category = parseCategory(val('category'));
    if (!category) {
      category = 'Ejecución y Procesos';
      warnings.push(rawCategory ? `Categoría "${rawCategory}" no reconocida: se usa "Ejecución y Procesos".` : 'Sin categoría: se usa "Ejecución y Procesos".');
    }

    const rawExposure = cellText(get(r, 'exposure'));
    let exposure = parseAmount(get(r, 'exposure'));
    if (exposure === null || exposure < 0) {
      if (map.exposure !== undefined) warnings.push(rawExposure ? `Monto "${rawExposure}" no reconocido: queda en 0.` : 'Sin exposición: queda en 0.');
      exposure = 0;
    }

    const controlIds: string[] = [];
    const rawControls = cellText(get(r, 'controls'));
    if (rawControls) {
      const unknown: string[] = [];
      for (const token of rawControls.split(/[,;\n/|]+/).map(t => t.trim()).filter(Boolean)) {
        const t = norm(token);
        const c = ctx.controls.find(x => norm(x.code) === t || norm(x.name) === t)
          ?? ctx.controls.find(x => t.startsWith(norm(x.code) + ' ') || t.startsWith(norm(x.code) + '-'));
        if (c) { if (!controlIds.includes(c.id)) controlIds.push(c.id); } else unknown.push(token);
      }
      if (unknown.length) warnings.push(`Controles no encontrados (no se vinculan): ${unknown.join(', ')}.`);
    }

    const rawStatus = cellText(get(r, 'status'));
    const status = parseStatus(get(r, 'status')) ?? 'Activo';
    if (rawStatus && !parseStatus(get(r, 'status'))) warnings.push(`Estado "${rawStatus}" no reconocido: queda "Activo".`);

    out.push({
      rowNumber: i + 1,
      code: cellText(get(r, 'code')).toUpperCase(),
      title,
      description: cellText(get(r, 'description')),
      process, newProcess, category,
      responsible: cellText(val('responsible')),
      likelihood: likelihood ?? 0, impact: impact ?? 0,
      exposure, controlIds, status,
      mitigation: cellText(get(r, 'mitigation')),
      errors, warnings,
    });
  }

  // Códigos repetidos dentro del mismo archivo.
  const seen = new Map<string, number>();
  for (const row of out) {
    if (!row.code) continue;
    if (seen.has(row.code)) row.errors.push(`Código ${row.code} repetido en el archivo (fila ${seen.get(row.code)}).`);
    else seen.set(row.code, row.rowNumber);
  }
  return out;
}

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------

/** CSV con separador ; , o tabulación (detectado) y comillas dobles. */
export function parseCsv(text: string): SheetRows {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLines = clean.split(/\r?\n/).slice(0, 10).join('\n');
  const counts = [';', ',', '\t'].map(d => [d, firstLines.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: SheetRows = [];
  let row: Cell[] = [], field = '', quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Plantilla CSV (se abre en Excel) con los encabezados que se reconocen automáticamente. */
export function templateCsv(currency: string): string {
  const header = ['Código', 'Riesgo', 'Descripción', 'Proceso', 'Categoría Basilea', 'Responsable', 'Probabilidad', 'Impacto', `Exposición ${currency}`, 'Controles', 'Estado', 'Plan de mitigación'];
  const ex = ['RGO-201', 'Caída del core financiero en cierre diario', 'Indisponibilidad del sistema central durante el proceso batch', 'Operaciones', 'Fallas Tecnológicas', 'Jefe de TI', '2', '4', currency === 'CLP' ? '45.000.000' : '50000', '', 'Activo', 'Plan de contingencia del batch nocturno'];
  const q = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '\uFEFF' + [header, ex].map(r => r.map(q).join(';')).join('\r\n') + '\r\n';
}
