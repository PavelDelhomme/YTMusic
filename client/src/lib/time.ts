/** Affiche une durée en secondes : `m:ss` ou `h:mm:ss` si ≥ 1 h. */
export function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const total = Math.floor(totalSeconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Normalise une durée texte API (`164:16` → `2:44:16`) ou utilise durationSeconds. */
export function formatTrackDuration(track: {
  duration?: string;
  durationSeconds?: number;
}): string {
  if (typeof track.durationSeconds === 'number' && Number.isFinite(track.durationSeconds)) {
    return formatClock(track.durationSeconds);
  }
  const raw = (track.duration || '').trim();
  if (!raw) return '';
  const parts = raw.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return raw;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return formatClock(h * 3600 + m * 60 + s);
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    // Ex. "164:16" (minutes totales) → heures
    if (m >= 60) return formatClock(m * 60 + s);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return raw;
}
