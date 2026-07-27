import { useMemo, useState } from 'react';
import { api } from '../api';

const GENRES = [
  'Pop',
  'Rock',
  'Hip-Hop',
  'R&B',
  'Électro',
  'Jazz',
  'Classique',
  'Metal',
  'Indie',
  'Latin',
  'Afrobeats',
  'K-Pop',
  'Country',
  'Soul',
  'Lo-Fi',
  'Rap FR',
];

const MOODS = [
  'Énergie',
  'Chill',
  'Focus',
  'Fête',
  'Mélancolie',
  'Motivation',
  'Romantique',
  'Nostalgie',
];

const MOMENTS = [
  { id: 'morning', label: 'Matin' },
  { id: 'afternoon', label: 'Après-midi' },
  { id: 'evening', label: 'Soir' },
  { id: 'night', label: 'Nuit' },
  { id: 'weekday', label: 'Semaine' },
  { id: 'weekend', label: 'Week-end' },
];

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm transition ${
        active ? 'bg-yt-red text-white' : 'bg-yt-elevated text-yt-muted hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

export function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [genres, setGenres] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [moments, setMoments] = useState<string[]>([]);
  const [artistQ, setArtistQ] = useState('');
  const [artistHits, setArtistHits] = useState<any[]>([]);
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const canNext = useMemo(() => {
    if (step === 0) return genres.length >= 3;
    if (step === 1) return moods.length >= 2;
    if (step === 2) return moments.length >= 1;
    if (step === 3) return artists.length >= 1;
    return true;
  }, [step, genres, moods, moments, artists]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  const searchArtists = async (q: string) => {
    setArtistQ(q);
    if (q.trim().length < 2) {
      setArtistHits([]);
      return;
    }
    try {
      const r = await api.search(q, 'artist');
      setArtistHits(r.artists.slice(0, 8));
    } catch {
      setArtistHits([]);
    }
  };

  const finish = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.onboarding({
        genres,
        moods,
        moments,
        artists,
        discoveryBias: 0.15,
      });
      onDone();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-yt-border bg-yt-surface p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-widest text-yt-muted">
          Préférences · étape {step + 1}/4
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold">
          {step === 0 && 'Tes genres'}
          {step === 1 && 'Tes ambiances'}
          {step === 2 && 'Quand tu écoutes'}
          {step === 3 && 'Artistes à suivre'}
        </h2>
        <p className="mt-1 text-sm text-yt-muted">
          On s’en sert pour l’accueil, Explorer, la radio et les similaires.
        </p>

        <div className="mt-5 flex max-h-[40vh] flex-wrap gap-2 overflow-y-auto">
          {step === 0 &&
            GENRES.map((g) => (
              <Chip key={g} label={g} active={genres.includes(g)} onClick={() => toggle(genres, setGenres, g)} />
            ))}
          {step === 1 &&
            MOODS.map((m) => (
              <Chip key={m} label={m} active={moods.includes(m)} onClick={() => toggle(moods, setMoods, m)} />
            ))}
          {step === 2 &&
            MOMENTS.map((m) => (
              <Chip
                key={m.id}
                label={m.label}
                active={moments.includes(m.id)}
                onClick={() => toggle(moments, setMoments, m.id)}
              />
            ))}
          {step === 3 && (
            <div className="w-full space-y-3">
              <input
                value={artistQ}
                onChange={(e) => void searchArtists(e.target.value)}
                placeholder="Chercher un artiste…"
                className="w-full rounded-xl border border-yt-border bg-yt-elevated px-3 py-2 text-sm outline-none focus:border-white/30"
              />
              <div className="flex flex-wrap gap-2">
                {artists.map((a) => (
                  <Chip
                    key={a.id}
                    label={a.name}
                    active
                    onClick={() => setArtists((prev) => prev.filter((x) => x.id !== a.id))}
                  />
                ))}
              </div>
              <div className="space-y-1">
                {artistHits.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-yt-hover"
                    onClick={() => {
                      if (!artists.some((x) => x.id === a.id)) {
                        setArtists((prev) => [...prev, { id: a.id, name: a.title || a.name }]);
                      }
                    }}
                  >
                    <span>{a.title}</span>
                    <span className="text-xs text-yt-muted">Suivre</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 0 || busy}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-full px-4 py-2 text-sm text-yt-muted hover:text-white disabled:opacity-40"
          >
            Retour
          </button>
          {step < 3 ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
              className="rounded-full bg-yt-red px-5 py-2 text-sm font-medium disabled:opacity-40"
            >
              Continuer
            </button>
          ) : (
            <button
              type="button"
              disabled={!canNext || busy}
              onClick={() => void finish()}
              className="rounded-full bg-yt-red px-5 py-2 text-sm font-medium disabled:opacity-40"
            >
              {busy ? 'Enregistrement…' : 'Lancer mes recommandations'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
