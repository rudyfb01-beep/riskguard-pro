import { randomUUID } from 'node:crypto';
import express from 'express';

/**
 * Endurecimiento HTTP: identificador por solicitud, cabeceras de seguridad (CSP, HSTS…),
 * verificación de origen en escrituras, límite de solicitudes a la API y un manejador de
 * errores que no expone detalles internos. Ver SECURITY.md.
 */

const isProd = () => process.env['NODE_ENV'] === 'production';

/** Política de contenido: todo desde el propio origen; sin scripts en línea ni orígenes externos. */
export function contentSecurityPolicy(): string {
  const connect = ["'self'", ...(isProd() ? [] : ['ws:', 'wss:'])]; // ws: solo para la recarga en vivo de desarrollo
  return [
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'", // estilos de componentes Angular y atributos style
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "frame-src 'self' blob:",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    ...(isProd() ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export const requestId: express.RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const id = incoming && /^[\w.-]{8,80}$/.test(incoming) ? incoming : randomUUID();
  res.locals['requestId'] = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const securityHeaders: express.RequestHandler = (req, res, next) => {
  if (process.env['CSP'] !== 'off') res.setHeader('Content-Security-Policy', contentSecurityPolicy());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  // Aísla la ventana de otros sitios. Se omite en la ventana emergente del ingreso con Google
  // (pasa por accounts.google.com y vuelve) para que la aplicación pueda cerrarla al terminar.
  if (!req.path.startsWith('/api/auth/google') && req.query['popup_login'] === undefined) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  }
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (req.secure) res.setHeader('Strict-Transport-Security', `max-age=${Number(process.env['HSTS_MAX_AGE'] ?? 31536000)}; includeSubDomains`);
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Orígenes aceptados para escrituras: el propio host y APP_URL. */
function allowedOrigin(req: express.Request, origin: string): boolean {
  try {
    const o = new URL(origin);
    if (o.host === req.get('host')) return true;
    if (process.env['APP_URL'] && o.origin === new URL(process.env['APP_URL']).origin) return true;
    return (process.env['ALLOWED_ORIGINS'] ?? '').split(',').map(s => s.trim()).filter(Boolean).includes(o.origin);
  } catch {
    return false;
  }
}

/**
 * Defensa adicional contra CSRF: además de la cabecera X-Requested-With, una escritura que trae
 * Origin (todos los navegadores lo envían en POST/PUT/DELETE) debe venir del propio sitio.
 */
export const checkOrigin: express.RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin && origin !== 'null' && !allowedOrigin(req, origin)) {
    res.status(403).json({ error: 'Origen no permitido.' });
    return;
  }
  if (origin === 'null') {
    res.status(403).json({ error: 'Origen no permitido.' });
    return;
  }
  next();
};

// Límite general de la API por IP (ventana de un minuto, en memoria). El inicio de sesión tiene
// además sus propios límites más estrictos (ver auth.ts).
const windows = new Map<string, { start: number; n: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) if (now - w.start > 60_000) windows.delete(k);
}, 60_000).unref();

export const apiRateLimit: express.RequestHandler = (req, res, next) => {
  const max = Number(process.env['RATE_LIMIT_PER_MINUTE'] ?? 600);
  if (!(max > 0) || req.path === '/health' || req.path === '/ready') return next();
  const key = req.ip || req.socket.remoteAddress || '?';
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now - w.start >= 60_000) {
    w = { start: now, n: 0 };
    windows.set(key, w);
  }
  w.n++;
  res.setHeader('RateLimit-Limit', String(max));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, max - w.n)));
  if (w.n > max) {
    res.setHeader('Retry-After', String(Math.ceil((w.start + 60_000 - now) / 1000)));
    res.status(429).json({ error: 'Demasiadas solicitudes. Espere un momento e inténtelo de nuevo.' });
    return;
  }
  next();
};

/** Errores no controlados: respuesta genérica con el identificador de la solicitud; el detalle queda en el log. */
export const errorHandler: express.ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const id = res.locals['requestId'] as string | undefined;
  const e = err as { type?: string; status?: number; statusCode?: number; message?: string; stack?: string };
  const status = e.status ?? e.statusCode ?? 500;
  let message = 'Error interno del servidor.';
  if (e.type === 'entity.parse.failed') message = 'El cuerpo de la solicitud no es JSON válido.';
  else if (e.type === 'entity.too.large') message = 'La solicitud supera el tamaño máximo permitido.';
  else if (status >= 400 && status < 500) message = 'Solicitud no válida.';
  if (status >= 500) console.error(`[Error ${id ?? ''}] ${req.method} ${req.originalUrl}:`, e.stack ?? e.message ?? err);
  if (req.path.startsWith('/api/') || req.accepts(['json', 'html']) === 'json') {
    res.status(status).json({ error: message, requestId: id });
  } else {
    res.status(status).type('text/plain').send(`${message}${id ? ` (referencia ${id})` : ''}`);
  }
};

/** Respuesta 500 genérica para errores inesperados de una ruta: el detalle va al log, no al cliente. */
export function serverError(res: express.Response, err: unknown, req?: express.Request): void {
  const id = res.locals['requestId'] as string | undefined;
  console.error(`[Error ${id ?? ''}]${req ? ` ${req.method} ${req.originalUrl}` : ''}:`, (err as Error)?.stack ?? err);
  if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor.', requestId: id });
}
