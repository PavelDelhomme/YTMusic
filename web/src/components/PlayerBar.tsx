import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react';
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
import { formatClock } from '../lib/time';
import type { NowPlayingTab } from './NowPlaying';

/** Empêche le clic de remonter jusqu’au footer (qui ouvre le Now Playing). */
function stop(e: SyntheticEvent) {
  e.stopPropagation();
}

export function PlayerBar({
  onOpenDevices,
  onExpand,
  expanded = false,
  onCollapse,
  compactEmpty = false,
}: {
  onOpenDevices?: () => void;
  onExpand?: (tab?: NowPlayingTab) => void;
  expanded?: boolean;
  onCollapse?: () => void;
  /** Masque le bandeau vide sur mobile (nav collée en bas). */
  compactEmpty?: boolean;
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
    audioEl,
    queue,
    queueIndex,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const isActivePlayer = useSession((s) => s.isActivePlayer);
  const devices = useSession((s) => s.devices);
  const activePlayerId = useSession((s) => s.activePlayerId);
  const activeName = devices.find((d) => d.id === activePlayerId)?.name;

  if (!current) {
    if (compactEmpty) {
      // Pas de lecteur fantôme sur mobile : la nav prend le bas d’écran
      return (
        <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 hidden h-0 lg:block" aria-hidden />
      );
    }
    return (
      <footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-yt-border bg-black px-4 py-4 text-center text-sm text-yt-muted">
        Sélectionne un titre pour commencer
      </footer>
    );
  }

  const upcomingCount = Math.max(0, queue.length - queueIndex - 1);
  const expand = (tab?: NowPlayingTab) => onExpand?.(tab);
  const effectiveDuration =
    duration > 0 ? duration : Number.isFinite(audioEl?.duration) ? Number(audioEl?.duration) : 0;
  const pct = effectiveDuration > 0 ? Math.min(100, (progress / effectiveDuration) * 100) : 0;

  const seekFromClientX = (el: HTMLElement, clientX: number) => {
    const dur = effectiveDuration > 0 ? effectiveDuration : Number(audioEl?.duration) || 0;
    if (!(dur > 0)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(ratio * dur);
  };

  const onSeekPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    stop(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromClientX(e.currentTarget, e.clientX);
  };

  const onSeekMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    stop(e);
    seekFromClientX(e.currentTarget, e.clientX);
  };

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 z-50 cursor-pointer border-t border-white/10 bg-black"
      onClick={() => {
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
        {/* Prev / play / next / temps */}
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
            {formatClock(progress)} / {formatClock(effectiveDuration)}
          </span>
        </div>

        {/* Cover + titre → expand ; artiste + like → stop */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md md:h-14 md:w-14">
            <CoverImage item={current} size={120} rounded="md" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{current.title}</div>
            <div className="truncate text-xs text-yt-muted" onClick={stop} onKeyDown={stop}>
              <ArtistLinks track={current} />
              {current.album?.name ? <span className="text-yt-muted"> · {current.album.name}</span> : null}
              {upcomingCount > 0 ? (
                <span className="text-yt-muted"> · {upcomingCount} à suivre</span>
              ) : null}
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

      {/* Seek : barre custom (évite le bug range max=0 → seek à 0) */}
      <div
        className="group relative h-3 w-full cursor-pointer px-0"
        onClick={stop}
        onPointerDown={onSeekPointer}
        onPointerMove={onSeekMove}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={effectiveDuration || 0}
        aria-valuenow={progress}
        aria-label="Position du morceau"
        tabIndex={0}
        onKeyDown={(e) => {
          stop(e);
          const dur = effectiveDuration;
          if (!(dur > 0)) return;
          if (e.key === 'ArrowRight') seek(Math.min(dur, progress + 5));
          if (e.key === 'ArrowLeft') seek(Math.max(0, progress - 5));
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-[#3a3a3a]">
          <div className="h-full bg-[#ff0033]" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition group-hover:opacity-100"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
    </footer>
  );
}
