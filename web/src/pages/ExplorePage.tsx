import { useEffect, useState } from 'react';
import { api, type Shelf } from '../api';
import { ShelfRow } from '../components/MediaCard';
import { usePlayer } from '../store/player';
import { Radio } from 'lucide-react';

export function ExplorePage() {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [radios, setRadios] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState('');
  const playQueue = usePlayer((s) => s.playQueue);

  useEffect(() => {
    api
      .explore()
      .then((r) => {
        setShelves(r.shelves);
        setRadios(r.radios || []);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const startRadio = async (id: string) => {
    try {
      const r = await api.recoRadio(id);
      if (r.tracks?.length) void playQueue(r.tracks, 0);
    } catch (e) {
      setError(String((e as Error).message || e));
    }
  };

  return (
    <div className="animate-fade-up">
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">Explorer</h1>
      <p className="mb-6 text-sm text-yt-muted">
        Radios automatiques (focus, sport, chill…) + nouveautés scorées.
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
                onClick={() => void startRadio(r.id)}
                className="rounded-full bg-yt-elevated px-4 py-2 text-sm text-yt-muted transition hover:bg-yt-hover hover:text-white"
              >
                {r.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <p className="text-sm text-yt-muted">{error}</p>}
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.title} title={shelf.title} items={shelf.items} />
      ))}
    </div>
  );
}
