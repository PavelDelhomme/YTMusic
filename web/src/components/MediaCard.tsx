import { Link, useNavigate } from 'react-router-dom';
import type { Track } from '../api';
import { api } from '../api';
import { usePlayer } from '../store/player';
import { Library, MoreHorizontal, Pin, Play, Plus } from 'lucide-react';
import { ArtistLinks } from './ArtistLinks';
import { CoverImage } from './CoverImage';
import { useLibrary } from '../store/library';
import { useState, type MouseEvent } from 'react';
import { useItemActions } from '../store/itemActions';

function isLocalPlaylist(item: Track) {
  return item.id.startsWith('local:') || item.album?.id?.startsWith('local:');
}

function localPlaylistId(item: Track) {
  if (item.id.startsWith('local:')) return item.id.slice(6);
  if (item.album?.id?.startsWith('local:')) return item.album.id.slice(6);
  return item.id;
}

export function MediaCard({ item, queue }: { item: Track; queue?: Track[] }) {
  const play = usePlayer((s) => s.play);
  const navigate = useNavigate();
  const openActions = useItemActions((s) => s.open);
  const { applyLibrary, isPlaylistLiked, hasAlbum, hasArtist } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const local = isLocalPlaylist(item);
  const href = local
    ? `/local-playlist/${localPlaylistId(item)}`
    : item.type === 'artist'
      ? `/artist/${item.id}`
      : item.type === 'album'
        ? `/album/${item.id}`
        : item.type === 'playlist'
          ? `/playlist/${item.id}`
          : null;

  const inLib =
    saved ||
    (item.type === 'playlist' && !local && isPlaylistLiked(item.id)) ||
    (item.type === 'album' && hasAlbum(item.id)) ||
    (item.type === 'artist' && hasArtist(item.id));

  const openItem = () => {
    if (href) {
      navigate(href);
      return;
    }
    void play(item, queue);
  };

  const onPlay = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (href) {
      navigate(href);
      return;
    }
    void play(item, queue);
  };

  const openMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openActions(item);
  };

  const addLibrary = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy || inLib || local) return;
    setBusy(true);
    try {
      if (item.type === 'playlist') {
        const r = await api.import({ kind: 'playlist', id: item.id });
        applyLibrary(r.library);
        setSaved(true);
      } else if (item.type === 'album') {
        const r = await api.import({ kind: 'album', id: item.id });
        applyLibrary(r.library);
        setSaved(true);
      } else if (item.type === 'artist') {
        const r = await api.import({ kind: 'artist', id: item.id });
        applyLibrary(r.library);
        setSaved(true);
      } else if (/^[a-zA-Z0-9_-]{11}$/.test(item.id)) {
        const r = await api.import({ kind: 'track', id: item.id });
        applyLibrary(r.library);
        setSaved(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const cover = (
    <div
      className={`relative overflow-hidden bg-yt-elevated ${
        item.type === 'artist' ? 'rounded-full' : 'rounded-lg'
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        className="aspect-square cursor-pointer"
        onClick={openItem}
        onContextMenu={openMenu}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openItem();
          }
        }}
      >
        <CoverImage
          item={item}
          size={400}
          rounded={item.type === 'artist' ? 'full' : 'lg'}
          className="transition duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          title="Plus d'options"
          onClick={openMenu}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Épingler à l’accueil"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void api
              .addPin({
                kind: item.type || 'song',
                targetId: item.id,
                payload: item,
                id: item.id,
              })
              .catch((err) => console.error(err));
          }}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg"
        >
          <Pin className="h-4 w-4" />
        </button>
        {(item.type === 'playlist' || item.type === 'album' || item.type === 'artist') && !local && (
          <button
            type="button"
            title={inLib ? 'Dans la bibliothèque' : 'Ajouter à la bibliothèque'}
            disabled={busy || inLib}
            onClick={addLibrary}
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg disabled:opacity-50"
          >
            {inLib ? <Library className="h-4 w-4 text-yt-red" /> : <Plus className="h-4 w-4" />}
          </button>
        )}
        {(item.type === 'song' || item.type === 'video' || item.type === 'unknown' || !href) && (
          <button
            type="button"
            onClick={onPlay}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-yt-red text-white shadow-lg"
          >
            <Play className="h-5 w-5 fill-white" />
          </button>
        )}
        {(item.type === 'playlist' || item.type === 'album') && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (href) navigate(href);
            }}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-yt-red text-white shadow-lg"
          >
            <Play className="h-5 w-5 fill-white" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="group w-40 shrink-0 text-left sm:w-44" onContextMenu={openMenu}>
      {cover}
      <div className="mt-2 flex items-start gap-1 px-0.5">
        <div className="min-w-0 flex-1">
          {href ? (
            <Link to={href} className="block truncate text-sm font-medium hover:underline">
              {item.title}
            </Link>
          ) : (
            <button
              type="button"
              className="block w-full truncate text-left text-sm font-medium"
              onClick={() => void play(item, queue)}
            >
              {item.title}
            </button>
          )}
          <div className="truncate text-xs text-yt-muted">
            {item.type === 'artist'
              ? 'Artiste'
              : item.type === 'playlist'
                ? item.artists?.length
                  ? <ArtistLinks track={item} />
                  : 'Playlist'
                : item.type === 'album'
                  ? item.artists?.length
                    ? <ArtistLinks track={item} />
                    : 'Album'
                  : item.artists?.length
                    ? <ArtistLinks track={item} />
                    : item.type === 'song' || item.type === 'video'
                      ? 'Titre'
                      : item.type}
          </div>
        </div>
        <button
          type="button"
          aria-label="Plus d'options"
          onClick={openMenu}
          className="shrink-0 rounded-full p-1 text-yt-muted opacity-100 transition hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ShelfRow({ title, items }: { title: string; items: Track[] }) {
  if (!items.length) return null;
  return (
    <section className="animate-fade-up mb-8">
      {title ? <h2 className="mb-3 font-display text-xl font-semibold tracking-tight">{title}</h2> : null}
      <div className="shelf-scroll">
        {items.map((item, i) => (
          <MediaCard key={`${title}-${item.id}-${i}`} item={item} queue={items} />
        ))}
      </div>
    </section>
  );
}
