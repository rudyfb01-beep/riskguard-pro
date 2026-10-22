import { getPool, applySchema } from './db';
import { appendLedger, importLedgerBlock, saveEntity, saveSetting, withTransaction } from './repository';
import { DEFAULT_ORGANIZATIONAL_ROLES, DEFAULT_REGULATORY_MILESTONES } from '../app/data/base-seed';
import {
  DEMO_ALERTS, DEMO_AUDITS, DEMO_CONTROLS, DEMO_FLAWS, DEMO_KRIS, DEMO_LEDGER, DEMO_RISKS, DEMO_USERS,
} from '../app/data/demo-seed';
import { SEED_BIA, SEED_PLANS, SEED_PROVIDERS, SEED_TESTS } from '../app/data/resilience-seed';

/**
 * Prepara la base al arrancar el servidor:
 * 1. Aplica database/schema.sql (idempotente: crea o migra tablas).
 * 2. En una base vacía carga los datos base (cargos, plazos regulatorios, ajustes).
 * 3. Si SEED_DEMO_DATA=true y no hay riesgos, carga los datos de ejemplo.
 *    Si no, crea un usuario administrador inicial para poder entrar.
 */
export async function ensureDatabase(): Promise<{ migrated: boolean; baseSeeded: boolean; demoSeeded: boolean }> {
  if (!getPool()) return { migrated: false, baseSeeded: false, demoSeeded: false };

  await applySchema();
  const wantDemo = process.env['SEED_DEMO_DATA'] === 'true';
  let baseSeeded = false;
  let demoSeeded = false;

  await withTransaction(async c => {
    await c.query('SELECT pg_advisory_xact_lock(727003)');

    if ((await c.query('SELECT 1 FROM organizational_roles LIMIT 1')).rowCount === 0) {
      for (const r of DEFAULT_ORGANIZATIONAL_ROLES) await saveEntity('roles', r, c);
      baseSeeded = true;
    }
    if ((await c.query('SELECT 1 FROM regulatory_milestone_templates LIMIT 1')).rowCount === 0) {
      for (const m of DEFAULT_REGULATORY_MILESTONES) await saveEntity('regulatory-milestones', m, c);
    }
    for (const [key, value] of [
      ['current_industry', 'Banca & Servicios Financieros'],
      ['loss_registration_threshold_usd', 1000],
    ] as const) {
      await c.query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]);
    }

    const hasRisks = (await c.query('SELECT 1 FROM risks LIMIT 1')).rowCount! > 0;
    if (wantDemo && !hasRisks) {
      await saveSetting('current_industry', 'Fintech & Pagos Digitales', c);
      for (const u of DEMO_USERS) await saveEntity('users', u, c);
      for (const x of DEMO_CONTROLS) await saveEntity('controls', x, c);
      for (const x of DEMO_RISKS) await saveEntity('risks', x, c);
      for (const x of SEED_PROVIDERS) await saveEntity('providers', x, c);
      for (const x of DEMO_FLAWS) await saveEntity('flaws', x, c);
      for (const x of DEMO_ALERTS) await saveEntity('alerts', x, c);
      for (const x of DEMO_AUDITS) await saveEntity('audits', x, c);
      for (const x of DEMO_KRIS) await saveEntity('kris', x, c);
      for (const x of SEED_BIA) await saveEntity('bia', x, c);
      for (const x of SEED_PLANS) await saveEntity('plans', x, c);
      for (const x of SEED_TESTS) await saveEntity('continuity-tests', x, c);
      if ((await c.query('SELECT 1 FROM crypto_audit_ledger LIMIT 1')).rowCount === 0) {
        for (const e of [...DEMO_LEDGER].sort((a, b) => a.blockNumber - b.blockNumber)) await importLedgerBlock(c, e);
      }
      demoSeeded = true;
    } else if ((await c.query('SELECT 1 FROM user_profiles LIMIT 1')).rowCount === 0) {
      const role = DEFAULT_ORGANIZATIONAL_ROLES[0];
      await saveEntity('users', {
        id: 'usr-admin', name: 'Administrador del sistema', email: process.env['ADMIN_EMAIL'] || 'admin@cooperativa.cl',
        role: role.title, roleId: role.id, department: role.department, badge: 'Administrador', isSystemUser: true,
        permissions: { ...role.permissions },
      }, c);
      await appendLedger({
        id: `log-init-${Date.now()}`, userName: 'Sistema', userRole: 'Instalación', action: 'ALTA_USUARIO', entityType: 'Usuario',
        entityCode: 'usr-admin', details: 'Instalación inicial: cargos de gobierno cooperativo, plazos regulatorios y usuario administrador creados.',
      }, '127.0.0.1', c);
    }
  });

  return { migrated: true, baseSeeded, demoSeeded };
}

