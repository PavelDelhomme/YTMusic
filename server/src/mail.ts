import nodemailer from 'nodemailer';
import { saveMailOutbox } from './platform.js';

function appUrl() {
  return (
    process.env.APP_URL ||
    process.env.WEBAUTHN_ORIGIN ||
    (process.env.NODE_ENV === 'production' ? 'https://ytmusic.delhomme.ovh' : 'http://localhost:5173')
  ).replace(/\/$/, '');
}

export function getAppEnv() {
  return process.env.APP_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'local');
}

let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (host) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === '1',
      auth:
        process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
          : undefined,
    });
    return transporter;
  }
  // Dev: ethereal-like fake — we keep outbox only
  return null;
}

export async function sendMail(opts: { to: string; subject: string; html: string; text?: string }) {
  const from = process.env.SMTP_FROM || 'YTMusic <noreply@ytmusic.local>';
  const id = saveMailOutbox(opts.to, opts.subject, opts.html);
  const tx = await getTransporter();
  if (!tx) {
    console.log(`\n[mail:${getAppEnv()}] → ${opts.to}\nSubject: ${opts.subject}\n${opts.text || opts.html}\n(outbox id=${id})\n`);
    return { ok: true, mode: 'outbox' as const, id };
  }
  await tx.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return { ok: true, mode: 'smtp' as const, id };
}

export async function sendVerificationEmail(email: string, name: string, rawToken: string) {
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
  return sendMail({
    to: email,
    subject: 'Confirme ton adresse — YTMusic',
    text: `Salut ${name},\n\nConfirme ton email : ${link}\n\nLien valable 48h.`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">
        <h2>Bienvenue sur YTMusic</h2>
        <p>Salut <strong>${name}</strong>, confirme ton adresse email :</p>
        <p><a href="${link}" style="display:inline-block;background:#ff0033;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Valider mon email</a></p>
        <p style="color:#666;font-size:12px">Ou copie ce lien :<br>${link}</p>
        <p style="color:#666;font-size:12px">Environnement : ${getAppEnv()}</p>
      </div>`,
  });
}

export { appUrl };
