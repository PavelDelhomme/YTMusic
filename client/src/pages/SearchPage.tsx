import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Track } from '../api';
import { TrackRow } from '../components/TrackRow';
import { MediaCard } from '../components/MediaCard';

const tabs = [
  { id: 'all', label: 'Tout' },
  { id: 'song', label: 'Titres' },
  { id: 'album', label: 'Albums' },
  { id: 'artist', label: 'Artistes' },
  { id: 'playlist', label: 'Playlists' },
  { id: 'video', label: 'Vidéos' },
] as const;

export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const [filter, setFilter] = useState<(typeof tabs)[number]['id']>('all');
  const [data, setData] = useState<{
    topResult: Track | null;
    songs: Track[];
    videos: Track[];
    albums: Track[];
    artists: Track[];
    playlists: Track[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    setError('');
    api
      .search(q, filter)
      .then(setData)
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [q, filter]);

  if (!q) {
    return <p className="text-yt-muted">Tape une recherche dans la barre du haut.</p>;
  }

  return (
    <div className="animate-fade-up">
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">Résultats</h1>
      <p className="mb-4 text-sm text-yt-muted">Pour « {q} »</p>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm transition ${
              filter === t.id ? 'bg-white text-black' : 'bg-yt-elevated text-yt-muted hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-yt-muted">Recherche…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {data && (
        <div className="space-y-8">
          {data.songs.length > 0 && (filter === 'all' || filter === 'song') && (
            <section>
              <h2 className="mb-3 font-display text-xl font-semibold">Titres</h2>
              <div className="space-y-0.5">
                {data.songs.slice(0, filter === 'all' ? 8 : 40).map((t) => (
                  <TrackRow key={t.id} track={t} queue={data.songs} showAlbum />
                ))}
              </div>
            </section>
          )}

          {data.artists.length > 0 && (filter === 'all' || filter === 'artist') && (
            <section>
              <h2 className="mb-3 font-display text-xl font-semibold">Artistes</h2>
              <div className="shelf-scroll">
                {data.artists.map((a) => (
                  <MediaCard key={a.id} item={{ ...a, type: 'artist' }} />
                ))}
              </div>
            </section>
          )}

          {data.albums.length > 0 && (filter === 'all' || filter === 'album') && (
            <section>
              <h2 className="mb-3 font-display text-xl font-semibold">Albums</h2>
              <div className="shelf-scroll">
                {data.albums.map((a) => (
                  <MediaCard key={a.id} item={{ ...a, type: 'album' }} />
                ))}
              </div>
            </section>
          )}

          {data.playlists.length > 0 && (filter === 'all' || filter === 'playlist') && (
            <section>
              <h2 className="mb-3 font-display text-xl font-semibold">Playlists</h2>
              <div className="shelf-scroll">
                {data.playlists.map((p) => (
                  <MediaCard key={p.id} item={{ ...p, type: 'playlist' }} />
                ))}
              </div>
            </section>
          )}

          {data.videos.length > 0 && (filter === 'all' || filter === 'video') && (
            <section>
              <h2 className="mb-3 font-display text-xl font-semibold">Vidéos</h2>
              <div className="space-y-0.5">
                {data.videos.slice(0, 12).map((t) => (
                  <TrackRow key={t.id} track={t} queue={data.videos} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
