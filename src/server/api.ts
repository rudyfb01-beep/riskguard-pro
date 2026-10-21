import express from 'express';
import { getPool } from './db';
import { ensureDatabase } from './bootstrap-db';
import {
  appendLedger, deleteEntity, isEntity, loadAll, saveEntity, saveSetting, SETTING_KEYS, SettingKey,
} from './repository';

let ready: ReturnType<typeof ensureDatabase> | null = null;

/** Prepara la base una sola vez (migración + datos base). `force` reintenta. */
export function getDbReady(force = false) {
  if (!ready || force) {
    ready = ensureDatabase();
    ready.catch(() => { ready = null; }); // permite reintentar en la próxima petición
  }
  return ready;
}

export const dataApi = express.Router();

/** Sin DATABASE_URL la app funciona en modo demostración: no hay API de datos. */
dataApi.use(['/data', '/ledger', '/settings'], async (req, res, next) => {
  if (!getPool()) {
    if (req.method === 'GET' && req.path === '/') {
      res.json({ mode: 'demo' });
      return;
    }
    res.status(503).json({ error: 'Base de datos no configurada (modo demostración).' });
    return;
  }
  try {
    await getDbReady();
    next();
  } catch (err) {
    res.status(503).json({ error: `Base de datos no disponible: ${(err as Error).message}` });
  }
});

dataApi.get('/data', async (_req, res) => {
  try {
    res.json({ mode: 'database', ...(await loadAll()) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

dataApi.put('/data/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  const body = req.body as { id?: string } | undefined;
  if (!isEntity(entity)) {
    res.status(404).json({ error: `Entidad desconocida: ${entity}` });
    return;
  }
  if (!body || typeof body !== 'object' || body.id !== id) {
    res.status(400).json({ error: 'El cuerpo debe ser el objeto completo con el mismo id de la URL.' });
    return;
  }
  try {
    await saveEntity(entity, body as { id: string });
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

dataApi.delete('/data/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  if (!isEntity(entity)) {
    res.status(404).json({ error: `Entidad desconocida: ${entity}` });
    return;
  }
  try {
    await deleteEntity(entity, id);
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

dataApi.post('/ledger', async (req, res) => {
  const b = req.body ?? {};
  const required = ['id', 'userName', 'userRole', 'action', 'entityType', 'entityCode', 'details'];
  if (required.some(k => typeof b[k] !== 'string' || !b[k])) {
    res.status(400).json({ error: `Campos requeridos: ${required.join(', ')}` });
    return;
  }
  try {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'desconocida';
    const entry = await appendLedger(
      { id: b.id, userName: b.userName, userRole: b.userRole, action: b.action, entityType: b.entityType, entityCode: b.entityCode, details: b.details },
      ip
    );
    res.json(entry);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

dataApi.put('/settings/:key', async (req, res) => {
  const key = req.params.key;
  if (!(SETTING_KEYS as readonly string[]).includes(key)) {
    res.status(404).json({ error: `Ajuste desconocido: ${key}` });
    return;
  }
  try {
    await saveSetting(key as SettingKey, req.body?.value);
    res.json({ ok: true });
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

/** Bitácora completa (para resincronizar la cadena cuando otro usuario agregó bloques). */
dataApi.get('/ledger', async (_req, res) => {
  try {
    const all = await loadAll();
    res.json(all.ledger);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
