/**
 * Demostración de RiskGuard Pro sin servidor.
 *
 * La aplicación de producción no tiene modo demostración: siempre habla con la API. Para la demo
 * publicada como página estática, este script (que NO forma parte de la aplicación ni de la imagen
 * Docker) reemplaza la API dentro del navegador con datos ficticios generados por el propio servidor
 * (scripts/build-demo.mjs). Los cambios duran mientras la pestaña esté abierta.
 */
import { computeBlockHash } from '../src/app/utils/crypto-ledger';

interface DemoUser { email: string; name: string; role: string; me: unknown; notifications: unknown }
interface DemoDump {
  generatedAt: string;
  data: Record<string, unknown> & { versions: Record<string, Record<string, number>>; ledger: Ledger[]; settings: Record<string, unknown> };
  authConfig: unknown;
  evidenceConfig: unknown;
  ops: Record<string, unknown>;
  users: DemoUser[];
  files: Record<string, { type: string; base64: string }>;
}
interface Ledger { id: string; blockNumber: number; timestamp: string; userName: string; userRole: string; action: string; entityType: string; entityCode: string; details: string; previousHash: string; hash: string; ipAddress: string }

declare global {
  interface Window { __RG_DEMO__: DemoDump }
}

const DUMP = window.__RG_DEMO__;
const STATE_KEY = 'rg-demo-state-v1';
const USER_KEY = 'rg-demo-user';

// Entidad de la URL → clave en /api/data (igual que PersistenceService).
const ENTITY_KEYS: Record<string, string> = {
  areas: 'areas', processes: 'processes', roles: 'roles', users: 'users', controls: 'controls', risks: 'risks', providers: 'providers',
  'regulatory-milestones': 'regulatoryMilestones', flaws: 'flaws', alerts: 'alerts', audits: 'audits', kris: 'kris', bia: 'bia', plans: 'plans',
  'continuity-tests': 'continuityTests', 'crisis-scenarios': 'crisisScenarios', 'crisis-events': 'crisisEvents', 'info-assets': 'infoAssets',
  vulnerabilities: 'vulnerabilities', 'security-assessment': 'securityAssessment', norms: 'norms', compliance: 'compliance',
  'security-tests': 'securityTests', 'action-plans': 'actionPlans', 'survey-campaigns': 'surveyCampaigns', 'survey-responses': 'surveyResponses',
  documents: 'documents', approvals: 'approvals',
};

type State = { data: DemoDump['data']; read: Record<string, string[]>; prefs: Record<string, unknown> };

const storage = {
  get(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { sessionStorage.setItem(k, v); } catch { /* sin almacenamiento: solo en memoria */ } },
  del(k: string) { try { sessionStorage.removeItem(k); } catch { /* */ } },
};

function freshState(): State {
  return { data: structuredClone(DUMP.data), read: {}, prefs: {} };
}
let state: State = (() => {
  const raw = storage.get(STATE_KEY);
  if (raw) { try { return JSON.parse(raw) as State; } catch { /* estado dañado */ } }
  return freshState();
})();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const save = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => storage.set(STATE_KEY, JSON.stringify(state)), 200);
};

const defaultUser = DUMP.users.find(u => /elena\.vasconcelos/.test(u.email)) ?? DUMP.users[0];
let sessionEmail: string | null = storage.get(USER_KEY) ?? defaultUser.email;
if (storage.get(USER_KEY) === '') sessionEmail = null;
const sessionUser = () => DUMP.users.find(u => u.email === sessionEmail) ?? null;

const uploaded = new Map<string, Blob>();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const notInDemo = (what: string) => json({ error: `${what} no está disponible en la demostración (no hay servidor).` }, 400);

async function appendLedger(b: { id: string; action: string; entityType: string; entityCode: string; details: string }): Promise<Ledger> {
  // El servidor entrega la bitácora del bloque más reciente al más antiguo.
  const list = state.data.ledger;
  const last = list.reduce<Ledger | undefined>((a, b) => (!a || b.blockNumber > a.blockNumber ? b : a), undefined);
  const u = sessionUser();
  const me = (u?.me as { user?: { name: string; role: string } })?.user;
  const block: Ledger = {
    id: b.id, blockNumber: (last?.blockNumber ?? 0) + 1, timestamp: new Date().toISOString(), userName: me?.name ?? 'Demostración',
    userRole: me?.role ?? '', action: b.action, entityType: b.entityType, entityCode: b.entityCode, details: b.details,
    previousHash: last?.hash ?? '0'.repeat(64), hash: '', ipAddress: 'demostración',
  };
  block.hash = await computeBlockHash(block.blockNumber, block.timestamp, block.userName, block.action, block.entityCode, block.details, block.previousHash);
  list.unshift(block);
  save();
  return block;
}

async function bodyOf(init?: RequestInit): Promise<any> {
  if (!init?.body || typeof init.body !== 'string') return init?.body ?? null;
  try { return JSON.parse(init.body); } catch { return null; }
}

async function handle(url: URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const path = url.pathname.slice(url.pathname.indexOf('/api/') + 4);
  const user = sessionUser();
  const authFree = path.startsWith('/auth/') || path === '/health' || path === '/ready';
  if (!user && !authFree) return json({ error: 'Sesión no iniciada.' }, 401);

  // --- Sesión -----------------------------------------------------------------------------------
  if (path === '/auth/config') return json(DUMP.authConfig);
  if (path === '/auth/me') return user ? json(user.me) : json({ error: 'Sin sesión.' }, 401);
  if (path === '/auth/request-code') return json({ ok: true });
  if (path === '/auth/verify') {
    const b = await bodyOf(init);
    const u = DUMP.users.find(x => x.email.toLowerCase() === String(b?.email ?? '').trim().toLowerCase());
    if (!u || !/^\d{6}$/.test(String(b?.code ?? ''))) return json({ error: 'En la demostración use el correo de una persona de ejemplo y cualquier código de 6 dígitos.' }, 401);
    sessionEmail = u.email;
    storage.set(USER_KEY, u.email);
    return json(u.me);
  }
  if (path === '/auth/logout') {
    sessionEmail = null;
    storage.set(USER_KEY, '');
    return json({ ok: true });
  }
  if (path === '/health') return json({ status: 'ok', version: 'demostración' });

  // --- Datos -------------------------------------------------------------------------------------
  if (path === '/data' && method === 'GET') return json(state.data);
  const m = /^\/data\/([^/]+)\/(.+)$/.exec(path);
  if (m) {
    const entity = m[1], id = decodeURIComponent(m[2]);
    const key = ENTITY_KEYS[entity];
    if (!key) return json({ error: `Entidad desconocida: ${entity}` }, 404);
    const list = (state.data[key] as { id: string }[]) ?? [];
    const versions = (state.data.versions[entity] ??= {});
    if (method === 'DELETE') {
      state.data[key] = list.filter(x => x.id !== id);
      delete versions[id];
      save();
      return json({ ok: true });
    }
    const obj = await bodyOf(init);
    if (!obj || obj.id !== id) return json({ error: 'El cuerpo debe ser el objeto completo con el mismo id de la URL.' }, 400);
    const i = list.findIndex(x => x.id === id);
    state.data[key] = i >= 0 ? list.map(x => (x.id === id ? obj : x)) : [...list, obj];
    versions[id] = (versions[id] ?? 0) + 1;
    save();
    return json({ ok: true, version: versions[id] });
  }
  if (path === '/ledger') {
    if (method === 'GET') return json(state.data.ledger);
    return json(await appendLedger(await bodyOf(init)));
  }
  const s = /^\/settings\/(.+)$/.exec(path);
  if (s && method === 'PUT') {
    state.data.settings[s[1]] = (await bodyOf(init))?.value;
    save();
    return json({ ok: true });
  }
  const imp = /^\/import\/(.+)$/.exec(path);
  if (imp) {
    const key = ENTITY_KEYS[imp[1]];
    const b = await bodyOf(init);
    if (!key || !Array.isArray(b?.records)) return json({ error: 'Carga no válida.' }, 400);
    const list = [...((state.data[key] as { id: string }[]) ?? [])];
    let created = 0, updated = 0;
    for (const r of b.records as { id: string }[]) {
      const i = list.findIndex(x => x.id === r.id);
      if (i >= 0) { list[i] = r; updated++; } else { list.push(r); created++; }
    }
    state.data[key] = list;
    const ledger = await appendLedger({ id: `log-bulk-${Date.now()}`, action: 'CARGA_MASIVA', entityType: 'Sistema', entityCode: imp[1], details: `Carga masiva desde ${b.fileName}: ${created} nuevos, ${updated} actualizados.` });
    return json({ ok: true, created, updated, ledger });
  }

  // --- Avisos ------------------------------------------------------------------------------------
  if (path === '/notifications' && method === 'GET') {
    const n = user!.notifications as { items?: { id: string; readAt?: string | null }[] } | { id: string; readAt?: string | null }[];
    const read = new Set(state.read[user!.email] ?? []);
    const mark = (x: { id: string; readAt?: string | null }) => (read.has(x.id) ? { ...x, readAt: x.readAt ?? new Date().toISOString() } : x);
    const items = (Array.isArray(n) ? n : n.items ?? []).map(mark);
    return json({ items, unread: items.filter(x => !x.readAt).length });
  }
  if (path === '/notifications/read') {
    const b = await bodyOf(init);
    const n = user!.notifications as { items?: { id: string }[] } | { id: string }[];
    const all = (Array.isArray(n) ? n : n.items ?? []).map(x => x.id);
    state.read[user!.email] = [...new Set([...(state.read[user!.email] ?? []), ...(b?.all ? all : (b?.ids ?? []))])];
    save();
    return json({ ok: true });
  }
  if (path === '/notifications/preferences') {
    if (method === 'GET') return json({ ...(state.prefs[user!.email] ? { preference: state.prefs[user!.email] } : {}), mailConfigured: false });
    state.prefs[user!.email] = await bodyOf(init);
    save();
    return json({ ok: true });
  }
  if (path === '/notifications/channels') return json({ email: false, sms: false, webhook: false });
  if (path === '/notifications/outbox') return json({ items: [], mailConfigured: false, settings: state.data.settings['notification_settings'] ?? {} });
  if (path === '/notifications/run') return json({ ok: true, created: 0, digests: 0 });
  if (path === '/notifications/test' || path === '/notifications/kri-test') return notInDemo('El envío de correos, SMS o webhooks');

  // --- Evidencias --------------------------------------------------------------------------------
  if (path === '/evidence/config') return json(DUMP.evidenceConfig);
  if (path === '/evidence' && method === 'POST') {
    const q = url.searchParams;
    const blob = init.body instanceof Blob ? init.body : new Blob([init.body as BlobPart]);
    const buf = await blob.arrayBuffer();
    const ext = /\.([a-z0-9]+)$/i.exec(decodeURIComponent(new Headers(init.headers).get('x-file-name') ?? ''))?.[1]?.toLowerCase() ?? '';
    const MIME: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(b => b.toString(16).padStart(2, '0')).join('');
    const h = new Headers(init.headers);
    const fileName = decodeURIComponent(h.get('x-file-name') ?? 'archivo');
    const id = `evd-demo-${Date.now()}`;
    const me = (user!.me as { user: { name: string; email: string } }).user;
    const file = {
      id, entityType: q.get('entityType'), entityId: q.get('entityId'), context: q.get('context') ?? undefined, fileName, mimeType: MIME[ext] ?? 'application/octet-stream',
      sizeBytes: buf.byteLength, sha256: sha, uploadedBy: me.name, uploadedByEmail: me.email, uploadedAt: new Date().toISOString(), description: q.get('description') ?? undefined,
    };
    uploaded.set(id, new Blob([buf], { type: file.mimeType }));
    (state.data['evidenceFiles'] as unknown[]).push(file);
    save();
    const ledger = await appendLedger({ id: `log-evd-${Date.now()}`, action: 'CARGA_EVIDENCIA', entityType: 'Evidencia', entityCode: fileName, details: `Evidencia ${fileName} (SHA-256 ${sha.slice(0, 16)}…).` });
    return json({ file, ledger });
  }
  const ev = /^\/evidence\/([^/]+)(\/verify)?$/.exec(path);
  if (ev) {
    const id = decodeURIComponent(ev[1]);
    if (ev[2]) return json({ ok: true });
    if (method === 'DELETE') {
      const b = await bodyOf(init);
      const files = state.data['evidenceFiles'] as { id: string }[];
      const me = (user!.me as { user: { name: string } }).user;
      const updated = { ...files.find(f => f.id === id), deletedAt: new Date().toISOString(), deletedBy: me.name, deleteReason: b?.reason ?? '' };
      state.data['evidenceFiles'] = files.map(f => (f.id === id ? updated : f));
      save();
      const ledger = await appendLedger({ id: `log-evd-del-${Date.now()}`, action: 'BAJA_EVIDENCIA', entityType: 'Evidencia', entityCode: id, details: `Baja de evidencia: ${b?.reason ?? ''}` });
      return json({ file: updated, ledger });
    }
    const blob = evidenceBlob(id);
    return blob ? new Response(blob) : json({ error: 'Archivo no disponible en la demostración.' }, 404);
  }

  // --- Administración ----------------------------------------------------------------------------
  if (path === '/admin/ops') return json({ ...DUMP.ops, backups: { ...(DUMP.ops['backups'] as object), list: [], last: null, canRun: false } });
  if (path.startsWith('/admin/backups')) return notInDemo('Los respaldos');
  if (path === '/admin/uf-sync') return notInDemo('La descarga de la UF');
  if (path === '/admin/convert-currency') return notInDemo('La conversión de moneda');
  if (/^\/admin\/users\/.+\/google-unlink$/.test(path)) return json({ ok: true });
  if (path.startsWith('/ai/')) return json({ error: 'Sin IA en la demostración.' }, 503);

  return notInDemo('Esta función');
}

function evidenceBlob(id: string): Blob | null {
  if (uploaded.has(id)) return uploaded.get(id)!;
  const f = DUMP.files[id];
  if (!f) return null;
  const bin = atob(f.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: f.type });
}

// --- Interceptar la API -----------------------------------------------------------------------------
const apiUrl = (u: string) => {
  try {
    const url = new URL(u, location.href);
    return url.origin === location.origin && url.pathname.includes('/api/') ? url : null;
  } catch { return null; }
};

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const s = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = apiUrl(s);
  if (!url) return realFetch(input, init);
  return handle(url, init).catch(err => json({ error: (err as Error).message }, 500));
};

// Archivos de evidencia (descarga o vista previa) y enlaces directos a la API.
function openApiFile(url: URL, download?: string): boolean {
  const m = /\/api\/evidence\/([^/?]+)$/.exec(url.pathname);
  const blob = m ? evidenceBlob(decodeURIComponent(m[1])) : null;
  if (!blob) {
    toast('Este archivo no está disponible en la demostración.');
    return true;
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  if (download) a.download = download; else a.target = '_blank';
  realClick.call(a);
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return true;
}
const realOpen = window.open.bind(window);
window.open = ((u?: string | URL, target?: string, features?: string) => {
  const url = u ? apiUrl(String(u)) : null;
  if (url) { openApiFile(url); return null; }
  return realOpen(u, target, features);
}) as typeof window.open;
const realClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
  const url = apiUrl(this.getAttribute('href') ?? '');
  if (url) { openApiFile(url, this.download || undefined); return; }
  realClick.call(this);
};
document.addEventListener('click', e => {
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  const url = a ? apiUrl(a.getAttribute('href') ?? '') : null;
  if (!url) return;
  e.preventDefault();
  if (url.pathname.includes('/api/evidence/')) openApiFile(url, a!.download || undefined);
  else toast('Disponible solo en la instalación con servidor.');
}, true);

// --- Barra de la demostración ---------------------------------------------------------------------
function toast(text: string) {
  const t = document.createElement('div');
  t.textContent = text;
  t.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:100000;background:#0f172a;color:#fff;font:600 12px system-ui,sans-serif;padding:8px 14px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.25)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function demoBar() {
  const bar = document.createElement('div');
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Demostración');
  bar.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:calc(100vw - 24px);background:#fffbeb;border:1px solid #f59e0b;color:#78350f;font:500 12px system-ui,sans-serif;padding:6px 8px 6px 12px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.15)';
  const label = document.createElement('strong');
  label.textContent = 'Demostración · datos ficticios';
  const sel = document.createElement('select');
  sel.title = 'Ver la aplicación como otra persona';
  sel.style.cssText = 'font:500 12px system-ui,sans-serif;border:1px solid #f59e0b;border-radius:8px;padding:3px 6px;background:#fff;color:#0f172a;max-width:260px';
  for (const u of DUMP.users) {
    const o = document.createElement('option');
    o.value = u.email;
    o.textContent = `${u.name} — ${u.role}`;
    if (u.email === sessionEmail) o.selected = true;
    sel.appendChild(o);
  }
  if (!sessionEmail) {
    const o = document.createElement('option');
    o.textContent = 'Elegir persona…';
    o.selected = true;
    o.disabled = true;
    sel.prepend(o);
  }
  sel.onchange = () => { storage.set(USER_KEY, sel.value); location.reload(); };
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reiniciar datos';
  reset.style.cssText = 'font:600 12px system-ui,sans-serif;border:1px solid #f59e0b;border-radius:8px;padding:3px 8px;background:#fff;color:#78350f;cursor:pointer';
  reset.onclick = () => { storage.del(STATE_KEY); location.reload(); };
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.title = 'Ocultar';
  close.setAttribute('aria-label', 'Ocultar la barra de la demostración');
  close.style.cssText = 'border:0;background:transparent;color:#78350f;font:700 16px system-ui;cursor:pointer;padding:0 4px';
  close.onclick = () => bar.remove();
  bar.append(label, sel, reset, close);
  document.body.appendChild(bar);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demoBar); else demoBar();

export {};
