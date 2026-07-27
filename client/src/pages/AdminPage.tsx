import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';
import { useAuth } from '../store/auth';
import {
  Activity,
  CheckCircle2,
  Construction,
  Copy,
  Mail,
  Monitor,
  Radar,
  Rocket,
  Server,
  Smartphone,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function AdminPage() {
  const user = useAuth((s) => s.user);
  const [status, setStatus] = useState<any>(null);
  const [err, setErr] = useState('');
  const [selectedUrl, setSelectedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [telemetry, setTelemetry] = useState<{ stats: any; events: any[] } | null>(null);
  const [mails, setMails] = useState<any[]>([]);
  const [levelFilter, setLevelFilter] = useState('');

  const refresh = useCallback(() => {
    void api
      .adminStatus()
      .then((s) => {
        setStatus(s);
        setSelectedUrl((prev) => prev || s.urls?.find((u: string) => !u.includes('localhost')) || s.urls?.[0] || '');
      })
      .catch((e) => setErr(String(e.message || e)));
    void api
      .adminTelemetry(levelFilter || undefined)
      .then(setTelemetry)
      .catch(() => undefined);
    void api
      .adminMailOutbox()
      .then((r) => setMails(r.mails || []))
      .catch(() => undefined);
  }, [levelFilter]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!user?.isAdmin) {
    return (
      <div className="animate-fade-up mx-auto max-w-lg rounded-2xl border border-yt-border bg-yt-elevated p-6 text-center">
        <Construction className="mx-auto mb-3 h-10 w-10 text-yt-muted" />
        <h1 className="font-display text-xl font-semibold">Administration</h1>
        <p className="mt-2 text-sm text-yt-muted">
          Réservé aux admins. Connecte-toi avec le premier compte créé, ou définis{' '}
          <code className="text-white">ADMIN_EMAILS</code> dans <code className="text-white">.env</code>.
        </p>
        <Link to="/profile" className="mt-4 inline-block text-sm text-yt-red hover:underline">
          Aller au profil
        </Link>
      </div>
    );
  }

  const stats = telemetry?.stats;

  return (
    <div className="animate-fade-up mx-auto max-w-4xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-yt-muted">Console</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Administration</h1>
          <p className="mt-1 text-sm text-yt-muted">
            Déploiement, analytics erreurs/perf/batterie, mails — local · préprod · prod.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-full bg-yt-elevated px-4 py-2 text-sm text-yt-muted hover:text-white"
        >
          Rafraîchir
        </button>
      </div>

      {err && <p className="mb-4 text-sm text-red-400">{err}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<Server className="h-4 w-4" />}
          label="Serveur"
          value={status ? `:${status.appPort || status.port}` : '…'}
          sub={
            status
              ? `${status.mode === 'development' ? 'Dev (Vite)' : 'Prod'} · env ${status.env || 'local'}`
              : ''
          }
        />
        <Stat
          icon={<Smartphone className="h-4 w-4" />}
          label="Comptes"
          value={status ? String(status.users) : '…'}
          sub={status ? `${status.guests} invités` : ''}
        />
        <Stat
          icon={<Activity className="h-4 w-4" />}
          label="Télémétrie 24h"
          value={stats ? String(stats.last24 ?? '…') : '…'}
          sub={stats ? `${stats.errors24 || 0} erreurs · ${stats.total || 0} total` : ''}
        />
      </div>

      <section className="mb-6 rounded-2xl border border-yt-border bg-yt-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-yt-red" />
            <h3 className="font-display text-lg font-semibold">Analytics & erreurs</h3>
          </div>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="rounded-xl border border-yt-border bg-yt-bg px-3 py-1.5 text-sm"
          >
            <option value="">Tous niveaux</option>
            <option value="error">Erreurs</option>
            <option value="fatal">Fatal</option>
            <option value="info">Info</option>
          </select>
        </div>
        <p className="mb-4 text-sm text-yt-muted">
          Client web, PWA mobile et desktop envoient erreurs, perf JS heap et batterie (si dispo).
        </p>
        <div className="max-h-80 overflow-auto rounded-xl bg-black/40">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-yt-elevated text-yt-muted">
              <tr>
                <th className="px-3 py-2">Quand</th>
                <th className="px-3 py-2">Niv.</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Message</th>
                <th className="px-3 py-2">Batt.</th>
              </tr>
            </thead>
            <tbody>
              {(telemetry?.events || []).slice(0, 80).map((ev: any) => (
                <tr key={ev.id} className="border-t border-yt-border/50 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-yt-muted">
                    {new Date(ev.created_at).toLocaleString('fr-FR')}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        ev.level === 'error' || ev.level === 'fatal'
                          ? 'text-red-400'
                          : 'text-yt-muted'
                      }
                    >
                      {ev.level}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-yt-muted">{ev.kind}</td>
                  <td className="max-w-xs truncate px-3 py-2" title={ev.message || ''}>
                    {ev.message || '—'}
                  </td>
                  <td className="px-3 py-2 text-yt-muted">
                    {ev.battery_level != null
                      ? `${Math.round(ev.battery_level * 100)}%${ev.battery_charging ? '⚡' : ''}`
                      : '—'}
                  </td>
                </tr>
              ))}
              {(!telemetry?.events || telemetry.events.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-yt-muted">
                    Aucun événement pour l&apos;instant
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-yt-border bg-yt-surface p-5">
        <div className="mb-3 flex items-center gap-2">
          <Mail className="h-5 w-5 text-yt-red" />
          <h3 className="font-display text-lg font-semibold">Boîte mail (outbox)</h3>
        </div>
        <p className="mb-4 text-sm text-yt-muted">
          Sans SMTP, les emails (validation…) sont stockés ici + logs console. Avec SMTP, ils
          partent vraiment.
        </p>
        <ul className="max-h-60 space-y-2 overflow-auto text-sm">
          {mails.slice(0, 30).map((m) => (
            <li key={m.id} className="rounded-xl bg-yt-elevated px-3 py-2">
              <div className="flex justify-between gap-2 text-xs text-yt-muted">
                <span>{m.to_email}</span>
                <span>{new Date(m.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <div className="font-medium">{m.subject}</div>
              <details className="mt-1 text-xs text-yt-muted">
                <summary>Corps</summary>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap">{m.body}</pre>
              </details>
            </li>
          ))}
          {mails.length === 0 && <li className="text-yt-muted">Aucun mail</li>}
        </ul>
      </section>

      <section className="mb-6 overflow-hidden rounded-3xl border border-yt-border bg-gradient-to-br from-[#1a1a1a] via-yt-surface to-[#0d0d0d] p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex-1">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-yt-red/20 px-3 py-1 text-xs font-medium text-yt-red">
              <Rocket className="h-3.5 w-3.5" /> Déploiement mobile
            </div>
            <h2 className="font-display text-2xl font-semibold">Installe YTMusic sur ton téléphone</h2>
            <p className="mt-2 max-w-md text-sm text-yt-muted">
              Même Wi‑Fi que cet ordinateur. Scanne le QR, ouvre le lien, puis installe en PWA
              (plein écran, icône, offline).
            </p>
            <div className="mt-4 space-y-2">
              {(status?.urls || []).map((u: string) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setSelectedUrl(u)}
                  className={`block w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    selectedUrl === u ? 'bg-white text-black' : 'bg-yt-elevated text-yt-muted hover:text-white'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-2 text-xs text-yt-muted hover:text-white"
              onClick={() => {
                void navigator.clipboard.writeText(selectedUrl).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copié !' : 'Copier le lien'}
            </button>
          </div>
          <div className="mx-auto rounded-3xl bg-white p-4 shadow-2xl">
            <QRCodeSVG value={selectedUrl || 'https://localhost'} size={200} level="M" />
          </div>
        </div>
        <ol className="mt-6 grid gap-3 text-sm text-yt-muted sm:grid-cols-3">
          <li className="rounded-2xl bg-black/30 p-3">
            <span className="text-white">1.</span> Scanne le QR sur le téléphone
          </li>
          <li className="rounded-2xl bg-black/30 p-3">
            <span className="text-white">2.</span> Connecte-toi (ou reste invité)
          </li>
          <li className="rounded-2xl bg-black/30 p-3">
            <span className="text-white">3.</span> « Installer l&apos;app » dans le navigateur
          </li>
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-yt-border bg-yt-surface p-5">
          <div className="mb-3 flex items-center gap-2">
            <Construction className="h-5 w-5 text-yt-red" />
            <h3 className="font-display text-lg font-semibold">Build production</h3>
          </div>
          <p className="mb-4 text-sm text-yt-muted">
            Compile le client React/PWA. Ensuite le serveur sert <code>client/dist</code> sur le port{' '}
            {status?.port || 8787}.
          </p>
          <div className="mb-3 flex items-center gap-2 text-sm">
            {status?.buildJob?.status === 'ok' && (
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> Build OK
              </span>
            )}
            {status?.buildJob?.status === 'running' && (
              <span className="text-amber-300">Build en cours…</span>
            )}
            {status?.buildJob?.status === 'error' && (
              <span className="text-red-400">Build échoué</span>
            )}
            {status?.built && (
              <span className="text-yt-muted">
                · {status.builtAt ? new Date(status.builtAt).toLocaleString('fr-FR') : 'prêt'}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={status?.buildJob?.status === 'running'}
            onClick={() => {
              void api.adminBuild().then(() => refresh());
            }}
            className="rounded-full bg-yt-red px-5 py-2 text-sm font-medium disabled:opacity-50"
          >
            Lancer le build
          </button>
          {status?.buildJob?.log && (
            <pre className="mt-4 max-h-48 overflow-auto rounded-xl bg-black/50 p-3 text-[11px] leading-relaxed text-yt-muted">
              {status.buildJob.log.slice(-4000)}
            </pre>
          )}
        </section>

        <section className="rounded-2xl border border-yt-border bg-yt-surface p-5">
          <div className="mb-3 flex items-center gap-2">
            <Monitor className="h-5 w-5 text-yt-red" />
            <h3 className="font-display text-lg font-semibold">Desktop & PWA</h3>
          </div>
          <ul className="space-y-3 text-sm text-yt-muted">
            <li>
              <strong className="text-white">Mobile / tablette</strong> — PWA via QR ci-dessus.
            </li>
            <li>
              <strong className="text-white">Ordinateur</strong> — Chrome/Edge propose « Installer
              YTMusic » uniquement si pas déjà installé (bannière conditionnelle).
            </li>
            <li>
              <strong className="text-white">Electron</strong> —{' '}
              <code className="text-white">npm run dev:desktop</code>
              {status?.desktopReady ? ' (desktop détecté)' : ''}.
            </li>
            <li>
              Socle réutilisable : <code className="text-white">packages/platform-kit</code>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-yt-border bg-yt-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wide text-yt-muted">
        {icon}
        {label}
      </div>
      <div className="font-display text-2xl font-semibold">{value}</div>
      {sub ? <div className="mt-1 text-xs text-yt-muted">{sub}</div> : null}
    </div>
  );
}
