import { create } from 'zustand';
import { api, artistNames, thumb, type Track } from '../api';
import { resolvePlayUrl } from '../lib/offlineCache';
import { useSession } from './session';
import { useLibrary } from './library';

type RepeatMode = 'off' | 'all' | 'one';

type PlayerState = {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  progress: number;
  duration: number;
  showQueue: boolean;
  showLyrics: boolean;
  lyrics: string | null;
  related: Track[];
  hydrated: boolean;
  play: (track: Track, queue?: Track[], opts?: { preserveQueue?: boolean; noAutoRadio?: boolean }) => Promise<void>;
  playQueue: (tracks: Track[], startIndex?: number) => Promise<void>;
  playAt: (index: number) => Promise<void>;
  toggle: () => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  setProgress: (n: number) => void;
  seek: (n: number) => void;
  setDuration: (n: number) => void;
  setVolume: (n: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleQueue: () => void;
  toggleLyrics: () => void;
  addNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  moveInQueue: (fromIndex: number, toIndex: number) => void;
  removeFromQueue: (index: number) => void;
  appendRelated: (tracks: Track[]) => void;
  clearQueue: () => void;
  startMix: (track: Track) => Promise<void>;
  /** Radio style YTM : depuis un titre, album ou artiste. */
  startRadio: (opts: {
    kind: 'track' | 'album' | 'artist';
    id: string;
    seed?: Track;
    /** Si true, favorise les titres du même artiste (quand kind=track). */
    stayClose?: boolean;
  }) => Promise<void>;
  hydrate: () => Promise<void>;
  applyRemoteState: (state: Partial<PlayerState> & { current?: Track | null }, playAudio?: boolean) => Promise<void>;
  loadRelated: (trackId: string) => Promise<void>;
  audioEl: HTMLAudioElement | null;
  bindAudio: (el: HTMLAudioElement | null) => void;
};

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isPlayable(t: Track) {
  return /^[a-zA-Z0-9_-]{11}$/.test(t.id);
}

function mergeArtists(
  local: Track['artists'] = [],
  remote: Track['artists'] = [],
): Track['artists'] {
  if (!remote.length) return local;
  if (!local.length) return remote;
  return remote.map((r, i) => {
    const l = local.find((x) => x.name.toLowerCase() === r.name.toLowerCase()) || local[i];
    return {
      name: r.name || l?.name || 'Artiste',
      id: r.id || l?.id,
    };
  });
}

function setupMediaSession(
  track: Track,
  handlers: {
    play: () => void;
    pause: () => void;
    next: () => void;
    prev: () => void;
    seek: (time: number) => void;
  },
) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: artistNames(track),
    album: track.album?.name || 'YTMusic',
    artwork: thumb(track, 512)
      ? [
          { src: thumb(track, 96), sizes: '96x96', type: 'image/jpeg' },
          { src: thumb(track, 256), sizes: '256x256', type: 'image/jpeg' },
          { src: thumb(track, 512), sizes: '512x512', type: 'image/jpeg' },
        ]
      : [],
  });
  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      /* ignore */
    }
  };
  set('play', handlers.play);
  set('pause', handlers.pause);
  set('stop', handlers.pause);
  set('previoustrack', handlers.prev);
  set('nexttrack', handlers.next);
  set('seekto', (details) => {
    if (typeof details.seekTime === 'number') handlers.seek(details.seekTime);
  });
  set('seekbackward', (details) => {
    const audio = usePlayer.getState().audioEl;
    if (!audio) return;
    const off = details.seekOffset ?? 10;
    handlers.seek(Math.max(0, audio.currentTime - off));
  });
  set('seekforward', (details) => {
    const audio = usePlayer.getState().audioEl;
    if (!audio) return;
    const off = details.seekOffset ?? 10;
    handlers.seek(Math.min(audio.duration || audio.currentTime + off, audio.currentTime + off));
  });
}

const PLAYER_STORAGE_KEY = 'ytm_player_v1';
/** Conserve un historique court + une longue suite (évite de saturer localStorage). */
const QUEUE_KEEP_BEFORE = 8;
const QUEUE_KEEP_AFTER = 72;

type PersistedPlayer = {
  v?: number;
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  progress: number;
  savedAt?: number;
};

function slimTrack(t: Track): Track {
  const thumbs = (t.thumbnails || []).slice(0, 2);
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    artists: t.artists,
    album: t.album,
    duration: t.duration,
    thumbnails: thumbs,
  };
}

function trimQueueForPersist(queue: Track[], queueIndex: number): { queue: Track[]; queueIndex: number } {
  if (queue.length <= QUEUE_KEEP_BEFORE + 1 + QUEUE_KEEP_AFTER) {
    return { queue: queue.map(slimTrack), queueIndex };
  }
  const start = Math.max(0, queueIndex - QUEUE_KEEP_BEFORE);
  const end = Math.min(queue.length, queueIndex + 1 + QUEUE_KEEP_AFTER);
  return {
    queue: queue.slice(start, end).map(slimTrack),
    queueIndex: queueIndex - start,
  };
}

function loadPersisted(): Partial<PersistedPlayer> {
  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedPlayer;
  } catch {
    return {};
  }
}

function persistPlayer() {
  try {
    const s = usePlayer.getState();
    if (!s.current && (!s.queue || s.queue.length === 0)) {
      localStorage.removeItem(PLAYER_STORAGE_KEY);
      return;
    }

    let progress = s.progress;
    const audio = s.audioEl;
    if (audio && Number.isFinite(audio.currentTime) && audio.currentTime > 0) {
      progress = audio.currentTime;
    }

    const trimmed = trimQueueForPersist(s.queue || [], s.queueIndex || 0);
    const payload: PersistedPlayer = {
      v: 2,
      current: s.current ? slimTrack(s.current) : null,
      queue: trimmed.queue,
      queueIndex: trimmed.queueIndex,
      volume: s.volume,
      shuffle: s.shuffle,
      repeat: s.repeat,
      progress,
      savedAt: Date.now(),
    };

    try {
      localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Quota : garder seulement le titre en cours + 24 suivants
      const qi = Math.max(0, s.queueIndex || 0);
      const q = (s.queue || []).slice(qi, qi + 25).map(slimTrack);
      const compact: PersistedPlayer = {
        v: 2,
        current: s.current ? slimTrack(s.current) : q[0] || null,
        queue: q.length ? q : s.current ? [slimTrack(s.current)] : [],
        queueIndex: 0,
        volume: s.volume,
        shuffle: s.shuffle,
        repeat: s.repeat,
        progress,
        savedAt: Date.now(),
      };
      localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(compact));
    }
  } catch {
    /* private mode / quota */
  }
}

/** Flush immédiat (fermeture onglet / app / arrière-plan). */
export function flushPlayerPersist() {
  persistPlayer();
}

function installPersistLifecycle() {
  if (typeof window === 'undefined') return;
  const flush = () => {
    try {
      persistPlayer();
    } catch {
      /* ignore */
    }
  };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  // PWA / mobile : freeze de la page
  window.addEventListener('freeze', flush);
}

installPersistLifecycle();

function publish() {
  const s = usePlayer.getState();
  useSession.getState().publishState({
    current: s.current,
    queue: s.queue,
    queueIndex: s.queueIndex,
    isPlaying: s.isPlaying,
    progress: s.progress,
    duration: s.duration,
    volume: s.volume,
    shuffle: s.shuffle,
    repeat: s.repeat,
    updatedAt: Date.now(),
  });
  persistPlayer();
  void import('../lib/backgroundAudio')
    .then(({ setNativePlaybackNotification }) =>
      setNativePlaybackNotification({
        playing: s.isPlaying,
        title: s.current?.title,
        artist: s.current ? artistNames(s.current) : 'Lecture en cours',
      }),
    )
    .catch(() => undefined);
}

async function restoreAudioFromPersisted() {
  const { audioEl, current, progress, volume } = usePlayer.getState();
  if (!audioEl || !current || !isPlayable(current)) return;
  // Déjà chargé pour ce titre
  if (audioEl.dataset.trackId === current.id && audioEl.src) return;
  try {
    const src = await resolvePlayUrl(current.id);
    if (audioEl.src.startsWith('blob:')) URL.revokeObjectURL(audioEl.src);
    audioEl.src = src;
    audioEl.dataset.trackId = current.id;
    audioEl.volume = volume;
    const seekTo = progress > 0 ? progress : 0;
    const applySeek = () => {
      try {
        if (seekTo > 0 && Number.isFinite(audioEl.duration) && seekTo < audioEl.duration) {
          audioEl.currentTime = seekTo;
        } else if (seekTo > 0) {
          audioEl.currentTime = seekTo;
        }
      } catch {
        /* ignore */
      }
    };
    if (audioEl.readyState >= 1) applySeek();
    else audioEl.addEventListener('loadedmetadata', applySeek, { once: true });
    void usePlayer.getState().loadRelated(current.id);
  } catch (err) {
    console.error('restore playback', err);
  }
}

function isActivePlayer() {
  return useSession.getState().isActivePlayer;
}

function sendCmd(command: Record<string, unknown>) {
  useSession.getState().sendCommand(command);
}

/** Dès qu'un titre démarre (même 1s) → historique + listen_events */
function recordStarted(track: Track) {
  void useLibrary.getState().recordPlay(track);
  void api
    .listen({ trackId: track.id, event: 'start', progressPct: 0, track })
    .catch(() => undefined);
}

let listenTrackId: string | null = null;
let listenStartedAt = 0;
let lastProgressSent = 0;
let completedForTrack: string | null = null;

export function reportListenProgress(progress: number, duration: number) {
  const current = usePlayer.getState().current;
  if (!current?.id || !duration) return;
  if (listenTrackId !== current.id) {
    listenTrackId = current.id;
    listenStartedAt = Date.now();
    lastProgressSent = 0;
    completedForTrack = null;
  }
  const pct = Math.min(100, (progress / duration) * 100);
  if (pct - lastProgressSent >= 25 && pct < 90) {
    lastProgressSent = pct;
    void api
      .listen({ trackId: current.id, event: 'progress', progressPct: pct })
      .catch(() => undefined);
  }
  if (pct >= 90 && completedForTrack !== current.id) {
    completedForTrack = current.id;
    void api
      .listen({
        trackId: current.id,
        event: 'complete',
        progressPct: pct,
        durationMs: Math.round(duration * 1000),
        track: current,
      })
      .catch(() => undefined);
  }
}

export function reportSkipIfEarly(progress: number) {
  const current = usePlayer.getState().current;
  if (!current?.id) return;
  const elapsed = Date.now() - listenStartedAt;
  if (progress < 15 || elapsed < 15_000) {
    void api
      .listen({
        trackId: current.id,
        event: 'skip',
        progressPct: Math.min(100, (progress / Math.max(1, usePlayer.getState().duration)) * 100),
        durationMs: elapsed,
      })
      .catch(() => undefined);
  }
}

/** Génération pour ignorer les play() obsolètes si l’utilisateur saute vite */
let playGeneration = 0;
const prefetchCache = new Map<string, string>();

async function resolveCachedUrl(trackId: string) {
  const hit = prefetchCache.get(trackId);
  if (hit) return hit;
  const src = await resolvePlayUrl(trackId);
  prefetchCache.set(trackId, src);
  // garder un cache petit
  if (prefetchCache.size > 12) {
    const first = prefetchCache.keys().next().value;
    if (first) prefetchCache.delete(first);
  }
  return src;
}

function prefetchTrack(trackId: string | undefined) {
  if (!trackId || !isPlayable({ id: trackId } as Track)) return;
  if (prefetchCache.has(trackId)) return;
  void resolvePlayUrl(trackId)
    .then((src) => {
      prefetchCache.set(trackId, src);
    })
    .catch(() => undefined);
}

/** Remplit la file avec un radio / similaires si plus rien à suivre (style YTM). */
async function ensureAutoRadio(seedId: string) {
  const cur = usePlayer.getState();
  const upcoming = cur.queue.slice(cur.queueIndex + 1).filter(isPlayable);
  // Vise une file longue (scroll jusqu’à ~100 dans l’UI)
  if (upcoming.length >= 40) {
    prefetchTrack(upcoming[0]?.id);
    return;
  }
  if (!isPlayable({ id: seedId } as Track)) return;
  try {
    const [{ radio, related }, upNext] = await Promise.all([
      api.related(seedId),
      api.upNext(seedId).catch(() => ({ tracks: [] as Track[] })),
    ]);
    const pool = [...(upNext.tracks || []), ...(radio.length ? radio : related)].filter(
      (t) => t.id !== seedId && isPlayable(t),
    );
    if (!pool.length) return;
    const state = usePlayer.getState();
    const remaining = state.queue.slice(state.queueIndex + 1).filter(isPlayable);
    if (remaining.length >= 40) return;
    const existing = new Set(state.queue.map((t) => t.id));
    const extra: Track[] = [];
    for (const t of pool) {
      if (existing.has(t.id)) continue;
      existing.add(t.id);
      extra.push(t);
      if (extra.length >= 80) break;
    }
    if (!extra.length) return;
    const queue = [...state.queue.slice(0, state.queueIndex + 1), ...remaining, ...extra];
    usePlayer.setState({
      queue,
      related: related.length ? related : radio,
    });
    prefetchTrack(extra[0]?.id);
    publish();
  } catch (err) {
    console.warn('auto-radio', err);
  }
}

async function playLocal(track: Track, state: PlayerState, gen: number) {
  const audio = state.audioEl;
  if (!audio) return;

  // Stream d’abord (fluide), métadonnées en parallèle
  const srcPromise = resolveCachedUrl(track.id);
  const metaPromise = api.track(track.id).catch(() => undefined);

  // Enrichissement rapide local (thumbs) pendant le fetch stream
  let enriched = track;
  if (!track.thumbnails?.length && /^[a-zA-Z0-9_-]{11}$/.test(track.id)) {
    enriched = {
      ...track,
      thumbnails: [
        { url: `https://i.ytimg.com/vi/${track.id}/hq720.jpg`, width: 1280, height: 720 },
      ],
    };
    if (gen === playGeneration) usePlayer.setState({ current: enriched });
  }

  const src = await srcPromise;
  if (gen !== playGeneration) return;

  if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
  audio.src = src;
  audio.dataset.trackId = track.id;
  audio.volume = state.volume;
  // démarrer dès que possible
  let playPromise: Promise<void>;
  try {
    playPromise = audio.play();
  } catch {
    return;
  }

  const meta = await metaPromise;
  if (gen !== playGeneration) {
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
    return;
  }
  if (meta?.track) {
    enriched = {
      ...meta.track,
      ...enriched,
      artists: mergeArtists(enriched.artists, meta.track.artists),
      thumbnails:
        enriched.thumbnails?.length
          ? enriched.thumbnails
          : meta.track.thumbnails?.length
            ? meta.track.thumbnails
            : enriched.thumbnails,
    };
    usePlayer.setState({ current: enriched });
  }

  try {
    await playPromise;
  } catch {
    if (gen !== playGeneration) return;
    throw new Error('Lecture bloquée ou interrompue');
  }
  if (gen !== playGeneration) return;

  setupMediaSession(enriched, {
    play: () => {
      void audio.play();
      usePlayer.setState({ isPlaying: true });
      publish();
    },
    pause: () => {
      audio.pause();
      usePlayer.setState({ isPlaying: false });
      publish();
    },
    next: () => void usePlayer.getState().next(),
    prev: () => void usePlayer.getState().prev(),
    seek: (time) => {
      audio.currentTime = time;
      usePlayer.setState({ progress: time });
      publish();
    },
  });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
}

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  queueIndex: 0,
  isPlaying: false,
  isLoading: false,
  shuffle: false,
  repeat: 'off',
  volume: 0.9,
  progress: 0,
  duration: 0,
  showQueue: false,
  showLyrics: false,
  lyrics: null,
  related: [],
  hydrated: false,
  audioEl: null,

  bindAudio: (el) => {
    set({ audioEl: el });
    if (el && get().hydrated && get().current) {
      void restoreAudioFromPersisted();
    }
  },

  hydrate: async () => {
    if (get().hydrated) return;
    const saved = loadPersisted();
    const queue = Array.isArray(saved.queue) ? saved.queue : [];
    const queueIndex = Math.min(
      Math.max(0, saved.queueIndex || 0),
      Math.max(0, queue.length - 1),
    );
    const current =
      saved.current ||
      (queue.length ? queue[queueIndex] || queue[0] : null) ||
      null;
    set({
      current,
      queue,
      queueIndex: queue.length ? queueIndex : 0,
      volume: typeof saved.volume === 'number' ? saved.volume : 0.9,
      shuffle: Boolean(saved.shuffle),
      repeat: saved.repeat || 'off',
      progress: typeof saved.progress === 'number' ? saved.progress : 0,
      isPlaying: false,
      hydrated: true,
    });
    await restoreAudioFromPersisted();
  },

  playQueue: async (tracks, startIndex = 0) => {
    const playable = tracks.filter(isPlayable);
    if (!playable.length) return;
    const idx = Math.min(Math.max(0, startIndex), playable.length - 1);
    await get().play(playable[idx], playable, { preserveQueue: true });
  },

  play: async (track, queue, opts) => {
    if (!isActivePlayer()) {
      recordStarted(track);
      sendCmd({
        action: 'play',
        track,
        queue: queue?.length ? queue : [track],
      });
      set({
        current: track,
        queue: queue?.length ? queue : [track],
        queueIndex: Math.max(0, (queue || [track]).findIndex((t) => t.id === track.id)),
        isPlaying: true,
        isLoading: false,
      });
      return;
    }

    const filtered = (queue || []).filter(isPlayable);
    // File = titres jouables seulement ; un seul titre → radio auto ensuite
    const nextQueue = filtered.length ? filtered : [track];
    const idx = Math.max(0, nextQueue.findIndex((t) => t.id === track.id));
    set({
      current: track,
      queue: nextQueue,
      queueIndex: idx >= 0 ? idx : 0,
      isLoading: true,
      progress: 0,
      lyrics: null,
    });

    const gen = ++playGeneration;
    const nextIdx = (idx >= 0 ? idx : 0) + 1;
    if (nextQueue[nextIdx]) prefetchTrack(nextQueue[nextIdx].id);

    try {
      await playLocal(track, get(), gen);
      if (gen !== playGeneration) return;
      recordStarted(get().current || track);
      set({ isPlaying: true, isLoading: false });
      publish();
      void get().loadRelated(track.id);
      // Toujours proposer une suite si la file est courte (1 titre ou fin proche)
      if (!opts?.noAutoRadio) {
        void ensureAutoRadio(track.id);
      }
    } catch (err) {
      console.error(err);
      set({ isLoading: false, isPlaying: false });
      publish();
    }
  },

  playAt: async (index) => {
    const { queue } = get();
    const track = queue[index];
    if (!track) return;
    if (!isActivePlayer()) {
      sendCmd({ action: 'play_at', index });
      set({ queueIndex: index, current: track, isPlaying: true });
      return;
    }
    await get().play(track, queue, { preserveQueue: true });
    set({ queueIndex: index });
    publish();
  },

  toggle: () => {
    if (!isActivePlayer()) {
      const playing = get().isPlaying;
      sendCmd({ action: playing ? 'pause' : 'resume' });
      set({ isPlaying: !playing });
      return;
    }
    const { audioEl, isPlaying, current, queue, progress } = get();
    if (!audioEl) return;
    if (isPlaying) {
      audioEl.pause();
      set({ isPlaying: false });
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      persistPlayer();
    } else {
      const needsLoad =
        !audioEl.src ||
        audioEl.src === window.location.href ||
        (current && audioEl.dataset.trackId !== current.id);
      if (needsLoad && current) {
        void (async () => {
          set({ isLoading: true });
          try {
            await restoreAudioFromPersisted();
            if (progress > 0) {
              try {
                audioEl.currentTime = progress;
              } catch {
                /* ignore */
              }
            }
            await audioEl.play();
            set({ isPlaying: true, isLoading: false });
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            publish();
            if (current.id) void ensureAutoRadio(current.id);
          } catch (err) {
            console.error(err);
            // Fallback : rejouer via play()
            await get().play(current, queue.length ? queue : [current], {
              preserveQueue: true,
              noAutoRadio: false,
            });
          }
        })();
        return;
      }
      void audioEl.play().then(() => {
        set({ isPlaying: true });
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      });
    }
    publish();
  },

  next: async () => {
    if (!isActivePlayer()) {
      sendCmd({ action: 'next' });
      return;
    }
    const { queue, queueIndex, repeat, shuffle, current, progress } = get();
    if (!queue.length) return;
    reportSkipIfEarly(progress);
    if (repeat === 'one') {
      await get().playAt(queueIndex);
      return;
    }
    let nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      if (repeat === 'all') {
        nextIndex = 0;
      } else {
        // Fin de file → charger des similaires puis rejouer next
        if (current?.id) {
          await ensureAutoRadio(current.id);
          const q = get().queue;
          if (get().queueIndex + 1 < q.length) {
            await get().playAt(get().queueIndex + 1);
          }
        }
        return;
      }
    }
    if (shuffle) {
      const remaining = queue.filter((_, i) => i !== queueIndex);
      const shuffled = shuffleArray(remaining);
      const nextTrack = shuffled[0];
      if (nextTrack) {
        const newQueue = [queue[queueIndex], ...shuffled];
        set({ queue: newQueue });
        await get().play(nextTrack, newQueue, { preserveQueue: true, noAutoRadio: true });
        void ensureAutoRadio(nextTrack.id);
        return;
      }
    }
    await get().playAt(nextIndex);
    const played = get().current;
    if (played?.id) void ensureAutoRadio(played.id);
  },

  prev: async () => {
    if (!isActivePlayer()) {
      sendCmd({ action: 'prev' });
      return;
    }
    const { audioEl, progress, queueIndex } = get();
    if (progress > 3 && audioEl) {
      audioEl.currentTime = 0;
      set({ progress: 0 });
      publish();
      return;
    }
    if (queueIndex > 0) await get().playAt(queueIndex - 1);
  },

  setProgress: (n) => {
    set({ progress: n });
    const { duration, isPlaying } = get();
    if ('mediaSession' in navigator && duration) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(n, duration),
          playbackRate: 1,
        });
      } catch {
        /* ignore */
      }
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
    const now = Date.now();
    const last = (get() as PlayerState & { _lastPersist?: number })._lastPersist || 0;
    if (now - last > 4000) {
      (get() as PlayerState & { _lastPersist?: number })._lastPersist = now;
      persistPlayer();
    }
  },

  seek: (n) => {
    if (!isActivePlayer()) {
      sendCmd({ action: 'seek', time: n });
      set({ progress: n });
      return;
    }
    const { audioEl } = get();
    if (audioEl) audioEl.currentTime = n;
    set({ progress: n });
    publish();
  },

  setDuration: (n) => set({ duration: n }),

  setVolume: (n) => {
    if (!isActivePlayer()) {
      sendCmd({ action: 'volume', volume: n });
      set({ volume: n });
      return;
    }
    const { audioEl } = get();
    if (audioEl) audioEl.volume = n;
    set({ volume: n });
    publish();
  },

  toggleShuffle: () => {
    set((s) => ({ shuffle: !s.shuffle }));
    if (!isActivePlayer()) sendCmd({ action: 'shuffle', value: get().shuffle });
    else publish();
  },

  cycleRepeat: () => {
    set((s) => ({
      repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    }));
    if (!isActivePlayer()) sendCmd({ action: 'repeat', value: get().repeat });
    else publish();
  },

  toggleQueue: () => set((s) => ({ showQueue: !s.showQueue, showLyrics: false })),

  toggleLyrics: async () => {
    const { showLyrics, current } = get();
    if (showLyrics) {
      set({ showLyrics: false });
      return;
    }
    set({ showLyrics: true, showQueue: false });
    if (current) {
      try {
        const { lyrics } = await api.lyrics(current.id);
        set({ lyrics });
      } catch {
        set({ lyrics: null });
      }
    }
  },

  addNext: (track) => {
    const state = get();
    const empty = !state.current || state.queue.length === 0;
    if (empty) {
      void get().play(track, [track], { preserveQueue: true });
      return;
    }
    if (!isActivePlayer()) {
      sendCmd({ action: 'add_next', track });
    }
    set((s) => {
      const q = [...s.queue];
      q.splice(s.queueIndex + 1, 0, track);
      return { queue: q };
    });
    publish();
  },

  addToQueue: (track) => {
    const state = get();
    const empty = !state.current || state.queue.length === 0;
    if (empty) {
      void get().play(track, [track], { preserveQueue: true });
      return;
    }
    if (!isActivePlayer()) sendCmd({ action: 'add_queue', track });
    set((s) => ({ queue: [...s.queue, track] }));
    publish();
  },

  moveInQueue: (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    set((s) => {
      if (fromIndex >= s.queue.length || toIndex >= s.queue.length) return s;
      const q = [...s.queue];
      const [item] = q.splice(fromIndex, 1);
      q.splice(toIndex, 0, item);
      let qi = s.queueIndex;
      if (fromIndex === qi) qi = toIndex;
      else if (fromIndex < qi && toIndex >= qi) qi -= 1;
      else if (fromIndex > qi && toIndex <= qi) qi += 1;
      return { queue: q, queueIndex: qi };
    });
    publish();
  },

  removeFromQueue: (index) => {
    set((s) => {
      if (index < 0 || index >= s.queue.length) return s;
      // Ne pas retirer le titre en cours via cette action (utiliser next)
      if (index === s.queueIndex) return s;
      const q = s.queue.filter((_, i) => i !== index);
      const qi = index < s.queueIndex ? s.queueIndex - 1 : s.queueIndex;
      return { queue: q, queueIndex: Math.max(0, Math.min(qi, q.length - 1)) };
    });
    publish();
  },

  appendRelated: (tracks) => {
    set((s) => {
      const ids = new Set(s.queue.map((t) => t.id));
      const extra = tracks.filter((t) => isPlayable(t) && !ids.has(t.id));
      return { queue: [...s.queue, ...extra], related: tracks };
    });
    publish();
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: 0 });
    publish();
  },

  startMix: async (track) => {
    await get().startRadio({ kind: 'track', id: track.id, seed: track });
  },

  startRadio: async ({ kind, id, seed, stayClose }) => {
    set({ isLoading: true, showQueue: true, showLyrics: false });
    try {
      let seedTrack: Track | null = seed && isPlayable(seed) ? seed : null;
      let pool: Track[] = [];

      if (kind === 'track') {
        const trackId = id;
        const [rel, up, sim] = await Promise.all([
          api.related(trackId).catch(() => ({ related: [] as Track[], radio: [] as Track[] })),
          api.upNext(trackId).catch(() => ({ tracks: [] as Track[] })),
          api.recoSimilar(trackId).catch(() => ({ tracks: [] as Track[], related: [], radio: [] })),
        ]);
        const raw = [
          ...(up.tracks || []),
          ...(rel.radio || []),
          ...(rel.related || []),
          ...(sim.tracks || []),
        ];
        pool = raw.filter((t) => t.id !== trackId && isPlayable(t));
        if (stayClose && seedTrack?.artists?.[0]) {
          const artistKey = (
            seedTrack.artists[0].id ||
            seedTrack.artists[0].name ||
            ''
          ).toLowerCase();
          const close = pool.filter((t) =>
            (t.artists || []).some(
              (a) => (a.id || a.name || '').toLowerCase() === artistKey,
            ),
          );
          const far = pool.filter(
            (t) =>
              !(t.artists || []).some(
                (a) => (a.id || a.name || '').toLowerCase() === artistKey,
              ),
          );
          // Mix : ~70 % même artiste / proches, le reste découverte
          pool = [...close, ...far].slice(0, 80);
          if (close.length >= 8) {
            pool = [...close.slice(0, 24), ...far.slice(0, 40)];
          }
        }
        if (!seedTrack) {
          seedTrack = { id: trackId, title: 'Radio', artists: [], thumbnails: [], type: 'song' };
        }
      } else if (kind === 'album') {
        const [radioRes, albumRes] = await Promise.all([
          api.albumRadio(id).catch(() => ({ tracks: [] as Track[] })),
          api.album(id).catch(() => null),
        ]);
        const albumTracks = (albumRes?.tracks || []).filter(isPlayable);
        seedTrack = seedTrack || albumTracks[0] || null;
        // Radio album = similaires (souvent hors album) + un peu de l’album en amorçage
        const radio = (radioRes.tracks || []).filter(
          (t) => isPlayable(t) && t.id !== seedTrack?.id,
        );
        const albumRest = albumTracks.filter((t) => t.id !== seedTrack?.id).slice(0, 6);
        pool = [...radio, ...albumRest];
      } else {
        const [radioRes, artistRes] = await Promise.all([
          api.artistRadio(id).catch(() => ({ tracks: [] as Track[] })),
          api.artist(id).catch(() => null),
        ]);
        const songs = (artistRes?.songs || []).filter(isPlayable);
        seedTrack = seedTrack || songs[0] || (radioRes.tracks || []).find(isPlayable) || null;
        const radio = (radioRes.tracks || []).filter(
          (t) => isPlayable(t) && t.id !== seedTrack?.id,
        );
        // Amorçage avec tops artiste puis radio (similaires liés / voisins)
        pool = [...songs.filter((t) => t.id !== seedTrack?.id).slice(0, 8), ...radio];
      }

      // Dédup
      const seen = new Set<string>();
      const uniq: Track[] = [];
      for (const t of pool) {
        if (!t.id || seen.has(t.id)) continue;
        seen.add(t.id);
        uniq.push(t);
        if (uniq.length >= 90) break;
      }
      pool = uniq;

      if (!seedTrack || !isPlayable(seedTrack)) {
        seedTrack = pool[0] || null;
        if (seedTrack) pool = pool.slice(1);
      }
      if (!seedTrack) return;

      const mix = [seedTrack, ...pool.filter((t) => t.id !== seedTrack!.id)];
      set({ related: pool });
      await get().play(seedTrack, mix, { preserveQueue: true, noAutoRadio: false });
    } catch (err) {
      console.error('startRadio', err);
      if (seed && isPlayable(seed)) {
        await get().play(seed, [seed], { preserveQueue: true });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  loadRelated: async (trackId) => {
    try {
      const { related, radio } = await api.related(trackId);
      set({ related: related.length ? related : radio });
    } catch {
      set({ related: [] });
    }
  },

  applyRemoteState: async (state, playAudio = false) => {
    set({
      current: state.current ?? get().current,
      queue: state.queue ?? get().queue,
      queueIndex: state.queueIndex ?? get().queueIndex,
      isPlaying: state.isPlaying ?? get().isPlaying,
      progress: state.progress ?? get().progress,
      duration: state.duration ?? get().duration,
      volume: state.volume ?? get().volume,
      shuffle: state.shuffle ?? get().shuffle,
      repeat: state.repeat ?? get().repeat,
    });

    if (playAudio && state.current && isActivePlayer()) {
      try {
        set({ isLoading: true });
        const gen = ++playGeneration;
        await playLocal(state.current, get(), gen);
        const audio = get().audioEl;
        if (audio && typeof state.progress === 'number') audio.currentTime = state.progress;
        if (state.isPlaying === false) {
          audio?.pause();
          set({ isPlaying: false, isLoading: false });
        } else {
          set({ isPlaying: true, isLoading: false });
        }
      } catch (err) {
        console.error(err);
        set({ isLoading: false });
      }
    }
  },
}));

// Wire remote events once
let wired = false;
export function wireRemotePlayer() {
  if (wired || typeof window === 'undefined') return;
  wired = true;

  window.addEventListener('ytm-remote-command', ((ev: CustomEvent) => {
    if (!isActivePlayer()) return;
    const cmd = ev.detail || {};
    const p = usePlayer.getState();
    switch (cmd.action) {
      case 'play':
        void p.play(cmd.track, cmd.queue, { preserveQueue: true });
        break;
      case 'play_at':
        void p.playAt(cmd.index);
        break;
      case 'pause':
        if (p.isPlaying) p.toggle();
        break;
      case 'resume':
        if (!p.isPlaying) p.toggle();
        break;
      case 'next':
        void p.next();
        break;
      case 'prev':
        void p.prev();
        break;
      case 'seek':
        p.seek(cmd.time);
        break;
      case 'volume':
        p.setVolume(cmd.volume);
        break;
      case 'shuffle':
        if (p.shuffle !== cmd.value) p.toggleShuffle();
        break;
      case 'repeat':
        while (usePlayer.getState().repeat !== cmd.value) p.cycleRepeat();
        break;
      case 'add_next':
        p.addNext(cmd.track);
        break;
      case 'add_queue':
        p.addToQueue(cmd.track);
        break;
      default:
        break;
    }
  }) as EventListener);

  window.addEventListener('ytm-become-player', ((ev: CustomEvent) => {
    const { state, autoplay } = ev.detail || {};
    void usePlayer.getState().applyRemoteState(state || {}, Boolean(autoplay ?? true));
  }) as EventListener);
}
