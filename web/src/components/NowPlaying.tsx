import { useEffect, useMemo, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { ListMusic, Mic2, Radio, Repeat, Repeat1, Save, Shuffle, Sparkles } from 'lucide-react';
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

/** Avance légère : la ligne s’allume juste avant le chant (feel YTM). */
const LYRIC_LEAD_SEC = 0.28;

/** LRC uniquement — pas de faux timings sur texte brut (ça décale / n’arrête pas). */
function parseLrcLines(raw: string | null): LyricLine[] {
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
  return timed.filter((l) => l.text.trim());
}

export function SyncedLyrics({
  text,
  timed,
}: {
  text: string | null;
  timed?: { startMs: number; text: string }[] | null;
}) {
  const audioEl = usePlayer((s) => s.audioEl);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const seek = usePlayer((s) => s.seek);
  const [clock, setClock] = useState(0);

  const lines = useMemo(() => {
    if (timed?.length) {
      return timed.map((l) => ({ t: l.startMs / 1000, text: l.text }));
    }
    return parseLrcLines(text);
  }, [text, timed]);

  // Horloge = audio réel ; en pause on fige (pas de setInterval qui avance)
  useEffect(() => {
    if (!lines.length) return;
    let raf = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const el = usePlayer.getState().audioEl;
      if (el && Number.isFinite(el.currentTime)) {
        setClock(el.currentTime);
      }
      if (!el?.paused && !el?.ended) {
        raf = requestAnimationFrame(tick);
      }
    };
    // Sync immédiat (seek / ouverture)
    const el = audioEl;
    if (el && Number.isFinite(el.currentTime)) setClock(el.currentTime);
    if (isPlaying) raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [lines.length, isPlaying, audioEl, timed, text]);

  const activeIdx = useMemo(() => {
    if (!lines.length) return -1;
    const t = clock + LYRIC_LEAD_SEC;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= t) idx = i;
      else break;
    }
    return idx;
  }, [lines, clock]);

  const activeRef = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeIdx]);

  // Texte brut sans timings → scroll libre, pas de faux karaoké
  if (!lines.length) {
    return (
      <div className="whitespace-pre-wrap px-2 py-6 text-base leading-8 text-[#c6c6c6] sm:px-4 sm:text-[17px] sm:leading-9">
        {text || 'Paroles indisponibles pour ce titre.'}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-3 py-10 sm:px-6">
      {lines.map((line, i) => {
        const active = i === activeIdx;
        const past = i < activeIdx;
        return (
          <p
            key={`${i}-${line.t}`}
            ref={active ? activeRef : undefined}
            role="button"
            tabIndex={0}
            onClick={() => seek(Math.max(0, line.t))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                seek(Math.max(0, line.t));
              }
            }}
            className={`origin-left cursor-pointer transition-all duration-300 hover:text-white ${
              active
                ? 'scale-[1.02] py-1.5 text-3xl font-extrabold leading-tight text-white underline decoration-yt-red decoration-2 underline-offset-4 sm:text-4xl'
                : past
                  ? 'text-base leading-7 text-white/25 sm:text-lg'
                  : 'text-lg leading-8 text-[#9a9a9a] sm:text-xl sm:leading-9'
            }`}
            title="Aller à cet instant"
          >
            {line.text || '\u00a0'}
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
  const autoRadioLoading = usePlayer((s) => s.autoRadioLoading);
  const related = usePlayer((s) => s.related);
  const playAt = usePlayer((s) => s.playAt);
  const appendRelated = usePlayer((s) => s.appendRelated);
  const loadRelated = usePlayer((s) => s.loadRelated);
  const toggleAutoplay = usePlayer((s) => s.toggleAutoplay);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const topUpAutoplay = usePlayer((s) => s.topUpAutoplay);
  const audioEl = usePlayer((s) => s.audioEl);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const [tab, setTab] = useState<NowPlayingTab>(initialTab);
  const [mediaMode, setMediaMode] = useState<'cover' | 'video'>('cover');
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsTimed, setLyricsTimed] = useState<{ startMs: number; text: string }[] | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [queueVisible, setQueueVisible] = useState(QUEUE_PAGE);
  const [saveOpen, setSaveOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const queueScrollRef = useRef<HTMLDivElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number; atTop: boolean } | null>(null);

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
    let cancelled = false;
    setLyricsLoading(true);
    // Ne pas vider tout de suite → évite flash « indisponible »
    void api
      .lyrics(current.id)
      .then((r) => {
        if (cancelled) return;
        setLyricsText(r.lyrics || null);
        setLyricsTimed(r.timed || null);
      })
      .catch(() => {
        if (cancelled) return;
        setLyricsText(null);
        setLyricsTimed(null);
      })
      .finally(() => {
        if (!cancelled) setLyricsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tab, current?.id]);

  // Charge l’URL vidéo progressive quand on bascule sur « Vidéo »
  useEffect(() => {
    if (!open || mediaMode !== 'video' || !current?.id) return;
    let cancelled = false;
    setVideoLoading(true);
    setVideoError(null);
    setVideoUrl(null);
    void api
      .streamUrl(current.id, 'video')
      .then((r) => {
        if (cancelled) return;
        if (!r.url) throw new Error('URL vidéo vide');
        setVideoUrl(r.url);
      })
      .catch((e) => {
        if (!cancelled) setVideoError(String(e?.message || e || 'Vidéo indisponible'));
      })
      .finally(() => {
        if (!cancelled) setVideoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mediaMode, current?.id]);

  // Sync image+son : vidéo muette calée sur l’audio (pause / seek inclus)
  useEffect(() => {
    if (mediaMode !== 'video' || !videoRef.current || !audioEl) return;
    const v = videoRef.current;
    v.muted = true;
    const sync = () => {
      if (!Number.isFinite(audioEl.currentTime)) return;
      if (Math.abs(v.currentTime - audioEl.currentTime) > 0.4) {
        try {
          v.currentTime = audioEl.currentTime;
        } catch {
          /* ignore seek race */
        }
      }
      if (audioEl.paused || audioEl.ended) {
        if (!v.paused) v.pause();
      } else if (v.paused) {
        void v.play().catch(() => {});
      }
    };
    sync();
    const onPlay = () => void v.play().catch(() => {});
    const onPause = () => v.pause();
    const onSeek = () => {
      try {
        v.currentTime = audioEl.currentTime;
      } catch {
        /* */
      }
    };
    audioEl.addEventListener('play', onPlay);
    audioEl.addEventListener('pause', onPause);
    audioEl.addEventListener('seeked', onSeek);
    audioEl.addEventListener('timeupdate', sync);
    const iv = window.setInterval(sync, 500);
    return () => {
      audioEl.removeEventListener('play', onPlay);
      audioEl.removeEventListener('pause', onPause);
      audioEl.removeEventListener('seeked', onSeek);
      audioEl.removeEventListener('timeupdate', sync);
      window.clearInterval(iv);
      v.pause();
    };
  }, [mediaMode, audioEl, videoUrl, isPlaying]);

  useEffect(() => {
    if (!open) setMediaMode('cover');
  }, [open, current?.id]);

  if (!open || !current) return null;

  const boundary = Math.min(Math.max(userQueueEnd || 0, 0), queue.length);
  const playingUser = queueIndex < boundary;
  /** Titres déjà joués dans la file (cliquables pour y revenir). */
  const playedBefore = queueIndex > 0 ? queue.slice(0, queueIndex) : [];
  const userUpcomingAll = playingUser ? queue.slice(queueIndex + 1, boundary) : [];
  const autoList = autoplay
    ? playingUser
      ? queue.slice(boundary)
      : queue.slice(queueIndex + 1)
    : [];
  const autoVisible = autoList.slice(0, Math.min(queueVisible, QUEUE_MAX));
  const canLoadMoreQueue = autoVisible.length < Math.min(autoList.length, QUEUE_MAX);
  const relatedArtists = uniqueArtists(related);
  const relatedForQueue = related.filter((t) => !queue.some((q) => q.id === t.id)).slice(0, 20);
  const saveTracks = queue.slice(
    0,
    Math.max(boundary, playingUser ? queueIndex + 1 : Math.max(boundary, queueIndex + 1)),
  );

  const onQueueScroll = () => {
    const el = queueScrollRef.current;
    if (!el || !canLoadMoreQueue) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      setQueueVisible((n) => Math.min(QUEUE_MAX, n + QUEUE_PAGE, autoList.length));
    }
  };

  const onPanelTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const el = queueScrollRef.current;
    touchRef.current = {
      x: t.clientX,
      y: t.clientY,
      atTop: !el || el.scrollTop <= 2,
    };
  };

  const onPanelTouchEnd = (e: TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const t = e.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Swipe horizontal → File ↔ Similaires
    if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0 && tab === 'queue') setTab('related');
      else if (dx > 0 && tab === 'related') setTab('queue');
      else if (dx < 0 && tab === 'lyrics') setTab('related');
      else if (dx > 0 && tab === 'lyrics') setTab('queue');
      return;
    }
    // En haut + pull bas → réaffiche le lecteur (cover)
    if (tab === 'queue' && start.atTop && dy > 72 && Math.abs(dy) > Math.abs(dx)) {
      coverRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="fixed inset-0 z-[45] flex flex-col overflow-hidden bg-[#030303] text-white animate-fade-up">
      {/* Ambient blur YTM — derrière tout le contenu */}
      {current && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <img
            src={thumb(current, 240) || undefined}
            alt=""
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-3xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/75 to-[#030303]" />
        </div>
      )}
      <div className="relative mx-auto grid min-h-0 w-full max-w-[1800px] flex-1 grid-cols-1 gap-3 overflow-hidden px-2 pb-[100px] pt-3 sm:px-4 md:grid-cols-[minmax(260px,0.85fr)_minmax(420px,1.25fr)] md:gap-8 md:px-6 lg:grid-cols-[minmax(280px,0.75fr)_minmax(520px,1.35fr)] lg:gap-10 lg:px-10 xl:px-14">
        <div ref={coverRef} className="flex min-h-0 flex-col items-center justify-center overflow-hidden">
          <div className="mb-4 flex rounded-full bg-[#1d1d1d] p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setMediaMode('cover')}
              className={`rounded-full px-5 py-1.5 transition ${
                mediaMode === 'cover' ? 'bg-white/15 text-white' : 'text-yt-muted hover:text-white'
              }`}
            >
              Titre
            </button>
            <button
              type="button"
              onClick={() => setMediaMode('video')}
              className={`rounded-full px-5 py-1.5 transition ${
                mediaMode === 'video' ? 'bg-white/15 text-white' : 'text-yt-muted hover:text-white'
              }`}
            >
              Vidéo
            </button>
          </div>
          <div className="relative aspect-square w-full max-w-[min(88vw,520px)] overflow-hidden rounded-md bg-yt-elevated shadow-[0_20px_60px_rgba(0,0,0,0.65)] lg:max-w-[min(42vw,560px)]">
            {mediaMode === 'cover' ? (
              <CoverImage item={current} size={800} rounded="md" alt={current.title} />
            ) : videoLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-yt-muted">Chargement vidéo…</div>
            ) : videoError ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-yt-muted">
                <CoverImage item={current} size={400} rounded="md" alt={current.title} />
                <p>{videoError}</p>
              </div>
            ) : videoUrl ? (
              <video
                ref={videoRef}
                key={videoUrl}
                src={videoUrl}
                className="h-full w-full object-contain bg-black"
                playsInline
                muted
                preload="auto"
                onLoadedMetadata={() => {
                  const v = videoRef.current;
                  const a = usePlayer.getState().audioEl;
                  if (v && a && Number.isFinite(a.currentTime)) {
                    try {
                      v.currentTime = a.currentTime;
                    } catch {
                      /* */
                    }
                    if (!a.paused) void v.play().catch(() => {});
                  }
                }}
              />
            ) : (
              <CoverImage item={current} size={800} rounded="md" alt={current.title} />
            )}
          </div>
        </div>

        <aside
          className="flex min-h-0 min-w-0 flex-col overflow-hidden md:pt-1"
          onTouchStart={onPanelTouchStart}
          onTouchEnd={onPanelTouchEnd}
        >
          <div className="mb-1 flex border-b border-white/10 text-[11px] font-bold tracking-wider sm:text-xs">
            <TabBtn active={tab === 'queue'} onClick={() => setTab('queue')} icon={<ListMusic className="h-3.5 w-3.5" />}>
              File
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
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
            onScroll={tab === 'queue' ? onQueueScroll : undefined}
          >
            {tab === 'queue' && (
              <div>
                <section>
                    <div className="mb-2 flex items-center justify-end gap-0.5 px-1 pt-0.5">
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
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                          repeat !== 'off' ? 'text-yt-red' : 'text-yt-muted hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {repeat === 'one' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={toggleShuffle}
                        title={shuffle ? 'Aléatoire activé' : 'Aléatoire'}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                          shuffle ? 'text-yt-red' : 'text-yt-muted hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Shuffle className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={saveTracks.length === 0}
                        onClick={() => setSaveOpen(true)}
                        className="flex h-8 w-8 items-center justify-center rounded-full text-yt-muted transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                        title="Enregistrer la file dans une playlist"
                      >
                        <Save className="h-4 w-4" />
                      </button>
                  </div>

                  {playedBefore.length > 0 && (
                    <div className="mb-3">
                      <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-yt-muted">
                        Déjà joués
                      </p>
                      <div className="opacity-70">
                        {playedBefore.map((t, i) => (
                          <TrackRow
                            key={`played-${t.id}-${i}`}
                            track={t}
                            queue={queue}
                            queueIndex={i}
                            hideIndex
                            draggable
                            alwaysActions
                            onPlay={() => void playAt(i)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-yt-muted">
                    En cours
                  </p>
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

                  {userUpcomingAll.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-yt-muted">
                        Ensuite dans ta file
                      </p>
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
                    </div>
                  )}

                  {!playingUser && userUpcomingAll.length === 0 && playedBefore.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-yt-muted">
                      Ta file manuelle est vide — suite en lecture auto.
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
                      const abs = (playingUser ? boundary : queueIndex + 1) + i;
                      return (
                        <TrackRow
                          key={`auto-${t.id}-${abs}`}
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
                    <div className="px-2 py-4 text-center">
                      <p className="text-sm text-yt-muted">
                        {autoRadioLoading
                          ? 'Chargement des suggestions…'
                          : 'Aucune suggestion pour l’instant.'}
                      </p>
                      {!autoRadioLoading && (
                        <button
                          type="button"
                          className="mt-2 text-xs text-yt-red hover:underline"
                          onClick={() => topUpAutoplay()}
                        >
                          Réessayer
                        </button>
                      )}
                    </div>
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
