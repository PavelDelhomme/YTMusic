import { useEffect, useState } from 'react';
import { api, type Track } from '../api';
import { useLibrary } from '../store/library';
import { downloadAndCache, listCachedIds } from '../lib/offlineCache';
import { Download, HardDrive, Loader2 } from 'lucide-react';
import { TrackRow } from '../components/TrackRow';

export function OfflinePage() {
  const { liked, playlists, downloaded, refresh } = useLibrary();
  const [jobs, setJobs] = useState<any[]>([]);
  const [localIds, setLocalIds] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const reload = async () => {
    const [{ jobs }, ids] = await Promise.all([api.offlineJobs(), listCachedIds()]);
    setJobs(jobs);
    setLocalIds(ids);
  };

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 4000);
    return () => clearInterval(t);
  }, []);

  const cacheTracks = async (label: string, tracks: Track[]) => {
    setBusy(label);
    setMessage('');
    let ok = 0;
    for (const t of tracks.filter((x) => /^[a-zA-Z0-9_-]{11}$/.test(x.id))) {
      try {
        await downloadAndCache(t);
        ok++;
      } catch {
        /* continue */
      }
    }
    await api.offlineStart('liked', 'liked').catch(() => undefined);
    await refresh();
    await reload();
    setBusy('');
    setMessage(`${ok} titres mis en cache sur cet appareil`);
  };

  return (
    <div className="animate-fade-up">
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">Mode hors-ligne</h1>
      <p className="mb-6 text-sm text-yt-muted">
        Télécharge albums, playlists ou titres aimés. Cache navigateur (IndexedDB) + fichiers serveur pour sync.
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-yt-elevated p-4">
          <HardDrive className="mb-2 h-5 w-5 text-yt-red" />
          <div className="text-2xl font-semibold">{localIds.length}</div>
          <div className="text-xs text-yt-muted">Cache local appareil</div>
        </div>
        <div className="rounded-xl bg-yt-elevated p-4">
          <Download className="mb-2 h-5 w-5 text-yt-red" />
          <div className="text-2xl font-semibold">{downloaded.length}</div>
          <div className="text-xs text-yt-muted">Marqués offline (compte)</div>
        </div>
        <div className="rounded-xl bg-yt-elevated p-4">
          <Loader2 className="mb-2 h-5 w-5 text-yt-red" />
          <div className="text-2xl font-semibold">{jobs.filter((j) => j.status === 'running').length}</div>
          <div className="text-xs text-yt-muted">Jobs en cours</div>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!busy || !liked.length}
          onClick={() => void cacheTracks('liked', liked)}
          className="rounded-full bg-yt-red px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy === 'liked' ? 'Téléchargement…' : 'Télécharger titres aimés'}
        </button>
        {playlists.slice(0, 6).map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={!!busy}
            onClick={() => {
              void (async () => {
                setBusy(p.id);
                await api.offlineStart('playlist', p.id);
                await cacheTracks(p.id, p.tracks);
              })();
            }}
            className="rounded-full bg-yt-elevated px-4 py-2 text-sm text-yt-muted hover:text-white disabled:opacity-50"
          >
            ↓ {p.name}
          </button>
        ))}
      </div>

      {message && <p className="mb-4 text-sm text-emerald-300">{message}</p>}

      {jobs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl font-semibold">Jobs serveur</h2>
          <div className="space-y-2">
            {jobs.slice(0, 8).map((j) => (
              <div key={j.id} className="rounded-lg bg-yt-elevated px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span>
                    {j.kind} · {j.target_id}
                  </span>
                  <span className="text-yt-muted">
                    {j.progress}/{j.total} · {j.status}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-yt-border">
                  <div
                    className="h-full bg-yt-red"
                    style={{ width: `${j.total ? (j.progress / j.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Disponibles hors-ligne</h2>
        {liked
          .filter((t) => localIds.includes(t.id) || downloaded.includes(t.id))
          .map((t) => (
            <TrackRow key={t.id} track={t} queue={liked} />
          ))}
        {!liked.some((t) => localIds.includes(t.id) || downloaded.includes(t.id)) && (
          <p className="text-sm text-yt-muted">Aucun titre en cache pour l’instant.</p>
        )}
      </section>
    </div>
  );
}
