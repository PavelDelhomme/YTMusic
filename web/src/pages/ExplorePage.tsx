import { useEffect, useRef, useState } from 'react';
import { api, type Shelf, type Track } from '../api';
import { ShelfRow } from '../components/MediaCard';
import { usePlayer } from '../store/player';
import { Loader2, Radio } from 'lucide-react';

type RadioCat = { id: string; title: string };

type RadioShelf = Shelf & { id: string };

export function ExplorePage() {
  const [ytShelves, setYtShelves] = useState<Shelf[]>([]);
  const [radioShelves, setRadioShelves] = useState<RadioShelf[]>([]);
  const [radios, setRadios] = useState<RadioCat[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRadios, setLoadingRadios] = useState(false);
  const [pendingRadios, setPendingRadios] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);
  const playQueue = usePlayer((s) => s.playQueue);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    setLoading(true);
    setError('');
    setRadioShelves([]);
    setPendingRadios([]);

    (async () => {
      try {
        const r = await api.explore();
        if (cancelled.current) return;
        setYtShelves(r.shelves || []);
        const cats = r.radios?.length
          ? r.radios
          : (await api.recoRadios().catch(() => ({ radios: [] as RadioCat[] }))).radios || [];
        setRadios(cats);
        setLoading(false);

        // Radios une par une (preview light) — page utilisable tout de suite
        if (!cats.length) return;
        setLoadingRadios(true);
        setPendingRadios(cats.map((c) => c.id));
        for (const cat of cats) {
          if (cancelled.current) return;
          try {
            const mix = await api.recoRadio(cat.id, { preview: true });
            if (cancelled.current) return;
            const items = (mix.tracks || []).slice(0, 12);
            if (items.length) {
              setRadioShelves((prev) => {
                if (prev.some((s) => s.id === cat.id)) return prev;
                return [...prev, { id: cat.id, title: `Radio · ${cat.title}`, items }];
              });
            }
          } catch {
            /* radio individuelle KO → on continue */
          } finally {
            if (!cancelled.current) {
              setPendingRadios((prev) => prev.filter((id) => id !== cat.id));
            }
          }
        }
        if (!cancelled.current) setLoadingRadios(false);
      } catch (e) {
        if (!cancelled.current) {
          setError(String((e as Error).message || e));
          setLoading(false);
          setLoadingRadios(false);
        }
      }
    })();

    return () => {
      cancelled.current = true;
    };
  }, []);

  const startRadio = async (id: string) => {
    setStartingId(id);
    setError('');
    try {
      const r = await api.recoRadio(id);
      if (r.tracks?.length) void playQueue(r.tracks, 0);
      else setError('Aucun titre pour cette radio.');
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setStartingId(null);
    }
  };

  const playShelf = (items: Track[]) => {
    const playable = items.filter((t) => /^[a-zA-Z0-9_-]{11}$/.test(t.id));
    if (playable.length) void playQueue(playable, 0);
  };

  return (
    <div className="animate-fade-up">
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">Explorer</h1>
      <p className="mb-6 text-sm text-yt-muted">
        Radios automatiques + nouveautés YouTube — chargement progressif.
      </p>

      {radios.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Radio className="h-4 w-4 text-yt-muted" />
            <h2 className="font-display text-lg font-semibold">Lancer une radio</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {radios.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={startingId === r.id}
                onClick={() => void startRadio(r.id)}
                className="rounded-full bg-yt-elevated px-4 py-2 text-sm text-yt-muted transition hover:bg-yt-hover hover:text-white disabled:opacity-60"
              >
                {startingId === r.id ? '…' : r.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {loading && (
        <div className="flex items-center gap-2 py-12 text-sm text-yt-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement d’Explorer…
        </div>
      )}

      {!loading &&
        radioShelves.map((shelf) => (
          <div key={shelf.id} className="relative">
            <div className="mb-[-0.5rem] flex justify-end px-1">
              <button
                type="button"
                onClick={() => playShelf(shelf.items)}
                className="text-xs text-yt-muted hover:text-white"
              >
                Tout lire
              </button>
            </div>
            <ShelfRow title={shelf.title} items={shelf.items} />
          </div>
        ))}

      {!loading && pendingRadios.length > 0 && (
        <div className="mb-8 space-y-4">
          {pendingRadios.slice(0, 2).map((id) => {
            const title = radios.find((r) => r.id === id)?.title || id;
            return (
              <div key={id} className="rounded-xl bg-yt-elevated/40 px-4 py-6">
                <div className="mb-3 flex items-center gap-2 text-sm text-yt-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Radio · {title}
                </div>
                <div className="flex gap-3 overflow-hidden">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-28 w-28 shrink-0 animate-pulse rounded-lg bg-yt-border/60"
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {loadingRadios && pendingRadios.length > 2 && (
            <p className="text-xs text-yt-muted">
              +{pendingRadios.length - 2} radio{pendingRadios.length - 2 > 1 ? 's' : ''} en
              cours…
            </p>
          )}
        </div>
      )}

      {!loading &&
        ytShelves.map((shelf) => (
          <ShelfRow key={`yt-${shelf.title}`} title={shelf.title} items={shelf.items} />
        ))}

      {!loading && !ytShelves.length && !radioShelves.length && !pendingRadios.length && !error && (
        <p className="text-sm text-yt-muted">Rien à afficher pour le moment.</p>
      )}
    </div>
  );
}
