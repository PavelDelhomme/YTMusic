import { CoverImage } from './CoverImage';
import type { Track } from '../api';
import { Library, MoreHorizontal, Pause, Play, Plus } from 'lucide-react';
import type { MouseEvent } from 'react';

/** Carte mix style album : mosaïque 2×2 + play / save / ⋮ (style YTM). */
export function MixCollageCard({
  title,
  tracks,
  onClick,
  busy,
  subtitle = 'Mix',
  saved = false,
  playing = false,
  onSave,
  onMore,
}: {
  title: string;
  tracks: Track[];
  onClick: () => void;
  busy?: boolean;
  subtitle?: string;
  saved?: boolean;
  playing?: boolean;
  onSave?: () => void;
  onMore?: () => void;
}) {
  const covers = tracks.slice(0, 4);
  while (covers.length < 4 && covers.length > 0) {
    covers.push(covers[covers.length % Math.max(1, tracks.length)]!);
  }

  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="group w-36 shrink-0 text-left sm:w-40">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }}
        className="relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-yt-elevated shadow-md ring-1 ring-white/5 transition group-hover:ring-white/20 disabled:opacity-60"
      >
        {covers.length === 0 ? (
          <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-black/40">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-center bg-gradient-to-br from-[#3a3a3a] to-[#1a1a1a] text-lg font-semibold text-white/40"
              >
                {(title.trim().charAt(i % Math.max(1, title.trim().length)) || 'M').toUpperCase()}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-black/40">
            {covers.slice(0, 4).map((t, i) => (
              <div key={`${t.id}-${i}`} className="relative min-h-0 min-w-0 overflow-hidden bg-yt-elevated">
                <CoverImage item={t} size={200} rounded="none" className="h-full w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Play toujours visible mobile ; desktop au hover */}
        <button
          type="button"
          title={playing ? 'Pause / relancer' : 'Lire'}
          disabled={busy}
          onClick={(e) => {
            stop(e);
            onClick();
          }}
          className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full bg-yt-red text-white shadow-lg opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-60"
        >
          {playing ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
        </button>

        <div className="pointer-events-none absolute bottom-2 right-2 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          {onMore && (
            <button
              type="button"
              title="Plus d'options"
              onClick={(e) => {
                stop(e);
                onMore();
              }}
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
          {onSave && (
            <button
              type="button"
              title={saved ? 'Dans la bibliothèque' : 'Enregistrer le mix'}
              disabled={busy || saved}
              onClick={(e) => {
                stop(e);
                if (!saved) onSave();
              }}
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg disabled:opacity-70"
            >
              {saved ? <Library className="h-4 w-4 text-yt-red" /> : <Plus className="h-4 w-4" />}
            </button>
          )}
        </div>

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-medium text-white">
            …
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <button type="button" onClick={onClick} className="block w-full truncate text-left text-sm font-medium hover:underline">
          {title}
        </button>
        <div className="truncate text-xs text-yt-muted">{subtitle}</div>
      </div>
    </div>
  );
}
