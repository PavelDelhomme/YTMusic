import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Shelf, type Track } from '../api';
import { ShelfRow } from '../components/MediaCard';
import { usePlayer } from '../store/player';
import { Pin, Play, Radio } from 'lucide-react';

export function HomePage() {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [seeds, setSeeds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [radios, setRadios] = useState<{ id: string; title: string }[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);
  const playQueue = usePlayer((s) => s.playQueue);
  const seenTitles = useRef(new Set<string>());

  const mergeShelves = useCallback((incoming: Shelf[]) => {
    setShelves((prev) => {
      const next = [...prev];
      for (const s of incoming) {
        let title = s.title;
        let n = 2;
        while (seenTitles.current.has(title)) {
          title = `${s.title} · ${n++}`;
        }
        seenTitles.current.add(title);
        next.push({ ...s, title });
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    seenTitles.current = new Set();
    api
      .home()
      .then((r) => {
        for (const s of r.shelves) seenTitles.current.add(s.title);
        setShelves(r.shelves);
        setSeeds(r.seeds || []);
        setHasMore(r.hasMore !== false);
        setRadios(r.radios || []);
        setPage(0);
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const r = await api.homeMore(nextPage, seeds);
      mergeShelves(r.shelves || []);
      setPage(nextPage);
      setHasMore(Boolean(r.hasMore));
    } catch (e) {
      console.error(e);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, seeds, mergeShelves]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const pinned = shelves.find((s) => /^épinglé$/i.test(s.title));
  const quick = shelves.find((s) => /rapide|pour toi|plus écoutés/i.test(s.title));
  const quickTracks = (quick?.items || []).filter((t) => /^[a-zA-Z0-9_-]{11}$/.test(t.id));

  const startRadio = async (id: string) => {
    try {
      const r = await api.recoRadio(id);
      if (r.tracks?.length) void playQueue(r.tracks, 0);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Accueil</h1>
          <p className="mt-1 text-sm text-yt-muted">
            Épingles, écoutes et recommandations hybrides — pour toi.
          </p>
        </div>
        {quickTracks.length > 0 && (
          <button
            type="button"
            onClick={() => {
              // Mélange préférentiel : départ aléatoire dans le pool « pour toi »
              const pool = [...quickTracks];
              for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
              }
              void playQueue(pool as Track[], 0);
            }}
            className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
          >
            <Play className="h-4 w-4 fill-white" /> Lecture rapide
          </button>
        )}
      </div>

      {pinned && pinned.items.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Pin className="h-4 w-4 text-yt-muted" />
            <h2 className="font-display text-lg font-semibold">Épinglé</h2>
          </div>
          <ShelfRow title="" items={pinned.items} />
        </section>
      )}

      {radios.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Radio className="h-4 w-4 text-yt-muted" />
            <h2 className="font-display text-lg font-semibold">Radios</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {radios.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void startRadio(r.id)}
                className="rounded-full bg-yt-elevated px-4 py-2 text-sm text-yt-muted transition hover:bg-yt-hover hover:text-white"
              >
                {r.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {loading && <p className="text-yt-muted">Chargement du fil musical…</p>}
      {error && (
        <div className="rounded-xl border border-yt-border bg-yt-elevated p-4 text-sm text-yt-muted">
          Impossible de charger l&apos;accueil : {error}
        </div>
      )}
      {!loading && !error && shelves.length === 0 && (
        <p className="text-yt-muted">Aucun contenu pour le moment. Essaie la recherche.</p>
      )}
      {shelves
        .filter((s) => !/^épinglé$/i.test(s.title))
        .map((shelf) => (
          <ShelfRow key={shelf.title} title={shelf.title} items={shelf.items} />
        ))}

      <div ref={sentinel} className="py-8 text-center text-sm text-yt-muted">
        {loadingMore
          ? 'Chargement…'
          : hasMore
            ? 'Fais défiler pour plus de recommandations'
            : 'Fin du fil — pour l’instant'}
      </div>
    </div>
  );
}
