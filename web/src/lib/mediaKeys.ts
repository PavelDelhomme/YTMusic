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
    /* action non supportée sur ce navigateur */
  }
}

/** Enregistre / rafraîchit les handlers Media Session (touches média OS + Chrome). */
export function wireMediaSession() {
  if (!('mediaSession' in navigator)) return;

  const play = () => {
    const p = usePlayer.getState();
    if (!p.current) return;
    if (!p.isPlaying) p.toggle();
  };
  const pause = () => {
    const p = usePlayer.getState();
    if (p.isPlaying) p.toggle();
  };
  const stop = () => {
    const p = usePlayer.getState();
    if (p.isPlaying) p.toggle();
  };

  setMediaHandler('play', play);
  setMediaHandler('pause', pause);
  setMediaHandler('stop', stop);
  setMediaHandler('previoustrack', () => void usePlayer.getState().prev());
  setMediaHandler('nexttrack', () => void usePlayer.getState().next());
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
  const { current, isPlaying, progress, duration } = usePlayer.getState();
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
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    if (duration > 0) {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(Math.max(0, progress), duration),
        playbackRate: 1,
      });
    }
  } catch {
    /* ignore */
  }

  // Les handlers doivent rester branchés même après un changement de piste
  wireMediaSession();
}

/**
 * Raccourcis clavier app-wide + Media Session.
 * Fonctionne sur toutes les pages (Accueil, Recherche, etc.), pas seulement le lecteur.
 */
export function installMediaKeys(): () => void {
  wireMediaSession();
  updateMediaSessionMetadata();

  const isMediaKey = (e: KeyboardEvent) => {
    const k = e.key;
    const c = e.code;
    return (
      k === 'MediaPlayPause' ||
      k === 'MediaPlay' ||
      k === 'MediaPause' ||
      k === 'MediaTrackNext' ||
      k === 'MediaTrackPrevious' ||
      k === 'MediaStop' ||
      c === 'MediaPlayPause' ||
      c === 'MediaPlay' ||
      c === 'MediaPause' ||
      c === 'MediaTrackNext' ||
      c === 'MediaTrackPrevious' ||
      c === 'MediaStop'
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Touches média hardware / OS — toujours actives (même dans un champ)
    if (isMediaKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      const p = usePlayer.getState();
      const key = e.key.startsWith('Media') ? e.key : e.code;
      if (!p.current && key !== 'MediaStop') return;
      if (key === 'MediaPlayPause') p.toggle();
      else if (key === 'MediaPlay') {
        if (!p.isPlaying) p.toggle();
      } else if (key === 'MediaPause' || key === 'MediaStop') {
        if (p.isPlaying) p.toggle();
      } else if (key === 'MediaTrackNext') void p.next();
      else if (key === 'MediaTrackPrevious') void p.prev();
      return;
    }

    if (isTypingTarget(e.target)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!usePlayer.getState().current) return;

    // Espace / K = play-pause (style YouTube)
    if (e.code === 'Space' || e.key === ' ' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      usePlayer.getState().toggle();
      return;
    }
    // Shift+N / Shift+P — piste suivante / précédente
    if (e.shiftKey && (e.key === 'N' || e.key === 'n')) {
      e.preventDefault();
      void usePlayer.getState().next();
      return;
    }
    if (e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      void usePlayer.getState().prev();
      return;
    }
    // J / L ou flèches — seek ±10s (hors champ texte)
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

  // Capture = prioritaire même si un enfant stoppe la propagation
  window.addEventListener('keydown', onKeyDown, true);

  // Garde metadata / handlers à jour quand le store change
  const unsub = usePlayer.subscribe((state, prev) => {
    if (
      state.current?.id !== prev.current?.id ||
      state.isPlaying !== prev.isPlaying ||
      Math.floor(state.progress) !== Math.floor(prev.progress) ||
      state.duration !== prev.duration
    ) {
      // Throttle léger via rAF pour progress
      if (state.current?.id === prev.current?.id && state.isPlaying === prev.isPlaying) {
        if (Math.abs(state.progress - prev.progress) < 1 && state.duration === prev.duration) {
          return;
        }
      }
      updateMediaSessionMetadata();
    }
  });

  // Re-wire si l’onglet redevient visible (certains navigateurs droppent les handlers)
  const onVis = () => {
    if (document.visibilityState === 'visible') {
      wireMediaSession();
      updateMediaSessionMetadata();
    }
  };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('visibilitychange', onVis);
    unsub();
  };
}
