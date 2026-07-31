import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Shelf, type Track } from '../api';
import { ShelfRow } from '../components/MediaCard';
import { MixCollageCard } from '../components/MixCollageCard';
import { usePlayer } from '../store/player';
import { usePins } from '../store/pins';
import { useLibrary } from '../store/library';
import { useItemActions } from '../store/itemActions';
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
  const [radioPreviews, setRadioPreviews] = useState<Record<string, Track[]>>({});
  const [startingRadio, setStartingRadio] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const playQueue = usePlayer((s) => s.playQueue);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const currentId = usePlayer((s) => s.current?.id);
  const pinCount = usePins((s) => s.pins.length);
  const refreshPins = usePins((s) => s.refresh);
  const hasMix = useLibrary((s) => s.hasMix);
  const saveMix = useLibrary((s) => s.saveMix);
  const openActions = useItemActions((s) => s.open);
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
    void refreshPins();
  }, [refreshPins]);

  useEffect(() => {
    setLoading(true);
    seenTitles.current = new Set();
    setRadioPreviews({});
    api
      .home()
      .then(async (r) => {
        for (const s of r.shelves) seenTitles.current.add(s.title);
        setShelves(r.shelves);
        setSeeds(r.seeds || []);
        setHasMore(r.hasMore !== false);
        const cats = r.radios || [];
        setRadios(cats);
        setPage(0);
        setLoading(false);
        // Previews mosaïque (léger) — en parallèle limité
        const previews: Record<string, Track[]> = {};
        await Promise.all(
          cats.slice(0, 8).map(async (cat) => {
            try {
              const mix = await api.recoRadio(cat.id, { preview: true });
              previews[cat.id] = (mix.tracks || []).slice(0, 4);
            } catch {
              /* ignore */
            }
          }),
        );
        setRadioPreviews(previews);
      })
      .catch((e) => {
        setError(String(e.message || e));
        setLoading(false);
      });
  }, [pinCount]);

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
    setStartingRadio(id);
    try {
      const r = await api.recoRadio(id);
      if (r.tracks?.length) void playQueue(r.tracks, 0);
    } catch (e) {
      console.error(e);
    } finally {
      setStartingRadio(null);
    }
  };

  const saveRadioMix = async (id: string, title: string) => {
    try {
      const covers = radioPreviews[id] || [];
      await saveMix({ id, title, covers, tracks: covers });
    } catch (e) {
      console.error(e);
    }
  };

  const openMixMenu = (id: string, title: string) => {
    const covers = radioPreviews[id] || [];
    openActions({
      id,
      title,
      type: 'mix',
      artists: [{ name: 'Mix radio' }],
      thumbnails: covers.flatMap((t) => t.thumbnails || []).slice(0, 4),
      covers,
      tracks: covers,
    } as Track);
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
            <h2 className="font-display text-lg font-semibold">Mixés pour toi</h2>
          </div>
          <div className="shelf-scroll">
            {radios.map((r) => (
              <MixCollageCard
                key={r.id}
                title={r.title}
                tracks={radioPreviews[r.id] || []}
                busy={startingRadio === r.id}
                subtitle="Mix radio"
                saved={hasMix(r.id)}
                playing={
                  isPlaying &&
                  Boolean(currentId) &&
                  (radioPreviews[r.id] || []).some((t) => t.id === currentId)
                }
                onClick={() => void startRadio(r.id)}
                onSave={() => void saveRadioMix(r.id, r.title)}
                onMore={() => openMixMenu(r.id, r.title)}
              />
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
