import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ListMusic, Mic2, Radio, Save, Sparkles } from 'lucide-react';
import { api, thumb, type Track } from '../api';
import { usePlayer } from '../store/player';
import { CoverImage } from './CoverImage';
import { TrackRow } from './TrackRow';
import { SaveQueueSheet } from './SaveQueueSheet';
import { useNavigate } from 'react-router-dom';

export type NowPlayingTab = 'queue' | 'lyrics' | 'related';

const QUEUE_PAGE = 24;
const QUEUE_MAX = 100;

type LyricLine = { t: number; text: string };

function parseLyricLines(raw: string | null, duration: number): LyricLine[] {
  if (!raw?.trim()) return [];
  const timed: LyricLine[] = [];
  const lrcRe = /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/;
  for (const row of raw.split(/\r?\n/)) {
    const m = row.match(lrcRe);
    if (!m) continue;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0;
    timed.push({ t: min * 60 + sec + frac, text: m[4] || '' });
  }
  if (timed.length > 0) return timed.filter((l) => l.text.trim());

  const plain = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!plain.length) return [];
  const dur = duration > 0 ? duration : Math.max(plain.length * 3, 30);
  return plain.map((text, i) => ({
    t: (i / Math.max(1, plain.length)) * dur,
    text,
  }));
}

function SyncedLyrics({
  text,
  timed,
  progress,
  duration,
}: {
  text: string | null;
  timed?: { startMs: number; text: string }[] | null;
  progress: number;
  duration: number;
}) {
  const lines = useMemo(() => {
    if (timed?.length) {
      return timed.map((l) => ({ t: l.startMs / 1000, text: l.text }));
    }
    return parseLyricLines(text, duration);
  }, [text, timed, duration]);

  const activeIdx = useMemo(() => {
    if (!lines.length) return -1;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= progress + 0.15) idx = i;
      else break;
    }
    return idx;
  }, [lines, progress]);

  const activeRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  if (!lines.length) {
    return (
      <div className="px-2 py-6 text-base leading-8 text-[#c6c6c6] sm:px-4 sm:text-[17px] sm:leading-9">
        {text || 'Paroles indisponibles pour ce titre.'}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 px-2 py-6 sm:px-4">
      {lines.map((line, i) => {
        const active = i === activeIdx;
        const past = i < activeIdx;
        return (
          <p
            key={`${i}-${line.t}`}
            ref={active ? activeRef : undefined}
            className={`text-base leading-8 transition-all duration-300 sm:text-[17px] sm:leading-9 ${
              active
                ? 'scale-[1.01] font-semibold text-white'
                : past
                  ? 'text-white/35'
                  : 'text-[#c6c6c6]'
            }`}
          >
            {line.text}
          </p>
        );
      })}
    </div>
  );
}

export function NowPlaying({
  open,
  onClose,
  initialTab = 'queue',
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: NowPlayingTab;
}) {
  const current = usePlayer((s) => s.current);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const userQueueEnd = usePlayer((s) => s.userQueueEnd);
  const autoplay = usePlayer((s) => s.autoplay);
  const related = usePlayer((s) => s.related);
  const playAt = usePlayer((s) => s.playAt);
  const appendRelated = usePlayer((s) => s.appendRelated);
  const loadRelated = usePlayer((s) => s.loadRelated);
  const toggleAutoplay = usePlayer((s) => s.toggleAutoplay);
  const topUpAutoplay = usePlayer((s) => s.topUpAutoplay);
  const progress = usePlayer((s) => s.progress);
  const duration = usePlayer((s) => s.duration);
  const [tab, setTab] = useState<NowPlayingTab>(initialTab);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsTimed, setLyricsTimed] = useState<{ startMs: number; text: string }[] | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [queueVisible, setQueueVisible] = useState(QUEUE_PAGE);
  const [saveOpen, setSaveOpen] = useState(false);
  const navigate = useNavigate();
  const queueScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (saveOpen) {
        setSaveOpen(false);
        return;
      }
      onClose();
    };
    // Capture : prioritaire sur les raccourcis média / recherche
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, saveOpen]);

  useEffect(() => {
    if (!open || !current?.id) return;
    void loadRelated(current.id);
    if (autoplay) topUpAutoplay();
  }, [open, current?.id, loadRelated, autoplay, topUpAutoplay]);

  useEffect(() => {
    setQueueVisible(QUEUE_PAGE);
  }, [current?.id, queueIndex]);

  useEffect(() => {
    if (!open || tab !== 'lyrics' || !current?.id) return;
    setLyricsLoading(true);
    setLyricsText(null);
    setLyricsTimed(null);
    void api
      .lyrics(current.id)
      .then((r) => {
        setLyricsText(r.lyrics || null);
        setLyricsTimed(r.timed || null);
      })
      .catch(() => {
        setLyricsText(null);
        setLyricsTimed(null);
      })
      .finally(() => setLyricsLoading(false));
  }, [open, tab, current?.id]);

  if (!open || !current) return null;

  const boundary = Math.min(Math.max(userQueueEnd || 0, 0), queue.length);
  const playingUser = queueIndex < boundary;
  const userUpcomingAll = playingUser ? queue.slice(queueIndex + 1, boundary) : [];
  const autoList = autoplay
    ? playingUser
      ? queue.slice(boundary)
      : queue.slice(queueIndex)
    : [];
  const autoVisible = autoList.slice(0, Math.min(queueVisible + (playingUser ? 0 : 1), QUEUE_MAX));
  const canLoadMoreQueue = autoVisible.length < Math.min(autoList.length, QUEUE_MAX);
  const relatedArtists = uniqueArtists(related);
  const relatedForQueue = related.filter((t) => !queue.some((q) => q.id === t.id)).slice(0, 20);
  const userRemaining = playingUser ? 1 + userUpcomingAll.length : 0;
  const saveTracks = queue.slice(0, Math.max(boundary, playingUser ? queueIndex + 1 : boundary));

  const onQueueScroll = () => {
    const el = queueScrollRef.current;
    if (!el || !canLoadMoreQueue) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      setQueueVisible((n) => Math.min(QUEUE_MAX, n + QUEUE_PAGE, autoList.length));
    }
  };

  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-[#030303] text-white animate-fade-up">
      <div className="mx-auto grid min-h-0 w-full max-w-[1800px] flex-1 grid-cols-1 gap-3 overflow-hidden px-2 pb-[100px] pt-3 sm:px-4 md:grid-cols-[minmax(260px,0.85fr)_minmax(420px,1.25fr)] md:gap-8 md:px-6 lg:grid-cols-[minmax(280px,0.75fr)_minmax(520px,1.35fr)] lg:gap-10 lg:px-10 xl:px-14">
        <div className="flex min-h-0 flex-col items-center justify-center overflow-hidden">
          <div className="mb-4 flex rounded-full bg-[#1d1d1d] p-1 text-xs font-medium">
            <span className="rounded-full bg-white/15 px-5 py-1.5 text-white">Titre</span>
            <span className="rounded-full px-5 py-1.5 text-yt-muted">Vidéo</span>
          </div>
          <div className="relative aspect-square w-full max-w-[min(88vw,520px)] overflow-hidden rounded-md bg-yt-elevated shadow-[0_20px_60px_rgba(0,0,0,0.65)] lg:max-w-[min(42vw,560px)]">
            <CoverImage item={current} size={800} rounded="md" alt={current.title} />
          </div>
        </div>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden md:pt-1">
          <div className="mb-2 flex border-b border-white/10 text-[11px] font-bold tracking-wider sm:text-xs">
            <TabBtn active={tab === 'queue'} onClick={() => setTab('queue')} icon={<ListMusic className="h-3.5 w-3.5" />}>
              À suivre
            </TabBtn>
            <TabBtn active={tab === 'lyrics'} onClick={() => setTab('lyrics')} icon={<Mic2 className="h-3.5 w-3.5" />}>
              Paroles
            </TabBtn>
            <TabBtn active={tab === 'related'} onClick={() => setTab('related')} icon={<Sparkles className="h-3.5 w-3.5" />}>
              Similaires
            </TabBtn>
          </div>

          <div
            ref={queueScrollRef}
            className="min-h-0 flex-1 overflow-y-auto"
            onScroll={tab === 'queue' ? onQueueScroll : undefined}
          >
            {tab === 'queue' && (
              <div>
                <section>
                  <div className="mb-3 flex items-center justify-between gap-2 px-1 pt-1">
                    <p className="min-w-0 truncate text-xs text-yt-muted">
                      <span className="font-medium text-white">File d&apos;attente</span>
                      <span className="ml-2 tabular-nums text-yt-muted">
                        {userRemaining} titre{userRemaining > 1 ? 's' : ''}
                      </span>
                    </p>
                    <button
                      type="button"
                      disabled={saveTracks.length === 0}
                      onClick={() => setSaveOpen(true)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/16 disabled:opacity-40"
                      title="Enregistrer la file dans une playlist"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Enregistrer
                    </button>
                  </div>
                  {playingUser ? (
                    <>
                      <div className="mb-1 rounded-md bg-[#ff0033]/18 ring-1 ring-[#ff0033]/55">
                        <TrackRow
                          track={current}
                          queue={queue}
                          queueIndex={queueIndex}
                          hideIndex
                          draggable
                          alwaysActions
                        />
                      </div>
                      {userUpcomingAll.map((t, i) => {
                        const abs = queueIndex + 1 + i;
                        return (
                          <TrackRow
                            key={`user-${t.id}-${abs}`}
                            track={t}
                            queue={queue}
                            queueIndex={abs}
                            hideIndex
                            draggable
                            alwaysActions
                            onPlay={() => void playAt(abs)}
                          />
                        );
                      })}
                    </>
                  ) : (
                    <p className="px-2 py-3 text-center text-xs text-yt-muted">
                      Ta file est terminée — suite en lecture auto.
                    </p>
                  )}
                </section>

                <section className="mt-5 border-t border-white/10 pt-4">
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-2 font-display text-base font-semibold">
                        <Radio className="h-4 w-4 text-yt-red" />
                        À suivre
                      </h3>
                      <p className="mt-0.5 text-[11px] text-yt-muted">
                        Lecture automatique · suggestions
                      </p>
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
                    <p className="px-2 py-4 text-center text-sm text-yt-muted">
                      Lecture auto désactivée — la file s&apos;arrête après tes titres.
                    </p>
                  )}

                  {autoplay &&
                    autoVisible.map((t, i) => {
                      const abs = (playingUser ? boundary : queueIndex) + i;
                      const isCurrent = abs === queueIndex;
                      return (
                        <div
                          key={`auto-${t.id}-${abs}`}
                          className={
                            isCurrent
                              ? 'mb-1 rounded-md bg-[#ff0033]/18 ring-1 ring-[#ff0033]/55'
                              : undefined
                          }
                        >
                          <TrackRow
                            track={t}
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

                  {autoplay && canLoadMoreQueue && (
                    <button
                      type="button"
                      className="w-full py-3 text-center text-xs text-yt-muted hover:text-white"
                      onClick={() =>
                        setQueueVisible((n) => Math.min(QUEUE_MAX, n + QUEUE_PAGE, autoList.length))
                      }
                    >
                      Charger plus ({autoVisible.length} / {Math.min(autoList.length, QUEUE_MAX)})
                    </button>
                  )}

                  {autoplay && autoList.length === 0 && relatedForQueue.length === 0 && (
                    <p className="px-2 py-4 text-center text-sm text-yt-muted">
                      Chargement des suggestions…
                    </p>
                  )}

                  {autoplay && relatedForQueue.length > 0 && autoList.length === 0 && (
                    <div className="mt-2">
                      <div className="mb-2 flex items-center justify-between px-1">
                        <span className="text-xs text-yt-muted">Propositions</span>
                        <button
                          type="button"
                          className="text-xs text-yt-muted hover:text-white"
                          onClick={() => appendRelated(relatedForQueue)}
                        >
                          Tout ajouter
                        </button>
                      </div>
                      {relatedForQueue.map((t) => (
                        <TrackRow key={`qrel-${t.id}`} track={t} queue={related} alwaysActions hideIndex />
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {tab === 'lyrics' &&
              (lyricsLoading ? (
                <div className="px-3 py-5 text-sm text-yt-muted">Chargement des paroles…</div>
              ) : (
                <SyncedLyrics
                  text={lyricsText}
                  timed={lyricsTimed}
                  progress={progress}
                  duration={duration}
                />
              ))}

            {tab === 'related' && (
              <div className="space-y-7 pt-1">
                <section>
                  <div className="mb-3 flex items-center justify-between px-1">
                    <h3 className="font-display text-lg font-semibold">Découvrez également</h3>
                    {related.length > 0 && (
                      <button
                        type="button"
                        className="text-xs text-yt-muted hover:text-white"
                        onClick={() => appendRelated(related)}
                      >
                        Tout ajouter
                      </button>
                    )}
                  </div>
                  {related.length === 0 && (
                    <p className="px-2 text-sm text-yt-muted">Chargement des suggestions…</p>
                  )}
                  {related.slice(0, 20).map((t) => (
                    <TrackRow key={`rel-${t.id}`} track={t} queue={related} hideIndex />
                  ))}
                </section>

                {relatedArtists.length > 0 && (
                  <section className="pb-4">
                    <h3 className="mb-4 px-1 font-display text-lg font-semibold">Artistes similaires</h3>
                    <div className="flex gap-5 overflow-x-auto pb-2">
                      {relatedArtists.map((a) => (
                        <button
                          key={a.id || a.name}
                          type="button"
                          className="flex w-28 shrink-0 flex-col items-center gap-2 text-center"
                          onClick={() => {
                            if (!a.id) return;
                            onClose();
                            navigate(`/artist/${a.id}`);
                          }}
                        >
                          <div className="h-24 w-24 overflow-hidden rounded-full bg-yt-elevated">
                            {a.thumb ? (
                              <img src={a.thumb} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-2xl text-yt-muted">
                                {a.name.slice(0, 1)}
                              </div>
                            )}
                          </div>
                          <span className="line-clamp-2 text-xs font-medium">{a.name}</span>
                          <span className="text-[10px] text-yt-muted">Artiste</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      <SaveQueueSheet
        open={saveOpen}
        tracks={saveTracks}
        onClose={() => setSaveOpen(false)}
      />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-1 py-3 uppercase transition sm:gap-2 sm:px-2 ${
        active ? 'border-white text-white' : 'border-transparent text-yt-muted hover:text-white'
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function uniqueArtists(tracks: Track[]) {
  const seen = new Set<string>();
  const out: { id?: string; name: string; thumb?: string }[] = [];
  for (const t of tracks) {
    for (const a of t.artists || []) {
      const key = a.id || a.name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: a.id, name: a.name, thumb: thumb(t, 200) || undefined });
      if (out.length >= 10) return out;
    }
  }
  return out;
}
