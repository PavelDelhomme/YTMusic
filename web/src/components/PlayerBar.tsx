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
  const transferHere = useSession((s) => s.transferHere);
  const activeName = devices.find((d) => d.id === activePlayerId)?.name;

  const [muted, setMuted] = useState(false);
  const [uiPlaying, setUiPlaying] = useState(isPlaying);
  const prevVol = useRef(volume);
  const footerRef = useRef<HTMLElement | null>(null);

  // Icône play/pause = état réel de l’élément <audio> (touches média / MPRIS)
  useEffect(() => {
    const el = audioEl;
    if (!el) {
      setUiPlaying(isPlaying);
      return;
    }
    const sync = () => setUiPlaying(!el.paused && !el.ended);
    sync();
    el.addEventListener('play', sync);
    el.addEventListener('playing', sync);
    el.addEventListener('pause', sync);
    el.addEventListener('ended', sync);
    return () => {
      el.removeEventListener('play', sync);
      el.removeEventListener('playing', sync);
      el.removeEventListener('pause', sync);
      el.removeEventListener('ended', sync);
    };
  }, [audioEl, isPlaying, queueIndex]);

  /** Publie la hauteur réelle du lecteur pour positionner la nav bas (évite chevauchement). */
  useEffect(() => {
    const clear = () => document.documentElement.style.setProperty('--ytm-player-h', '0px');
    if (!current) {
      clear();
      return;
    }
    const el = footerRef.current;
    if (!el) {
      clear();
      return;
    }
    const publish = () => {
      document.documentElement.style.setProperty('--ytm-player-h', `${el.offsetHeight}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      clear();
    };
  }, [current, isActivePlayer, activeName]);

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
      const v = prevVol.current > 0 ? prevVol.current : 0.7;
      setVolume(v);
      setMuted(false);
    } else {
      prevVol.current = volume;
      setVolume(0);
      setMuted(true);
    }
  };

  const listenHere = (e: SyntheticEvent) => {
    stop(e);
    transferHere();
    useSession.setState({ isActivePlayer: true });
    void toggle();
  };

  return (
    <footer
      ref={footerRef}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-yt-border bg-[#0a0a0a]/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={() => expand('queue')}
    >
      {/* Seek */}
      <div
        className="group relative h-5 cursor-pointer px-0"
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
        <div
          className="flex items-center justify-center gap-2 border-b border-yt-border/60 px-3 py-1 text-[11px] text-yt-muted"
          onClick={stop}
        >
          <span className="truncate">
            Sur <span className="text-white">{activeName}</span>
          </span>
          <button
            type="button"
            onClick={listenHere}
            className="shrink-0 rounded-full bg-yt-red px-2.5 py-0.5 text-[11px] font-medium text-white"
          >
            Écouter ici
          </button>
        </div>
      )}

      {/* —— Mobile (< sm) : 2 lignes lisibles —— */}
      <div className="px-2 pb-1.5 pt-1 sm:hidden">
        <div className="flex items-center gap-2">
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md">
            <CoverImage item={current} size={96} rounded="md" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold leading-tight text-white">{current.title}</div>
            <div className="truncate text-[11px] text-yt-muted" onClick={stop}>
              <ArtistLinks track={current} />
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              void toggleLike(current);
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-yt-muted"
            title="J'aime"
          >
            <Heart className={`h-5 w-5 ${isLiked(current.id) ? 'fill-yt-red text-yt-red' : ''}`} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              openActions(current, { queueIndex });
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-yt-muted"
            title="Plus d'options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-1" onClick={stop}>
          <span className="w-10 text-[10px] tabular-nums text-yt-muted">{formatClock(progress)}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                void prev();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white"
              aria-label="Titre précédent"
            >
              <SkipBack className="h-6 w-6 fill-white" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                toggle();
              }}
              disabled={isLoading}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black disabled:opacity-60"
              aria-label={uiPlaying ? 'Pause' : 'Lecture'}
            >
              {uiPlaying ? <Pause className="h-6 w-6 fill-black" /> : <Play className="h-6 w-6 fill-black" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                void next();
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white"
              aria-label="Titre suivant"
            >
              <SkipForward className="h-6 w-6 fill-white" />
            </button>
          </div>
          <span className="w-10 text-right text-[10px] tabular-nums text-yt-muted">
            {formatClock(effectiveDuration)}
          </span>
        </div>
      </div>

      {/* —— Desktop / tablette (≥ sm) —— */}
      <div className="mx-auto hidden max-w-[1600px] items-center gap-3 px-3 py-2.5 sm:flex md:gap-4 md:px-5 md:py-3">
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5" onClick={stop} onPointerDown={stop}>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              void prev();
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
            aria-label="Titre précédent"
          >
            <SkipBack className="h-6 w-6 fill-white" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              toggle();
            }}
            disabled={isLoading}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black transition hover:scale-105 disabled:opacity-60"
            aria-label={uiPlaying ? 'Pause' : 'Lecture'}
          >
            {uiPlaying ? <Pause className="h-6 w-6 fill-black" /> : <Play className="h-6 w-6 fill-black" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              void next();
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/10"
            aria-label="Titre suivant"
          >
            <SkipForward className="h-6 w-6 fill-white" />
          </button>
          <span className="ml-2 whitespace-nowrap text-xs tabular-nums text-yt-muted">
            {formatClock(progress)} / {formatClock(effectiveDuration)}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md md:h-14 md:w-14">
            <CoverImage item={current} size={120} rounded="md" />
          </div>
          <div className="min-w-0 max-w-[min(420px,36vw)]">
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

        <div className="relative flex shrink-0 items-center justify-end gap-1 sm:gap-1.5" onClick={stop}>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              title={muted || volume === 0 ? 'Réactiver le son' : 'Couper le son'}
              aria-label={muted || volume === 0 ? 'Réactiver le son' : 'Couper le son'}
              onClick={(e) => {
                stop(e);
                toggleMute();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-yt-muted hover:bg-white/10 hover:text-white"
            >
              {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  setMuted(v === 0);
                  if (v > 0) prevVol.current = v;
                }}
                onPointerDown={stop}
                onClick={stop}
                className="progress-range h-1.5 w-16 cursor-pointer accent-[#ff0033] sm:w-24 md:w-28"
                aria-label="Volume"
              />
              <span className="hidden w-8 tabular-nums text-[11px] text-yt-muted md:inline">
                {Math.round((muted ? 0 : volume) * 100)}
              </span>
            </div>
          </div>
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
              className={`flex h-11 w-11 items-center justify-center rounded-full ${!isActivePlayer ? 'text-yt-red' : 'text-yt-muted hover:bg-white/10 hover:text-white'}`}
              title="Cast"
            >
              <Cast className="h-5 w-5" />
            </button>
          )}
          {onCollapse && expanded && (
            <button
              type="button"
              onClick={onCollapse}
              className="flex h-11 w-11 items-center justify-center rounded-full text-yt-muted hover:bg-white/10 hover:text-white"
              title="Réduire"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </footer>
  );
}
