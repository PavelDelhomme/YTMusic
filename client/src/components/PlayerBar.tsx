import {
  Cast,
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

function fmt(s: number) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function PlayerBar({
  onOpenDevices,
  onExpand,
}: {
  onOpenDevices?: () => void;
  onExpand?: () => void;
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
    toggleQueue,
    toggleLyrics,
    showQueue,
    showLyrics,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const isActivePlayer = useSession((s) => s.isActivePlayer);
  const devices = useSession((s) => s.devices);
  const activePlayerId = useSession((s) => s.activePlayerId);
  const activeName = devices.find((d) => d.id === activePlayerId)?.name;

  if (!current) {
    return (
      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-yt-border bg-yt-surface/95 px-4 py-4 text-center text-sm text-yt-muted backdrop-blur">
        Sélectionne un titre pour commencer
      </footer>
    );
  }

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-yt-border bg-yt-surface/95 backdrop-blur-md">
      {!isActivePlayer && activeName && (
        <div className="border-b border-yt-border/60 px-3 py-1 text-center text-[11px] text-yt-muted">
          Lecture sur <span className="text-white">{activeName}</span> — contrôle distant actif
        </div>
      )}
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-2 px-3 py-2 md:grid-cols-[1fr_1.4fr_1fr] md:gap-4 md:px-4 md:py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div
            role="button"
            tabIndex={0}
            onClick={onExpand}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onExpand?.();
              }
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          >
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md md:h-14 md:w-14">
              <CoverImage item={current} size={120} rounded="md" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{current.title}</div>
              <div
                className="truncate text-xs text-yt-muted"
                onClick={(e) => e.stopPropagation()}
              >
                <ArtistLinks track={current} />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void toggleLike(current)}
            className="shrink-0 rounded-full p-2 text-yt-muted hover:text-white"
          >
            <Heart className={`h-4 w-4 ${isLiked(current.id) ? 'fill-yt-red text-yt-red' : ''}`} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleShuffle}
              className={`rounded-full p-1.5 ${shuffle ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            >
              <Shuffle className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => void prev()} className="rounded-full p-1.5 text-white">
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
            <button type="button" onClick={() => void next()} className="rounded-full p-1.5 text-white">
              <SkipForward className="h-5 w-5 fill-white" />
            </button>
            <button
              type="button"
              onClick={cycleRepeat}
              className={`rounded-full p-1.5 ${repeat !== 'off' ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            >
              {repeat === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex w-full max-w-xl items-center gap-2 text-[11px] text-yt-muted">
            <span className="w-8 text-right">{fmt(progress)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={progress}
              onChange={(e) => seek(Number(e.target.value))}
              className="progress-range w-full"
              style={{
                background: `linear-gradient(to right, #ff0033 ${(progress / (duration || 1)) * 100}%, #3a3a3a 0%)`,
              }}
            />
            <span className="w-8">{fmt(duration)}</span>
          </div>
        </div>

        <div className="hidden items-center justify-end gap-2 md:flex">
          <button
            type="button"
            onClick={onOpenDevices}
            className={`rounded-full p-2 ${!isActivePlayer ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            title="Appareils / Cast"
          >
            <Cast className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void toggleLyrics()}
            className={`rounded-full p-2 ${showLyrics ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            title="Paroles"
          >
            <Mic2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleQueue}
            className={`rounded-full p-2 ${showQueue ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            title="File d'attente"
          >
            <ListMusic className="h-4 w-4" />
          </button>
          <Volume2 className="h-4 w-4 text-yt-muted" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="progress-range w-24"
          />
        </div>
      </div>
    </footer>
  );
}
