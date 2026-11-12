import { getPool } from './db';
import { appendLedger } from './repository';
import { enrollTotp, totpEnabled } from './totp';

/**
 * Comando del servidor para registrar la aplicación autenticadora de una persona (por ejemplo, el
 * primer administrador, que aún no puede entrar):
 *
 *   docker compose exec app node dist/app/server/server.mjs autenticador <correo>
 *
 * Dibuja el QR en la terminal; la persona lo escanea con Google Authenticator.
 */
export async function runTotpCli(rawEmail: string | undefined, ready: () => Promise<unknown>): Promise<number> {
  const email = (rawEmail ?? '').trim().toLowerCase();
  if (!email) {
    console.error('Uso: node dist/app/server/server.mjs autenticador <correo de la persona>');
    return 2;
  }
  if (!getPool()) {
    console.error('No hay base de datos configurada (DATABASE_URL o SQLITE_PATH).');
    return 1;
  }
  await ready();
  const r = await getPool()!.query('SELECT id, name, email FROM user_profiles WHERE lower(email) = $1 AND active = TRUE', [email]);
  const u = r.rows[0];
  if (!u) {
    const all = await getPool()!.query('SELECT email FROM user_profiles WHERE active = TRUE ORDER BY email LIMIT 30');
    console.error(`No hay una persona activa con el correo ${email}. Correos registrados:\n${all.rows.map((x: { email: string }) => `  - ${x.email}`).join('\n')}`);
    return 1;
  }
  const e = await enrollTotp(u, 'Consola del servidor');
  await appendLedger({
    id: `log-totp-cli-${Date.now()}`, userName: 'Consola del servidor', userRole: 'Administración del servidor', action: 'GESTIÓN_USUARIO',
    entityType: 'Usuario', entityCode: u.id, details: `Autenticador activado desde la consola del servidor para ${u.name} (${u.email}).`,
  }, 'servidor');
  console.log(`\nAutenticador de ${u.name} <${u.email}>\n`);
  console.log(e.qrTerminal);
  console.log('1. Abra Google Authenticator (o Microsoft Authenticator) en el celular.');
  console.log('2. Toque "+" → "Escanear un código QR" y apunte a este QR.');
  console.log(`   Si no puede escanear, elija "Ingresar una clave de configuración": cuenta ${u.email}, clave ${e.secret}, basada en el tiempo.`);
  console.log('3. En RiskGuard Pro escriba su correo y luego el número de 6 dígitos que muestra la aplicación.\n');
  if (!totpEnabled()) console.warn('Atención: AUTH_TOTP no está en true; defina AUTH_TOTP=true en .env y reinicie la aplicación para que se acepte el autenticador.');
  console.log('Este QR equivale a una llave de acceso: no lo comparta ni deje capturas.');
  return 0;
}
