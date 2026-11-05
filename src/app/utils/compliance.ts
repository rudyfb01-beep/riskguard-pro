import {
  COMPLIANCE_FREQUENCIES, ComplianceFrequency, ComplianceNorm, ComplianceRequirement, ControlCoverage,
} from '../models/compliance.model';
import { Control } from '../models/risk.model';

/** Texto → identificador ASCII en minúsculas con guiones (mismo criterio que los ids existentes). */
export function slugify(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
}

/** Id único para un requisito nuevo de una norma. */
export function requirementId(normId: string, title: string, taken: Set<string>): string {
  const base = `${normId}-${slugify(title).slice(0, 60) || 'requisito'}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Id único para una norma nueva a partir de su código ("Ley 21.719" → "ley-21719"). */
export function normId(code: string, taken: Set<string>): string {
  const base = slugify(code.replace(/\./g, '')).slice(0, 50) || 'norma';
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Porcentaje de cumplimiento: Cumple = 1, Cumple parcialmente = 0,5, No cumple = 0 (sin contar "Sin evaluar" ni "No aplica"). */
export function complianceScore(items: ComplianceRequirement[]): { pct: number | null; rated: number } {
  const rated = items.filter(i => i.status !== 'Sin evaluar' && i.status !== 'No aplica');
  const pts = rated.reduce((s, i) => s + (i.status === 'Cumple' ? 1 : i.status === 'Cumple parcialmente' ? 0.5 : 0), 0);
  return { pct: rated.length ? Math.round((pts / rated.length) * 100) : null, rated: rated.length };
}

export const isGap = (r: ComplianceRequirement) => r.status === 'No cumple' || r.status === 'Cumple parcialmente';

/**
 * Cobertura por controles: un requisito cubierto solo por controles efectivos sugiere "Cumple";
 * si alguno es parcial o deficiente, "Cumple parcialmente"; si todos son deficientes, "No cumple".
 */
export function controlCoverage(controlIds: string[] | undefined, controls: Control[]): ControlCoverage | null {
  const ids = controlIds ?? [];
  if (!ids.length) return null;
  const byId = new Map(controls.map(c => [c.id, c]));
  const linked = ids.map(id => byId.get(id)).filter((c): c is Control => !!c);
  const effective = linked.filter(c => c.status === 'Efectivo').length;
  const partial = linked.filter(c => c.status === 'Parcialmente Efectivo').length;
  const deficient = linked.filter(c => c.status === 'Deficiente').length;
  const missing = ids.length - linked.length;
  const avg = linked.length ? Math.round(linked.reduce((s, c) => s + (c.totalEffectiveness ?? 0), 0) / linked.length) : null;
  let suggested: ControlCoverage['suggested'];
  if (linked.length) {
    if (effective === linked.length) suggested = 'Cumple';
    else if (deficient === linked.length) suggested = 'No cumple';
    else suggested = 'Cumple parcialmente';
  }
  const parts = [`${linked.length} control${linked.length === 1 ? '' : 'es'} vinculado${linked.length === 1 ? '' : 's'}`];
  if (linked.length) parts.push(`${effective} efectivo${effective === 1 ? '' : 's'}`);
  if (partial) parts.push(`${partial} parcial${partial === 1 ? '' : 'es'}`);
  if (deficient) parts.push(`${deficient} deficiente${deficient === 1 ? '' : 's'}`);
  if (avg !== null) parts.push(`efectividad promedio ${avg} %`);
  if (missing) parts.push(`${missing} vínculo${missing === 1 ? '' : 's'} a controles eliminados`);
  return { total: linked.length, effective, partial, deficient, missing, avgEffectiveness: avg, suggested, text: parts.join(' · ') + '.' };
}

/** Versión de la norma con la que quedó evaluado el requisito (las evaluaciones anteriores al historial usan la primera versión). */
export function evaluatedVersion(r: ComplianceRequirement, norm: ComplianceNorm | undefined): string | undefined {
  return r.normVersion ?? norm?.versions[0]?.version;
}

/** El requisito se evaluó con una versión anterior de la norma y debe revisarse. */
export function needsVersionReview(r: ComplianceRequirement, norm: ComplianceNorm | undefined): boolean {
  if (!norm || r.status === 'Sin evaluar' || !r.lastReviewDate) return false;
  const v = evaluatedVersion(r, norm);
  return !!v && v !== norm.version;
}

// -----------------------------------------------------------------------------
// Importación de requisitos desde Excel (copiar y pegar) o CSV
// -----------------------------------------------------------------------------

export interface ParsedRequirementRow {
  line: number;
  numeral: string;
  title: string;
  requirement: string;
  frequency: ComplianceFrequency;
  owner: string;
}

export interface ParseResult {
  rows: ParsedRequirementRow[];
  errors: string[];
}

const HEADER_ALIASES: Record<string, keyof Omit<ParsedRequirementRow, 'line'>> = {
  numeral: 'numeral', articulo: 'numeral', 'art': 'numeral', referencia: 'numeral', seccion: 'numeral',
  titulo: 'title', requisito: 'title', nombre: 'title',
  detalle: 'requirement', descripcion: 'requirement', texto: 'requirement', obligacion: 'requirement',
  frecuencia: 'frequency', periodicidad: 'frequency',
  responsable: 'owner', dueno: 'owner',
};

function splitLine(line: string, sep: string): string[] {
  if (sep === '\t') return line.split('\t').map(c => c.trim());
  // CSV con comillas dobles.
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toFrequency(v: string): ComplianceFrequency | null {
  if (!v) return 'Anual';
  const k = slugify(v);
  return COMPLIANCE_FREQUENCIES.find(f => slugify(f) === k) ?? null;
}

/**
 * Lee filas pegadas desde Excel (separadas por tabulación) o un CSV (coma o punto y coma).
 * Columnas por encabezado (Numeral, Título, Detalle, Frecuencia, Responsable) o, sin encabezado,
 * en ese orden. Título es obligatorio; si falta el detalle se usa el título.
 */
export function parseRequirementRows(text: string): ParseResult {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l, i) => ({ l, n: i + 1 })).filter(x => x.l.trim());
  if (!lines.length) return { rows: [], errors: ['No hay filas para importar.'] };
  const first = lines[0].l;
  const sep = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');

  let order: (keyof Omit<ParsedRequirementRow, 'line'>)[] = ['numeral', 'title', 'requirement', 'frequency', 'owner'];
  const head = splitLine(first, sep).map(h => HEADER_ALIASES[slugify(h).replace(/-/g, '')] ?? HEADER_ALIASES[slugify(h)]);
  let start = 0;
  if (head.filter(Boolean).length >= 2) {
    order = head.map(h => h ?? ('' as never));
    start = 1;
  }

  const rows: ParsedRequirementRow[] = [];
  const errors: string[] = [];
  for (const { l, n } of lines.slice(start)) {
    const cells = splitLine(l, sep);
    const v: Record<string, string> = {};
    order.forEach((k, i) => { if (k) v[k] = cells[i] ?? ''; });
    const title = (v['title'] ?? '').trim();
    if (!title) { errors.push(`Fila ${n}: falta el título del requisito.`); continue; }
    const freq = toFrequency((v['frequency'] ?? '').trim());
    if (!freq) { errors.push(`Fila ${n}: frecuencia "${v['frequency']}" no válida (use Permanente, Anual, Semestral o Por evento).`); continue; }
    rows.push({
      line: n, numeral: (v['numeral'] ?? '').trim(), title: title.slice(0, 255),
      requirement: (v['requirement'] ?? '').trim() || title, frequency: freq, owner: (v['owner'] ?? '').trim(),
    });
  }
  return { rows, errors };
}
