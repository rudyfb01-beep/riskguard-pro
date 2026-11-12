import { getPool } from './db';
import { passwordEnabled, setTemporaryPassword } from './passwords';

/**
 * Comando del servidor para dar una contraseña temporal a una persona (por ejemplo, el primer
 * administrador, que aún no puede entrar, o quien la olvidó si no hay otro administrador):
 *
 *   docker compose exec app node dist/app/server/server.mjs contrasena <correo>
 *
 * Muestra la contraseña una sola vez; vence en 24 horas y debe cambiarse al ingresar.
 */
export async function runPasswordCli(rawEmail: string | undefined, ready: () => Promise<unknown>): Promise<number> {
  const email = (rawEmail ?? '').trim().toLowerCase();
  if (!email) {
    console.error('Uso: node dist/app/server/server.mjs contrasena <correo de la persona>');
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
  const t = await setTemporaryPassword(u, { name: 'Consola del servidor', role: 'Administración del servidor' }, 'servidor');
  const until = new Date(t.expiresAt).toLocaleString('es-CL', { timeZone: process.env['TZ'] || 'America/Santiago' });
  console.log(`\nContraseña temporal de ${u.name} <${u.email}>:\n\n    ${t.password}\n`);
  console.log(`Vence: ${until} (24 horas).`);
  console.log('Al ingresar con ella, el sistema pedirá crear una contraseña propia (mínimo 12 caracteres).');
  console.log('Se muestra solo esta vez: entréguela en persona y no la deje escrita.');
  if (!passwordEnabled()) console.warn('\nAtención: AUTH_PASSWORD no está en true; defina AUTH_PASSWORD=true en .env y reinicie la aplicación (docker compose up -d) para habilitar el ingreso con contraseña.');
  return 0;
}
