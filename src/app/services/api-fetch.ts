/** Cabecera anti-CSRF exigida por el servidor en toda escritura. */
export const API_HEADERS = { 'X-Requested-With': 'RiskGuard' } as const;

/** fetch hacia la API propia: misma cookie de sesión y cabecera de seguridad. */
export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(API_HEADERS)) headers.set(k, v);
  return fetch(url, { ...init, headers, credentials: 'same-origin' });
}
