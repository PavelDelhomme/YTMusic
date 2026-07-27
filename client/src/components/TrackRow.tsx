import { Link, useNavigate } from 'react-router-dom';
import type { Track } from '../api';
import { api } from '../api';
import { usePlayer } from '../store/player';
import {
  Disc3,
  Heart,
  Library,
  ListEnd,
  ListPlus,
  MoreHorizontal,
  Play,
  Radio,
  User,
} from 'lucide-react';
import { useLibrary } from '../store/library';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArtistLinks } from './ArtistLinks';
import { CoverImage } from './CoverImage';

type Props = {
  track: Track;
  index?: number;
  queue?: Track[];
  showAlbum?: boolean;
  /** Remplace le comportement de lecture (ex. file d'attente) */
  onPlay?: () => void;
};

function isPlayable(t: Track) {
  return t.type === 'song' || t.type === 'video' || t.type === 'unknown' || /^[a-zA-Z0-9_-]{11}$/.test(t.id);
}

export function TrackRow({ track, index, queue, showAlbum, onPlay }: Props) {
  const play = usePlayer((s) => s.play);
  const addNext = usePlayer((s) => s.addNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const startMix = usePlayer((s) => s.startMix);
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const { isLiked, toggleLike, playlists, addToPlaylist, hasAlbum, applyLibrary } = useLibrary();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enriched, setEnriched] = useState<Track>(track);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const active = current?.id === track.id;
  const liked = isLiked(track.id);

  useEffect(() => {
    setEnriched(track);
  }, [track]);

  // Enrichit album / artistes à l'ouverture du menu si manquants
  useEffect(() => {
    if (!menu || !isPlayable(track)) return;
    if (enriched.album?.id && enriched.artists?.some((a) => a.id)) return;
    let cancelled = false;
    void api
      .track(track.id)
      .then(({ track: meta }) => {
        if (cancelled || !meta) return;
        setEnriched((prev) => ({
          ...prev,
          ...meta,
          ...prev,
          artists: prev.artists?.some((a) => a.id) ? prev.artists : meta.artists,
          album: prev.album?.id ? prev.album : meta.album,
          thumbnails: prev.thumbnails?.length ? prev.thumbnails : meta.thumbnails,
        }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [menu, track.id]);

  const open = () => {
    if (onPlay) {
      onPlay();
      return;
    }
    if (track.type === 'artist') navigate(`/artist/${track.id}`);
    else if (track.type === 'album') navigate(`/album/${track.id}`);
    else if (track.type === 'playlist') navigate(`/playlist/${track.id}`);
    else void play(track, queue);
  };

  const close = () => setMenu(false);

  const addToLibrary = async () => {
    setBusy(true);
    try {
      const albumId = enriched.album?.id;
      if (albumId && !hasAlbum(albumId)) {
        const r = await api.import({ kind: 'album', id: albumId });
        applyLibrary(r.library);
      } else if (isPlayable(track)) {
        const r = await api.import({ kind: 'track', id: track.id });
        applyLibrary(r.library);
      }
    } finally {
      setBusy(false);
      close();
    }
  };

  const artistsWithId = enriched.artists?.filter((a) => a.id) || [];
  const albumId = enriched.album?.id;
  const albumName = enriched.album?.name;

  return (
    <div
      className={`group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-yt-hover ${
        active ? 'bg-yt-hover/80' : ''
      }`}
    >
      <button
        type="button"
        onClick={open}
        className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-yt-elevated"
      >
        <CoverImage item={enriched} size={96} rounded="md" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
          <Play className="h-5 w-5 fill-white text-white" />
        </span>
        {typeof index === 'number' && (
          <span className="pointer-events-none absolute left-[-1.6rem] hidden w-6 text-center text-sm text-yt-muted sm:block">
            {index + 1}
          </span>
        )}
      </button>

      <div className="min-w-0 text-left">
        <button type="button" onClick={open} className="w-full text-left">
          <div className={`truncate text-sm font-medium ${active ? 'text-yt-red' : 'text-white'}`}>
            {track.title}
            {active && isPlaying ? ' · ' : ''}
            {active && isPlaying && <span className="text-yt-muted">en lecture</span>}
          </div>
        </button>
        <div className="truncate text-xs text-yt-muted">
          <ArtistLinks track={enriched} />
          {showAlbum && albumName ? (
            <>
              {' · '}
              {albumId ? (
                <Link
                  to={`/album/${albumId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="hover:underline hover:text-white"
                >
                  {albumName}
                </Link>
              ) : (
                albumName
              )}
            </>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-2 hidden text-xs text-yt-muted sm:inline">{track.duration || ''}</span>
        <button
          type="button"
          title={liked ? 'Retirer des titres aimés' : "J'aime"}
          onClick={(e) => {
            e.stopPropagation();
            void toggleLike(track);
          }}
          className={`rounded-full p-2 text-yt-muted transition hover:text-white ${
            liked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-yt-red text-yt-red' : ''}`} />
        </button>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Plus d'options"
            onClick={(e) => {
              e.stopPropagation();
              setMenu((v) => !v);
            }}
            className="rounded-full p-2 text-yt-muted opacity-100 transition hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                }}
                aria-label="Fermer"
              />
              <div
                className="absolute right-0 z-50 mt-1 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-yt-border bg-yt-elevated py-1 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {isPlayable(track) && (
                  <>
                    <MenuItem
                      icon={<ListPlus className="h-4 w-4" />}
                      label="Lire ensuite"
                      onClick={() => {
                        addNext(track);
                        close();
                      }}
                    />
                    <MenuItem
                      icon={<ListEnd className="h-4 w-4" />}
                      label="Ajouter à la file"
                      onClick={() => {
                        addToQueue(track);
                        close();
                      }}
                    />
                    <MenuItem
                      icon={<Radio className="h-4 w-4" />}
                      label="Démarrer un mix"
                      onClick={() => {
                        void startMix(track);
                        close();
                      }}
                    />
                    <Divider />
                    {!liked && (
                      <MenuItem
                        icon={<Heart className="h-4 w-4" />}
                        label="Ajouter aux titres aimés"
                        onClick={() => {
                          void toggleLike(track);
                          close();
                        }}
                      />
                    )}
                    {liked && (
                      <MenuItem
                        icon={<Heart className="h-4 w-4 fill-yt-red text-yt-red" />}
                        label="Retirer des titres aimés"
                        onClick={() => {
                          void toggleLike(track);
                          close();
                        }}
                      />
                    )}
                    <MenuItem
                      icon={<Library className="h-4 w-4" />}
                      label={
                        albumId && !hasAlbum(albumId)
                          ? "Ajouter l'album à la bibliothèque"
                          : 'Ajouter à la bibliothèque'
                      }
                      disabled={busy}
                      onClick={() => void addToLibrary()}
                    />
                    {playlists.length > 0 && (
                      <>
                        <Divider />
                        <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-yt-muted">
                          Ajouter à une playlist
                        </div>
                        {playlists.map((p) => (
                          <MenuItem
                            key={p.id}
                            label={p.name}
                            onClick={() => {
                              void addToPlaylist(p.id, track);
                              close();
                            }}
                          />
                        ))}
                      </>
                    )}
                    <Divider />
                  </>
                )}

                {albumId && (
                  <MenuItem
                    icon={<Disc3 className="h-4 w-4" />}
                    label="Accéder à l'album"
                    sub={albumName}
                    onClick={() => {
                      close();
                      navigate(`/album/${albumId}`);
                    }}
                  />
                )}
                {artistsWithId.map((a) => (
                  <MenuItem
                    key={a.id}
                    icon={<User className="h-4 w-4" />}
                    label={`Accéder à ${a.name}`}
                    onClick={() => {
                      close();
                      navigate(`/artist/${a.id}`);
                    }}
                  />
                ))}
                {!isPlayable(track) && track.type === 'album' && (
                  <MenuItem
                    icon={<Disc3 className="h-4 w-4" />}
                    label="Ouvrir l'album"
                    onClick={() => {
                      close();
                      navigate(`/album/${track.id}`);
                    }}
                  />
                )}
                {!isPlayable(track) && track.type === 'artist' && (
                  <MenuItem
                    icon={<User className="h-4 w-4" />}
                    label="Ouvrir l'artiste"
                    onClick={() => {
                      close();
                      navigate(`/artist/${track.id}`);
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-yt-border/80" />;
}

function MenuItem({
  icon,
  label,
  sub,
  onClick,
  disabled,
}: {
  icon?: ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-yt-hover disabled:cursor-default disabled:opacity-40"
      onClick={onClick}
    >
      {icon ? <span className="mt-0.5 shrink-0 text-yt-muted">{icon}</span> : <span className="w-4" />}
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {sub ? <span className="block truncate text-xs text-yt-muted">{sub}</span> : null}
      </span>
    </button>
  );
}
