import { useEffect, useState } from 'react';
import { usePlayer } from '../store/player';
import { TrackRow } from './TrackRow';
import { SaveQueueSheet } from './SaveQueueSheet';
import { Radio, Save, X } from 'lucide-react';

export function QueuePanel() {
  const showQueue = usePlayer((s) => s.showQueue);
  const showLyrics = usePlayer((s) => s.showLyrics);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const userQueueEnd = usePlayer((s) => s.userQueueEnd);
  const autoplay = usePlayer((s) => s.autoplay);
  const lyrics = usePlayer((s) => s.lyrics);
  const related = usePlayer((s) => s.related);
  const toggleQueue = usePlayer((s) => s.toggleQueue);
  const toggleLyrics = usePlayer((s) => s.toggleLyrics);
  const toggleAutoplay = usePlayer((s) => s.toggleAutoplay);
  const topUpAutoplay = usePlayer((s) => s.topUpAutoplay);
  const playAt = usePlayer((s) => s.playAt);
  const appendRelated = usePlayer((s) => s.appendRelated);
  const play = usePlayer((s) => s.play);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    if (!showQueue || !autoplay) return;
    topUpAutoplay();
  }, [showQueue, autoplay, topUpAutoplay, queueIndex]);

  useEffect(() => {
    if (!showQueue && !showLyrics) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (saveOpen) {
        setSaveOpen(false);
        return;
      }
      if (showLyrics) toggleLyrics();
      else toggleQueue();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [showQueue, showLyrics, saveOpen, toggleQueue, toggleLyrics]);

  if (!showQueue && !showLyrics) return null;

  const boundary = Math.min(
    Math.max(userQueueEnd || 0, queueIndex + 1),
    queue.length,
  );
  const userTracks = queue.slice(0, boundary);
  const autoTracks = autoplay ? queue.slice(boundary) : [];

  return (
    <aside className="fixed bottom-[88px] right-0 top-0 z-30 flex w-full max-w-xl flex-col border-l border-yt-border bg-yt-surface shadow-2xl md:static md:bottom-auto md:z-10 md:max-w-lg lg:max-w-xl">
      <div className="flex items-center justify-between gap-2 border-b border-yt-border px-4 py-3">
        <h3 className="min-w-0 truncate font-display text-base font-semibold">
          {showLyrics ? 'Paroles' : "File d'attente"}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          {!showLyrics && (
            <button
              type="button"
              disabled={userTracks.length === 0}
              onClick={() => setSaveOpen(true)}
              className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2.5 py-1.5 text-xs text-white hover:bg-white/14 disabled:opacity-40"
              title="Enregistrer la file"
            >
              <Save className="h-3.5 w-3.5" />
              Enregistrer
            </button>
          )}
          <button
            type="button"
            onClick={() => (showLyrics ? void toggleLyrics() : toggleQueue())}
            className="rounded-full p-1.5 text-yt-muted hover:bg-yt-hover hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {showLyrics ? (
          <div className="whitespace-pre-wrap px-3 py-2 text-base leading-8 text-[#c6c6c6]">
            {lyrics || 'Paroles indisponibles pour ce titre.'}
          </div>
        ) : (
          <>
            <div className="mb-2 px-2 text-xs text-yt-muted">
              {userTracks.length} titre{userTracks.length > 1 ? 's' : ''} dans ta file
            </div>
            {userTracks.map((track, i) => (
              <div
                key={`u-${track.id}-${i}`}
                className={i === queueIndex ? 'rounded-lg ring-1 ring-yt-red/40' : undefined}
              >
                <TrackRow
                  track={track}
                  queue={queue}
                  queueIndex={i}
                  hideIndex
                  draggable
                  alwaysActions
                  onPlay={() => void playAt(i)}
                />
              </div>
            ))}

            <section className="mt-5 border-t border-yt-border pt-4">
              <div className="mb-2 flex items-center justify-between gap-2 px-2">
                <div className="min-w-0">
                  <h4 className="flex items-center gap-2 font-display text-sm font-semibold">
                    <Radio className="h-4 w-4 text-yt-red" /> À suivre
                  </h4>
                  <p className="text-[11px] text-yt-muted">Lecture automatique</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoplay}
                  onClick={() => toggleAutoplay()}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition ${
                    autoplay ? 'bg-yt-red' : 'bg-white/15'
                  }`}
                  title={autoplay ? 'Désactiver la lecture auto' : 'Activer la lecture auto'}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                      autoplay ? 'left-5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {!autoplay && (
                <p className="px-2 py-3 text-center text-xs text-yt-muted">
                  Lecture auto désactivée.
                </p>
              )}

              {autoplay &&
                autoTracks.map((track, i) => {
                  const abs = boundary + i;
                  return (
                    <div key={`a-${track.id}-${abs}`}>
                      <TrackRow
                        track={track}
                        queue={queue}
                        queueIndex={abs}
                        hideIndex
                        draggable
                        alwaysActions
                        onPlay={() => void playAt(abs)}
                      />
                    </div>
                  );
                })}

              {autoplay && autoTracks.length === 0 && related.length > 0 && (
                <>
                  <div className="mb-2 flex items-center justify-between px-2">
                    <span className="text-xs text-yt-muted">Propositions</span>
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
                        hideIndex
                        onPlay={() =>
                          void play(track, [...queue, track], {
                            preserveQueue: true,
                            keepUserBoundary: true,
                          })
                        }
                      />
                    </div>
                  ))}
                </>
              )}

              {autoplay && autoTracks.length === 0 && related.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-yt-muted">
                  Chargement des suggestions…
                </p>
              )}
            </section>
          </>
        )}
      </div>
      <SaveQueueSheet open={saveOpen} tracks={userTracks} onClose={() => setSaveOpen(false)} />
    </aside>
  );
}
