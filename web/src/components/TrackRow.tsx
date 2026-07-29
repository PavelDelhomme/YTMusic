import { Link, useNavigate } from 'react-router-dom';
import type { Track } from '../api';
import { usePlayer } from '../store/player';
import { GripVertical, Heart, MoreHorizontal, Play, Radio } from 'lucide-react';
import { useLibrary } from '../store/library';
import { useEffect, useState } from 'react';
import { ArtistLinks } from './ArtistLinks';
import { CoverImage } from './CoverImage';
import { formatTrackDuration } from '../lib/time';
import { useItemActions } from '../store/itemActions';

type Props = {
  track: Track;
  index?: number;
  queue?: Track[];
  showAlbum?: boolean;
  /** Remplace le comportement de lecture (ex. file d'attente) */
  onPlay?: () => void;
  /** Index dans la file pour drag & drop */
  queueIndex?: number;
  draggable?: boolean;
  /** Affiche toujours like / radio / ⋮ (file d'attente) */
  alwaysActions?: boolean;
  /** Contexte playlist locale (suppression) */
  playlistId?: string;
  onRemoveFromPlaylist?: () => void;
};

function isPlayable(t: Track) {
  return t.type === 'song' || t.type === 'video' || t.type === 'unknown' || /^[a-zA-Z0-9_-]{11}$/.test(t.id);
}

export function TrackRow({
  track,
  index,
  queue,
  showAlbum,
  onPlay,
  queueIndex,
  draggable,
  alwaysActions,
  playlistId,
  onRemoveFromPlaylist,
}: Props) {
  const play = usePlayer((s) => s.play);
  const startRadio = usePlayer((s) => s.startRadio);
  const moveInQueue = usePlayer((s) => s.moveInQueue);
  const current = usePlayer((s) => s.current);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const { isLiked, toggleLike } = useLibrary();
  const openActions = useItemActions((s) => s.open);
  const [dragging, setDragging] = useState(false);
  const [enriched, setEnriched] = useState<Track>(track);
  const navigate = useNavigate();
  const active = current?.id === track.id;
  const liked = isLiked(track.id);
  const inQueue = typeof queueIndex === 'number';
  const showActions = alwaysActions || inQueue;

  useEffect(() => {
    setEnriched(track);
  }, [track]);

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

  const openMenu = (e?: { stopPropagation?: () => void; preventDefault?: () => void }) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    openActions(enriched, {
      queueIndex,
      playlistId,
      onRemoveFromPlaylist,
    });
  };

  const albumId = enriched.album?.id;
  const albumName = enriched.album?.name;

  return (
    <div
      className={`group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-yt-hover sm:gap-3 sm:px-3 ${
        active ? 'bg-yt-hover/80' : ''
      } ${dragging ? 'opacity-50' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      draggable={Boolean(draggable && typeof queueIndex === 'number')}
      onContextMenu={openMenu}
      onDragStart={(e) => {
        if (typeof queueIndex !== 'number') return;
        setDragging(true);
        e.dataTransfer.setData('text/queue-index', String(queueIndex));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => {
        if (!draggable || typeof queueIndex !== 'number') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        if (!draggable || typeof queueIndex !== 'number') return;
        e.preventDefault();
        const from = Number(e.dataTransfer.getData('text/queue-index'));
        if (!Number.isFinite(from) || from === queueIndex) return;
        moveInQueue(from, queueIndex);
      }}
    >
      {draggable ? (
        <span className="hidden shrink-0 text-yt-muted sm:inline" title="Glisser pour réordonner">
          <GripVertical className="h-4 w-4" />
        </span>
      ) : null}

      {typeof index === 'number' ? (
        <span className="w-6 shrink-0 text-center text-xs tabular-nums text-yt-muted sm:w-7 sm:text-sm">
          {index + 1}
        </span>
      ) : null}

      <button
        type="button"
        onClick={open}
        className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-yt-elevated"
      >
        <CoverImage item={enriched} size={96} rounded="md" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
          <Play className="h-5 w-5 fill-white text-white" />
        </span>
      </button>

      <div className="min-w-0 flex-1 text-left">
        <button type="button" onClick={open} className="w-full text-left">
          <div className={`truncate text-sm font-medium ${active ? 'text-yt-red' : 'text-white'}`}>
            {track.title}
            {active && isPlaying ? (
              <span className="ml-1 text-xs font-normal text-yt-muted">· en lecture</span>
            ) : null}
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

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <span
          className={`mr-1 min-w-[2.5rem] text-right text-xs tabular-nums text-yt-muted ${
            showActions ? 'inline' : 'hidden sm:inline'
          }`}
        >
          {formatTrackDuration(track)}
        </span>
        <button
          type="button"
          title={liked ? 'Retirer des titres aimés' : "J'aime"}
          onClick={(e) => {
            e.stopPropagation();
            void toggleLike(track);
          }}
          className={`rounded-full p-2 text-yt-muted transition hover:text-white ${
            liked || showActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-yt-red text-yt-red' : ''}`} />
        </button>
        {isPlayable(track) && (
          <button
            type="button"
            title="Radio à partir de ce titre"
            onClick={(e) => {
              e.stopPropagation();
              void startRadio({ kind: 'track', id: track.id, seed: track });
            }}
            className={`rounded-full p-2 text-yt-muted transition hover:text-white ${
              showActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            <Radio className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="Plus d'options"
          onClick={openMenu}
          className={`rounded-full p-2 text-yt-muted transition hover:text-white ${
            showActions ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          }`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
