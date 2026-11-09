// Prueba de humo en el navegador (Playwright + Chromium): ingreso con código, recorrido de los
// módulos sin errores de consola ni violaciones de la CSP, y opciones ocultas según el cargo.
//   npx playwright install chromium   (una vez; o CHROME_PATH=/ruta/a/chrome)
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { D, startServer } from '../api/helpers.mjs';

const TABS = ['tablero', 'matriz-riesgos', 'controles', 'incidentes-perdidas', 'reportes-regulatorios', 'proveedores', 'continuidad',
  'gestion-crisis', 'seguridad-informacion', 'mantenedores', 'carga-masiva', 'cumplimiento-ran', 'planes-accion', 'autoevaluaciones',
  'aprobaciones', 'documentos', 'alertas-kri', 'auditorias', 'bitacora', 'reportes-pdf', 'operacion'];

let srv, browser;
before(async () => {
  srv = await startServer();
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
});
after(async () => {
  await browser?.close();
  await srv?.stop();
});

async function login(user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const problems = [];
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
  page.on('console', m => { if (m.type() === 'error' && !/status of 401/.test(m.text())) problems.push(m.text()); });
  page.on('pageerror', e => problems.push(String(e)));
  await page.goto(srv.base);
  const email = user + D;
  const mark = srv.log.length;
  await page.fill('#login-email', email);
  await page.click('button[type=submit]');
  await page.waitForSelector('#login-code');
  await page.fill('#login-code', await srv.codeFor(email, mark));
  await page.click('button[type=submit]').catch(() => undefined);
  await page.waitForSelector('app-sidebar-nav, nav', { timeout: 20_000 });
  return { ctx, page, problems };
}

describe('Navegador', () => {
  test('administración recorre todos los módulos sin errores ni violaciones de CSP', async () => {
    const { ctx, page, problems } = await login('elena.vasconcelos');
    try {
      for (const t of TABS) {
        await page.goto(`${srv.base}/?tab=${t}`);
        await page.waitForTimeout(700);
        assert.ok(await page.locator('main').count(), `sin contenido en ${t}`);
      }
      await page.goto(`${srv.base}/?tab=operacion`);
      await page.getByText('Operación y respaldos').first().waitFor();
      await page.getByRole('button', { name: 'Respaldar ahora' }).click();
      await page.getByText(/riskguard-\d{8}-\d{6}\.db/).first().waitFor({ timeout: 15_000 });
      assert.deepEqual(problems, []);
    } finally {
      await ctx.close();
    }
  });

  test('un cargo operativo no ve Operación y respaldos', async () => {
    const { ctx, page, problems } = await login('carlos.mendoza');
    try {
      await page.waitForTimeout(1000);
      const nav = page.locator('app-sidebar-nav');
      assert.equal(await nav.getByText('Operación y respaldos').count(), 0);
      await page.goto(`${srv.base}/?tab=operacion`);
      await page.waitForTimeout(1000);
      assert.equal(await page.getByRole('button', { name: 'Respaldar ahora' }).count(), 0);
      assert.deepEqual(problems, []);
    } finally {
      await ctx.close();
    }
  });
});
