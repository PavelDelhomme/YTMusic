import { usePlayer } from '../store/player';
import { TrackRow } from './TrackRow';
import { X, Radio } from 'lucide-react';

export function QueuePanel() {
  const showQueue = usePlayer((s) => s.showQueue);
  const showLyrics = usePlayer((s) => s.showLyrics);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const lyrics = usePlayer((s) => s.lyrics);
  const related = usePlayer((s) => s.related);
  const toggleQueue = usePlayer((s) => s.toggleQueue);
  const toggleLyrics = usePlayer((s) => s.toggleLyrics);
  const playAt = usePlayer((s) => s.playAt);
  const appendRelated = usePlayer((s) => s.appendRelated);
  const play = usePlayer((s) => s.play);

  if (!showQueue && !showLyrics) return null;

  return (
    <aside className="fixed bottom-[88px] right-0 top-0 z-30 flex w-full max-w-md flex-col border-l border-yt-border bg-yt-surface shadow-2xl md:static md:bottom-auto md:z-10 md:max-w-sm">
      <div className="flex items-center justify-between border-b border-yt-border px-4 py-3">
        <h3 className="font-display text-base font-semibold">
          {showLyrics ? 'Paroles' : "File d'attente"}
        </h3>
        <button
          type="button"
          onClick={() => (showLyrics ? void toggleLyrics() : toggleQueue())}
          className="rounded-full p-1.5 text-yt-muted hover:bg-yt-hover hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {showLyrics ? (
          <div className="whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-yt-muted">
            {lyrics || 'Paroles indisponibles pour ce titre.'}
          </div>
        ) : (
          <>
            <div className="mb-2 px-2 text-xs text-yt-muted">{queue.length} titres</div>
            {queue.map((track, i) => (
              <div
                key={`${track.id}-${i}`}
                className={i === queueIndex ? 'rounded-lg ring-1 ring-yt-red/40' : undefined}
              >
                <TrackRow
                  track={track}
                  index={i}
                  queue={queue}
                  onPlay={() => void playAt(i)}
                />
              </div>
            ))}

            {related.length > 0 && (
              <section className="mt-6 border-t border-yt-border pt-4">
                <div className="mb-2 flex items-center justify-between px-2">
                  <h4 className="flex items-center gap-2 font-display text-sm font-semibold">
                    <Radio className="h-4 w-4 text-yt-red" /> Similaires
                  </h4>
                  <button
                    type="button"
                    className="text-xs text-yt-muted hover:text-white"
                    onClick={() => appendRelated(related)}
                  >
                    Ajouter à la file
                  </button>
                </div>
                {related.slice(0, 12).map((track) => (
                  <div key={`rel-${track.id}`}>
                    <TrackRow
                      track={track}
                      queue={related}
                      onPlay={() => void play(track, [...queue, track], { preserveQueue: true })}
                    />
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
