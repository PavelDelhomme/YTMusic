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

export function smtpPublicConfig() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT || 587);
  const useSsl = process.env.SMTP_USE_SSL === '1' || process.env.SMTP_USE_SSL === 'true';
  const secure =
    process.env.SMTP_SECURE === '1' ||
    process.env.SMTP_SECURE === 'true' ||
    useSsl ||
    port === 465;
  return {
    configured: Boolean(host),
    host: host || null,
    port,
    secure,
    user: process.env.SMTP_USER || null,
    from: process.env.SMTP_FROM || 'YTMusic <noreply@example.com>',
    replyTo: process.env.SMTP_REPLY_TO || process.env.SMTP_USER || null,
    mode: host ? 'smtp' : 'outbox',
    domainHint: 'maily.ovh (OVH MX Plan)',
  };
}

let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (transporter) return transporter;
  const cfg = smtpPublicConfig();
  if (!cfg.host) return null;

  transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
      : undefined,
    tls: { minVersion: 'TLSv1.2' },
  });
  return transporter;
}

/** Reset le transporteur après changement d’env (admin / tests). */
export function resetMailTransporter() {
  transporter = null;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const cfg = smtpPublicConfig();
  const from = cfg.from;
  const id = saveMailOutbox(opts.to, opts.subject, opts.html);
  const tx = await getTransporter();
  if (!tx) {
    console.log(
      `\n[mail:${getAppEnv()}] → ${opts.to}\nSubject: ${opts.subject}\n${opts.text || opts.html}\n(outbox id=${id})\n`,
    );
    return { ok: true, mode: 'outbox' as const, id };
  }
  await tx.sendMail({
    from,
    to: opts.to,
    replyTo: cfg.replyTo || undefined,
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
        <p style="color:#666;font-size:12px">Envoyé via ${cfgDomain()} · env ${getAppEnv()}</p>
      </div>`,
  });
}

function cfgDomain() {
  return process.env.SMTP_USER?.split('@')[1] || 'maily.ovh';
}

/** Smoke SMTP — verify() + mail de test optionnel. */
export async function testSmtp(to?: string) {
  const cfg = smtpPublicConfig();
  if (!cfg.configured) {
    return {
      ok: false,
      mode: 'outbox' as const,
      error: 'SMTP_HOST non configuré — mails en outbox admin uniquement',
      config: cfg,
    };
  }
  try {
    const tx = await getTransporter();
    if (!tx) throw new Error('Transporteur indisponible');
    await tx.verify();
    let sent: { ok: boolean; mode: string; id?: string } | undefined;
    if (to) {
      sent = await sendMail({
        to,
        subject: `[YTMusic] Test SMTP · ${getAppEnv()}`,
        text: `Test d’envoi OK depuis ${cfg.from} via ${cfg.host}:${cfg.port}`,
        html: `<p>Test d’envoi <strong>OK</strong> depuis <code>${cfg.from}</code><br>via ${cfg.host}:${cfg.port} (${getAppEnv()})</p>`,
      });
    }
    return { ok: true, mode: 'smtp' as const, config: cfg, sent };
  } catch (err) {
    resetMailTransporter();
    return {
      ok: false,
      mode: 'smtp' as const,
      error: String((err as Error).message || err),
      config: cfg,
    };
  }
}

export { appUrl };
