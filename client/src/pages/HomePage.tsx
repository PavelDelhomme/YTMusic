import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Shelf, type Track } from '../api';
import { ShelfRow } from '../components/MediaCard';
import { usePlayer } from '../store/player';
import { Play } from 'lucide-react';

export function HomePage() {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [seeds, setSeeds] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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

  const quick = shelves.find((s) => /rapide|pour toi|plus écoutés/i.test(s.title));
  const quickTracks = (quick?.items || []).filter((t) => /^[a-zA-Z0-9_-]{11}$/.test(t.id));

  return (
    <div className="animate-fade-up">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Accueil</h1>
          <p className="mt-1 text-sm text-yt-muted">
            Tes écoutes, playlists et une avalanche de recommandations.
          </p>
        </div>
        {quickTracks.length > 0 && (
          <button
            type="button"
            onClick={() => void playQueue(quickTracks as Track[], 0)}
            className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
          >
            <Play className="h-4 w-4 fill-white" /> Lecture rapide
          </button>
        )}
      </div>

      {loading && <p className="text-yt-muted">Chargement du fil musical…</p>}
      {error && (
        <div className="rounded-xl border border-yt-border bg-yt-elevated p-4 text-sm text-yt-muted">
          Impossible de charger l&apos;accueil : {error}
        </div>
      )}
      {!loading && !error && shelves.length === 0 && (
        <p className="text-yt-muted">Aucun contenu pour le moment. Essaie la recherche.</p>
      )}
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.title} title={shelf.title} items={shelf.items} />
      ))}

      <div ref={sentinel} className="py-8 text-center text-sm text-yt-muted">
        {loadingMore ? 'Chargement…' : hasMore ? 'Fais défiler pour plus de recommandations' : 'Fin du fil — pour l’instant'}
      </div>
    </div>
  );
}
