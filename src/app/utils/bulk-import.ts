// =============================================================================
// Carga masiva desde Excel (.xlsx) o CSV: áreas, procesos, usuarios, controles,
// proveedores, activos de información e incidentes / eventos de pérdida.
//
// Lógica pura (sin Angular), usada por el panel "Carga masiva" (vista previa) y
// por el servidor (validación final antes de guardar todo en una transacción).
// Cada tipo declara sus columnas; el motor detecta el encabezado, asocia las
// columnas, convierte los valores y arma el registro a crear o actualizar.
// En una actualización, una celda vacía conserva el valor actual.
// =============================================================================

import {
  CAC_BUSINESS_LINES, Control, ControlTestExecution, OperationalFlaw, UserPermissions, UserProfile,
} from '../models/risk.model';
import { BusinessProcess, OrgArea, PROCESS_CRITICALITIES } from '../models/catalog.model';
import { ServiceProvider } from '../models/resilience.model';
import { ASSET_TYPES, InformationAsset } from '../models/security.model';
import { BASEL_CATEGORIES, Cell, matchProcess, norm, parseAmount, parseCategory, SheetRows } from './risk-import';
import { colName, XlsxSheet } from './xlsx-writer';
import { UfTable, ufStampFor } from './uf';

export type BulkEntity = 'areas' | 'processes' | 'users' | 'controls' | 'providers' | 'info-assets' | 'flaws';

export type BulkFieldType = 'text' | 'number' | 'int' | 'date' | 'bool' | 'enum' | 'list' | 'email';

/** Listas que dependen de los datos de la organización. */
export interface BulkLists {
  processes: string[];
  areas: string[];
  roles: string[];
  providers: string[];
  providerCategories: string[];
  biaProcesses: string[];
}

export interface BulkField {
  key: string;
  label: string;
  type: BulkFieldType;
  /** Obligatorio siempre. */
  required?: boolean;
  /** Obligatorio solo para registros nuevos (al actualizar, vacío conserva el valor). */
  requiredOnCreate?: boolean;
  /** Otros nombres de encabezado que se reconocen (además de la etiqueta). */
  aliases?: string[];
  hint?: string;
  example?: string | number;
  options?: readonly string[];
  optionsFrom?: keyof BulkLists;
  /** Valores fuera de la lista: true = se aceptan con un aviso (catálogos abiertos). */
  openList?: boolean;
  min?: number;
  max?: number;
}

export interface BulkContext {
  today: string;            // YYYY-MM-DD
  nowStamp: string;         // YYYY-MM-DD HH:mm
  actorName: string;
  actorRole: string;
  lists: BulkLists;
  areas: Pick<OrgArea, 'id' | 'name'>[];
  roles: { id: string; title: string; department: string; badge: string; permissions: UserPermissions }[];
  providers: Pick<ServiceProvider, 'id' | 'code' | 'name' | 'taxId'>[];
  bia: { id: string; name: string }[];
  /** Registros actuales del tipo que se importa. */
  existing: unknown[];
  /** Procesos actuales (para validar nombres únicos al importar procesos). */
  allProcesses?: Pick<BusinessProcess, 'id' | 'code' | 'name'>[];
  updateExisting: boolean;
  newId: (prefix: string) => string;
  /** Con montos en pesos: tabla UF para fijar el valor UF de cada evento de pérdida. */
  ufTable?: UfTable;
}

export type Values = Record<string, unknown>;

interface Built { record?: { id: string }; errors: string[]; warnings: string[] }

export interface BulkSpec {
  entity: BulkEntity;
  label: string;
  singular: string;
  icon: string;
  description: string;
  /** Basta uno para importar (el servidor exige lo mismo). */
  permissions: (keyof UserPermissions)[];
  fields: BulkField[];
  /** Cómo se reconoce un registro existente (en orden). */
  matchBy: { field: string; prop: string; label: string; rut?: boolean }[];
  /** Prefijo y largo del código automático (si el tipo tiene código). */
  autoCode?: { prefix: string; pad: number; prop: string; min?: number };
  build(v: Values, prev: Record<string, unknown> | null, ctx: BulkContext, code: string | undefined): Built;
  describe(r: Record<string, unknown>): string;
}

export type BulkAction = 'crear' | 'actualizar' | 'omitir' | 'error';

export interface BulkRow {
  line: number;
  action: BulkAction;
  label: string;
  record?: { id: string };
  errors: string[];
  warnings: string[];
  raw: Cell[];
}

export const MAX_BULK_ROWS = 5000;

// -----------------------------------------------------------------------------
// Conversión de valores
// -----------------------------------------------------------------------------

const text = (v: Cell): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoDay(v);
  return String(v).trim();
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

const validDay = (y: number, m: number, d: number): string | null => {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? isoDay(dt) : null;
};

/** Fecha desde Excel (fecha o número de serie) o texto (AAAA-MM-DD, DD-MM-AAAA, DD/MM/AAAA). */
export function parseDay(v: Cell): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : isoDay(v);
  if (typeof v === 'number') {
    if (v < 1 || v > 120000) return null;
    return isoDay(new Date(Math.round((v - 25569) * 86400000)));
  }
  const s = text(v);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return validDay(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) return validDay(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

export function parseBool(v: Cell): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  const t = norm(text(v));
  if (/^(si|s|x|true|verdadero|1|yes|y|activo|vigente)$/.test(t)) return true;
  if (/^(no|n|false|falso|0|inactivo)$/.test(t)) return false;
  return null;
}

/** Elige la opción que corresponde al texto: igual, que empiece igual (única) o que contenga. */
export function matchOption(raw: string, options: readonly string[]): { value: string; exact: boolean } | null {
  const t = norm(raw);
  if (!t) return null;
  const exact = options.find(o => norm(o) === t);
  if (exact) return { value: exact, exact: true };
  const starts = options.filter(o => norm(o).startsWith(t) || t.startsWith(norm(o)));
  if (starts.length === 1) return { value: starts[0], exact: true };
  const contains = options.filter(o => norm(o).includes(t));
  if (contains.length === 1) return { value: contains[0], exact: false };
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** RUT chileno con dígito verificador correcto (acepta puntos y guion). */
export function validRut(raw: string): boolean {
  const s = raw.replace(/[.\s-]/g, '').toUpperCase();
  const m = s.match(/^(\d{6,8})([\dK])$/);
  if (!m) return false;
  let sum = 0, mul = 2;
  for (let i = m[1].length - 1; i >= 0; i--) { sum += Number(m[1][i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (sum % 11);
  const dv = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return dv === m[2];
}

interface Parsed { value?: unknown; error?: string; warning?: string }

function optionsOf(f: BulkField, lists: BulkLists): readonly string[] {
  return f.options ?? (f.optionsFrom ? lists[f.optionsFrom] : []);
}

function matchListItem(raw: string, f: BulkField, lists: BulkLists): Parsed {
  const opts = optionsOf(f, lists);
  const hit = matchOption(raw, opts) ?? (f.optionsFrom === 'processes' || f.optionsFrom === 'biaProcesses'
    ? (() => { const p = matchProcess(raw, [...opts]); return p ? { value: p.name, exact: p.exact } : null; })()
    : null);
  if (hit) return { value: hit.value, warning: hit.exact ? undefined : `${f.label}: "${raw}" se asoció a "${hit.value}".` };
  if (f.openList) return { value: raw.trim(), warning: `${f.label}: "${raw}" no está en el catálogo.` };
  return { error: `${f.label}: "${raw}" no es un valor reconocido${opts.length && opts.length <= 8 ? ` (${opts.join(', ')})` : ''}.` };
}

export function parseCell(v: Cell, f: BulkField, lists: BulkLists): Parsed {
  const raw = text(v);
  if (raw === '') return {};
  switch (f.type) {
    case 'text': return { value: raw.slice(0, 4000) };
    case 'email': return EMAIL_RE.test(raw) ? { value: raw.toLowerCase() } : { error: `${f.label}: "${raw}" no es un correo válido.` };
    case 'number':
    case 'int': {
      const n = parseAmount(v);
      if (n === null) return { error: `${f.label}: "${raw}" no es un número.` };
      const val = f.type === 'int' ? Math.round(n) : n;
      if ((f.min !== undefined && val < f.min) || (f.max !== undefined && val > f.max)) {
        return { error: `${f.label}: ${val} está fuera del rango ${f.min ?? '−∞'}–${f.max ?? '∞'}.` };
      }
      return { value: val };
    }
    case 'date': {
      const d = parseDay(v);
      return d ? { value: d } : { error: `${f.label}: "${raw}" no es una fecha (usa AAAA-MM-DD o DD-MM-AAAA).` };
    }
    case 'bool': {
      const b = parseBool(v);
      return b === null ? { error: `${f.label}: "${raw}" debe ser Sí o No.` } : { value: b };
    }
    case 'enum': return matchListItem(raw, f, lists);
    case 'list': {
      const parts = raw.split(/[;,|\n]/).map(s => s.trim()).filter(Boolean);
      const out: string[] = [];
      const warnings: string[] = [];
      for (const p of parts) {
        const r = matchListItem(p, f, lists);
        if (r.error) return r;
        if (r.warning) warnings.push(r.warning);
        if (!out.includes(r.value as string)) out.push(r.value as string);
      }
      return { value: out, warning: warnings.join(' ') || undefined };
    }
  }
}

// -----------------------------------------------------------------------------
// Encabezado y columnas
// -----------------------------------------------------------------------------

export type BulkColumnMap = Record<string, number | undefined>;

const headerNames = (f: BulkField) => [f.label, ...(f.aliases ?? [])].map(norm);

/** Asocia cada campo a una columna: primero nombres exactos, luego que empiecen igual. */
export function guessBulkColumns(spec: BulkSpec, header: Cell[]): BulkColumnMap {
  const names = header.map(h => norm(text(h)).replace(/\s*\*$/, '').replace(/\s*\(.*\)$/, ''));
  const used = new Set<number>();
  const map: BulkColumnMap = {};
  for (const pass of [0, 1] as const) {
    for (const f of spec.fields) {
      if (map[f.key] !== undefined) continue;
      const wanted = headerNames(f).map(n => n.replace(/\s*\(.*\)$/, ''));
      const idx = names.findIndex((n, i) => !!n && !used.has(i)
        && (pass === 0 ? wanted.includes(n) : wanted.some(w => w.length >= 4 && (n.startsWith(w) || w.startsWith(n)) && n.length >= 4)));
      if (idx >= 0) { map[f.key] = idx; used.add(idx); }
    }
  }
  return map;
}

/** Fila de encabezado: la de las 20 primeras con más columnas reconocidas (al menos 1 obligatoria). */
export function findBulkHeader(spec: BulkSpec, rows: SheetRows): number {
  let best = -1, bestScore = 0;
  rows.slice(0, 20).forEach((r, i) => {
    const map = guessBulkColumns(spec, r);
    const score = Object.keys(map).length;
    const hasRequired = spec.fields.some(f => (f.required || f.requiredOnCreate) && map[f.key] !== undefined);
    if (hasRequired && score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

// -----------------------------------------------------------------------------
// Construcción de filas
// -----------------------------------------------------------------------------

const keyOf = (v: unknown, rut = false) => {
  const k = norm(String(v ?? ''));
  return rut ? k.replace(/[.\s-]/g, '') : k;
};

/** Arma la vista previa: qué se crea, qué se actualiza y qué tiene errores. */
export function buildBulkRows(spec: BulkSpec, rows: SheetRows, headerIdx: number, map: BulkColumnMap, ctx: BulkContext): BulkRow[] {
  const existing = ctx.existing as Record<string, unknown>[];
  const out: BulkRow[] = [];
  const seen = new Map<string, number>();       // clave → fila donde apareció
  const usedCodes = new Set<string>();
  let nextCode = 0;
  if (spec.autoCode) {
    const { prefix, prop, min = 0 } = spec.autoCode;
    nextCode = existing.reduce<number>((m, r) => {
      const c = String(r[prop] ?? '');
      return c.toUpperCase().startsWith(prefix) ? Math.max(m, Number(c.replace(/\D/g, '')) || 0) : m;
    }, min);
    for (const r of existing) usedCodes.add(String(r[spec.autoCode.prop] ?? '').toUpperCase());
  }
  const codeField = spec.autoCode ? spec.fields.find(f => f.key === spec.autoCode!.prop) : undefined;
  // Los códigos escritos en el archivo se reservan antes de numerar los nuevos.
  if (codeField && map[codeField.key] !== undefined) {
    for (const r of rows.slice(headerIdx + 1)) {
      const c = text(r[map[codeField.key]!]).toUpperCase();
      if (c) {
        usedCodes.add(c);
        if (c.startsWith(spec.autoCode!.prefix)) nextCode = Math.max(nextCode, Number(c.replace(/\D/g, '')) || 0);
      }
    }
  }

  rows.slice(headerIdx + 1).forEach((r, i) => {
    const line = headerIdx + i + 2;
    if (!r.some(c => text(c) !== '')) return;
    const errors: string[] = [];
    const warnings: string[] = [];
    const values: Values = {};
    for (const f of spec.fields) {
      const col = map[f.key];
      if (col === undefined) continue;
      const p = parseCell(r[col], f, ctx.lists);
      if (p.error) errors.push(p.error);
      if (p.warning) warnings.push(p.warning);
      if (p.value !== undefined) values[f.key] = p.value;
    }
    // Registro existente
    let prev: Record<string, unknown> | null = null;
    let key = '';
    for (const m of spec.matchBy) {
      const v = values[m.field];
      if (v === undefined || v === '') continue;
      key = `${m.field}:${keyOf(v, m.rut)}`;
      prev = existing.find(x => keyOf(x[m.prop], m.rut) === keyOf(v, m.rut)) ?? null;
      break;
    }
    if (key) {
      const first = seen.get(key);
      if (first !== undefined) errors.push(`Está repetido en el archivo (fila ${first}).`);
      else seen.set(key, line);
    }
    for (const f of spec.fields) {
      if ((f.required || (f.requiredOnCreate && !prev)) && values[f.key] === undefined && !errors.some(e => e.startsWith(`${f.label}:`))) {
        errors.push(`Falta ${f.label}${f.requiredOnCreate && !f.required ? ' (obligatorio para registros nuevos)' : ''}.`);
      }
    }
    if (prev && !ctx.updateExisting) {
      out.push({ line, action: 'omitir', label: spec.describe(prev), errors: [], warnings: ['Ya existe; no se actualiza (opción desactivada).'], raw: r });
      return;
    }
    const rowLabel = text(r[map[spec.fields[0].key] ?? -1]) || `Fila ${line}`;
    if (errors.length) {
      out.push({ line, action: 'error', label: rowLabel, errors, warnings, raw: r });
      return;
    }
    // El código automático se asigna solo a filas válidas (sin saltos en la numeración).
    let code: string | undefined;
    let next = nextCode;
    if (spec.autoCode && !prev) {
      const given = values[spec.autoCode.prop] as string | undefined;
      if (given) code = given.toUpperCase();
      else {
        do { next++; code = `${spec.autoCode.prefix}${String(next).padStart(spec.autoCode.pad, '0')}`; } while (usedCodes.has(code));
      }
    }
    const built = spec.build(values, prev, ctx, code);
    errors.push(...built.errors);
    warnings.push(...built.warnings);
    if (!built.record || errors.length) {
      out.push({ line, action: 'error', label: rowLabel, errors, warnings, raw: r });
      return;
    }
    if (code && !values[spec.autoCode!.prop]) { nextCode = next; usedCodes.add(code); }
    out.push({ line, action: prev ? 'actualizar' : 'crear', label: spec.describe(built.record as unknown as Record<string, unknown>), record: built.record, errors: [], warnings, raw: r });
  });
  return out;
}

export function bulkSummary(rows: BulkRow[]) {
  const by = (a: BulkAction) => rows.filter(r => r.action === a).length;
  return { total: rows.length, crear: by('crear'), actualizar: by('actualizar'), omitir: by('omitir'), error: by('error'), warnings: rows.filter(r => r.warnings.length).length };
}

// -----------------------------------------------------------------------------
// Tipos de carga
// -----------------------------------------------------------------------------

/** Toma el valor del archivo, o el actual (actualización), o el predeterminado. */
const pick = <T>(v: Values, key: string, prev: Record<string, unknown> | null, prop: string, fallback: T): T =>
  (v[key] !== undefined ? v[key] : prev && prev[prop] !== undefined ? prev[prop] : fallback) as T;

const YES_NO = ['Sí', 'No'] as const;

const AREA_SPEC: BulkSpec = {
  entity: 'areas', label: 'Áreas', singular: 'área', icon: 'apartment', permissions: ['canManageCatalogs'],
  description: 'Unidades de la organización (gerencias, departamentos). Se reconocen por nombre.',
  matchBy: [{ field: 'name', prop: 'name', label: 'Nombre' }],
  fields: [
    { key: 'name', label: 'Nombre', type: 'text', required: true, aliases: ['area', 'nombre del area', 'unidad', 'gerencia'], example: 'Gerencia de Operaciones' },
    { key: 'manager', label: 'Responsable', type: 'text', aliases: ['jefe', 'gerente', 'encargado'], example: 'María Pérez' },
    { key: 'description', label: 'Descripción', type: 'text', example: 'Procesos de back office' },
    { key: 'active', label: 'Activa', type: 'bool', options: YES_NO, hint: 'Sí / No (por defecto Sí)', example: 'Sí' },
  ],
  build(v, prev, ctx) {
    const area: OrgArea = {
      id: (prev?.['id'] as string) ?? ctx.newId('area'),
      name: pick(v, 'name', prev, 'name', ''),
      manager: pick(v, 'manager', prev, 'manager', ''),
      description: pick(v, 'description', prev, 'description', ''),
      active: pick(v, 'active', prev, 'active', true),
    };
    return { record: area, errors: [], warnings: [] };
  },
  describe: r => String(r['name'] ?? ''),
};

const PROCESS_SPEC: BulkSpec = {
  entity: 'processes', label: 'Procesos', singular: 'proceso', icon: 'account_tree', permissions: ['canManageCatalogs'],
  description: 'Mapa de procesos. Se reconocen por código (o por nombre si no lo trae). Para renombrar un proceso usa Mantenedores.',
  matchBy: [{ field: 'code', prop: 'code', label: 'Código' }, { field: 'name', prop: 'name', label: 'Nombre' }],
  autoCode: { prefix: 'PRC-', pad: 2, prop: 'code' },
  fields: [
    { key: 'name', label: 'Nombre', type: 'text', required: true, aliases: ['proceso', 'nombre del proceso'], example: 'Otorgamiento de créditos' },
    { key: 'code', label: 'Código', type: 'text', aliases: ['cod', 'codigo del proceso'], hint: 'Vacío: se asigna PRC-NN', example: '' },
    { key: 'area', label: 'Área', type: 'enum', optionsFrom: 'areas', aliases: ['area responsable', 'gerencia'], example: '' },
    { key: 'owner', label: 'Dueño del proceso', type: 'text', aliases: ['dueno', 'responsable', 'owner'], example: 'Juan Soto' },
    { key: 'businessLine', label: 'Línea de negocio', type: 'enum', options: CAC_BUSINESS_LINES, example: 'Créditos de Consumo' },
    { key: 'criticality', label: 'Criticidad', type: 'enum', options: PROCESS_CRITICALITIES, hint: 'Por defecto Medio', example: 'Alto' },
    { key: 'description', label: 'Descripción', type: 'text', example: '' },
    { key: 'active', label: 'Activo', type: 'bool', options: YES_NO, example: 'Sí' },
  ],
  build(v, prev, ctx, code) {
    const errors: string[] = [];
    const name = pick<string>(v, 'name', prev, 'name', '');
    if (prev && v['name'] !== undefined && norm(name) !== norm(String(prev['name']))) {
      errors.push(`El código ${prev['code']} corresponde a "${prev['name']}". Para renombrar un proceso usa Mantenedores.`);
    }
    const clash = (ctx.allProcesses ?? (ctx.existing as BusinessProcess[])).find(p => p.id !== prev?.['id'] && norm(p.name) === norm(name));
    if (clash) errors.push(`Ya existe un proceso llamado "${clash.name}" (${clash.code}).`);
    const areaName = v['area'] as string | undefined;
    const proc: BusinessProcess = {
      id: (prev?.['id'] as string) ?? ctx.newId('proc'),
      code: (prev?.['code'] as string) ?? code!,
      name,
      areaId: areaName !== undefined ? ctx.areas.find(a => a.name === areaName)?.id : (prev?.['areaId'] as string | undefined),
      owner: pick(v, 'owner', prev, 'owner', ''),
      businessLine: pick(v, 'businessLine', prev, 'businessLine', undefined),
      criticality: pick(v, 'criticality', prev, 'criticality', 'Medio'),
      description: pick(v, 'description', prev, 'description', ''),
      active: pick(v, 'active', prev, 'active', true),
    };
    return { record: proc, errors, warnings: [] };
  },
  describe: r => `${r['code'] ?? ''} ${r['name'] ?? ''}`.trim(),
};

const USER_SPEC: BulkSpec = {
  entity: 'users', label: 'Usuarios', singular: 'usuario', icon: 'group', permissions: ['canManageRoles'],
  description: 'Personas con acceso. Se reconocen por correo; los permisos vienen del puesto asignado.',
  matchBy: [{ field: 'email', prop: 'email', label: 'Correo' }],
  fields: [
    { key: 'name', label: 'Nombre', type: 'text', requiredOnCreate: true, aliases: ['nombre completo', 'colaborador', 'persona'], example: 'Ana Rojas' },
    { key: 'email', label: 'Correo', type: 'email', required: true, aliases: ['email', 'correo electronico', 'mail', 'e mail'], example: 'ana.rojas@cooperativa.cl' },
    { key: 'role', label: 'Puesto', type: 'enum', optionsFrom: 'roles', requiredOnCreate: true, aliases: ['cargo', 'rol', 'perfil'], example: '' },
    { key: 'area', label: 'Área', type: 'enum', optionsFrom: 'areas', aliases: ['departamento', 'gerencia'], hint: 'Vacío: el área del puesto', example: '' },
    { key: 'active', label: 'Activo', type: 'bool', options: YES_NO, hint: 'No: no puede iniciar sesión', example: 'Sí' },
  ],
  build(v, prev, ctx) {
    const p = prev as unknown as UserProfile | null;
    const roleTitle = v['role'] as string | undefined;
    const role = roleTitle !== undefined ? ctx.roles.find(r => r.title === roleTitle) : ctx.roles.find(r => r.id === p?.roleId);
    if (!role && !p) return { errors: ['Falta Puesto.'], warnings: [] };
    const roleChanged = !!role && role.id !== p?.roleId;
    const user: UserProfile = {
      ...(p ?? {}),
      id: p?.id ?? ctx.newId('usr'),
      name: pick(v, 'name', prev, 'name', ''),
      email: p?.email ?? (v['email'] as string),
      role: role?.title ?? p!.role,
      roleId: role?.id ?? p?.roleId,
      department: (v['area'] as string | undefined) ?? (roleChanged || !p ? role!.department : p.department),
      badge: roleChanged || !p ? role!.badge : p.badge,
      isSystemUser: p?.isSystemUser ?? false,
      permissions: roleChanged || !p ? { ...role!.permissions } : p.permissions,
      active: pick(v, 'active', prev, 'active', true),
    };
    const warnings = roleChanged && p ? [`Cambia de puesto: ${p.role} → ${user.role} (se aplican los permisos del nuevo puesto).`] : [];
    return { record: user, errors: [], warnings };
  },
  describe: r => `${r['name'] ?? ''} <${r['email'] ?? ''}>`,
};

const CONTROL_SPEC: BulkSpec = {
  entity: 'controls', label: 'Controles', singular: 'control', icon: 'verified_user', permissions: ['canEvaluateControls', 'canEditRisks'],
  description: 'Inventario de controles internos con su última evaluación. Se reconocen por código.',
  matchBy: [{ field: 'code', prop: 'code', label: 'Código' }],
  autoCode: { prefix: 'CTR-', pad: 3, prop: 'code', min: 200 },
  fields: [
    { key: 'name', label: 'Nombre', type: 'text', requiredOnCreate: true, aliases: ['control', 'nombre del control'], example: 'Doble firma en transferencias' },
    { key: 'code', label: 'Código', type: 'text', aliases: ['cod', 'codigo del control', 'id'], hint: 'Vacío: se asigna CTR-NNN', example: '' },
    { key: 'description', label: 'Descripción', type: 'text', aliases: ['detalle', 'actividad de control'], example: 'Toda transferencia sobre 500 UF requiere dos firmas' },
    { key: 'process', label: 'Proceso', type: 'enum', optionsFrom: 'processes', requiredOnCreate: true, aliases: ['proceso asociado', 'macroproceso'], example: '' },
    { key: 'type', label: 'Tipo', type: 'enum', options: ['Preventivo', 'Detectivo', 'Correctivo'], aliases: ['tipo de control', 'naturaleza'], hint: 'Por defecto Preventivo', example: 'Preventivo' },
    { key: 'automation', label: 'Automatización', type: 'enum', options: ['Automático', 'Semiautomático', 'Manual'], aliases: ['ejecucion', 'forma de ejecucion'], hint: 'Por defecto Manual', example: 'Manual' },
    { key: 'frequency', label: 'Frecuencia', type: 'enum', options: ['Continuo', 'Diario', 'Semanal', 'Mensual', 'Por Evento'], aliases: ['periodicidad'], hint: 'Por defecto Mensual', example: 'Por Evento' },
    { key: 'owner', label: 'Responsable', type: 'text', aliases: ['dueno', 'ejecutor', 'owner'], example: 'Jefe de Operaciones' },
    { key: 'design', label: 'Efectividad de diseño', type: 'int', min: 0, max: 100, requiredOnCreate: true, aliases: ['diseno', 'efectividad diseno', '% diseno'], hint: '0 a 100', example: 90 },
    { key: 'operating', label: 'Efectividad operativa', type: 'int', min: 0, max: 100, requiredOnCreate: true, aliases: ['operativa', 'efectividad operacional', '% operativa'], hint: '0 a 100', example: 80 },
    { key: 'lastTested', label: 'Fecha de evaluación', type: 'date', aliases: ['ultima prueba', 'fecha de prueba', 'fecha evaluacion'], hint: 'Por defecto hoy', example: '2026-10-15' },
    { key: 'evidence', label: 'Evidencia', type: 'text', aliases: ['evidencias', 'respaldo'], example: 'Muestra de 25 transferencias de septiembre' },
  ],
  build(v, prev, ctx, code) {
    const p = prev as unknown as Control | null;
    const design = pick<number>(v, 'design', prev, 'designEffectiveness', 0);
    const operating = pick<number>(v, 'operating', prev, 'operatingEffectiveness', 0);
    const total = Math.round(design * 0.4 + operating * 0.6);
    const status: Control['status'] = total >= 85 ? 'Efectivo' : total >= 65 ? 'Parcialmente Efectivo' : 'Deficiente';
    const testDate = (v['lastTested'] as string) ?? (p && v['design'] === undefined && v['operating'] === undefined ? p.lastTested : ctx.today);
    const evaluated = !p || design !== p.designEffectiveness || operating !== p.operatingEffectiveness;
    const evidence = pick<string>(v, 'evidence', prev, 'evidence', 'Evaluación registrada por carga masiva.');
    const test: ControlTestExecution = {
      id: ctx.newId('tst'), testDate, testedBy: ctx.actorName, testerRole: ctx.actorRole, testMethod: 'Inspección de Muestra',
      sampleSize: 'Carga masiva', deviationsIdentified: 0, designScore: design, operatingScore: operating, totalScore: total,
      conclusion: status === 'Efectivo' ? 'Efectivo / Conforme' : status === 'Parcialmente Efectivo' ? 'Con Desviaciones Menores' : 'Deficiente / No Conforme',
      evidenceNotes: evidence, attachments: [],
    };
    const ctl: Control = {
      ...(p ?? {} as Control),
      id: p?.id ?? ctx.newId('ctr'),
      code: p?.code ?? code!,
      name: pick(v, 'name', prev, 'name', ''),
      description: pick(v, 'description', prev, 'description', ''),
      process: pick(v, 'process', prev, 'process', ''),
      type: pick(v, 'type', prev, 'type', 'Preventivo'),
      automation: pick(v, 'automation', prev, 'automation', 'Manual'),
      frequency: pick(v, 'frequency', prev, 'frequency', 'Mensual'),
      owner: pick(v, 'owner', prev, 'owner', ctx.actorName),
      designEffectiveness: design,
      operatingEffectiveness: operating,
      totalEffectiveness: total,
      status,
      lastTested: evaluated ? testDate : p!.lastTested,
      lastTestedBy: evaluated ? ctx.actorName : p?.lastTestedBy,
      sampleDetails: p?.sampleDetails ?? 'Carga masiva',
      evidence,
      attachments: p?.attachments ?? [],
      testHistory: evaluated ? [test, ...(p?.testHistory ?? [])] : p!.testHistory,
    };
    const warnings = testDate > ctx.today ? ['La fecha de evaluación es futura.'] : [];
    return { record: ctl, errors: [], warnings };
  },
  describe: r => `${r['code'] ?? ''} ${r['name'] ?? ''}`.trim(),
};

const PROVIDER_SPEC: BulkSpec = {
  entity: 'providers', label: 'Proveedores', singular: 'proveedor', icon: 'handshake', permissions: ['canManageProviders'],
  description: 'Proveedores y servicios externalizados (RAN 20-7). Se reconocen por código o por RUT.',
  matchBy: [{ field: 'code', prop: 'code', label: 'Código' }, { field: 'taxId', prop: 'taxId', label: 'RUT', rut: true }],
  autoCode: { prefix: 'PRV-', pad: 3, prop: 'code' },
  fields: [
    { key: 'name', label: 'Proveedor', type: 'text', requiredOnCreate: true, aliases: ['nombre', 'razon social', 'nombre del proveedor', 'empresa'], example: 'Servicios TI Andes SpA' },
    { key: 'code', label: 'Código', type: 'text', aliases: ['cod'], hint: 'Vacío: se asigna PRV-NNN', example: '' },
    { key: 'taxId', label: 'RUT', type: 'text', aliases: ['rut proveedor', 'tax id'], example: '76.123.456-0' },
    { key: 'serviceDescription', label: 'Servicio', type: 'text', aliases: ['descripcion del servicio', 'servicio prestado'], example: 'Mesa de ayuda y soporte' },
    { key: 'category', label: 'Categoría', type: 'enum', optionsFrom: 'providerCategories', openList: true, aliases: ['categoria del servicio'], example: 'Otros servicios' },
    { key: 'criticality', label: 'Criticidad', type: 'enum', options: ['Crítico', 'Alto', 'Medio', 'Bajo'], requiredOnCreate: true, example: 'Alto' },
    { key: 'internalOwner', label: 'Responsable interno', type: 'text', aliases: ['responsable', 'administrador del contrato'], example: 'Jefe de TI' },
    { key: 'supportedProcesses', label: 'Procesos que soporta', type: 'list', optionsFrom: 'processes', aliases: ['procesos'], hint: 'Separados por coma', example: '' },
    { key: 'status', label: 'Estado', type: 'enum', options: ['Activo', 'En evaluación', 'En término'], hint: 'Por defecto Activo', example: 'Activo' },
    { key: 'contractStart', label: 'Inicio de contrato', type: 'date', requiredOnCreate: true, aliases: ['fecha inicio', 'inicio'], example: '2025-01-01' },
    { key: 'contractEnd', label: 'Término de contrato', type: 'date', requiredOnCreate: true, aliases: ['fecha termino', 'vencimiento', 'fin de contrato'], example: '2027-12-31' },
    { key: 'annualCostUSD', label: 'Costo anual', type: 'number', min: 0, aliases: ['monto anual', 'valor anual'], hint: 'En la moneda de registro', example: 24000000 },
    { key: 'isCloud', label: 'Servicio en la nube', type: 'bool', options: YES_NO, aliases: ['nube', 'cloud'], example: 'No' },
    { key: 'cloudModel', label: 'Modelo de nube', type: 'enum', options: ['IaaS', 'PaaS', 'SaaS'], example: '' },
    { key: 'dataLocation', label: 'Ubicación de los datos', type: 'enum', options: ['Chile', 'Extranjero'], aliases: ['ubicacion datos'], hint: 'Por defecto Chile', example: 'Chile' },
    { key: 'dataCountry', label: 'País de los datos', type: 'text', aliases: ['pais'], example: '' },
    { key: 'handlesMemberData', label: 'Trata datos de socios', type: 'bool', options: YES_NO, aliases: ['datos de socios', 'datos personales'], example: 'Sí' },
    { key: 'usesSubcontractors', label: 'Usa subcontratistas', type: 'bool', options: YES_NO, aliases: ['subcontratistas'], example: 'No' },
    { key: 'hasExitPlan', label: 'Plan de salida', type: 'bool', options: YES_NO, aliases: ['tiene plan de salida'], example: 'No' },
    { key: 'committedRtoHours', label: 'RTO comprometido (horas)', type: 'number', min: 0, aliases: ['rto'], example: 8 },
    { key: 'lastAssessmentDate', label: 'Última evaluación', type: 'date', aliases: ['fecha evaluacion'], example: '' },
    { key: 'assessmentScore', label: 'Puntaje de evaluación', type: 'int', min: 0, max: 100, aliases: ['puntaje', 'nota evaluacion'], hint: '0 a 100', example: '' },
  ],
  build(v, prev, ctx, code) {
    const p = prev as unknown as ServiceProvider | null;
    const warnings: string[] = [];
    const errors: string[] = [];
    const taxId = pick<string>(v, 'taxId', prev, 'taxId', '');
    if (v['taxId'] !== undefined && !validRut(taxId) && keyOf(taxId, true) !== keyOf(p?.taxId, true)) warnings.push(`RUT: "${taxId}" no tiene un dígito verificador válido.`);
    if (p && v['code'] === undefined && v['taxId'] !== undefined) warnings.push(`Se reconoció por RUT como ${p.code}.`);
    const isCloud = pick<boolean>(v, 'isCloud', prev, 'isCloud', false);
    const dataLocation = pick<ServiceProvider['dataLocation']>(v, 'dataLocation', prev, 'dataLocation', 'Chile');
    const prov: ServiceProvider = {
      ...(p ?? {} as ServiceProvider),
      id: p?.id ?? ctx.newId('prv'),
      code: p?.code ?? code!,
      name: pick(v, 'name', prev, 'name', ''),
      taxId,
      serviceDescription: pick(v, 'serviceDescription', prev, 'serviceDescription', ''),
      category: pick(v, 'category', prev, 'category', ctx.lists.providerCategories[ctx.lists.providerCategories.length - 1] ?? 'Otros servicios'),
      criticality: pick(v, 'criticality', prev, 'criticality', 'Medio'),
      internalOwner: pick(v, 'internalOwner', prev, 'internalOwner', ''),
      supportedProcesses: pick(v, 'supportedProcesses', prev, 'supportedProcesses', []),
      status: pick(v, 'status', prev, 'status', 'Activo'),
      isCloud,
      cloudModel: isCloud ? pick(v, 'cloudModel', prev, 'cloudModel', undefined) : undefined,
      dataLocation,
      dataCountry: dataLocation === 'Extranjero' ? pick(v, 'dataCountry', prev, 'dataCountry', undefined) : undefined,
      handlesMemberData: pick(v, 'handlesMemberData', prev, 'handlesMemberData', false),
      usesSubcontractors: pick(v, 'usesSubcontractors', prev, 'usesSubcontractors', false),
      contractStart: pick(v, 'contractStart', prev, 'contractStart', ''),
      contractEnd: pick(v, 'contractEnd', prev, 'contractEnd', ''),
      annualCostUSD: pick(v, 'annualCostUSD', prev, 'annualCostUSD', 0),
      clauses: p?.clauses ?? {},
      lastAssessmentDate: pick(v, 'lastAssessmentDate', prev, 'lastAssessmentDate', undefined),
      assessmentScore: pick(v, 'assessmentScore', prev, 'assessmentScore', undefined),
      hasExitPlan: pick(v, 'hasExitPlan', prev, 'hasExitPlan', false),
      exitPlanNotes: p?.exitPlanNotes,
      committedRtoHours: pick(v, 'committedRtoHours', prev, 'committedRtoHours', undefined),
    };
    if (prov.contractEnd && prov.contractStart && prov.contractEnd < prov.contractStart) errors.push('El término de contrato es anterior al inicio.');
    if (v['cloudModel'] !== undefined && !isCloud) warnings.push('Modelo de nube ignorado: el servicio no está marcado en la nube.');
    if (dataLocation === 'Extranjero' && !prov.dataCountry) warnings.push('Datos en el extranjero sin país indicado.');
    return { record: prov, errors, warnings };
  },
  describe: r => `${r['code'] ?? ''} ${r['name'] ?? ''}`.trim(),
};

const ASSET_SPEC: BulkSpec = {
  entity: 'info-assets', label: 'Activos de información', singular: 'activo', icon: 'storage', permissions: ['canManageInfoSecurity'],
  description: 'Inventario de activos de información con su valoración CID. Se reconocen por código.',
  matchBy: [{ field: 'code', prop: 'code', label: 'Código' }],
  autoCode: { prefix: 'AST-', pad: 3, prop: 'code' },
  fields: [
    { key: 'name', label: 'Activo', type: 'text', requiredOnCreate: true, aliases: ['nombre', 'nombre del activo'], example: 'Base de datos de socios' },
    { key: 'code', label: 'Código', type: 'text', aliases: ['cod'], hint: 'Vacío: se asigna AST-NNN', example: '' },
    { key: 'description', label: 'Descripción', type: 'text', example: '' },
    { key: 'type', label: 'Tipo', type: 'enum', options: ASSET_TYPES, requiredOnCreate: true, aliases: ['tipo de activo'], example: 'Datos / Base de datos' },
    { key: 'owner', label: 'Dueño', type: 'text', aliases: ['dueno de la informacion', 'propietario'], example: 'Gerencia Comercial' },
    { key: 'custodian', label: 'Custodio', type: 'text', aliases: ['custodio tecnico'], example: 'Jefe de Infraestructura' },
    { key: 'classification', label: 'Clasificación', type: 'enum', options: ['Pública', 'Interna', 'Confidencial', 'Restringida'], hint: 'Por defecto Interna', example: 'Confidencial' },
    { key: 'confidentiality', label: 'Confidencialidad', type: 'int', min: 1, max: 4, aliases: ['c'], hint: '1 a 4 (por defecto 2)', example: 4 },
    { key: 'integrity', label: 'Integridad', type: 'int', min: 1, max: 4, aliases: ['i'], hint: '1 a 4', example: 4 },
    { key: 'availability', label: 'Disponibilidad', type: 'int', min: 1, max: 4, aliases: ['d'], hint: '1 a 4', example: 3 },
    { key: 'handlesPersonalData', label: 'Datos personales', type: 'bool', options: YES_NO, aliases: ['trata datos personales'], example: 'Sí' },
    { key: 'location', label: 'Ubicación', type: 'enum', options: ['Instalaciones propias', 'Nube', 'Proveedor externo'], hint: 'Por defecto Instalaciones propias', example: 'Instalaciones propias' },
    { key: 'provider', label: 'Proveedor', type: 'enum', optionsFrom: 'providers', aliases: ['proveedor que lo opera'], hint: 'Código o nombre', example: '' },
    { key: 'bia', label: 'Procesos críticos (BIA)', type: 'list', optionsFrom: 'biaProcesses', aliases: ['procesos bia', 'procesos que soporta'], hint: 'Separados por coma', example: '' },
    { key: 'lastReviewDate', label: 'Última revisión', type: 'date', aliases: ['fecha revision'], hint: 'Por defecto hoy', example: '' },
    { key: 'criticalInfrastructure', label: 'Infraestructura crítica', type: 'bool', options: YES_NO, example: 'No' },
  ],
  build(v, prev, ctx, code) {
    const p = prev as unknown as InformationAsset | null;
    const prov = v['provider'] as string | undefined;
    const providerId = prov !== undefined ? ctx.providers.find(x => `${x.code} ${x.name}` === prov || x.name === prov || x.code === prov)?.id : p?.providerId;
    const bia = v['bia'] as string[] | undefined;
    const asset: InformationAsset = {
      ...(p ?? {} as InformationAsset),
      id: p?.id ?? ctx.newId('ast'),
      code: p?.code ?? code!,
      name: pick(v, 'name', prev, 'name', ''),
      description: pick(v, 'description', prev, 'description', ''),
      type: pick(v, 'type', prev, 'type', 'Aplicación'),
      owner: pick(v, 'owner', prev, 'owner', ''),
      custodian: pick(v, 'custodian', prev, 'custodian', ''),
      classification: pick(v, 'classification', prev, 'classification', 'Interna'),
      cia: {
        confidentiality: (v['confidentiality'] as number) ?? p?.cia.confidentiality ?? 2,
        integrity: (v['integrity'] as number) ?? p?.cia.integrity ?? 2,
        availability: (v['availability'] as number) ?? p?.cia.availability ?? 2,
      },
      handlesPersonalData: pick(v, 'handlesPersonalData', prev, 'handlesPersonalData', false),
      location: pick(v, 'location', prev, 'location', 'Instalaciones propias'),
      providerId,
      biaProcessIds: bia ? bia.map(n => ctx.bia.find(b => b.name === n)!.id) : (p?.biaProcessIds ?? []),
      lastReviewDate: pick(v, 'lastReviewDate', prev, 'lastReviewDate', ctx.today),
      criticalInfrastructure: pick(v, 'criticalInfrastructure', prev, 'criticalInfrastructure', false),
    };
    const warnings = asset.location === 'Proveedor externo' && !asset.providerId ? ['Ubicado en un proveedor externo sin indicar cuál.'] : [];
    return { record: asset, errors: [], warnings };
  },
  describe: r => `${r['code'] ?? ''} ${r['name'] ?? ''}`.trim(),
};

const FLAW_SPEC: BulkSpec = {
  entity: 'flaws', label: 'Incidentes y pérdidas', singular: 'incidente', icon: 'report_problem',
  permissions: ['canManageRegulatoryReports', 'canConvertFlaws'],
  description: 'Base histórica de eventos de pérdida e incidentes operacionales. Siempre se crean registros nuevos (sin avisos por correo).',
  matchBy: [],
  fields: [
    { key: 'title', label: 'Título', type: 'text', required: true, aliases: ['evento', 'incidente', 'nombre del evento', 'descripcion corta'], example: 'Transferencia duplicada a proveedor' },
    { key: 'description', label: 'Descripción', type: 'text', aliases: ['detalle', 'relato'], example: '' },
    { key: 'process', label: 'Proceso', type: 'enum', optionsFrom: 'processes', required: true, aliases: ['proceso afectado'], example: '' },
    { key: 'incidentType', label: 'Tipo', type: 'enum', options: ['Falla de Control', 'Evento de Pérdida Real', 'Casi Pérdida (Near Miss)', 'Vulnerabilidad Operativa'], aliases: ['tipo de evento', 'tipo de incidente'], hint: 'Por defecto Evento de Pérdida Real', example: 'Evento de Pérdida Real' },
    { key: 'severity', label: 'Severidad', type: 'enum', options: ['Crítica', 'Alta', 'Media', 'Baja'], hint: 'Por defecto Media', example: 'Media' },
    { key: 'occurrenceDate', label: 'Fecha de ocurrencia', type: 'date', aliases: ['ocurrencia', 'fecha del evento', 'fecha'], example: '2025-08-14' },
    { key: 'discoveryDate', label: 'Fecha de descubrimiento', type: 'date', aliases: ['descubrimiento', 'fecha deteccion'], example: '2025-08-16' },
    { key: 'accountingDate', label: 'Fecha contable', type: 'date', aliases: ['fecha de contabilizacion', 'contabilizacion'], example: '2025-08-31' },
    { key: 'loss', label: 'Pérdida bruta', type: 'number', min: 0, aliases: ['perdida', 'monto perdida', 'perdida real', 'monto'], hint: 'En la moneda de registro', example: 3500000 },
    { key: 'recovered', label: 'Monto recuperado', type: 'number', min: 0, aliases: ['recuperado', 'recupero', 'recuperos'], example: 3500000 },
    { key: 'businessLine', label: 'Línea de negocio', type: 'enum', options: CAC_BUSINESS_LINES, example: 'Soporte Corporativo' },
    { key: 'baselCategory', label: 'Categoría Basilea', type: 'text', aliases: ['categoria', 'tipo de evento basilea', 'basilea'], hint: 'Una de las 7 categorías de Basilea', example: 'Ejecución y Procesos' },
    { key: 'baselSubcategory', label: 'Subcategoría Basilea', type: 'text', aliases: ['subcategoria'], example: '' },
    { key: 'accountingAccount', label: 'Cuenta contable', type: 'text', aliases: ['cuenta'], example: '' },
    { key: 'provider', label: 'Proveedor', type: 'enum', optionsFrom: 'providers', hint: 'Si lo causó un proveedor', example: '' },
    { key: 'impacted', label: 'Sistema o cuenta afectada', type: 'text', aliases: ['sistema afectado', 'cuenta afectada'], example: '' },
    { key: 'reportedBy', label: 'Reportado por', type: 'text', aliases: ['informante', 'reportante'], hint: 'Por defecto quien carga', example: '' },
    { key: 'status', label: 'Estado', type: 'enum', options: ['Pendiente de Evaluación', 'Descartada'], hint: 'Por defecto Pendiente de Evaluación', example: '' },
  ],
  build(v, _prev, ctx) {
    const errors: string[] = [];
    const warnings: string[] = [];
    let basel: OperationalFlaw['baselCategory'];
    if (v['baselCategory'] !== undefined) {
      const c = parseCategory(v['baselCategory'] as string);
      if (!c) errors.push(`Categoría Basilea: "${v['baselCategory']}" no corresponde a ninguna (${BASEL_CATEGORIES.join(', ')}).`);
      else {
        basel = c;
        if (norm(c) !== norm(v['baselCategory'] as string)) warnings.push(`Categoría Basilea: "${v['baselCategory']}" se asoció a "${c}".`);
      }
    }
    const loss = (v['loss'] as number) ?? 0;
    const recovered = (v['recovered'] as number) ?? 0;
    if (recovered > loss) warnings.push('El monto recuperado supera la pérdida bruta.');
    const occ = v['occurrenceDate'] as string | undefined;
    const disc = v['discoveryDate'] as string | undefined;
    const acc = v['accountingDate'] as string | undefined;
    if (occ && disc && disc < occ) warnings.push('La fecha de descubrimiento es anterior a la de ocurrencia.');
    if ([occ, disc, acc].some(d => d && d > ctx.today)) warnings.push('Hay una fecha futura.');
    const type = (v['incidentType'] as OperationalFlaw['incidentType']) ?? 'Evento de Pérdida Real';
    if (type === 'Evento de Pérdida Real' && !loss) warnings.push('Evento de pérdida sin monto.');
    const prov = v['provider'] as string | undefined;
    const flaw: OperationalFlaw = {
      id: ctx.newId('inc'),
      title: v['title'] as string,
      description: (v['description'] as string) ?? '',
      reportedBy: (v['reportedBy'] as string) ?? ctx.actorName,
      process: v['process'] as string,
      severity: (v['severity'] as OperationalFlaw['severity']) ?? 'Media',
      reportedAt: ctx.nowStamp,
      status: (v['status'] as OperationalFlaw['status']) ?? 'Pendiente de Evaluación',
      incidentType: type,
      realLossAmountUSD: loss,
      recoveredAmountUSD: recovered,
      impactedSystemOrAccount: (v['impacted'] as string) ?? '',
      businessLine: v['businessLine'] as OperationalFlaw['businessLine'],
      baselCategory: basel,
      baselSubcategory: v['baselSubcategory'] as string | undefined,
      occurrenceDate: occ,
      discoveryDate: disc,
      accountingDate: acc,
      accountingAccount: v['accountingAccount'] as string | undefined,
      providerId: prov ? ctx.providers.find(x => `${x.code} ${x.name}` === prov || x.name === prov || x.code === prov)?.id : undefined,
    };
    if (ctx.ufTable && (loss || recovered)) {
      Object.assign(flaw, ufStampFor(flaw, ctx.ufTable));
      if (!flaw.ufValueClp && Object.keys(ctx.ufTable).length) warnings.push('Sin valor UF para la fecha del evento (se puede asignar después en Mantenedores).');
    }
    const dup = (ctx.existing as OperationalFlaw[]).find(f => norm(f.title) === norm(flaw.title) && (f.occurrenceDate ?? '') === (occ ?? '') && (f.realLossAmountUSD ?? 0) === loss);
    if (dup) warnings.push('Parece duplicado de un incidente ya registrado (mismo título, fecha y monto).');
    return { record: flaw, errors, warnings };
  },
  describe: r => String(r['title'] ?? ''),
};

export const BULK_SPECS: BulkSpec[] = [AREA_SPEC, PROCESS_SPEC, USER_SPEC, CONTROL_SPEC, PROVIDER_SPEC, ASSET_SPEC, FLAW_SPEC];

export const bulkSpec = (e: string): BulkSpec | undefined => BULK_SPECS.find(s => s.entity === e);

export const isBulkEntity = (e: string): e is BulkEntity => !!bulkSpec(e);

export const canBulkImport = (spec: BulkSpec, perms: Partial<UserPermissions> | undefined) => spec.permissions.some(p => !!perms?.[p]);

/** Lista "Código Nombre" de proveedores, para elegirlos en la planilla. */
export const providerOptions = (list: Pick<ServiceProvider, 'code' | 'name'>[]) => list.flatMap(p => [`${p.code} ${p.name}`, p.code, p.name]);

// -----------------------------------------------------------------------------
// Validación en el servidor (forma final del registro)
// -----------------------------------------------------------------------------

const str = (v: unknown, max = 4000) => typeof v === 'string' && v.length <= max;
const nonEmpty = (v: unknown, max = 500) => str(v, max) && (v as string).trim().length > 0;
const inList = (v: unknown, list: readonly string[]) => typeof v === 'string' && list.includes(v);
const optIn = (v: unknown, list: readonly string[]) => v === undefined || v === null || inList(v, list);
const num = (v: unknown, min = -Infinity, max = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const day = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const optDay = (v: unknown) => v === undefined || v === null || day(v);

/** Revisa que el registro tenga la forma esperada. Devuelve el problema o null. */
export function validateBulkRecord(entity: BulkEntity, rec: unknown): string | null {
  const r = rec as Record<string, unknown>;
  if (!r || typeof r !== 'object' || !nonEmpty(r['id'], 100)) return 'Registro sin identificador.';
  switch (entity) {
    case 'areas':
      return nonEmpty(r['name'], 200) ? null : 'Área sin nombre.';
    case 'processes':
      if (!nonEmpty(r['name'], 200) || !nonEmpty(r['code'], 40)) return 'Proceso sin nombre o código.';
      if (!inList(r['criticality'], PROCESS_CRITICALITIES) || !optIn(r['businessLine'], CAC_BUSINESS_LINES)) return `Proceso ${r['code']}: criticidad o línea de negocio no válida.`;
      return null;
    case 'users': {
      if (!nonEmpty(r['name'], 200) || !(typeof r['email'] === 'string' && EMAIL_RE.test(r['email']))) return 'Usuario sin nombre o con correo no válido.';
      if (!nonEmpty(r['role'], 200) || !r['permissions'] || typeof r['permissions'] !== 'object') return `Usuario ${r['email']}: falta el puesto.`;
      return null;
    }
    case 'controls':
      if (!nonEmpty(r['name'], 300) || !nonEmpty(r['code'], 40) || !nonEmpty(r['process'], 200)) return 'Control sin nombre, código o proceso.';
      if (!inList(r['type'], ['Preventivo', 'Detectivo', 'Correctivo']) || !inList(r['automation'], ['Automático', 'Semiautomático', 'Manual'])
        || !inList(r['frequency'], ['Continuo', 'Diario', 'Semanal', 'Mensual', 'Por Evento'])) return `Control ${r['code']}: tipo, automatización o frecuencia no válidos.`;
      if (!num(r['designEffectiveness'], 0, 100) || !num(r['operatingEffectiveness'], 0, 100) || !num(r['totalEffectiveness'], 0, 100)) return `Control ${r['code']}: efectividad fuera de rango.`;
      if (!inList(r['status'], ['Efectivo', 'Parcialmente Efectivo', 'Deficiente']) || !Array.isArray(r['testHistory'])) return `Control ${r['code']}: estado no válido.`;
      return null;
    case 'providers':
      if (!nonEmpty(r['name'], 300) || !nonEmpty(r['code'], 40)) return 'Proveedor sin nombre o código.';
      if (!inList(r['criticality'], ['Crítico', 'Alto', 'Medio', 'Bajo']) || !inList(r['status'], ['Activo', 'En evaluación', 'En término'])
        || !inList(r['dataLocation'], ['Chile', 'Extranjero'])) return `Proveedor ${r['code']}: criticidad, estado o ubicación no válidos.`;
      if (!day(r['contractStart']) || !day(r['contractEnd']) || !num(r['annualCostUSD'], 0)) return `Proveedor ${r['code']}: fechas de contrato o costo no válidos.`;
      if (!Array.isArray(r['supportedProcesses']) || typeof r['clauses'] !== 'object') return `Proveedor ${r['code']}: datos incompletos.`;
      return null;
    case 'info-assets': {
      const cia = r['cia'] as Record<string, unknown> | undefined;
      if (!nonEmpty(r['name'], 300) || !nonEmpty(r['code'], 40)) return 'Activo sin nombre o código.';
      if (!inList(r['type'], ASSET_TYPES) || !inList(r['classification'], ['Pública', 'Interna', 'Confidencial', 'Restringida'])
        || !inList(r['location'], ['Instalaciones propias', 'Nube', 'Proveedor externo'])) return `Activo ${r['code']}: tipo, clasificación o ubicación no válidos.`;
      if (!cia || !['confidentiality', 'integrity', 'availability'].every(k => num(cia[k], 1, 4))) return `Activo ${r['code']}: valoración CID fuera de rango (1 a 4).`;
      if (!Array.isArray(r['biaProcessIds']) || !day(r['lastReviewDate'])) return `Activo ${r['code']}: datos incompletos.`;
      return null;
    }
    case 'flaws':
      if (!nonEmpty(r['title'], 300) || !nonEmpty(r['process'], 200)) return 'Incidente sin título o proceso.';
      if (!inList(r['severity'], ['Crítica', 'Alta', 'Media', 'Baja']) || !inList(r['status'], ['Pendiente de Evaluación', 'Descartada'])
        || !inList(r['incidentType'], ['Falla de Control', 'Evento de Pérdida Real', 'Casi Pérdida (Near Miss)', 'Vulnerabilidad Operativa'])) return `Incidente "${r['title']}": severidad, estado o tipo no válidos.`;
      if (!num(r['realLossAmountUSD'], 0) || !num(r['recoveredAmountUSD'], 0)) return `Incidente "${r['title']}": montos no válidos.`;
      if (!optDay(r['occurrenceDate']) || !optDay(r['discoveryDate']) || !optDay(r['accountingDate'])) return `Incidente "${r['title']}": fechas no válidas.`;
      if (!optIn(r['baselCategory'], BASEL_CATEGORIES) || !optIn(r['businessLine'], CAC_BUSINESS_LINES)) return `Incidente "${r['title']}": categoría o línea de negocio no válida.`;
      return null;
  }
}

/** Texto de la bitácora para una carga. */
export function bulkLedgerDetails(spec: BulkSpec, created: number, updated: number, fileName: string): string {
  const name = fileName.replace(/[\r\n]/g, ' ').slice(0, 120);
  return `Carga masiva de ${spec.label.toLowerCase()} desde "${name}": ${created} creado(s), ${updated} actualizado(s).`;
}

// -----------------------------------------------------------------------------
// Plantilla e informe de errores (.xlsx)
// -----------------------------------------------------------------------------

/** Plantilla: hoja Datos (encabezados + ejemplo), Instrucciones y Listas (desplegables). */
export function templateSheets(spec: BulkSpec, lists: BulkLists): XlsxSheet[] {
  const listFields = spec.fields.filter(f => f.type === 'enum' || f.type === 'bool' || f.type === 'list');
  const listCols = listFields.map(f => {
    const opts = f.type === 'bool' ? [...YES_NO] : [...optionsOf(f, lists)];
    return { f, opts: f.optionsFrom === 'providers' ? opts.filter((_, i) => i % 3 === 0) : opts };
  }).filter(x => x.opts.length);
  const maxLen = listCols.reduce((m, x) => Math.max(m, x.opts.length), 0);
  const listRows = [listCols.map(x => x.f.label), ...Array.from({ length: maxLen }, (_, i) => listCols.map(x => x.opts[i] ?? null))];
  const validations = listCols
    .filter(x => x.f.type !== 'list')
    .map(x => {
      const letter = colName(listCols.indexOf(x));
      return { col: spec.fields.indexOf(x.f), source: `Listas!$${letter}$2:$${letter}$${x.opts.length + 1}`, strict: !x.f.openList && x.f.optionsFrom !== 'processes' };
    });
  const example = spec.fields.map(f => {
    if (f.example !== undefined && f.example !== '') return f.example;
    const opts = optionsOf(f, lists);
    return (f.type === 'enum' || f.type === 'list') && opts.length ? (f.optionsFrom === 'providers' ? null : opts[0]) : null;
  });
  const required = spec.fields.map((f, i) => (f.required || f.requiredOnCreate ? i : -1)).filter(i => i >= 0);
  return [
    {
      name: 'Datos', header: true, requiredCols: required, validations,
      rows: [spec.fields.map(f => f.label), example],
      widths: spec.fields.map(f => Math.max(14, f.label.length + 4, String(f.example ?? '').length + 2)),
    },
    {
      name: 'Instrucciones', header: true, widths: [28, 22, 16, 70],
      rows: [
        ['Columna', 'Obligatoria', 'Formato', 'Detalle'],
        ...spec.fields.map(f => [
          f.label,
          f.required ? 'Sí' : f.requiredOnCreate ? 'Para registros nuevos' : 'No',
          FORMAT_LABEL[f.type],
          [f.hint, f.options && f.type === 'enum' ? `Valores: ${f.options.join(', ')}` : f.optionsFrom ? 'Valores: ver hoja Listas' : ''].filter(Boolean).join('. '),
        ]),
        [],
        ['Cómo funciona', null, null, spec.description],
        ['Actualizaciones', null, null, spec.matchBy.length
          ? `Si ${spec.matchBy.map(m => m.label).join(' o ')} coincide con un registro existente, se actualiza; las celdas vacías conservan el valor actual.`
          : 'Cada fila crea un registro nuevo.'],
        ['Fila de ejemplo', null, null, 'Reemplaza o borra la fila 2 antes de cargar el archivo.'],
      ],
    },
    { name: 'Listas', header: true, rows: listRows, widths: listCols.map(x => Math.min(60, Math.max(16, ...x.opts.map(o => o.length + 2)))) },
  ];
}

const FORMAT_LABEL: Record<BulkFieldType, string> = {
  text: 'Texto', number: 'Número', int: 'Número entero', date: 'Fecha (AAAA-MM-DD)', bool: 'Sí / No', enum: 'Lista', list: 'Lista (varios, con coma)', email: 'Correo',
};

/** Informe de resultados: las filas del archivo con su resultado y observaciones. */
export function resultSheets(header: Cell[], rows: BulkRow[]): XlsxSheet[] {
  const cell = (c: Cell) => (c instanceof Date ? isoDay(c) : typeof c === 'number' || typeof c === 'boolean' ? c : text(c));
  const label: Record<BulkAction, string> = { crear: 'Se crea', actualizar: 'Se actualiza', omitir: 'Se omite', error: 'Con errores' };
  return [{
    name: 'Resultado', header: true,
    widths: [8, 14, 60, ...header.map(h => Math.max(12, text(h).length + 2))],
    rows: [
      ['Fila', 'Resultado', 'Observaciones', ...header.map(h => text(h))],
      ...rows.map(r => [r.line, label[r.action], [...r.errors, ...r.warnings].join(' '), ...r.raw.map(cell)]),
    ],
  }];
}
