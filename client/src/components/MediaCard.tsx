import { Link, useNavigate } from 'react-router-dom';
import type { Track } from '../api';
import { api } from '../api';
import { usePlayer } from '../store/player';
import { Library, Play, Plus } from 'lucide-react';
import { ArtistLinks } from './ArtistLinks';
import { CoverImage } from './CoverImage';
import { useLibrary } from '../store/library';
import { useState } from 'react';

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

  const onPlay = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
    e.preventDefault();
    e.stopPropagation();
    if (href) {
      navigate(href);
      return;
    }
    void play(item, queue);
  };

  const addLibrary = async (e: { preventDefault: () => void; stopPropagation: () => void }) => {
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

  const image = (
    <div
      className={`relative overflow-hidden bg-yt-elevated ${
        item.type === 'artist' ? 'rounded-full' : 'rounded-lg'
      }`}
    >
      <div className="aspect-square">
        <CoverImage
          item={item}
          size={400}
          rounded={item.type === 'artist' ? 'full' : 'lg'}
          className="transition duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
        {(item.type === 'playlist' || item.type === 'album' || item.type === 'artist') && !local && (
          <button
            type="button"
            title={inLib ? 'Dans la bibliothèque' : 'Ajouter à la bibliothèque'}
            disabled={busy || inLib}
            onClick={addLibrary}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white shadow-lg disabled:opacity-50"
          >
            {inLib ? <Library className="h-4 w-4 text-yt-red" /> : <Plus className="h-4 w-4" />}
          </button>
        )}
        {(item.type === 'song' || item.type === 'video' || item.type === 'unknown') && (
          <button
            type="button"
            onClick={onPlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-yt-red text-white shadow-lg"
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
            className="flex h-10 w-10 items-center justify-center rounded-full bg-yt-red text-white shadow-lg"
          >
            <Play className="h-5 w-5 fill-white" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="group w-40 shrink-0 text-left sm:w-44">
      {href ? (
        <Link to={href} className="block">
          {image}
        </Link>
      ) : (
        <button type="button" className="block w-full" onClick={() => void play(item, queue)}>
          {image}
        </button>
      )}
      <div className="mt-2 px-0.5">
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
              ? 'Playlist'
              : item.type === 'album'
                ? 'Album'
                : item.artists?.length
                  ? <ArtistLinks track={item} />
                  : item.type}
        </div>
      </div>
    </div>
  );
}

export function ShelfRow({ title, items }: { title: string; items: Track[] }) {
  if (!items.length) return null;
  return (
    <section className="animate-fade-up mb-8">
      <h2 className="mb-3 font-display text-xl font-semibold tracking-tight">{title}</h2>
      <div className="shelf-scroll">
        {items.map((item, i) => (
          <MediaCard key={`${title}-${item.id}-${i}`} item={item} queue={items} />
        ))}
      </div>
    </section>
  );
}
