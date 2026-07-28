import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ListMusic, Mic2, Sparkles } from 'lucide-react';
import { api, thumb, type Track } from '../api';
import { usePlayer } from '../store/player';
import { CoverImage } from './CoverImage';
import { TrackRow } from './TrackRow';
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
      <div className="px-3 py-5 text-[15px] leading-8 text-[#c6c6c6]">
        {text || 'Paroles indisponibles pour ce titre.'}
      </div>
    );
  }

  return (
    <div className="space-y-1 px-3 py-5">
      {lines.map((line, i) => {
        const active = i === activeIdx;
        const past = i < activeIdx;
        return (
          <p
            key={`${i}-${line.t}`}
            ref={active ? activeRef : undefined}
            className={`text-[15px] leading-8 transition-all duration-300 ${
              active
                ? 'scale-[1.02] font-semibold text-white'
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
  const { current, queue, queueIndex, related, playAt, appendRelated, loadRelated, progress, duration } =
    usePlayer();
  const [tab, setTab] = useState<NowPlayingTab>(initialTab);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsTimed, setLyricsTimed] = useState<{ startMs: number; text: string }[] | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [queueVisible, setQueueVisible] = useState(QUEUE_PAGE);
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
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !current?.id) return;
    void loadRelated(current.id);
  }, [open, current?.id, loadRelated]);

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

  const upcomingAll = queue.slice(queueIndex + 1);
  const upcoming = upcomingAll.slice(0, Math.min(queueVisible, QUEUE_MAX));
  const canLoadMoreQueue = upcoming.length < Math.min(upcomingAll.length, QUEUE_MAX);
  const relatedArtists = uniqueArtists(related);
  const relatedForQueue = related.filter((t) => !queue.some((q) => q.id === t.id)).slice(0, 20);

  const onQueueScroll = () => {
    const el = queueScrollRef.current;
    if (!el || !canLoadMoreQueue) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      setQueueVisible((n) => Math.min(QUEUE_MAX, n + QUEUE_PAGE, upcomingAll.length));
    }
  };

  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-[#030303] text-white animate-fade-up">
      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 overflow-hidden px-3 pb-[100px] pt-3 md:grid-cols-[1fr_minmax(300px,400px)] md:gap-10 md:px-8 lg:px-14">
        <div className="flex min-h-0 flex-col items-center justify-center overflow-hidden">
          <div className="mb-5 flex rounded-full bg-[#1d1d1d] p-1 text-xs font-medium">
            <span className="rounded-full bg-white/15 px-5 py-1.5 text-white">Titre</span>
            <span className="rounded-full px-5 py-1.5 text-yt-muted">Vidéo</span>
          </div>
          <div className="relative aspect-square w-full max-w-[min(92vw,560px)] overflow-hidden rounded-md shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
            <CoverImage item={current} size={800} rounded="md" />
          </div>
        </div>

        <aside className="flex min-h-0 flex-col overflow-hidden md:pt-2">
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
                <div className="mb-3 flex items-center justify-between gap-2 px-1 pt-1">
                  <p className="text-xs text-yt-muted">
                    Lecture à partir de :{' '}
                    <span className="font-medium text-white">File d&apos;attente</span>
                  </p>
                  <span className="text-[11px] text-yt-muted">
                    {Math.min(upcomingAll.length, QUEUE_MAX)}/{queue.length}
                  </span>
                </div>
                <div className="mb-1 rounded-md bg-[#ff0033]/18 ring-1 ring-[#ff0033]/55">
                  <TrackRow track={current} queue={queue} index={queueIndex} queueIndex={queueIndex} draggable />
                </div>
                {upcoming.map((t, i) => {
                  const abs = queueIndex + 1 + i;
                  return (
                    <TrackRow
                      key={`up-${t.id}-${abs}`}
                      track={t}
                      index={abs}
                      queue={queue}
                      queueIndex={abs}
                      draggable
                      onPlay={() => void playAt(abs)}
                    />
                  );
                })}
                {canLoadMoreQueue && (
                  <button
                    type="button"
                    className="w-full py-3 text-center text-xs text-yt-muted hover:text-white"
                    onClick={() =>
                      setQueueVisible((n) => Math.min(QUEUE_MAX, n + QUEUE_PAGE, upcomingAll.length))
                    }
                  >
                    Charger plus ({upcoming.length}/{Math.min(upcomingAll.length, QUEUE_MAX)})
                  </button>
                )}
                {upcomingAll.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-yt-muted">
                    Aucun titre à suivre — lance un album ou une playlist.
                  </p>
                )}

                {relatedForQueue.length > 0 && (
                  <section className="mt-6 border-t border-white/10 pt-4">
                    <div className="mb-3 flex items-center justify-between px-1">
                      <h3 className="font-display text-base font-semibold">Similaires</h3>
                      <button
                        type="button"
                        className="text-xs text-yt-muted hover:text-white"
                        onClick={() => appendRelated(relatedForQueue)}
                      >
                        Tout ajouter
                      </button>
                    </div>
                    {relatedForQueue.map((t) => (
                      <TrackRow key={`qrel-${t.id}`} track={t} queue={related} />
                    ))}
                  </section>
                )}
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
                    <TrackRow key={`rel-${t.id}`} track={t} queue={related} />
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
