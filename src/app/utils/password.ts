/**
 * Política de contraseñas (la usan el servidor y la pantalla). Sigue NIST SP 800-63B: largo mínimo,
 * sin reglas de composición obligatorias, rechazo de contraseñas conocidas o predecibles.
 */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

// Contraseñas y palabras frecuentes (en minúsculas, sin espacios): se rechazan si la contraseña es
// una de ellas, o una de ellas seguida o precedida solo de números o símbolos.
const COMMON = [
  'password', 'contraseña', 'contrasena', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'abc123', 'abcdef', 'iloveyou',
  'admin', 'administrador', 'administrator', 'bienvenido', 'bienvenida', 'welcome', 'letmein', 'monkey', 'dragon', 'football',
  'futbol', 'chile', 'santiago', 'oriencoop', 'cooperativa', 'riskguard', 'riskguardpro', 'riesgo', 'riesgos', 'usuario',
  'secreto', 'cambiame', 'changeme', 'temporal', 'invierno', 'verano', 'primavera', 'otono', 'enero', 'diciembre',
];

export interface PasswordCheck { ok: boolean; problems: string[] }

/** Revisa una contraseña nueva. `context`: correo y nombre de la persona (no deben aparecer en ella). */
export function checkPassword(password: string, context: { email?: string; name?: string; previous?: string } = {}): PasswordCheck {
  const problems: string[] = [];
  const p = password ?? '';
  const chars = [...p];
  if (chars.length < PASSWORD_MIN) problems.push(`Debe tener al menos ${PASSWORD_MIN} caracteres.`);
  if (chars.length > PASSWORD_MAX) problems.push(`No puede superar ${PASSWORD_MAX} caracteres.`);
  const lower = p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const compact = lower.replace(/[\s._-]/g, '');
  if (new Set(chars).size <= 3) problems.push('Usa más caracteres distintos (no repitas el mismo).');
  if (isSequence(compact)) problems.push('No uses secuencias como 123456789012 o abcdefghijkl.');
  const core = compact.replace(/^[\d\W_]+|[\d\W_]+$/g, '');
  if (core && COMMON.includes(core)) problems.push('Es una contraseña demasiado común o fácil de adivinar.');
  const local = (context.email ?? '').toLowerCase().split('@')[0];
  if (local && local.length >= 3 && compact.includes(local.replace(/[._-]/g, ''))) problems.push('No incluyas tu correo.');
  const nameParts = (context.name ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(w => w.length >= 4);
  if (nameParts.some(w => compact.includes(w.replace(/[^a-z]/g, '')))) problems.push('No incluyas tu nombre o apellido.');
  if (context.previous && p === context.previous) problems.push('Debe ser distinta de la contraseña anterior.');
  return { ok: problems.length === 0, problems };
}

function isSequence(s: string): boolean {
  if (s.length < 6) return false;
  const codes = [...s].map(c => c.charCodeAt(0));
  const up = codes.every((c, i) => i === 0 || c - codes[i - 1] === 1);
  const down = codes.every((c, i) => i === 0 || codes[i - 1] - c === 1);
  const digitsCycle = /^\d+$/.test(s) && '01234567890123456789'.includes(s);
  return up || down || digitsCycle;
}
