import { useEffect, useState, type ReactNode } from 'react';
import { ListMusic, Mic2, Sparkles } from 'lucide-react';
import { api, thumb, type Track } from '../api';
import { usePlayer } from '../store/player';
import { CoverImage } from './CoverImage';
import { TrackRow } from './TrackRow';
import { useNavigate } from 'react-router-dom';

export type NowPlayingTab = 'queue' | 'lyrics' | 'related';

export function NowPlaying({
  open,
  onClose,
  initialTab = 'queue',
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: NowPlayingTab;
}) {
  const { current, queue, queueIndex, related, playAt, appendRelated, loadRelated } = usePlayer();
  const [tab, setTab] = useState<NowPlayingTab>(initialTab);
  const [lyricsText, setLyricsText] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !current?.id) return;
    void loadRelated(current.id);
  }, [open, current?.id, loadRelated]);

  useEffect(() => {
    if (!open || tab !== 'lyrics' || !current?.id) return;
    setLyricsLoading(true);
    void api
      .lyrics(current.id)
      .then((r) => setLyricsText(r.lyrics || null))
      .catch(() => setLyricsText(null))
      .finally(() => setLyricsLoading(false));
  }, [open, tab, current?.id]);

  if (!open || !current) return null;

  const upcoming = queue.slice(queueIndex + 1);
  const relatedArtists = uniqueArtists(related);

  return (
    <div className="fixed inset-0 z-[45] flex flex-col bg-[#030303] text-white animate-fade-up">
      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-1 gap-4 overflow-hidden px-3 pb-[100px] pt-3 md:grid-cols-[1fr_minmax(300px,400px)] md:gap-10 md:px-8 lg:px-14">
        {/* Cover centrale */}
        <div className="flex min-h-0 flex-col items-center justify-center overflow-hidden">
          <div className="mb-5 flex rounded-full bg-[#1d1d1d] p-1 text-xs font-medium">
            <span className="rounded-full bg-white/15 px-5 py-1.5 text-white">Titre</span>
            <span className="rounded-full px-5 py-1.5 text-yt-muted">Vidéo</span>
          </div>
          <div className="relative aspect-square w-full max-w-[min(92vw,560px)] overflow-hidden rounded-md shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
            <CoverImage item={current} size={800} rounded="md" />
          </div>
        </div>

        {/* Panneau droit : À suivre / Paroles / Similaires */}
        <aside className="flex min-h-0 flex-col overflow-hidden md:pt-2">
          <div className="mb-2 flex border-b border-white/10 text-[11px] font-bold tracking-wider sm:text-xs">
            <TabBtn active={tab === 'queue'} onClick={() => setTab('queue')} icon={<ListMusic className="h-3.5 w-3.5" />}>
              À suivre
            </TabBtn>
            <TabBtn active={tab === 'lyrics'} onClick={() => setTab('lyrics')} icon={<Mic2 className="h-3.5 w-3.5" />}>
              Paroles
            </TabBtn>
            <TabBtn active={tab === 'related'} onClick={() => setTab('related')} icon={<Sparkles className="h-3.5 w-3.5" />}>
              Similaires
            </TabBtn>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'queue' && (
              <div>
                <div className="mb-3 flex items-center justify-between gap-2 px-1 pt-1">
                  <p className="text-xs text-yt-muted">
                    Lecture à partir de :{' '}
                    <span className="font-medium text-white">File d&apos;attente</span>
                  </p>
                  <span className="text-[11px] text-yt-muted">{queue.length}</span>
                </div>
                <div className="mb-1 rounded-md bg-[#ff0033]/18 ring-1 ring-[#ff0033]/55">
                  <TrackRow track={current} queue={queue} index={queueIndex} />
                </div>
                {upcoming.map((t, i) => (
                  <TrackRow
                    key={`up-${t.id}-${queueIndex + 1 + i}`}
                    track={t}
                    index={queueIndex + 1 + i}
                    queue={queue}
                    onPlay={() => void playAt(queueIndex + 1 + i)}
                  />
                ))}
                {upcoming.length === 0 && (
                  <p className="px-2 py-8 text-center text-sm text-yt-muted">
                    Aucun titre à suivre — lance un album ou une playlist.
                  </p>
                )}
              </div>
            )}

            {tab === 'lyrics' && (
              <div className="whitespace-pre-wrap px-3 py-5 text-[15px] leading-8 text-[#c6c6c6]">
                {lyricsLoading
                  ? 'Chargement des paroles…'
                  : lyricsText || 'Paroles indisponibles pour ce titre.'}
              </div>
            )}

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
                    <TrackRow key={`rel-${t.id}`} track={t} queue={related} />
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
