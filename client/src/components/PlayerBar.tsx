import type { SyntheticEvent } from 'react';
import {
  Cast,
  ChevronDown,
  ChevronUp,
  Heart,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useSession } from '../store/session';
import { ArtistLinks } from './ArtistLinks';
import { CoverImage } from './CoverImage';
import type { NowPlayingTab } from './NowPlaying';

function fmt(s: number) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Empêche le clic de remonter jusqu’au footer (qui ouvre le Now Playing). */
function stop(e: SyntheticEvent) {
  e.stopPropagation();
}

export function PlayerBar({
  onOpenDevices,
  onExpand,
  expanded = false,
  onCollapse,
}: {
  onOpenDevices?: () => void;
  onExpand?: (tab?: NowPlayingTab) => void;
  expanded?: boolean;
  onCollapse?: () => void;
}) {
  const {
    current,
    isPlaying,
    isLoading,
    progress,
    duration,
    volume,
    shuffle,
    repeat,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const isActivePlayer = useSession((s) => s.isActivePlayer);
  const devices = useSession((s) => s.devices);
  const activePlayerId = useSession((s) => s.activePlayerId);
  const activeName = devices.find((d) => d.id === activePlayerId)?.name;

  if (!current) {
    return (
      <footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-yt-border bg-black px-4 py-4 text-center text-sm text-yt-muted">
        Sélectionne un titre pour commencer
      </footer>
    );
  }

  const expand = (tab?: NowPlayingTab) => onExpand?.(tab);

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 z-50 cursor-pointer border-t border-white/10 bg-black"
      onClick={() => {
        // Même action que la flèche ↑ : ouvrir À suivre / Paroles / Similaires
        if (expanded) return;
        expand('queue');
      }}
      role="presentation"
    >
      {!isActivePlayer && activeName && (
        <div className="border-b border-yt-border/60 px-3 py-1 text-center text-[11px] text-yt-muted" onClick={stop}>
          Lecture sur <span className="text-white">{activeName}</span> — contrôle distant actif
        </div>
      )}
      <div className="mx-auto grid max-w-[1600px] grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-[1.1fr_1.3fr_1.1fr] md:gap-4 md:px-5 md:py-2.5">
        {/* Prev / play / next / temps — ne pas expand */}
        <div className="flex items-center gap-1 sm:gap-2" onClick={stop}>
          <button type="button" onClick={() => void prev()} className="rounded-full p-2 text-white hover:bg-white/10">
            <SkipBack className="h-5 w-5 fill-white" />
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={isLoading}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:opacity-60"
          >
            {isPlaying ? <Pause className="h-5 w-5 fill-black" /> : <Play className="h-5 w-5 fill-black" />}
          </button>
          <button type="button" onClick={() => void next()} className="rounded-full p-2 text-white hover:bg-white/10">
            <SkipForward className="h-5 w-5 fill-white" />
          </button>
          <span className="ml-1 hidden whitespace-nowrap text-[11px] text-yt-muted sm:inline">
            {fmt(progress)} / {fmt(duration)}
          </span>
        </div>

        {/* Cover / titre / artiste : stop (pas d’expand) ; zones vides du footer → expand */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md md:h-14 md:w-14" onClick={stop} onKeyDown={stop}>
            <CoverImage item={current} size={120} rounded="md" />
          </div>
          <div className="min-w-0 flex-1" onClick={stop} onKeyDown={stop}>
            <div className="truncate text-sm font-medium">{current.title}</div>
            <div className="truncate text-xs text-yt-muted">
              <ArtistLinks track={current} />
              {current.album?.name ? <span className="text-yt-muted"> · {current.album.name}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              void toggleLike(current);
            }}
            className="shrink-0 rounded-full p-2 text-yt-muted hover:text-white"
          >
            <Heart className={`h-4 w-4 ${isLiked(current.id) ? 'fill-yt-red text-yt-red' : ''}`} />
          </button>
        </div>

        {/* Volume, boucle, aléatoire, cast, paroles, file, flèche */}
        <div className="flex items-center justify-end gap-0.5 sm:gap-1" onClick={stop}>
          <div className="mr-1 hidden items-center gap-2 lg:flex">
            <Volume2 className="h-4 w-4 text-yt-muted" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="progress-range w-20"
            />
          </div>
          <button
            type="button"
            onClick={cycleRepeat}
            title={repeat === 'off' ? 'Pas de boucle' : repeat === 'all' ? 'Boucler la file' : 'Boucler le titre'}
            className={`rounded-full p-2 ${repeat !== 'off' ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
          >
            {repeat === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={toggleShuffle}
            className={`rounded-full p-2 ${shuffle ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onOpenDevices}
            className={`rounded-full p-2 ${!isActivePlayer ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            title="Cast"
          >
            <Cast className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => expand('lyrics')}
            className="hidden rounded-full px-2 py-1.5 text-[10px] font-bold tracking-wide text-yt-muted hover:bg-white/10 hover:text-white sm:inline"
            title="Paroles"
          >
            PAROLES
          </button>
          <button
            type="button"
            onClick={() => expand('lyrics')}
            className="rounded-full p-2 text-yt-muted hover:text-white sm:hidden"
            title="Paroles"
          >
            <Mic2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => expand('queue')}
            className="rounded-full p-2 text-yt-muted hover:text-white"
            title="File d'attente"
          >
            <ListMusic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => (expanded ? onCollapse?.() : expand('queue'))}
            className="rounded-full p-2 text-yt-muted hover:text-white"
            title={expanded ? 'Réduire' : 'Agrandir'}
          >
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className="px-0" onClick={stop}>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={progress}
          onChange={(e) => seek(Number(e.target.value))}
          className="progress-range h-1 w-full cursor-pointer appearance-none bg-transparent"
          style={{
            background: `linear-gradient(to right, #ff0033 ${(progress / (duration || 1)) * 100}%, #3a3a3a 0%)`,
          }}
        />
      </div>
    </footer>
  );
}
