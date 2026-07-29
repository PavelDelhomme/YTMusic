import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Cast,
  Heart,
  MoreVertical,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  ThumbsDown,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '../api';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useSession } from '../store/session';
import { useItemActions } from '../store/itemActions';
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
    queueIndex,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const openActions = useItemActions((s) => s.open);
  const isActivePlayer = useSession((s) => s.isActivePlayer);
  const devices = useSession((s) => s.devices);
  const activePlayerId = useSession((s) => s.activePlayerId);
  const activeName = devices.find((d) => d.id === activePlayerId)?.name;

  const [volOpen, setVolOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const prevVol = useRef(volume);
  const volRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!volOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!volRef.current?.contains(e.target as Node)) setVolOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [volOpen]);

  if (!current) {
    if (compactEmpty) {
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

  const expand = (tab?: NowPlayingTab) => onExpand?.(tab);
  const effectiveDuration =
    duration > 0 ? duration : Number.isFinite(audioEl?.duration) ? Number(audioEl?.duration) : 0;
  const pct = effectiveDuration > 0 ? Math.min(100, Math.max(0, (progress / effectiveDuration) * 100)) : 0;

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

  const toggleMute = () => {
    if (muted || volume === 0) {
      setVolume(prevVol.current || 0.9);
      setMuted(false);
    } else {
      prevVol.current = volume;
      setVolume(0);
      setMuted(true);
    }
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
      <div
        className="group relative h-4 w-full cursor-pointer touch-none"
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
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-[#3a3a3a] transition group-hover:h-1.5">
          <div className="relative h-full bg-[#ff0033]" style={{ width: `${pct}%` }}>
            <span
              className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#ff0033] shadow-[0_0_0_2px_#000] ring-2 ring-[#ff0033]/40 transition group-hover:scale-110"
              aria-hidden
            />
          </div>
        </div>
      </div>

      {!isActivePlayer && activeName && (
        <div className="border-b border-yt-border/60 px-3 py-1 text-center text-[11px] text-yt-muted" onClick={stop}>
          Lecture sur <span className="text-white">{activeName}</span> — contrôle distant actif
        </div>
      )}

      {/* Layout : transport+temps | centre (cover+titre+actions) | volume+repeat+shuffle */}
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2.5 md:gap-4 md:px-5 md:py-3">
        {/* Gauche */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5" onClick={stop}>
          <button type="button" onClick={() => void prev()} className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10" title="Précédent">
            <SkipBack className="h-6 w-6 fill-white" />
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={isLoading}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:opacity-60"
            title={isPlaying ? 'Pause' : 'Lecture'}
          >
            {isPlaying ? <Pause className="h-6 w-6 fill-black" /> : <Play className="h-6 w-6 fill-black" />}
          </button>
          <button type="button" onClick={() => void next()} className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10" title="Suivant">
            <SkipForward className="h-6 w-6 fill-white" />
          </button>
          <span className="ml-2 hidden whitespace-nowrap text-xs tabular-nums text-yt-muted sm:inline">
            {formatClock(progress)} / {formatClock(effectiveDuration)}
          </span>
        </div>

        {/* Centre */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md md:h-14 md:w-14">
            <CoverImage item={current} size={120} rounded="md" />
          </div>
          <div className="min-w-0 max-w-[min(420px,40vw)]">
            <div className="truncate text-sm font-semibold text-white">{current.title}</div>
            <div className="truncate text-xs text-yt-muted" onClick={stop} onKeyDown={stop}>
              <ArtistLinks track={current} />
              {current.album?.name ? <span> — {current.album.name}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              const willLike = !isLiked(current.id);
              void toggleLike(current);
              void api
                .recoFeedback({
                  trackId: current.id,
                  verdict: willLike ? 'good' : 'bad',
                  context: 'player_bar_like',
                })
                .catch(() => undefined);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-yt-muted hover:bg-white/10 hover:text-white"
            title="J'aime"
          >
            <Heart className={`h-5 w-5 ${isLiked(current.id) ? 'fill-yt-red text-yt-red' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              void api
                .recoFeedback({ trackId: current.id, verdict: 'bad', context: 'player_bar' })
                .catch(() => undefined);
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-yt-muted hover:bg-white/10 hover:text-white"
            title="Je n'aime pas"
          >
            <ThumbsDown className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              openActions(current, { queueIndex });
            }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-yt-muted hover:bg-white/10 hover:text-white"
            title="Plus d'options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>

        {/* Droite */}
        <div className="relative flex shrink-0 items-center justify-end gap-1 sm:gap-1.5" onClick={stop} ref={volRef}>
          <button
            type="button"
            title="Volume (clic = mute)"
            onClick={toggleMute}
            onContextMenu={(e) => {
              e.preventDefault();
              stop(e);
              setVolOpen((v) => !v);
            }}
            onDoubleClick={(e) => {
              stop(e);
              setVolOpen((v) => !v);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full text-yt-muted hover:bg-white/10 hover:text-white"
          >
            {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          {volOpen && (
            <div className="absolute bottom-14 right-0 z-50 w-48 rounded-xl border border-white/10 bg-yt-elevated p-4 shadow-xl">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  setMuted(v === 0);
                }}
                className="progress-range w-full"
              />
            </div>
          )}
          <button
            type="button"
            onClick={cycleRepeat}
            title={
              repeat === 'off'
                ? 'Boucle désactivée'
                : repeat === 'all'
                  ? 'Boucler toute la file'
                  : 'Boucler le titre'
            }
            className={`flex h-11 w-11 items-center justify-center rounded-full ${repeat !== 'off' ? 'text-yt-red' : 'text-yt-muted/50 hover:bg-white/10 hover:text-yt-muted'}`}
          >
            {repeat === 'one' ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={toggleShuffle}
            title="Aléatoire"
            className={`flex h-11 w-11 items-center justify-center rounded-full ${shuffle ? 'text-yt-red' : 'text-yt-muted/50 hover:bg-white/10 hover:text-yt-muted'}`}
          >
            <Shuffle className="h-5 w-5" />
          </button>
          {onOpenDevices && (
            <button
              type="button"
              onClick={onOpenDevices}
              className={`hidden h-11 w-11 items-center justify-center rounded-full sm:flex ${!isActivePlayer ? 'text-yt-red' : 'text-yt-muted hover:bg-white/10 hover:text-white'}`}
              title="Cast"
            >
              <Cast className="h-5 w-5" />
            </button>
          )}
          {onCollapse && expanded && (
            <button type="button" onClick={onCollapse} className="flex h-11 w-11 items-center justify-center rounded-full text-yt-muted hover:bg-white/10 hover:text-white" title="Réduire">
              ✕
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
