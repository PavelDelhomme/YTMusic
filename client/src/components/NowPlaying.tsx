import {
  Cast,
  ChevronDown,
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
  X,
} from 'lucide-react';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useSession } from '../store/session';
import { ArtistLinks } from './ArtistLinks';
import { CoverImage } from './CoverImage';
import { TrackRow } from './TrackRow';
import { useNavigate } from 'react-router-dom';

function fmt(s: number) {
  if (!Number.isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function NowPlaying({
  open,
  onClose,
  onOpenDevices,
}: {
  open: boolean;
  onClose: () => void;
  onOpenDevices?: () => void;
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
    queue,
    queueIndex,
    related,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    toggleLyrics,
    playAt,
    appendRelated,
    showLyrics,
    lyrics,
  } = usePlayer();
  const { isLiked, toggleLike } = useLibrary();
  const navigate = useNavigate();
  const isActivePlayer = useSession((s) => s.isActivePlayer);

  if (!open || !current) return null;

  const upcoming = queue.slice(queueIndex + 1);
  const goArtist = (id: string) => {
    onClose();
    navigate(`/artist/${id}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a] text-white animate-fade-up">
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-yt-muted hover:bg-yt-hover hover:text-white"
          aria-label="Réduire"
        >
          <ChevronDown className="h-6 w-6" />
        </button>
        <div className="text-center text-xs uppercase tracking-widest text-yt-muted">
          En écoute
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-yt-muted hover:bg-yt-hover hover:text-white md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="hidden w-10 md:block" />
      </div>

      <div className="mx-auto grid min-h-0 w-full max-w-7xl flex-1 grid-cols-1 gap-6 overflow-hidden px-4 pb-6 md:grid-cols-[1.2fr_0.9fr] md:px-8">
        {/* Left: big player */}
        <div className="flex min-h-0 flex-col items-center justify-center gap-6 overflow-y-auto py-2">
          <div className="relative w-full max-w-md aspect-square overflow-hidden rounded-2xl shadow-2xl shadow-black/60 md:max-w-lg">
            <CoverImage item={current} size={800} rounded="lg" />
          </div>

          <div className="w-full max-w-md text-center md:max-w-lg md:text-left">
            <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight sm:text-3xl md:text-4xl">
              {current.title}
            </h1>
            <div className="mt-2 text-base text-yt-muted sm:text-lg">
              <ArtistLinks
                track={current}
                className="text-yt-muted"
                onArtistClick={(id) => goArtist(id)}
              />
            </div>
          </div>

          <div className="w-full max-w-md md:max-w-lg">
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
            <div className="mt-1 flex justify-between text-xs text-yt-muted">
              <span>{fmt(progress)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          <div className="flex w-full max-w-md items-center justify-between md:max-w-lg">
            <button
              type="button"
              onClick={toggleShuffle}
              className={`rounded-full p-3 ${shuffle ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            >
              <Shuffle className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => void prev()} className="rounded-full p-3 text-white">
              <SkipBack className="h-7 w-7 fill-white" />
            </button>
            <button
              type="button"
              onClick={toggle}
              disabled={isLoading}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-lg transition hover:scale-105 disabled:opacity-60"
            >
              {isPlaying ? (
                <Pause className="h-8 w-8 fill-black" />
              ) : (
                <Play className="h-8 w-8 fill-black" />
              )}
            </button>
            <button type="button" onClick={() => void next()} className="rounded-full p-3 text-white">
              <SkipForward className="h-7 w-7 fill-white" />
            </button>
            <button
              type="button"
              onClick={cycleRepeat}
              className={`rounded-full p-3 ${repeat !== 'off' ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            >
              {repeat === 'one' ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex w-full max-w-md items-center justify-between gap-3 md:max-w-lg">
            <button
              type="button"
              onClick={() => void toggleLike(current)}
              className="rounded-full p-2 text-yt-muted hover:text-white"
            >
              <Heart className={`h-5 w-5 ${isLiked(current.id) ? 'fill-yt-red text-yt-red' : ''}`} />
            </button>
            <div className="flex flex-1 items-center gap-2">
              <Volume2 className="h-4 w-4 text-yt-muted" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="progress-range w-full"
              />
            </div>
            <button
              type="button"
              onClick={onOpenDevices}
              className={`rounded-full p-2 ${!isActivePlayer ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            >
              <Cast className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => void toggleLyrics()}
              className={`rounded-full p-2 ${showLyrics ? 'text-yt-red' : 'text-yt-muted hover:text-white'}`}
            >
              <Mic2 className="h-5 w-5" />
            </button>
          </div>

          {showLyrics && (
            <div className="max-h-40 w-full max-w-md overflow-y-auto whitespace-pre-wrap rounded-xl bg-yt-elevated/80 p-4 text-sm leading-relaxed text-yt-muted md:max-w-lg">
              {lyrics || 'Paroles indisponibles.'}
            </div>
          )}
        </div>

        {/* Right: queue + related */}
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-yt-border bg-yt-surface/80 md:flex">
          <div className="flex items-center gap-2 border-b border-yt-border px-4 py-3">
            <ListMusic className="h-4 w-4 text-yt-red" />
            <h2 className="font-display text-sm font-semibold">File d&apos;attente</h2>
            <span className="ml-auto text-xs text-yt-muted">{queue.length} titres</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="mb-2 px-2 text-[11px] uppercase tracking-wide text-yt-muted">
              En cours
            </div>
            <div className="mb-4 rounded-lg ring-1 ring-yt-red/40">
              <TrackRow track={current} queue={queue} index={queueIndex} />
            </div>
            {upcoming.length > 0 && (
              <>
                <div className="mb-2 px-2 text-[11px] uppercase tracking-wide text-yt-muted">
                  À suivre
                </div>
                {upcoming.map((t, i) => (
                  <div key={`up-${t.id}-${i}`}>
                    <TrackRow
                      track={t}
                      index={queueIndex + 1 + i}
                      queue={queue}
                      onPlay={() => void playAt(queueIndex + 1 + i)}
                    />
                  </div>
                ))}
              </>
            )}

            {related.length > 0 && (
              <section className="mt-6 border-t border-yt-border pt-4">
                <div className="mb-2 flex items-center justify-between px-2">
                  <h3 className="font-display text-sm font-semibold">Similaires</h3>
                  <button
                    type="button"
                    className="text-xs text-yt-muted hover:text-white"
                    onClick={() => appendRelated(related)}
                  >
                    Tout ajouter
                  </button>
                </div>
                {related.slice(0, 15).map((t) => (
                  <TrackRow key={`rel-${t.id}`} track={t} queue={related} />
                ))}
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
