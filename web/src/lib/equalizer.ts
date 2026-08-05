/**
 * Égaliseur Web Audio — désactivé par défaut.
 * createMediaElementSource ne peut être appelé qu’une fois par <audio>.
 * Ne jamais créer l’AudioContext au chargement de la page (autoplay policy).
 */

export type EqBand = {
  id: string;
  label: string;
  freq: number;
  type: BiquadFilterType;
  gain: number; // dB, -12..+12
};

const STORAGE_KEY = 'ytm_eq_v1';

const DEFAULT_BANDS: EqBand[] = [
  { id: 'bass', label: 'Graves', freq: 60, type: 'lowshelf', gain: 0 },
  { id: 'lowmid', label: 'Bas-méd.', freq: 250, type: 'peaking', gain: 0 },
  { id: 'mid', label: 'Médiums', freq: 1000, type: 'peaking', gain: 0 },
  { id: 'highmid', label: 'Haut-méd.', freq: 4000, type: 'peaking', gain: 0 },
  { id: 'treble', label: 'Aigus', freq: 12000, type: 'highshelf', gain: 0 },
];

type EqState = {
  enabled: boolean;
  bands: EqBand[];
};

type EqRuntime = {
  ctx: AudioContext;
  source: MediaElementAudioSourceNode;
  filters: BiquadFilterNode[];
  output: GainNode;
  wired: boolean;
  audio: HTMLAudioElement;
};

let runtime: EqRuntime | null = null;
let state: EqState = loadState();
let pendingAudio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

function loadState(): EqState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: false, bands: DEFAULT_BANDS.map((b) => ({ ...b })) };
    const parsed = JSON.parse(raw) as Partial<EqState>;
    const bands = DEFAULT_BANDS.map((d) => {
      const hit = parsed.bands?.find((b) => b.id === d.id);
      return {
        ...d,
        gain: typeof hit?.gain === 'number' ? Math.max(-12, Math.min(12, hit.gain)) : 0,
      };
    });
    return { enabled: Boolean(parsed.enabled), bands };
  } catch {
    return { enabled: false, bands: DEFAULT_BANDS.map((b) => ({ ...b })) };
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const l of listeners) l();
}

export function subscribeEq(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getEqState(): EqState {
  return {
    enabled: state.enabled,
    bands: state.bands.map((b) => ({ ...b })),
  };
}

/** True si l’EQ est branché → stream same-origin requis (CORS). */
export function eqNeedsSameOrigin(): boolean {
  return Boolean(state.enabled && runtime?.wired);
}

function applyGains() {
  if (!runtime) return;
  for (let i = 0; i < runtime.filters.length; i++) {
    const band = state.bands[i];
    const filter = runtime.filters[i];
    if (!band || !filter) continue;
    const gain = state.enabled ? band.gain : 0;
    filter.gain.setTargetAtTime(gain, runtime.ctx.currentTime, 0.015);
  }
}

/**
 * Mémorise l’élément audio. Ne crée PAS l’AudioContext tant que l’EQ
 * n’est pas activé (évite le warning Chrome autoplay).
 */
export async function wireEqualizer(audio: HTMLAudioElement | null) {
  pendingAudio = audio;
  if (!audio || !state.enabled) return;
  await ensureEqWired(audio);
}

async function ensureEqWired(audio: HTMLAudioElement) {
  if (runtime?.wired && runtime.audio === audio) {
    applyGains();
    if (runtime.ctx.state === 'suspended') {
      await runtime.ctx.resume().catch(() => undefined);
    }
    return;
  }
  if (runtime?.wired) {
    applyGains();
    return;
  }
  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const filters = state.bands.map((band) => {
      const f = ctx.createBiquadFilter();
      f.type = band.type;
      f.frequency.value = band.freq;
      f.Q.value = band.type === 'peaking' ? 1.0 : 0.7;
      f.gain.value = state.enabled ? band.gain : 0;
      return f;
    });
    const output = ctx.createGain();
    output.gain.value = 1;

    let node: AudioNode = source;
    for (const f of filters) {
      node.connect(f);
      node = f;
    }
    node.connect(output);
    output.connect(ctx.destination);

    runtime = { ctx, source, filters, output, wired: true, audio };
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => undefined);
    }
    applyGains();
  } catch (err) {
    console.warn('[eq] wire failed', err);
  }
}

/** Ferme le graphe EQ (rare — ex. changement forcé d’élément). */
export async function rewireEqualizer(audio: HTMLAudioElement | null) {
  pendingAudio = audio;
  if (runtime) {
    try {
      await runtime.ctx.close();
    } catch {
      /* ignore */
    }
    runtime = null;
  }
  if (audio && state.enabled) await ensureEqWired(audio);
}

export async function resumeEqContext() {
  if (!state.enabled) return;
  if (runtime?.ctx.state === 'suspended') {
    await runtime.ctx.resume().catch(() => undefined);
  }
}

export function setEqEnabled(enabled: boolean) {
  state = { ...state, enabled };
  persist();
  if (enabled) {
    const audio = pendingAudio;
    if (audio) void ensureEqWired(audio);
  }
  applyGains();
  emit();
  void resumeEqContext();
}

export function setEqBandGain(id: string, gain: number) {
  const g = Math.max(-12, Math.min(12, gain));
  state = {
    ...state,
    bands: state.bands.map((b) => (b.id === id ? { ...b, gain: g } : b)),
  };
  persist();
  applyGains();
  emit();
}

export function resetEqBands() {
  state = {
    ...state,
    bands: DEFAULT_BANDS.map((b) => ({ ...b })),
  };
  persist();
  applyGains();
  emit();
}

export function toggleEqEnabled() {
  setEqEnabled(!state.enabled);
}
