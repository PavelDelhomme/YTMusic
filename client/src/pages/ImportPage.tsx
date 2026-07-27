import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';
import { Download, Link2, Loader2, RefreshCw, Unplug, Youtube } from 'lucide-react';

export function ImportPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const applyLibrary = useLibrary((s) => s.applyLibrary);
  const user = useAuth((s) => s.user);
  const isGuest = !user || user.isGuest || user.email.includes('@local.ytmusic');

  const [cookie, setCookie] = useState('');
  const [account, setAccount] = useState<any>(null);
  const [oauthCode, setOauthCode] = useState('');
  const [oauthUrl, setOauthUrl] = useState('');
  const [ytmBusy, setYtmBusy] = useState(false);
  const [ytmMsg, setYtmMsg] = useState('');
  const [ytmErr, setYtmErr] = useState('');

  const refreshStatus = () => {
    if (isGuest) return;
    void api
      .ytmStatus()
      .then((r) => setAccount(r.account))
      .catch(() => undefined);
  };

  useEffect(() => {
    refreshStatus();
  }, [isGuest]);

  useEffect(() => {
    if (!oauthCode) return;
    const t = setInterval(() => {
      void api.ytmOauthStatus().then((s) => {
        if (s.status === 'connected') {
          setOauthCode('');
          setOauthUrl('');
          setYtmMsg('Compte YouTube Music lié — tu peux synchroniser.');
          refreshStatus();
        }
        if (s.status === 'error') {
          setYtmErr(s.error || 'OAuth échoué');
          setOauthCode('');
        }
      });
    }, 2500);
    return () => clearInterval(t);
  }, [oauthCode]);

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await api.import({ url: input.trim(), query: input.trim() });
      applyLibrary(result.library);
      setMessage(
        `Importé : ${result.title} (${result.kind}) — ${JSON.stringify(result.added)}`,
      );
      setInput('');
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">Importer</h1>
      <p className="mb-6 text-sm text-yt-muted">
        Synchronise ta vraie bibliothèque YouTube Music, ou importe un lien / une recherche.
      </p>

      {!isGuest && (
        <section className="mb-8 rounded-2xl border border-yt-border bg-yt-surface p-5">
          <div className="mb-3 flex items-center gap-2">
            <Youtube className="h-5 w-5 text-yt-red" />
            <h2 className="font-display text-lg font-semibold">Compte YouTube Music</h2>
          </div>
          <p className="mb-4 text-sm text-yt-muted">
            Lie ton compte YTM pour récupérer titres aimés, albums, artistes et playlists dans
            cette app (stockage local sécurisé, cookies chiffrés).
          </p>

          {account?.connected ? (
            <div className="mb-4 space-y-3">
              <p className="text-sm text-emerald-400">
                Connecté
                {account.lastSyncAt
                  ? ` · dernière sync ${new Date(account.lastSyncAt).toLocaleString('fr-FR')}`
                  : ''}
              </p>
              {account.lastSyncSummary && (
                <p className="text-xs text-yt-muted">{account.lastSyncSummary}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={ytmBusy}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-red px-4 py-2 text-sm font-medium disabled:opacity-50"
                  onClick={() => {
                    setYtmBusy(true);
                    setYtmErr('');
                    setYtmMsg('');
                    void api
                      .ytmSync()
                      .then((r) => {
                        applyLibrary(r.library);
                        setAccount(r.account);
                        setYtmMsg(
                          `Sync OK — ${r.stats.songs} titres, ${r.stats.albums} albums, ${r.stats.artists} artistes, ${r.stats.playlists} playlists`,
                        );
                      })
                      .catch((e) => setYtmErr(String(e.message || e)))
                      .finally(() => setYtmBusy(false));
                  }}
                >
                  {ytmBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Synchroniser la bibliothèque
                </button>
                <button
                  type="button"
                  disabled={ytmBusy}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2 text-sm text-yt-muted hover:text-white"
                  onClick={() => {
                    void api.ytmDisconnect().then((r) => {
                      setAccount(r.account);
                      setYtmMsg('Compte YTM déconnecté');
                    });
                  }}
                >
                  <Unplug className="h-4 w-4" /> Déconnecter
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                disabled={ytmBusy}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
                onClick={() => {
                  setYtmBusy(true);
                  setYtmErr('');
                  void api
                    .ytmConnectOauth()
                    .then((r) => {
                      setOauthCode(r.userCode);
                      setOauthUrl(r.verificationUrl);
                      setYtmMsg('Ouvre le lien Google, entre le code, puis attends la confirmation.');
                    })
                    .catch((e) => setYtmErr(String(e.message || e)))
                    .finally(() => setYtmBusy(false));
                }}
              >
                Lier via Google (code appareil)
              </button>
              {oauthCode && (
                <div className="rounded-xl bg-yt-elevated px-3 py-3 text-sm">
                  <p>
                    Va sur{' '}
                    <a
                      href={oauthUrl || 'https://www.google.com/device'}
                      target="_blank"
                      rel="noreferrer"
                      className="text-yt-red underline"
                    >
                      {oauthUrl || 'google.com/device'}
                    </a>
                  </p>
                  <p className="mt-2 font-mono text-lg tracking-widest text-white">{oauthCode}</p>
                  <p className="mt-1 text-xs text-yt-muted">En attente de validation…</p>
                </div>
              )}

              <details className="rounded-xl border border-yt-border bg-yt-bg p-3 text-sm">
                <summary className="cursor-pointer text-yt-muted">Ou coller les cookies (avancé)</summary>
                <p className="mt-2 text-xs text-yt-muted">
                  Sur music.youtube.com connecté → F12 → Réseau → une requête → en-tête Cookie →
                  copie (SID, SAPISID…).
                </p>
                <textarea
                  value={cookie}
                  onChange={(e) => setCookie(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-yt-border bg-yt-elevated px-3 py-2 text-xs outline-none"
                  placeholder="SID=…; HSID=…; SSID=…; APISID=…; SAPISID=…"
                />
                <button
                  type="button"
                  disabled={ytmBusy || cookie.length < 20}
                  className="mt-2 rounded-full bg-yt-elevated px-4 py-2 text-xs disabled:opacity-50"
                  onClick={() => {
                    setYtmBusy(true);
                    setYtmErr('');
                    void api
                      .ytmConnectCookie(cookie)
                      .then((r) => {
                        setAccount(r.account);
                        setCookie('');
                        setYtmMsg('Cookies enregistrés — lance une synchronisation.');
                      })
                      .catch((e) => setYtmErr(String(e.message || e)))
                      .finally(() => setYtmBusy(false));
                  }}
                >
                  Enregistrer les cookies
                </button>
              </details>
            </div>
          )}

          {ytmErr && <p className="mt-3 text-sm text-red-400">{ytmErr}</p>}
          {ytmMsg && <p className="mt-3 text-sm text-emerald-400">{ytmMsg}</p>}
        </section>
      )}

      {isGuest && (
        <p className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          Connecte-toi (compte app) pour lier YouTube Music et synchroniser ta bibliothèque.
        </p>
      )}

      <div className="rounded-2xl border border-yt-border bg-yt-elevated p-4">
        <label className="mb-2 flex items-center gap-2 text-sm text-yt-muted">
          <Link2 className="h-4 w-4" /> URL ou recherche (import unitaire)
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="https://music.youtube.com/playlist?list=... ou Daft Punk"
          className="w-full resize-none rounded-xl border border-yt-border bg-yt-bg px-3 py-2.5 text-sm outline-none focus:border-white/30"
        />
        <button
          type="button"
          disabled={loading || !input.trim()}
          onClick={() => void run()}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Importer dans ma bibliothèque
        </button>
      </div>

      {message && (
        <p className="mt-4 rounded-xl border border-emerald-900/50 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
