#!/usr/bin/env node
// =============================================================================
// Genera una demostración estática (sin servidor) en release/demo/.
//
//   npx ng build && node scripts/build-demo.mjs
//
// 1. Levanta el servidor compilado sobre una base temporal con datos ficticios (SEED_DEMO_DATA).
// 2. Ingresa como cada persona de ejemplo y guarda lo que devuelve la API.
// 3. Copia la aplicación y agrega demo/demo-api.ts, que reemplaza la API dentro del navegador.
//
// La aplicación de producción no cambia: la demo es solo esta carpeta.
// =============================================================================
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { ROOT, startServer } from '../tests/api/helpers.mjs';

const out = resolve(ROOT, 'release/demo');
const browser = join(ROOT, 'dist/app/browser');

const srv = await startServer({ NOTIFY_INTERVAL_MINUTES: '0' });
try {
  const admin = await srv.login('elena.vasconcelos');
  const data = (await admin.call('GET', '/api/data')).body;
  const authConfig = (await srv.anon().call('GET', '/api/auth/config')).body;
  const evidenceConfig = (await admin.call('GET', '/api/evidence/config')).body;
  const ops = (await admin.call('GET', '/api/admin/ops')).body;
  // Avisos de ejemplo: la revisión de plazos genera los de cada persona.
  await admin.call('POST', '/api/notifications/run', { digest: false });

  const users = [];
  for (const u of data.users.filter(x => x.active !== false && /@demo\.riskguard\.cl$/.test(x.email))) {
    const s = await srv.login(u.email);
    users.push({
      email: u.email, name: u.name, role: u.role,
      me: (await s.call('GET', '/api/auth/me')).body,
      notifications: (await s.call('GET', '/api/notifications?limit=100')).body,
    });
  }

  const files = {};
  for (const f of data.evidenceFiles ?? []) {
    const r = await admin.fetch('GET', `/api/evidence/${encodeURIComponent(f.id)}`);
    if (r.ok) files[f.id] = { type: f.mimeType, base64: Buffer.from(await r.arrayBuffer()).toString('base64') };
  }

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(browser, out, { recursive: true });
  rmSync(join(out, 'index.csr.html'), { force: true });
  writeFileSync(join(out, 'demo-data.js'), `window.__RG_DEMO__=${JSON.stringify({ generatedAt: new Date().toISOString(), data, authConfig, evidenceConfig, ops, users, files })};\n`);
  await build({
    entryPoints: [join(ROOT, 'demo/demo-api.ts')], bundle: true, format: 'iife', target: 'es2022', minify: true,
    outfile: join(out, 'demo-api.js'), logLevel: 'warning',
  });

  // index.html: base relativa a la carpeta donde se publique, datos y API de la demo antes de la app.
  const html = readFileSync(join(browser, 'index.csr.html'), 'utf8')
    .replace(/<base href="\/"\s*\/?>/, '<script>(function(){if(/\\/index\\.html$/.test(location.pathname))history.replaceState(null,"",location.pathname.replace(/index\\.html$/,"")+location.search+location.hash);var b=document.createElement("base");b.href=location.pathname.replace(/[^/]*$/,"");document.head.appendChild(b);})();</script>\n    <script src="demo-data.js"></script>\n    <script src="demo-api.js"></script>')
    .replace('<title>RiskGuard Pro - Gestión de Riesgo Operacional</title>', '<title>RiskGuard Pro - Demostración</title>');
  if (!html.includes('demo-api.js')) throw new Error('No se encontró <base href="/"> en index.csr.html');
  writeFileSync(join(out, 'index.html'), html);

  console.log(`Demostración en ${out}: ${users.length} personas, ${data.risks.length} riesgos, ${Object.keys(files).length} archivos de evidencia.`);
} finally {
  await srv.stop();
}
