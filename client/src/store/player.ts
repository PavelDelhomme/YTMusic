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
  appendRelated: (tracks: Track[]) => void;
  clearQueue: () => void;
  startMix: (track: Track) => Promise<void>;
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
  navigator.mediaSession.setActionHandler('play', handlers.play);
  navigator.mediaSession.setActionHandler('pause', handlers.pause);
  navigator.mediaSession.setActionHandler('previoustrack', handlers.prev);
  navigator.mediaSession.setActionHandler('nexttrack', handlers.next);
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    if (typeof details.seekTime === 'number') handlers.seek(details.seekTime);
  });
}

const PLAYER_STORAGE_KEY = 'ytm_player_v1';

type PersistedPlayer = {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  progress: number;
};

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
    const payload: PersistedPlayer = {
      current: s.current,
      queue: s.queue,
      queueIndex: s.queueIndex,
      volume: s.volume,
      shuffle: s.shuffle,
      repeat: s.repeat,
      progress: s.progress,
    };
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

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
  if (upcoming.length >= 3) {
    prefetchTrack(upcoming[0]?.id);
    return;
  }
  if (!isPlayable({ id: seedId } as Track)) return;
  try {
    const { radio, related } = await api.related(seedId);
    const pool = (radio.length ? radio : related).filter(
      (t) => t.id !== seedId && isPlayable(t),
    );
    if (!pool.length) return;
    const state = usePlayer.getState();
    // Ne pas écraser une file album/playlist déjà longue
    const remaining = state.queue.slice(state.queueIndex + 1).filter(isPlayable);
    if (remaining.length >= 3) return;
    const existing = new Set(state.queue.map((t) => t.id));
    const extra = pool.filter((t) => !existing.has(t.id)).slice(0, 40);
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

  bindAudio: (el) => set({ audioEl: el }),

  hydrate: async () => {
    if (get().hydrated) return;
    const saved = loadPersisted();
    set({
      current: saved.current || null,
      queue: saved.queue || [],
      queueIndex: saved.queueIndex || 0,
      volume: typeof saved.volume === 'number' ? saved.volume : 0.9,
      shuffle: Boolean(saved.shuffle),
      repeat: saved.repeat || 'off',
      progress: saved.progress || 0,
      isPlaying: false,
      hydrated: true,
    });
    const audio = get().audioEl;
    const track = get().current;
    if (audio && track && isPlayable(track)) {
      try {
        const src = await resolvePlayUrl(track.id);
        if (audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
        audio.src = src;
        audio.volume = get().volume;
        if (saved.progress) audio.currentTime = saved.progress;
        void get().loadRelated(track.id);
      } catch (err) {
        console.error(err);
      }
    }
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
    const { audioEl, isPlaying } = get();
    if (!audioEl) return;
    if (isPlaying) {
      audioEl.pause();
      set({ isPlaying: false });
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else {
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
    set({ isLoading: true, showQueue: true, showLyrics: false });
    try {
      const { radio, related } = await api.related(track.id);
      const pool = (radio.length ? radio : related).filter(
        (t) => t.id !== track.id && isPlayable(t),
      );
      const mix = [track, ...pool];
      set({ related: pool });
      await get().play(track, mix, { preserveQueue: true });
    } catch (err) {
      console.error(err);
      await get().play(track, [track], { preserveQueue: true });
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
        await playLocal(state.current, get());
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
