import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../api';
import { useAuth } from '../store/auth';
import {
  CheckCircle2,
  Construction,
  Copy,
  Radar,
  Rocket,
  Server,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export function AdminPage() {
  const user = useAuth((s) => s.user);
  const [status, setStatus] = useState<any>(null);
  const [err, setErr] = useState('');
  const [selectedUrl, setSelectedUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    void api
      .adminStatus()
      .then((s) => {
        setStatus(s);
        setSelectedUrl((prev) => prev || s.urls?.find((u: string) => !u.includes('localhost')) || s.urls?.[0] || '');
      })
      .catch((e) => setErr(String(e.message || e)));
  }, []);

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

  return (
    <div className="animate-fade-up mx-auto max-w-4xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-yt-muted">Console</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Administration</h1>
          <p className="mt-1 text-sm text-yt-muted">
            Déploie sur mobile, build PWA, statut serveur — sans quitter l&apos;app.
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
              ? `${status.mode === 'development' ? 'Dev (Vite)' : 'Prod'} · API :${status.port}`
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
          icon={<Radar className="h-4 w-4" />}
          label="Réseau local"
          value={status?.lan?.length ? `${status.lan.length} IP` : '…'}
          sub={status?.lan?.[0]?.address || 'Aucune'}
        />
      </div>

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
              YTMusic » ; une bannière apparaît aussi dans l&apos;app.
            </li>
            <li>
              <strong className="text-white">Electron</strong> —{' '}
              <code className="text-white">npm run dev:desktop</code> dans le dossier projet
              {status?.desktopReady ? ' (desktop détecté)' : ''}.
            </li>
            <li>
              Prod simple : <code className="text-white">npm run build && npm start</code> puis ouvre
              les URLs LAN.
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
