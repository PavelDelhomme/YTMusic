import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Track } from '../api';
import { TrackRow } from '../components/TrackRow';
import { ShelfRow } from '../components/MediaCard';
import { CoverImage } from '../components/CoverImage';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { Play, Download, Library, Heart, Radio, Check, UserPlus, UserMinus, Shuffle, ChevronRight } from 'lucide-react';
import { ArtistLinks } from '../components/ArtistLinks';
import { BackButton } from '../components/BackButton';

export function ArtistPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.artist>> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [radio, setRadio] = useState<Track[]>([]);
  const playQueue = usePlayer((s) => s.playQueue);
  const startRadio = usePlayer((s) => s.startRadio);
  const { hasArtist, applyLibrary, liked, albums } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [radioBusy, setRadioBusy] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [showBio, setShowBio] = useState(false);

  const loadArtist = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    setData(null);
    setFollowing(false);
    setShowBio(false);
    api
      .artist(id)
      .then(setData)
      .catch((e) => setError(String(e?.message || e || 'Artiste introuvable')))
      .finally(() => setLoading(false));
    api.artistRadio(id).then((r) => setRadio(r.tracks)).catch(() => setRadio([]));
    api
      .prefs()
      .then((r) => {
        const follows = r.follows || [];
        setFollowing(
          follows.some(
            (f: { artist_id?: string; id?: string }) => f.artist_id === id || f.id === id,
          ),
        );
      })
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    loadArtist();
  }, [loadArtist]);

  if (loading && !data) {
    return (
      <div>
        <BackButton />
        <p className="text-yt-muted">Chargement…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <BackButton />
        <p className="mb-3 text-red-400">{error || 'Artiste introuvable'}</p>
        <button
          type="button"
          className="rounded-full bg-yt-elevated px-4 py-2 text-sm"
          onClick={() => loadArtist()}
        >
          Réessayer
        </button>
      </div>
    );
  }
  const inLib = hasArtist(data.artist.id);
  const artistName = data.artist.name.toLowerCase();
  const matchesArtist = (t: Track) =>
    (t.artists || []).some(
      (a) => a.id === data.artist.id || a.name?.toLowerCase() === artistName,
    );
  const libTracks = liked.filter((t) => matchesArtist(t)).slice(0, 12);
  const libAlbums = albums.filter((t) => matchesArtist(t) || t.id === data.artist.id).slice(0, 12);
  const bio = typeof data.artist.description === 'string' ? data.artist.description.trim() : '';
  // API may still return TextRuns objects if a mapper regresses — never render objects as React children.
  const subscribersLabel =
    typeof data.artist.subscribers === 'string'
      ? data.artist.subscribers
      : data.artist.subscribers &&
          typeof data.artist.subscribers === 'object' &&
          'text' in (data.artist.subscribers as object)
        ? String((data.artist.subscribers as { text?: string }).text || '')
        : '';
  const topSongs = data.songs.slice(0, 10);

  return (
    <div className="animate-fade-up">
      <BackButton />
      <div className="mb-8 flex flex-col items-start gap-6 sm:flex-row sm:items-end">
        <div className="h-40 w-40 shrink-0 shadow-2xl sm:h-52 sm:w-52">
          <CoverImage item={data.artist} size={800} rounded="full" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-yt-muted">Artiste</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{data.artist.name}</h1>
          {subscribersLabel ? <p className="mt-2 text-sm text-yt-muted">{subscribersLabel}</p> : null}
          {bio && (
            <div className="mt-3 max-w-2xl">
              <p className="text-sm leading-relaxed text-yt-muted">
                {showBio || bio.length <= 220 ? bio : `${bio.slice(0, 220).trimEnd()}…`}
              </p>
              {bio.length > 220 && (
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-white hover:underline"
                  onClick={() => setShowBio((v) => !v)}
                >
                  {showBio ? 'Réduire' : 'À propos'}
                </button>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {data.songs[0] && (
              <button
                type="button"
                onClick={() => {
                  void useLibrary.getState().recordEntityPlay({
                    id: data.artist.id,
                    kind: 'artist',
                    title: data.artist.name || data.artist.title,
                    thumbnails: data.artist.thumbnails,
                  });
                  void playQueue(data.songs, 0);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
              >
                <Play className="h-4 w-4 fill-white" /> Lecture
              </button>
            )}
            <button
              type="button"
              disabled={radioBusy}
              onClick={() => {
                setRadioBusy(true);
                void startRadio({
                  kind: 'artist',
                  id: data.artist.id,
                  seed: data.songs[0],
                }).finally(() => setRadioBusy(false));
              }}
              className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white disabled:opacity-60"
              title="Radio artiste — titres similaires liés à cet artiste"
            >
              <Radio className="h-4 w-4" />
              {radioBusy ? 'Radio…' : 'Radio'}
            </button>
            <button
              type="button"
              disabled={followBusy}
              onClick={() => {
                void (async () => {
                  setFollowBusy(true);
                  try {
                    if (following) {
                      await api.unfollowArtist(data.artist.id);
                      setFollowing(false);
                    } else {
                      await api.followArtist(data.artist.id, data.artist.name);
                      setFollowing(true);
                    }
                  } finally {
                    setFollowBusy(false);
                  }
                })();
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm ${
                following
                  ? 'bg-white/10 text-white'
                  : 'bg-yt-elevated text-yt-muted hover:text-white'
              } disabled:opacity-60`}
              title="Suivre pour alimenter les rayons Accueil"
            >
              {following ? <UserMinus className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {following ? 'Abonné' : 'Suivre'}
            </button>
            <button
              type="button"
              disabled={busy || inLib}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const r = await api.saveArtist({
                      id: data.artist.id,
                      name: data.artist.name,
                      title: data.artist.name,
                      subscribers: subscribersLabel || undefined,
                      thumbnails: data.artist.thumbnails,
                      description: bio || undefined,
                      type: 'artist',
                    });
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

      {topSongs.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">Titres les plus écoutés</h2>
            <Link
              to={`/artist/${data.artist.id}/songs`}
              className="inline-flex items-center gap-1 text-sm font-medium text-yt-muted transition hover:text-white"
            >
              Plus
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          {topSongs.map((t, i) => (
            <TrackRow key={t.id} track={t} index={i} queue={data.songs} />
          ))}
        </section>
      )}

      {(libTracks.length > 0 || libAlbums.length > 0) && (
        <section className="mb-8">
          <h2 className="mb-3 font-display text-xl font-semibold">Dans ma bibliothèque</h2>
          {libAlbums.length > 0 && (
            <ShelfRow
              title="Albums enregistrés"
              items={libAlbums.map((a) => ({ ...a, type: 'album' as const }))}
            />
          )}
          {libTracks.map((t, i) => (
            <TrackRow key={`lib-${t.id}`} track={t} index={i} queue={libTracks} />
          ))}
        </section>
      )}

      <ShelfRow title="Albums" items={data.albums.map((a) => ({ ...a, type: 'album' as const }))} />
      <ShelfRow
        title="Singles & EP"
        items={(data.singles || []).map((a) => ({ ...a, type: a.type === 'unknown' ? ('album' as const) : a.type }))}
      />
      <ShelfRow
        title="Apparitions"
        items={(data.featured || []).map((a) => ({
          ...a,
          type: a.type === 'unknown' ? ('album' as const) : a.type,
        }))}
      />
      <ShelfRow title="Vidéos" items={data.videos || []} />
      <ShelfRow title="Playlists" items={(data.playlists || []).map((p) => ({ ...p, type: 'playlist' as const }))} />
      <ShelfRow
        title="Les fans aiment aussi"
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

/** Page dédiée : tous les titres de l’artiste (pas seulement le top 10). */
export function ArtistSongsPage() {
  const { id = '' } = useParams();
  const [artistName, setArtistName] = useState('Artiste');
  const [cover, setCover] = useState<{ thumbnails?: Track['thumbnails']; name?: string; title?: string } | null>(
    null,
  );
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const playQueue = usePlayer((s) => s.playQueue);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setTracks([]);
    api
      .artistSongs(id)
      .then((r) => {
        setArtistName(r.artist?.name || 'Artiste');
        setCover(r.artist || null);
        setTracks(r.tracks || []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="animate-fade-up">
      <BackButton fallback={id ? `/artist/${id}` : '/'} />
      <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end">
        {cover && (
          <div className="h-36 w-36 shrink-0 shadow-2xl sm:h-44 sm:w-44">
            <CoverImage item={{ ...cover, title: artistName }} size={800} rounded="full" />
          </div>
        )}
        <div>
          <p className="text-xs uppercase tracking-widest text-yt-muted">Discographie</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Tous les titres
          </h1>
          <p className="mt-2 text-sm text-yt-muted">
            <Link to={`/artist/${id}`} className="hover:text-white hover:underline">
              {artistName}
            </Link>
            {tracks.length > 0 ? ` · ${tracks.length} titre${tracks.length > 1 ? 's' : ''}` : null}
          </p>
          {tracks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void playQueue(tracks, 0)}
                className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
              >
                <Play className="h-4 w-4 fill-white" /> Lecture
              </button>
              <button
                type="button"
                onClick={() => {
                  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
                  void playQueue(shuffled, 0);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white"
              >
                <Shuffle className="h-4 w-4" /> Aléatoire
              </button>
            </div>
          )}
        </div>
      </div>

      {loading && <p className="text-yt-muted">Chargement des titres…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!loading && !error && tracks.length === 0 && (
        <p className="text-yt-muted">Aucun titre trouvé pour cet artiste.</p>
      )}
      {tracks.map((t, i) => (
        <TrackRow key={`${t.id}-${i}`} track={t} index={i} queue={tracks} showAlbum />
      ))}
    </div>
  );
}

export function AlbumPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.album>> | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [radio, setRadio] = useState<Track[]>([]);
  const playQueue = usePlayer((s) => s.playQueue);
  const startRadio = usePlayer((s) => s.startRadio);
  const { hasAlbum, applyLibrary } = useLibrary();
  const [radioBusy, setRadioBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    setData(null);
    api
      .album(id)
      .then(setData)
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
    api.albumRadio(id).then((r) => setRadio(r.tracks)).catch(() => setRadio([]));
  }, [id]);

  if (loading && !data) {
    return (
      <div>
        <BackButton />
        <p className="text-yt-muted">Chargement…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <BackButton />
        <p className="mb-3 text-red-400">{error || 'Album introuvable'}</p>
        <button
          type="button"
          className="rounded-full bg-yt-elevated px-4 py-2 text-sm"
          onClick={() => {
            setLoading(true);
            setError('');
            void api
              .album(id)
              .then(setData)
              .catch((e) => setError(String(e.message || e)))
              .finally(() => setLoading(false));
          }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <>
      <CollectionHeader
        kind="Album"
        title={data.album.title}
        subtitle={
          <>
            <ArtistLinks
              track={{ artists: data.album.artists }}
              emptyLabel={data.album.year ? null : 'Album'}
            />
            {data.album.year ? (
              <>
                {data.album.artists?.length ? ' · ' : ''}
                {data.album.year}
              </>
            ) : null}
          </>
        }
        cover={data.album}
        tracks={data.tracks}
        inLibrary={hasAlbum(data.album.id)}
        onPlay={() => {
          void useLibrary.getState().recordEntityPlay({
            id: data.album.id,
            kind: 'album',
            title: data.album.title,
            thumbnails: data.album.thumbnails,
            artists: data.album.artists,
          });
          void playQueue(data.tracks, 0);
        }}
        onShuffle={() => {
          void useLibrary.getState().recordEntityPlay({
            id: data.album.id,
            kind: 'album',
            title: data.album.title,
            thumbnails: data.album.thumbnails,
            artists: data.album.artists,
          });
          const shuffled = [...data.tracks].sort(() => Math.random() - 0.5);
          void playQueue(shuffled, 0);
        }}
        onRadio={() => {
          setRadioBusy(true);
          void startRadio({
            kind: 'album',
            id: data.album.id,
            seed: data.tracks.find((t) => t.id?.length === 11) || data.tracks[0],
          }).finally(() => setRadioBusy(false));
        }}
        radioBusy={radioBusy}
        onAddLibrary={async () => {
          if (hasAlbum(data.album.id)) {
            const r = await api.removeAlbum(data.album.id);
            applyLibrary(r.library);
          } else {
            const r = await api.saveAlbum({
              id: data.album.id,
              title: data.album.title,
              year: data.album.year,
              artists: data.album.artists,
              thumbnails: data.album.thumbnails,
              type: 'album',
            });
            applyLibrary(r.library);
          }
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const playQueue = usePlayer((s) => s.playQueue);
  const { isPlaylistLiked, applyLibrary } = useLibrary();

  const loadPlaylist = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    setData(null);
    api
      .playlist(id)
      .then(setData)
      .catch((e) => setError(String(e?.message || e || 'Playlist introuvable')))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadPlaylist();
  }, [loadPlaylist]);

  if (loading && !data) {
    return (
      <div>
        <BackButton />
        <p className="text-yt-muted">Chargement…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <BackButton />
        <p className="mb-3 text-red-400">{error || 'Playlist introuvable'}</p>
        <button
          type="button"
          className="rounded-full bg-yt-elevated px-4 py-2 text-sm"
          onClick={() => loadPlaylist()}
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <CollectionHeader
      kind="Playlist"
      title={data.playlist.title}
      subtitle={[data.playlist.author, data.playlist.trackCount].filter(Boolean).join(' · ') || 'Playlist'}
      cover={data.playlist}
      tracks={data.tracks}
      liked={isPlaylistLiked(data.playlist.id)}
      onPlay={() => {
        void useLibrary.getState().recordEntityPlay({
          id: data.playlist.id,
          kind: 'playlist',
          title: data.playlist.title,
          thumbnails: data.playlist.thumbnails,
        });
        void playQueue(data.tracks, 0);
      }}
      onShuffle={() => {
        void useLibrary.getState().recordEntityPlay({
          id: data.playlist.id,
          kind: 'playlist',
          title: data.playlist.title,
          thumbnails: data.playlist.thumbnails,
        });
        const shuffled = [...data.tracks].sort(() => Math.random() - 0.5);
        void playQueue(shuffled, 0);
      }}
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
        // Aimer la playlist seulement — ne pas copier tous les titres en biblio
        const r = await api.likePlaylist({
          id: data.playlist.id,
          title: data.playlist.title,
          author: data.playlist.author,
          thumbnails: data.playlist.thumbnails,
          type: 'playlist',
        });
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
  onShuffle,
  onRadio,
  radioBusy,
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
  onShuffle?: () => void;
  onRadio?: () => void;
  radioBusy?: boolean;
  onAddLibrary?: () => Promise<void>;
  onOffline?: () => void;
  onLike?: () => Promise<void>;
  inLibrary?: boolean;
  liked?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="animate-fade-up">
      <BackButton />
      <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="h-44 w-44 shrink-0 shadow-2xl sm:h-56 sm:w-56">
          <CoverImage item={{ ...cover, title: cover.title || title }} size={800} rounded="lg" />
        </div>
        <div>
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
            {onShuffle && tracks.length > 1 && (
              <button
                type="button"
                onClick={onShuffle}
                className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white"
              >
                <Shuffle className="h-4 w-4" /> Aléatoire
              </button>
            )}
            {onRadio && (
              <button
                type="button"
                disabled={radioBusy}
                onClick={onRadio}
                className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white disabled:opacity-60"
                title={`Radio ${kind.toLowerCase()} — enchaîne des titres similaires`}
              >
                <Radio className="h-4 w-4" />
                {radioBusy ? 'Radio…' : 'Radio'}
              </button>
            )}
            {onAddLibrary && (
              <button
                type="button"
                disabled={busy}
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
                {inLibrary ? <Check className="h-4 w-4" /> : <Library className="h-4 w-4" />}
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
