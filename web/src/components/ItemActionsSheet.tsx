import {
  Disc3,
  Download,
  Heart,
  Library,
  ListEnd,
  ListMusic,
  ListPlus,
  Pin,
  Radio,
  Share2,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Track } from '../api';
import { downloadAndCache } from '../lib/offlineCache';
import { formatTrackDuration } from '../lib/time';
import { useItemActions } from '../store/itemActions';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { ArtistLinks } from './ArtistLinks';
import { CoverImage } from './CoverImage';

function isPlayable(t: Track) {
  return t.type === 'song' || t.type === 'video' || t.type === 'unknown' || /^[a-zA-Z0-9_-]{11}$/.test(t.id);
}

function shareUrl(track: Track) {
  if (track.type === 'playlist') return `https://music.youtube.com/playlist?list=${track.id}`;
  if (track.type === 'album') return `https://music.youtube.com/browse/${track.id}`;
  if (track.type === 'artist') return `https://music.youtube.com/channel/${track.id}`;
  return `https://music.youtube.com/watch?v=${track.id}`;
}

async function shareTrack(track: Track) {
  const text = `${track.title} — ${track.artists?.map((a) => a.name).join(', ') || ''}\n${shareUrl(track)}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: track.title, text, url: shareUrl(track) });
      return;
    }
  } catch {
    /* cancelled */
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

export function ItemActionsSheet() {
  const item = useItemActions((s) => s.item);
  const opts = useItemActions((s) => s.opts);
  const close = useItemActions((s) => s.close);
  const navigate = useNavigate();
  const addNext = usePlayer((s) => s.addNext);
  const addToQueue = usePlayer((s) => s.addToQueue);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const startRadio = usePlayer((s) => s.startRadio);
  const startMix = usePlayer((s) => s.startMix);
  const queue = usePlayer((s) => s.queue);
  const queueIndex = usePlayer((s) => s.queueIndex);
  const { isLiked, toggleLike, playlists, addToPlaylist, hasAlbum, applyLibrary } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [pinId, setPinId] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setShowPlaylists(false);
    void api
      .pins()
      .then((r) => {
        const hit = (r.pins || []).find(
          (p: { targetId?: string; id?: string }) => p.targetId === item.id || p.id === item.id,
        );
        setPinId(hit?.id || null);
      })
      .catch(() => setPinId(null));
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, close]);

  if (!item) return null;

  const liked = isLiked(item.id);
  const playable = isPlayable(item);
  const absQueueIndex =
    typeof opts.queueIndex === 'number'
      ? opts.queueIndex
      : queue.findIndex((t) => t.id === item.id);
  const inQueue = absQueueIndex >= 0;
  const isCurrent = inQueue && absQueueIndex === queueIndex;
  const duration = formatTrackDuration(item);
  const albumId = item.album?.id;
  const artistsWithId = item.artists?.filter((a) => a.id) || [];

  const after = (fn: () => void | Promise<void>) => {
    void (async () => {
      await fn();
      close();
    })();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Fermer" onClick={close} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-yt-border bg-yt-elevated shadow-2xl animate-fade-up sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-white/10 px-4 pb-3 pt-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md">
            <CoverImage item={item} size={120} rounded="md" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="truncate text-base font-semibold text-white">{item.title}</div>
            <div className="mt-0.5 truncate text-sm text-yt-muted">
              {item.artists?.length ? <ArtistLinks track={item} /> : item.type || 'Titre'}
              {duration ? <span className="text-yt-muted"> · {duration}</span> : null}
            </div>
          </div>
          {playable && (
            <button
              type="button"
              title={liked ? 'Retirer des aimés' : "J'aime"}
              className="shrink-0 rounded-full p-2 text-yt-muted hover:text-white"
              onClick={() => void toggleLike(item)}
            >
              <Heart className={`h-5 w-5 ${liked ? 'fill-yt-red text-yt-red' : ''}`} />
            </button>
          )}
          <button
            type="button"
            aria-label="Fermer"
            className="shrink-0 rounded-full p-2 text-yt-muted hover:text-white"
            onClick={close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 3 boutons rapides */}
        {playable && (
          <div className="grid grid-cols-3 gap-1 border-b border-white/10 px-2 py-3">
            <QuickBtn
              icon={<ListPlus className="h-5 w-5" />}
              label="Lire ensuite"
              onClick={() =>
                after(() => {
                  if (inQueue && absQueueIndex >= 0 && absQueueIndex !== queueIndex) {
                    const cur = usePlayer.getState().queueIndex;
                    const dest = absQueueIndex < cur ? cur : cur + 1;
                    usePlayer.getState().moveInQueue(absQueueIndex, dest);
                  } else {
                    addNext(item);
                  }
                })
              }
            />
            <QuickBtn
              icon={<ListMusic className="h-5 w-5" />}
              label="Playlist"
              onClick={() => setShowPlaylists((v) => !v)}
            />
            <QuickBtn
              icon={<Share2 className="h-5 w-5" />}
              label="Partager"
              onClick={() => after(() => shareTrack(item))}
            />
          </div>
        )}

        {showPlaylists && (
          <div className="border-b border-white/10 px-2 py-2">
            <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-yt-muted">
              Enregistrer dans une playlist
            </div>
            {playlists.length === 0 && (
              <p className="px-3 py-2 text-sm text-yt-muted">Aucune playlist locale.</p>
            )}
            {playlists.map((p) => (
              <Row
                key={p.id}
                icon={<ListMusic className="h-4 w-4" />}
                label={p.name}
                onClick={() => after(() => void addToPlaylist(p.id, item))}
              />
            ))}
          </div>
        )}

        <div className="py-1 pb-6">
          {playable && (
            <>
              <Row
                icon={<Radio className="h-4 w-4" />}
                label="Démarrer le mix"
                sub="Similaires + découverte"
                onClick={() => after(() => void startMix(item))}
              />
              {item.artists?.some((a) => a.id) && (
                <Row
                  icon={<Radio className="h-4 w-4" />}
                  label="Radio proche de l'artiste"
                  sub="Plus du même univers"
                  onClick={() =>
                    after(() =>
                      void startRadio({ kind: 'track', id: item.id, seed: item, stayClose: true }),
                    )
                  }
                />
              )}
              {albumId && (
                <Row
                  icon={<Radio className="h-4 w-4" />}
                  label="Radio de l'album"
                  onClick={() => after(() => void startRadio({ kind: 'album', id: albumId, seed: item }))}
                />
              )}
              {artistsWithId[0]?.id && (
                <Row
                  icon={<Radio className="h-4 w-4" />}
                  label="Radio de l'artiste"
                  onClick={() =>
                    after(() => void startRadio({ kind: 'artist', id: artistsWithId[0].id!, seed: item }))
                  }
                />
              )}
              {inQueue && !isCurrent ? (
                <Row
                  icon={<Trash2 className="h-4 w-4" />}
                  label="Retirer de la file d'attente"
                  onClick={() => after(() => removeFromQueue(absQueueIndex))}
                />
              ) : (
                <Row
                  icon={<ListEnd className="h-4 w-4" />}
                  label="Ajouter à la file d'attente"
                  sub="À la fin de la file prévue"
                  onClick={() => after(() => addToQueue(item))}
                />
              )}
              <Row
                icon={<Download className="h-4 w-4" />}
                label="Télécharger"
                onClick={() =>
                  after(async () => {
                    setBusy(true);
                    try {
                      await downloadAndCache(item);
                      await api.download(item.id).catch(() => undefined);
                    } finally {
                      setBusy(false);
                    }
                  })
                }
              />
            </>
          )}

          {opts.playlistId && opts.onRemoveFromPlaylist && (
            <Row
              icon={<Trash2 className="h-4 w-4" />}
              label="Supprimer de la playlist"
              onClick={() => after(() => opts.onRemoveFromPlaylist?.())}
            />
          )}

          {albumId && (
            <Row
              icon={<Disc3 className="h-4 w-4" />}
              label="Accéder à l'album"
              sub={item.album?.name}
              onClick={() =>
                after(() => {
                  navigate(`/album/${albumId}`);
                })
              }
            />
          )}
          {artistsWithId.map((a) => (
            <Row
              key={a.id}
              icon={<User className="h-4 w-4" />}
              label={`Accéder à ${a.name}`}
              onClick={() =>
                after(() => {
                  navigate(`/artist/${a.id}`);
                })
              }
            />
          ))}

          {(item.type === 'album' || item.type === 'playlist' || item.type === 'artist') && (
            <Row
              icon={<Library className="h-4 w-4" />}
              label="Enregistrer dans la bibliothèque"
              disabled={busy}
              onClick={() =>
                after(async () => {
                  setBusy(true);
                  try {
                    const kind =
                      item.type === 'album' ? 'album' : item.type === 'artist' ? 'artist' : 'playlist';
                    const r = await api.import({ kind, id: item.id });
                    applyLibrary(r.library);
                  } finally {
                    setBusy(false);
                  }
                })
              }
            />
          )}

          {playable && albumId && !hasAlbum(albumId) && (
            <Row
              icon={<Library className="h-4 w-4" />}
              label="Enregistrer l'album dans la bibliothèque"
              disabled={busy}
              onClick={() =>
                after(async () => {
                  setBusy(true);
                  try {
                    const r = await api.import({ kind: 'album', id: albumId });
                    applyLibrary(r.library);
                  } finally {
                    setBusy(false);
                  }
                })
              }
            />
          )}

          <Row
            icon={<Pin className="h-4 w-4" />}
            label={pinId ? "Retirer de l'accès rapide" : "Épingler dans l'accès rapide"}
            onClick={() =>
              after(async () => {
                if (pinId) {
                  await api.removePin(pinId).catch(() => undefined);
                } else {
                  await api
                    .addPin({
                      kind: item.type || 'song',
                      targetId: item.id,
                      payload: item,
                      id: item.id,
                    })
                    .catch(() => undefined);
                }
              })
            }
          />

          <Row
            icon={<Radio className="h-4 w-4 opacity-40" />}
            label="Mise en veille"
            sub="Bientôt — 5 / 15 / 30 min, 1 h, fin de chanson"
            disabled
            onClick={() => undefined}
          />
        </div>
      </div>
    </div>
  );
}

function QuickBtn({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-2 text-center text-yt-muted transition hover:bg-yt-hover hover:text-white"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">{icon}</span>
      <span className="text-[11px] font-medium leading-tight text-white">{label}</span>
    </button>
  );
}

function Row({
  icon,
  label,
  sub,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm hover:bg-yt-hover disabled:cursor-default disabled:opacity-40"
    >
      <span className="mt-0.5 shrink-0 text-yt-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-white">{label}</span>
        {sub ? <span className="block truncate text-xs text-yt-muted">{sub}</span> : null}
      </span>
    </button>
  );
}
