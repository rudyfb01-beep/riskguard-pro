import nodemailer, { Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

/** El envío de correo está configurado si hay SMTP_HOST. */
export function isMailConfigured(): boolean {
  return !!process.env['SMTP_HOST'];
}

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env['SMTP_PORT'] || 587);
  transporter = nodemailer.createTransport({
    host: process.env['SMTP_HOST'],
    port,
    // 465 = TLS directo; 587/25 = STARTTLS si el servidor lo ofrece.
    secure: process.env['SMTP_SECURE'] ? process.env['SMTP_SECURE'] === 'true' : port === 465,
    auth: process.env['SMTP_USER'] ? { user: process.env['SMTP_USER'], pass: process.env['SMTP_PASS'] || '' } : undefined,
    tls: process.env['SMTP_TLS_REJECT_UNAUTHORIZED'] === 'false' ? { rejectUnauthorized: false } : undefined,
  });
  return transporter;
}

/** Envía el código de acceso. Sin SMTP configurado, lo deja en el log solo si se permite. */
export async function sendLoginCode(to: string, name: string, code: string, minutes: number): Promise<void> {
  const appName = process.env['APP_NAME'] || 'RiskGuard Pro';
  if (!isMailConfigured()) {
    if (process.env['AUTH_DEV_LOG_CODES'] === 'true') {
      console.warn(`[Auth] SMTP no configurado. Código de acceso para ${to}: ${code}`);
      return;
    }
    throw new Error('El envío de correo no está configurado (SMTP_HOST).');
  }
  const text =
    `Hola ${name}:\n\nTu código de acceso a ${appName} es: ${code}\n\n` +
    `Vence en ${minutes} minutos y sirve una sola vez. Si no lo solicitaste, ignora este correo; nadie podrá entrar sin el código.\n`;
  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:480px;color:#0f172a">
      <p>Hola ${escapeHtml(name)}:</p>
      <p>Tu código de acceso a <strong>${escapeHtml(appName)}</strong> es:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:Consolas,monospace;background:#f1f5f9;padding:12px 16px;border-radius:8px;display:inline-block">${code}</p>
      <p style="color:#475569;font-size:13px">Vence en ${minutes} minutos y sirve una sola vez.<br>Si no lo solicitaste, ignora este correo; nadie podrá entrar sin el código.</p>
    </div>`;
  await getTransporter().sendMail({
    from: process.env['SMTP_FROM'] || process.env['SMTP_USER'],
    to,
    subject: `${code} es tu código de acceso a ${appName}`,
    text,
    html,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
