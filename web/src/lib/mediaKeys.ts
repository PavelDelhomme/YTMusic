import { usePlayer } from '../store/player';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"], input, textarea, select'));
}

function setMediaHandler(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null,
) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    /* action non supportée */
  }
}

function audioEl() {
  return usePlayer.getState().audioEl;
}

/** Sync isPlaying depuis l’élément audio (source de vérité UI). */
function syncPlayingFromAudio() {
  const audio = audioEl();
  const p = usePlayer.getState();
  if (!audio) return;
  const playing = !audio.paused && !audio.ended;
  if (p.isPlaying !== playing) {
    usePlayer.setState({ isPlaying: playing });
  }
}

/** Play/pause unifié — passe toujours par toggle() (local + remote + UI). */
function doPlayPause() {
  usePlayer.getState().toggle();
  // Sync différé au cas où les events audio arrivent en retard
  requestAnimationFrame(() => {
    syncPlayingFromAudio();
    updateMediaSessionMetadata();
  });
}

function ensurePlaying() {
  const p = usePlayer.getState();
  if (!p.current) return;
  const audio = p.audioEl;
  // Déjà en lecture → force l’icône play
  if (audio && !audio.paused && !audio.ended) {
    usePlayer.setState({ isPlaying: true });
    updateMediaSessionMetadata();
    return;
  }
  if (p.isPlaying && audio && audio.paused) {
    // État store désynchronisé
    usePlayer.setState({ isPlaying: false });
  }
  p.toggle();
  requestAnimationFrame(() => {
    syncPlayingFromAudio();
    updateMediaSessionMetadata();
  });
}

function ensurePaused() {
  const p = usePlayer.getState();
  const audio = p.audioEl;
  if (audio && !audio.paused) {
    audio.pause();
    usePlayer.setState({ isPlaying: false });
    updateMediaSessionMetadata();
    return;
  }
  if (p.isPlaying) {
    // Remote ou store désync : toggle pour envoyer pause
    p.toggle();
  }
  usePlayer.setState({ isPlaying: false });
  updateMediaSessionMetadata();
}

function doNext() {
  void usePlayer.getState().next();
}

function doPrev() {
  void usePlayer.getState().prev();
}

/** Enregistre / rafraîchit les handlers Media Session (MPRIS Linux + OS). */
export function wireMediaSession() {
  if (!('mediaSession' in navigator)) return;

  setMediaHandler('play', () => ensurePlaying());
  setMediaHandler('pause', () => ensurePaused());
  setMediaHandler('stop', () => ensurePaused());
  setMediaHandler('previoustrack', () => doPrev());
  setMediaHandler('nexttrack', () => doNext());
  setMediaHandler('seekto', (details) => {
    if (typeof details.seekTime === 'number') usePlayer.getState().seek(details.seekTime);
  });
  setMediaHandler('seekbackward', (details) => {
    const p = usePlayer.getState();
    const off = details.seekOffset ?? 10;
    p.seek(Math.max(0, p.progress - off));
  });
  setMediaHandler('seekforward', (details) => {
    const p = usePlayer.getState();
    const off = details.seekOffset ?? 10;
    const max = p.duration > 0 ? p.duration : p.progress + off;
    p.seek(Math.min(max, p.progress + off));
  });
}

export function updateMediaSessionMetadata() {
  if (!('mediaSession' in navigator)) return;
  const { current, progress, duration } = usePlayer.getState();
  const audio = audioEl();
  const playing = audio ? !audio.paused && !audio.ended : usePlayer.getState().isPlaying;

  if (!current) {
    try {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    } catch {
      /* ignore */
    }
    return;
  }

  const artworkUrl =
    current.thumbnails?.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url ||
    (current.id && /^[a-zA-Z0-9_-]{11}$/.test(current.id)
      ? `https://i.ytimg.com/vi/${current.id}/hqdefault.jpg`
      : '');

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artists?.map((a) => a.name).filter(Boolean).join(', ') || 'Artiste',
      album: current.album?.name || 'YTMusic',
      artwork: artworkUrl
        ? [
            { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
            { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
          ]
        : [],
    });
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    const dur = Number.isFinite(duration) && duration > 0 ? duration : audio?.duration || 0;
    const pos = Number.isFinite(progress) ? progress : audio?.currentTime || 0;
    if (dur > 0 && Number.isFinite(pos)) {
      navigator.mediaSession.setPositionState({
        duration: dur,
        position: Math.min(Math.max(0, pos), dur),
        playbackRate: 1,
      });
    }
  } catch {
    /* ignore */
  }

  wireMediaSession();
}

type MediaAction = 'playpause' | 'play' | 'pause' | 'stop' | 'next' | 'prev';

function mediaActionFromEvent(e: KeyboardEvent): MediaAction | null {
  const k = e.key;
  const c = e.code;
  const code = e.keyCode || (e as KeyboardEvent & { which?: number }).which || 0;

  if (
    k === 'MediaPlayPause' ||
    c === 'MediaPlayPause' ||
    k === 'AudioPlay' ||
    c === 'AudioPlay' ||
    code === 179
  ) {
    return 'playpause';
  }
  if (k === 'MediaPlay' || c === 'MediaPlay' || code === 250) return 'play';
  if (k === 'MediaPause' || c === 'MediaPause') return 'pause';
  if (k === 'MediaStop' || c === 'MediaStop' || code === 178) return 'stop';
  if (k === 'MediaTrackNext' || c === 'MediaTrackNext' || code === 176) return 'next';
  if (k === 'MediaTrackPrevious' || c === 'MediaTrackPrevious' || code === 177) return 'prev';

  if ((k === 'Unidentified' || k === '' || !k) && code) {
    if (code === 179) return 'playpause';
    if (code === 176) return 'next';
    if (code === 177) return 'prev';
    if (code === 178) return 'stop';
  }
  return null;
}

let lastMediaAction: MediaAction | null = null;
let lastMediaAt = 0;

function handleMediaAction(action: MediaAction) {
  const now = Date.now();
  if (action === lastMediaAction && now - lastMediaAt < 280) return;
  lastMediaAction = action;
  lastMediaAt = now;

  const p = usePlayer.getState();
  if (!p.current && action !== 'stop') return;
  if (action === 'playpause') doPlayPause();
  else if (action === 'play') ensurePlaying();
  else if (action === 'pause' || action === 'stop') ensurePaused();
  else if (action === 'next') doNext();
  else if (action === 'prev') doPrev();
}

/**
 * Raccourcis clavier app-wide + Media Session (MPRIS).
 * Bindings multiples : Ctrl souvent capturé par le DE Linux (workspaces).
 */
export function installMediaKeys(): () => void {
  wireMediaSession();
  updateMediaSessionMetadata();

  const onKey = (e: KeyboardEvent) => {
    const media = mediaActionFromEvent(e);
    if (media) {
      e.preventDefault();
      e.stopPropagation();
      handleMediaAction(media);
      return;
    }

    if (e.type === 'keyup') return;
    if (isTypingTarget(e.target)) return;
    if (e.metaKey) return;
    if (!usePlayer.getState().current) return;

    const key = e.key;
    const code = e.code;

    // —— Play / Pause ——
    // Espace, K, P (sans modificateur)
    if (
      (!e.ctrlKey && !e.altKey && !e.shiftKey && (code === 'Space' || key === ' ' || key === 'k' || key === 'K' || key === 'p' || key === 'P')) ||
      (e.ctrlKey && !e.altKey && !e.shiftKey && (key === 'p' || key === 'P' || code === 'Space'))
    ) {
      e.preventDefault();
      e.stopPropagation();
      doPlayPause();
      return;
    }

    // —— Suivant ——
    // Ctrl/Alt/Shift+→ , ] , . , Shift+N , N
    if (
      ((e.ctrlKey || e.altKey || e.shiftKey) && (key === 'ArrowRight' || code === 'ArrowRight')) ||
      (!e.ctrlKey && !e.altKey && (key === ']' || code === 'BracketRight' || key === '.' || code === 'Period')) ||
      (e.shiftKey && (key === 'N' || key === 'n')) ||
      (!e.ctrlKey && !e.altKey && !e.shiftKey && (key === 'n' || key === 'N') && code === 'KeyN')
    ) {
      // N seul = next (YouTube) ; Shift+N aussi
      if ((key === 'n' || key === 'N') && !e.shiftKey && (e.ctrlKey || e.altKey)) {
        /* ignore Ctrl+N = nouvel onglet */
      } else if ((key === 'n' || key === 'N') && e.ctrlKey) {
        return;
      } else {
        e.preventDefault();
        e.stopPropagation();
        doNext();
        return;
      }
    }

    // —— Précédent ——
    // Ctrl/Alt/Shift+← , [ , , , Shift+P already used for play — use Shift+, or B
    if (
      ((e.ctrlKey || e.altKey || e.shiftKey) && (key === 'ArrowLeft' || code === 'ArrowLeft')) ||
      (!e.ctrlKey && !e.altKey && (key === '[' || code === 'BracketLeft' || key === ',' || code === 'Comma')) ||
      (!e.ctrlKey && !e.altKey && !e.shiftKey && (key === 'b' || key === 'B'))
    ) {
      e.preventDefault();
      e.stopPropagation();
      doPrev();
      return;
    }

    // Seek J / L (sans flèches seules — flèches seules = seek aussi style YT)
    if (!e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (key === 'j' || key === 'J') {
        e.preventDefault();
        const p = usePlayer.getState();
        p.seek(Math.max(0, p.progress - 10));
        return;
      }
      if (key === 'l' || key === 'L') {
        e.preventDefault();
        const p = usePlayer.getState();
        const max = p.duration > 0 ? p.duration : p.progress + 10;
        p.seek(Math.min(max, p.progress + 10));
        return;
      }
      if (key === 'ArrowLeft' || code === 'ArrowLeft') {
        e.preventDefault();
        const p = usePlayer.getState();
        p.seek(Math.max(0, p.progress - 5));
        return;
      }
      if (key === 'ArrowRight' || code === 'ArrowRight') {
        e.preventDefault();
        const p = usePlayer.getState();
        const max = p.duration > 0 ? p.duration : p.progress + 5;
        p.seek(Math.min(max, p.progress + 5));
      }
    }
  };

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKey, true);

  const unsub = usePlayer.subscribe((state, prev) => {
    if (
      state.current?.id !== prev.current?.id ||
      state.isPlaying !== prev.isPlaying ||
      state.audioEl !== prev.audioEl ||
      Math.floor(state.progress) !== Math.floor(prev.progress) ||
      state.duration !== prev.duration
    ) {
      if (
        state.current?.id === prev.current?.id &&
        state.isPlaying === prev.isPlaying &&
        state.audioEl === prev.audioEl
      ) {
        if (Math.abs(state.progress - prev.progress) < 1 && state.duration === prev.duration) {
          return;
        }
      }
      updateMediaSessionMetadata();
    }
  });

  const onVis = () => {
    if (document.visibilityState === 'visible') {
      wireMediaSession();
      syncPlayingFromAudio();
      updateMediaSessionMetadata();
    }
  };
  const onFocus = () => {
    wireMediaSession();
    syncPlayingFromAudio();
    updateMediaSessionMetadata();
  };
  const onPointer = () => {
    wireMediaSession();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pointerdown', onPointer, { passive: true });

  const keepAlive = window.setInterval(() => {
    if (!usePlayer.getState().current) return;
    wireMediaSession();
    syncPlayingFromAudio();
    try {
      const audio = audioEl();
      const playing = audio ? !audio.paused && !audio.ended : usePlayer.getState().isPlaying;
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch {
      /* ignore */
    }
  }, 5000);

  let attached: HTMLAudioElement | null = null;
  const audioListeners: Array<[string, EventListener]> = [];
  const attachAudio = (el: HTMLAudioElement | null) => {
    if (attached === el) return;
    if (attached) {
      for (const [ev, fn] of audioListeners) attached.removeEventListener(ev, fn);
      audioListeners.length = 0;
    }
    attached = el;
    if (!el) return;
    const bump = () => {
      syncPlayingFromAudio();
      wireMediaSession();
      updateMediaSessionMetadata();
    };
    for (const ev of ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'timeupdate'] as const) {
      const fn: EventListener =
        ev === 'timeupdate'
          ? () => {
              const { progress, duration } = usePlayer.getState();
              if (!duration) return;
              try {
                navigator.mediaSession.setPositionState({
                  duration,
                  position: Math.min(Math.max(0, progress || el.currentTime), duration),
                  playbackRate: 1,
                });
              } catch {
                /* ignore */
              }
            }
          : bump;
      el.addEventListener(ev, fn);
      audioListeners.push([ev, fn]);
    }
    bump();
  };
  attachAudio(usePlayer.getState().audioEl);
  const unsubAudio = usePlayer.subscribe((s, prev) => {
    if (s.audioEl !== prev.audioEl) attachAudio(s.audioEl);
  });

  return () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKey, true);
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pointerdown', onPointer);
    window.clearInterval(keepAlive);
    unsub();
    unsubAudio();
    attachAudio(null);
  };
}
