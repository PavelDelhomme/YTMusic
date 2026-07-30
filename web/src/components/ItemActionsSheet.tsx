import {
  AudioLines,
  Check,
  Disc3,
  Download,
  Heart,
  Library,
  ListEnd,
  ListMinus,
  ListMusic,
  ListPlus,
  Mic2,
  Pin,
  PinOff,
  Share2,
  Smartphone,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Track } from '../api';
import { downloadAndCache, listCachedIds } from '../lib/offlineCache';
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

export function ItemActionsSheet({ onOpenEqualizer }: { onOpenEqualizer?: () => void }) {
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
  const { isLiked, toggleLike, playlists, addToPlaylist, hasAlbum, hasArtist, isPlaylistLiked, applyLibrary, downloaded, refresh } =
    useLibrary();
  const [busy, setBusy] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [pinId, setPinId] = useState<string | null>(null);
  const [onDevice, setOnDevice] = useState(false);

  useEffect(() => {
    if (!item) return;
    setShowPlaylists(false);
    void refresh().catch(() => undefined);
    void api
      .pins()
      .then((r) => {
        const hit = (r.pins || []).find(
          (p: { targetId?: string; id?: string }) => p.targetId === item.id || p.id === item.id,
        );
        setPinId(hit?.id || null);
      })
      .catch(() => setPinId(null));
    void listCachedIds()
      .then((ids) => setOnDevice(ids.includes(item.id) || downloaded.includes(item.id)))
      .catch(() => setOnDevice(downloaded.includes(item.id)));
  }, [item?.id, downloaded, refresh]);

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
  const artistsAll = (item.artists || []).filter(
    (a) => a?.name && !/^(inconnu|unknown|n\/a)$/i.test(a.name.trim()),
  );
  const collectionInLibrary =
    (item.type === 'album' && hasAlbum(item.id)) ||
    (item.type === 'artist' && hasArtist(item.id)) ||
    (item.type === 'playlist' && isPlaylistLiked(item.id));
  const albumSaved = albumId ? hasAlbum(albumId) : false;
  const canOpenAlbum = Boolean(albumId || item.album?.name || item.type === 'album');

  const after = (fn: () => void | Promise<void>) => {
    void (async () => {
      await fn();
      close();
    })();
  };

  const goArtist = async (a: { name: string; id?: string }) => {
    if (a.id) {
      navigate(`/artist/${a.id}`);
      return;
    }
    try {
      const r = await api.search(a.name, 'artist');
      const hit =
        (r.artists || []).find(
          (x) => x.title.toLowerCase() === a.name.toLowerCase() || x.id.startsWith('UC'),
        ) || r.artists?.[0];
      if (hit?.id) navigate(`/artist/${hit.id}`);
    } catch {
      /* ignore */
    }
  };

  const goAlbum = async () => {
    let id = albumId || (item.type === 'album' ? item.id : undefined);
    if (!id && item.album?.name) {
      try {
        const r = await api.search(item.album.name, 'album');
        id = r.albums?.[0]?.id;
      } catch {
        /* ignore */
      }
    }
    if (!id && playable) {
      try {
        const meta = await api.track(item.id);
        id = meta.track.album?.id;
      } catch {
        /* ignore */
      }
    }
    if (id) navigate(`/album/${id}`);
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
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-yt-muted hover:bg-white/10 hover:text-white"
              onClick={() => void toggleLike(item)}
            >
              <Heart className={`h-6 w-6 ${liked ? 'fill-yt-red text-yt-red' : ''}`} />
            </button>
          )}
          <button
            type="button"
            aria-label="Fermer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-yt-muted hover:bg-white/10 hover:text-white"
            onClick={close}
          >
            <X className="h-6 w-6" />
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
          {artistsAll.map((a) => (
            <Row
              key={`${a.name}-${a.id || 'x'}`}
              icon={<User className="h-4 w-4" />}
              label={`Accéder à ${a.name}`}
              onClick={() => after(() => goArtist(a))}
            />
          ))}
          {canOpenAlbum && (
            <Row
              icon={<Disc3 className="h-4 w-4" />}
              label="Accéder à l'album"
              sub={item.album?.name}
              onClick={() => after(() => goAlbum())}
            />
          )}
          {(artistsAll.length > 0 || canOpenAlbum) && (
            <div className="my-1 border-t border-white/10" />
          )}
          {playable && (
            <>
              <Row
                icon={<Sparkles className="h-4 w-4" />}
                label="En rapport"
                sub="Mix · similaires + découverte"
                onClick={() => after(() => void startMix(item))}
              />
              {artistsAll.length > 0 && (
                <Row
                  icon={<AudioLines className="h-4 w-4" />}
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
                  icon={<Disc3 className="h-4 w-4" />}
                  label="Radio de l'album"
                  onClick={() => after(() => void startRadio({ kind: 'album', id: albumId, seed: item }))}
                />
              )}
              {artistsAll[0] && (
                <Row
                  icon={<Mic2 className="h-4 w-4" />}
                  label="Radio de l'artiste"
                  sub={artistsAll[0].name}
                  onClick={() =>
                    after(async () => {
                      let id = artistsAll[0].id;
                      if (!id) {
                        const r = await api.search(artistsAll[0].name, 'artist');
                        id =
                          r.artists?.find((x) => x.id.startsWith('UC'))?.id || r.artists?.[0]?.id;
                      }
                      if (id) void startRadio({ kind: 'artist', id, seed: item });
                    })
                  }
                />
              )}
              {inQueue && !isCurrent ? (
                <Row
                  icon={<ListMinus className="h-4 w-4" />}
                  label="Supprimer de la file d'attente"
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
                icon={onDevice ? <Smartphone className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                label={onDevice ? "Sur l'appareil" : 'Télécharger'}
                onClick={() =>
                  after(async () => {
                    if (onDevice) return;
                    setBusy(true);
                    try {
                      await downloadAndCache(item);
                      await api.download(item.id).catch(() => undefined);
                      setOnDevice(true);
                    } finally {
                      setBusy(false);
                    }
                  })
                }
              />
              {onOpenEqualizer && (
                <Row
                  icon={<SlidersHorizontal className="h-4 w-4" />}
                  label="Égaliseur"
                  sub="Optionnel · désactivé par défaut"
                  onClick={() =>
                    after(() => {
                      onOpenEqualizer();
                    })
                  }
                />
              )}
              <Row
                icon={liked ? <Check className="h-5 w-5 text-yt-red" /> : <Library className="h-5 w-5" />}
                label={liked ? 'Dans la bibliothèque' : 'Enregistrer dans la bibliothèque'}
                sub={liked ? 'Appuyer pour retirer' : 'Ajoute aux titres J’aime'}
                disabled={busy}
                onClick={() => {
                  void toggleLike(item);
                }}
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

          {(item.type === 'album' || item.type === 'playlist' || item.type === 'artist') && (
            <Row
              icon={collectionInLibrary ? <Check className="h-4 w-4" /> : <Library className="h-4 w-4" />}
              label={collectionInLibrary ? 'Dans la bibliothèque' : 'Enregistrer dans la bibliothèque'}
              disabled={busy}
              onClick={() =>
                after(async () => {
                  setBusy(true);
                  try {
                    if (item.type === 'album' && hasAlbum(item.id)) {
                      const r = await api.removeAlbum(item.id);
                      applyLibrary(r.library);
                    } else if (item.type === 'album') {
                      const r = await api.saveAlbum({
                        id: item.id,
                        title: item.title,
                        artists: item.artists,
                        thumbnails: item.thumbnails,
                        type: 'album',
                      });
                      applyLibrary(r.library);
                    } else if (item.type === 'playlist') {
                      const r = await api.likePlaylist({
                        id: item.id,
                        title: item.title,
                        thumbnails: item.thumbnails,
                        type: 'playlist',
                      });
                      applyLibrary(r.library);
                    } else if (item.type === 'artist') {
                      const r = await api.saveArtist({
                        id: item.id,
                        name: item.title,
                        title: item.title,
                        thumbnails: item.thumbnails,
                        type: 'artist',
                      });
                      applyLibrary(r.library);
                    }
                  } finally {
                    setBusy(false);
                  }
                })
              }
            />
          )}

          {playable && albumId && (
            <Row
              icon={albumSaved ? <Check className="h-4 w-4" /> : <Library className="h-4 w-4" />}
              label={
                albumSaved ? 'Album dans la bibliothèque' : "Enregistrer l'album dans la bibliothèque"
              }
              disabled={busy}
              onClick={() =>
                after(async () => {
                  setBusy(true);
                  try {
                    if (albumSaved) {
                      const r = await api.removeAlbum(albumId);
                      applyLibrary(r.library);
                    } else {
                      const r = await api.saveAlbum({
                        id: albumId,
                        title: item.album?.name || item.title,
                        artists: item.artists,
                        thumbnails: item.thumbnails,
                        type: 'album',
                      });
                      applyLibrary(r.library);
                    }
                  } finally {
                    setBusy(false);
                  }
                })
              }
            />
          )}

          <Row
            icon={pinId ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            label={pinId ? "Retirer de l'accès rapide" : "Épingler à l'accès rapide"}
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
            icon={<Sparkles className="h-4 w-4 opacity-40" />}
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
      className="flex min-h-[4.5rem] flex-col items-center justify-center gap-2 rounded-xl px-2 py-3 text-center text-yt-muted transition hover:bg-yt-hover hover:text-white"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white">{icon}</span>
      <span className="text-xs font-medium leading-tight text-white">{label}</span>
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
      className="flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] hover:bg-yt-hover disabled:cursor-default disabled:opacity-40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center text-yt-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-white">{label}</span>
        {sub ? <span className="block truncate text-sm text-yt-muted">{sub}</span> : null}
      </span>
    </button>
  );
}
