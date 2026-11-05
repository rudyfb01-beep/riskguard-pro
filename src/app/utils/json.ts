/**
 * JSON con claves ordenadas (y sin las que valen undefined). Sirve para comparar un objeto
 * guardado con el que envía el cliente: PostgreSQL (JSONB) no conserva el orden de las claves.
 */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export const sameJson = (a: unknown, b: unknown) => stableJson(a ?? null) === stableJson(b ?? null);
