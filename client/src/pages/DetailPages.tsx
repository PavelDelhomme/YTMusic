import { useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Track } from '../api';
import { TrackRow } from '../components/TrackRow';
import { ShelfRow } from '../components/MediaCard';
import { CoverImage } from '../components/CoverImage';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { Play, Download, Library, Heart } from 'lucide-react';
import { ArtistLinks } from '../components/ArtistLinks';

export function ArtistPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.artist>> | null>(null);
  const [radio, setRadio] = useState<Track[]>([]);
  const playQueue = usePlayer((s) => s.playQueue);
  const { hasArtist, applyLibrary } = useLibrary();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setData(null);
    api.artist(id).then(setData).catch(console.error);
    api.artistRadio(id).then((r) => setRadio(r.tracks)).catch(() => setRadio([]));
  }, [id]);

  if (!data) return <p className="text-yt-muted">Chargement…</p>;
  const inLib = hasArtist(data.artist.id);

  return (
    <div className="animate-fade-up">
      <div className="mb-8 flex flex-col items-start gap-6 sm:flex-row sm:items-end">
        <div className="h-40 w-40 shrink-0 shadow-2xl sm:h-52 sm:w-52">
          <CoverImage item={data.artist} size={800} rounded="full" />
        </div>        <div>
          <p className="text-xs uppercase tracking-widest text-yt-muted">Artiste</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{data.artist.name}</h1>
          {data.artist.subscribers && <p className="mt-2 text-sm text-yt-muted">{data.artist.subscribers}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {data.songs[0] && (
              <button
                type="button"
                onClick={() => void playQueue(data.songs, 0)}
                className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
              >
                <Play className="h-4 w-4 fill-white" /> Lecture
              </button>
            )}
            <button
              type="button"
              disabled={busy || inLib}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const r = await api.import({ kind: 'artist', id: data.artist.id });
                    applyLibrary(r.library);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white disabled:opacity-60"
            >
              <Library className="h-4 w-4" />
              {inLib ? 'Dans la bibliothèque' : 'Ajouter artiste'}
            </button>
            <button
              type="button"
              onClick={() => void api.offlineStart('artist', data.artist.id)}
              className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white"
            >
              <Download className="h-4 w-4" /> Offline
            </button>
          </div>
        </div>
      </div>

      {data.songs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl font-semibold">Titres les plus écoutés</h2>
          {data.songs.slice(0, 10).map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} queue={data.songs} />
          ))}
        </section>
      )}

      <ShelfRow title="Albums" items={data.albums.map((a) => ({ ...a, type: 'album' as const }))} />
      <ShelfRow
        title="Singles & EP"
        items={(data.singles || []).map((a) => ({ ...a, type: a.type === 'unknown' ? ('album' as const) : a.type }))}
      />
      <ShelfRow title="Vidéos" items={data.videos || []} />
      <ShelfRow title="Playlists" items={(data.playlists || []).map((p) => ({ ...p, type: 'playlist' as const }))} />
      <ShelfRow
        title="Artistes similaires"
        items={(data.similar || []).map((a) => ({ ...a, type: 'artist' as const }))}
      />

      {radio.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">Radio artiste</h2>
          {radio.slice(0, 12).map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} queue={radio} />
          ))}
        </section>
      )}
    </div>
  );
}

export function AlbumPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.album>> | null>(null);
  const [radio, setRadio] = useState<Track[]>([]);
  const playQueue = usePlayer((s) => s.playQueue);
  const { hasAlbum, applyLibrary } = useLibrary();

  useEffect(() => {
    if (!id) return;
    api.album(id).then(setData).catch(console.error);
    api.albumRadio(id).then((r) => setRadio(r.tracks)).catch(() => setRadio([]));
  }, [id]);

  if (!data) return <p className="text-yt-muted">Chargement…</p>;

  return (
    <>
      <CollectionHeader
        kind="Album"
        title={data.album.title}
        subtitle={
          <>
            <ArtistLinks track={{ artists: data.album.artists }} />
            {data.album.year ? ` · ${data.album.year}` : ''}
          </>
        }
        cover={data.album}
        tracks={data.tracks}
        inLibrary={hasAlbum(data.album.id)}
        onPlay={() => void playQueue(data.tracks, 0)}
        onAddLibrary={async () => {
          const r = await api.import({ kind: 'album', id: data.album.id });
          applyLibrary(r.library);
        }}
        onOffline={() => void api.offlineStart('album', data.album.id)}
      />
      {radio.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-xl font-semibold">Similaires à cet album</h2>
          {radio.slice(0, 15).map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} queue={radio} />
          ))}
        </section>
      )}
    </>
  );
}

export function PlaylistPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.playlist>> | null>(null);
  const playQueue = usePlayer((s) => s.playQueue);
  const { isPlaylistLiked, applyLibrary } = useLibrary();

  useEffect(() => {
    if (!id) return;
    api.playlist(id).then(setData).catch(console.error);
  }, [id]);

  if (!data) return <p className="text-yt-muted">Chargement…</p>;

  return (
    <CollectionHeader
      kind="Playlist"
      title={data.playlist.title}
      subtitle={[data.playlist.author, data.playlist.trackCount].filter(Boolean).join(' · ')}
      cover={data.playlist}
      tracks={data.tracks}
      liked={isPlaylistLiked(data.playlist.id)}
      onPlay={() => void playQueue(data.tracks, 0)}
      onLike={async () => {
        const r = await api.likePlaylist({
          id: data.playlist.id,
          title: data.playlist.title,
          author: data.playlist.author,
          thumbnails: data.playlist.thumbnails,
          type: 'playlist',
        });
        applyLibrary(r.library);
      }}
      onAddLibrary={async () => {
        const r = await api.import({ kind: 'playlist', id: data.playlist.id });
        applyLibrary(r.library);
      }}
      onOffline={() => void api.offlineStart('playlist', data.playlist.id)}
    />
  );
}

function CollectionHeader({
  kind,
  title,
  subtitle,
  cover,
  tracks,
  onPlay,
  onAddLibrary,
  onOffline,
  onLike,
  inLibrary,
  liked,
}: {
  kind: string;
  title: string;
  subtitle: ReactNode;
  cover: { thumbnails?: Track['thumbnails']; title?: string; name?: string };
  tracks: Track[];
  onPlay: () => void;
  onAddLibrary?: () => Promise<void>;
  onOffline?: () => void;
  onLike?: () => Promise<void>;
  inLibrary?: boolean;
  liked?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="animate-fade-up">
      <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="h-44 w-44 shrink-0 shadow-2xl sm:h-56 sm:w-56">
          <CoverImage item={{ ...cover, title: cover.title || title }} size={800} rounded="lg" />
        </div>        <div>
          <p className="text-xs uppercase tracking-widest text-yt-muted">{kind}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-2 text-sm text-yt-muted">{subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onPlay}
              className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
            >
              <Play className="h-4 w-4 fill-white" /> Lecture
            </button>
            {onAddLibrary && (
              <button
                type="button"
                disabled={busy || inLibrary}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      await onAddLibrary();
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
                className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white disabled:opacity-60"
              >
                <Library className="h-4 w-4" />
                {inLibrary ? 'Dans la bibliothèque' : 'Ajouter à la bibliothèque'}
              </button>
            )}
            {onLike && (
              <button
                type="button"
                onClick={() => void onLike()}
                className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white"
              >
                <Heart className={`h-4 w-4 ${liked ? 'fill-yt-red text-yt-red' : ''}`} />
                J'aime
              </button>
            )}
            {onOffline && (
              <button
                type="button"
                onClick={onOffline}
                className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white"
                title="Télécharger hors-ligne"
              >
                <Download className="h-4 w-4" /> Offline
              </button>
            )}
          </div>
        </div>
      </div>
      {tracks.map((t, i) => (
        <TrackRow key={`${t.id}-${i}`} track={t} index={i} queue={tracks} showAlbum />
      ))}
    </div>
  );
}
