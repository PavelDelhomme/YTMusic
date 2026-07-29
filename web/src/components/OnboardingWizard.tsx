import { useEffect, useMemo, useState } from 'react';
import { api, type Track } from '../api';
import { CoverImage } from './CoverImage';

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

type FollowedArtist = {
  id: string;
  name: string;
  thumbnails?: Track['thumbnails'];
};

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

export function OnboardingWizard({
  onDone,
  onCancel,
  mode = 'onboarding',
}: {
  onDone: () => void;
  onCancel?: () => void;
  mode?: 'onboarding' | 'edit';
}) {
  const [step, setStep] = useState(0);
  const [genres, setGenres] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [moments, setMoments] = useState<string[]>([]);
  const [bias, setBias] = useState(0.15);
  const [artistQ, setArtistQ] = useState('');
  const [artistHits, setArtistHits] = useState<Track[]>([]);
  const [artists, setArtists] = useState<FollowedArtist[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(mode === 'edit');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (mode !== 'edit') return;
    let cancelled = false;
    void api
      .prefs()
      .then((r) => {
        if (cancelled) return;
        setGenres(r.prefs?.genres || []);
        setMoods(r.prefs?.moods || []);
        setMoments(r.prefs?.moments || []);
        setBias(Number(r.prefs?.discoveryBias ?? 0.15));
        setArtists(
          (r.follows || []).map((f: any) => ({
            id: String(f.artist_id || f.id),
            name: String(f.artist_name || f.name || 'Artiste'),
          })),
        );
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const canNext = useMemo(() => {
    if (step === 0) return genres.length >= 3;
    if (step === 1) return moods.length >= 2;
    if (step === 2) return moments.length >= 1;
    if (step === 3) return mode === 'edit' || artists.length >= 1;
    return true;
  }, [step, genres, moods, moments, artists, mode]);

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
      setArtistHits(r.artists.slice(0, 10));
    } catch {
      setArtistHits([]);
    }
  };

  const finish = async () => {
    setBusy(true);
    setErr('');
    try {
      if (mode === 'edit') {
        await api.savePrefs({
          genres,
          moods,
          moments,
          discoveryBias: bias,
          onboardingDone: true,
        });
        // sync follows: follow currently selected (idempotent), unfollow removed handled by UI clicks
        for (const a of artists) {
          await api.followArtist(a.id, a.name);
        }
      } else {
        await api.onboarding({
          genres,
          moods,
          moments,
          artists: artists.map(({ id, name }) => ({ id, name })),
          discoveryBias: bias,
        });
      }
      onDone();
    } catch (e) {
      setErr(String((e as Error).message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-black/85 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden border-yt-border bg-yt-surface shadow-2xl sm:h-auto sm:max-h-[min(92dvh,720px)] sm:rounded-2xl sm:border">
        <div className="shrink-0 px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-yt-muted">
                {mode === 'edit' ? 'Affiner' : 'Préférences'} · étape {step + 1}/4
              </p>
              <h2 className="mt-1 font-display text-2xl font-semibold">
                {step === 0 && 'Tes genres'}
                {step === 1 && 'Tes ambiances'}
                {step === 2 && 'Quand tu écoutes'}
                {step === 3 && 'Artistes à suivre'}
              </h2>
              <p className="mt-1 text-sm text-yt-muted">
                {mode === 'edit'
                  ? 'Modifie tes goûts pour recalibrer l’accueil, Explorer et la radio.'
                  : 'Valable sur web et application mobile — accueil, Explorer, radio et similaires.'}
              </p>
            </div>
            {mode === 'edit' && onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full px-3 py-1.5 text-sm text-yt-muted hover:text-white"
              >
                Fermer
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 sm:px-6">
          {loading ? (
            <p className="py-12 text-center text-sm text-yt-muted">Chargement des préférences…</p>
          ) : (
          <div className="flex flex-wrap gap-2 pb-4 pt-3">
            {step === 0 &&
              GENRES.map((g) => (
                <Chip key={g} label={g} active={genres.includes(g)} onClick={() => toggle(genres, setGenres, g)} />
              ))}
            {step === 1 &&
              MOODS.map((m) => (
                <Chip key={m} label={m} active={moods.includes(m)} onClick={() => toggle(moods, setMoods, m)} />
              ))}
            {step === 2 && (
              <>
                {MOMENTS.map((m) => (
                  <Chip
                    key={m.id}
                    label={m.label}
                    active={moments.includes(m.id)}
                    onClick={() => toggle(moments, setMoments, m.id)}
                  />
                ))}
                <div className="mt-4 w-full space-y-2">
                  <p className="text-sm font-medium">Familiarité ↔ Découverte</p>
                  <input
                    type="range"
                    min={0}
                    max={0.45}
                    step={0.01}
                    value={bias}
                    onChange={(e) => setBias(Number(e.target.value))}
                    className="w-full accent-yt-red"
                  />
                  <p className="text-xs text-yt-muted">
                    Biais découverte : {Math.round(bias * 100)} % — plus haut = plus de nouveautés
                  </p>
                </div>
              </>
            )}
            {step === 3 && (
              <div className="w-full space-y-3">
                <input
                  value={artistQ}
                  onChange={(e) => void searchArtists(e.target.value)}
                  placeholder="Chercher un artiste…"
                  className="w-full rounded-xl border border-yt-border bg-yt-elevated px-3 py-2.5 text-sm outline-none focus:border-white/30"
                  autoComplete="off"
                  enterKeyHint="search"
                />
                {artists.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {artists.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setArtists((prev) => prev.filter((x) => x.id !== a.id));
                          if (mode === 'edit') {
                            void api.unfollowArtist(a.id).catch(() => undefined);
                          }
                        }}
                        className="inline-flex max-w-full items-center gap-2 rounded-full bg-yt-red/90 py-1 pl-1 pr-3 text-sm text-white"
                        title="Retirer"
                      >
                        <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-black/30">
                          <CoverImage
                            item={{ title: a.name, thumbnails: a.thumbnails, type: 'artist', id: a.id }}
                            size={64}
                            rounded="full"
                          />
                        </span>
                        <span className="truncate">{a.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-1">
                  {artistHits.map((a) => {
                    const name = a.title || 'Artiste';
                    const selected = artists.some((x) => x.id === a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition hover:bg-yt-hover ${
                          selected ? 'bg-yt-hover/80 ring-1 ring-yt-red/50' : ''
                        }`}
                        onClick={() => {
                          if (selected) {
                            setArtists((prev) => prev.filter((x) => x.id !== a.id));
                            if (mode === 'edit') {
                              void api.unfollowArtist(a.id).catch(() => undefined);
                            }
                            return;
                          }
                          setArtists((prev) => [
                            ...prev,
                            { id: a.id, name, thumbnails: a.thumbnails },
                          ]);
                          if (mode === 'edit') {
                            void api.followArtist(a.id, name).catch(() => undefined);
                          }
                        }}
                      >
                        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-yt-elevated">
                          <CoverImage item={a} size={96} rounded="full" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{name}</span>
                          <span className="text-xs text-yt-muted">Artiste</span>
                        </span>
                        <span className="shrink-0 text-xs text-yt-muted">
                          {selected ? 'Suivi' : 'Suivre'}
                        </span>
                      </button>
                    );
                  })}
                  {artistQ.trim().length >= 2 && artistHits.length === 0 && (
                    <p className="px-2 py-4 text-center text-sm text-yt-muted">Aucun artiste trouvé.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          )}
          {err && <p className="pb-2 text-sm text-red-400">{err}</p>}
        </div>

        <div className="shrink-0 border-t border-yt-border/80 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={step === 0 || busy || loading}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="rounded-full px-4 py-2.5 text-sm text-yt-muted hover:text-white disabled:opacity-40"
            >
              Retour
            </button>
            {step < 3 ? (
              <button
                type="button"
                disabled={!canNext || loading}
                onClick={() => setStep((s) => s + 1)}
                className="rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                Continuer
              </button>
            ) : (
              <button
                type="button"
                disabled={!canNext || busy || loading}
                onClick={() => void finish()}
                className="rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium disabled:opacity-40"
              >
                {busy
                  ? 'Enregistrement…'
                  : mode === 'edit'
                    ? 'Enregistrer'
                    : 'Lancer mes recommandations'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
