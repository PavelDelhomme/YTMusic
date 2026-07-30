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

/** Play explicite (Media Session / MPRIS envoie « play », pas un toggle). */
function ensurePlaying() {
  const p = usePlayer.getState();
  if (!p.current) return;
  const audio = p.audioEl;
  if (audio && !audio.paused && !audio.ended) {
    usePlayer.setState({ isPlaying: true });
    updateMediaSessionMetadata();
    return;
  }
  if (audio && audio.src && audio.dataset.trackId === p.current.id) {
    void audio
      .play()
      .then(() => {
        usePlayer.setState({ isPlaying: true });
        updateMediaSessionMetadata();
      })
      .catch(() => {
        p.toggle();
      });
    return;
  }
  // Pas de source prête → laisse toggle/play reconstruire
  p.toggle();
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
  if (p.isPlaying) p.toggle();
  else updateMediaSessionMetadata();
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

  // Chromium/Linux droppe parfois les handlers après un update metadata
  wireMediaSession();
}

type MediaAction = 'playpause' | 'play' | 'pause' | 'stop' | 'next' | 'prev';

/** Détecte touches média hardware (Linux/Logitech souvent via keyCode legacy). */
function mediaActionFromEvent(e: KeyboardEvent): MediaAction | null {
  const k = e.key;
  const c = e.code;
  // keyCode legacy (toujours renvoyé par beaucoup de claviers Logitech sous X11/Wayland)
  const code = e.keyCode || (e as KeyboardEvent & { which?: number }).which || 0;

  if (
    k === 'MediaPlayPause' ||
    c === 'MediaPlayPause' ||
    k === 'AudioPlay' ||
    code === 179
  ) {
    return 'playpause';
  }
  if (k === 'MediaPlay' || c === 'MediaPlay' || code === 250 /* XF86AudioPlay rare */) {
    return 'play';
  }
  if (k === 'MediaPause' || c === 'MediaPause') return 'pause';
  if (k === 'MediaStop' || c === 'MediaStop' || code === 178) return 'stop';
  if (k === 'MediaTrackNext' || c === 'MediaTrackNext' || code === 176) return 'next';
  if (k === 'MediaTrackPrevious' || c === 'MediaTrackPrevious' || code === 177) return 'prev';
  return null;
}

function handleMediaAction(action: MediaAction) {
  const p = usePlayer.getState();
  if (!p.current && action !== 'stop') return;
  if (action === 'playpause') {
    const audio = p.audioEl;
    if (audio ? audio.paused || audio.ended : !p.isPlaying) ensurePlaying();
    else ensurePaused();
    return;
  }
  if (action === 'play') ensurePlaying();
  else if (action === 'pause' || action === 'stop') ensurePaused();
  else if (action === 'next') doNext();
  else if (action === 'prev') doPrev();
}

/**
 * Raccourcis clavier app-wide + Media Session (MPRIS).
 * Sur Linux les touches Logitech passent surtout par Media Session ;
 * on garde aussi keydown/keyup + raccourcis secours.
 */
export function installMediaKeys(): () => void {
  wireMediaSession();
  updateMediaSessionMetadata();

  const onKey = (e: KeyboardEvent) => {
    const media = mediaActionFromEvent(e);
    if (media) {
      e.preventDefault();
      e.stopPropagation();
      // keydown + keyup → une seule action (ignore keyup dupliqué immédiat)
      if (e.type === 'keyup') return;
      handleMediaAction(media);
      return;
    }

    if (isTypingTarget(e.target)) return;
    if (e.altKey || e.metaKey) return;
    if (!usePlayer.getState().current) return;

    // Ctrl+← / Ctrl+→ = précédent / suivant (fiable sur tous claviers Linux)
    if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') {
      e.preventDefault();
      doNext();
      return;
    }
    if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      doPrev();
      return;
    }
    if (e.ctrlKey) return;

    // Espace / K = play-pause
    if (e.code === 'Space' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      const p = usePlayer.getState();
      const audio = p.audioEl;
      if (audio ? audio.paused || audio.ended : !p.isPlaying) ensurePlaying();
      else ensurePaused();
      return;
    }

    // Shift+N / Shift+P — piste suivante / précédente
    if (e.shiftKey && (e.key === 'N' || e.key === 'n')) {
      e.preventDefault();
      doNext();
      return;
    }
    if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      doPrev();
      return;
    }

    // [ ] = prev / next (secours sans modificateur)
    if (e.key === ']' || e.code === 'BracketRight') {
      e.preventDefault();
      doNext();
      return;
    }
    if (e.key === '[' || e.code === 'BracketLeft') {
      e.preventDefault();
      doPrev();
      return;
    }

    // J / L ou flèches — seek ±10s
    if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      const p = usePlayer.getState();
      p.seek(Math.max(0, p.progress - 10));
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      const p = usePlayer.getState();
      const max = p.duration > 0 ? p.duration : p.progress + 10;
      p.seek(Math.min(max, p.progress + 10));
    }
  };

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  document.addEventListener('keydown', onKey, true);

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
      updateMediaSessionMetadata();
    }
  };
  const onFocus = () => {
    wireMediaSession();
    updateMediaSessionMetadata();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('focus', onFocus);

  // Keepalive MPRIS : Chromium Linux perd parfois la session
  const keepAlive = window.setInterval(() => {
    if (!usePlayer.getState().current) return;
    wireMediaSession();
    try {
      const audio = audioEl();
      const playing = audio ? !audio.paused && !audio.ended : usePlayer.getState().isPlaying;
      navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    } catch {
      /* ignore */
    }
  }, 8000);

  // Branche play/pause audio dès qu’un élément est lié
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
      wireMediaSession();
      updateMediaSessionMetadata();
    };
    for (const ev of ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'timeupdate'] as const) {
      // timeupdate : throttle via updateMediaSessionMetadata (déjà soft)
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
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('focus', onFocus);
    window.clearInterval(keepAlive);
    unsub();
    unsubAudio();
    attachAudio(null);
  };
}
