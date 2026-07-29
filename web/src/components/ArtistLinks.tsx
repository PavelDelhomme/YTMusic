import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Track } from '../api';

/** Noms d'artistes cliquables → page artiste (résout l’id via recherche si absent). */
export function ArtistLinks({
  track,
  className = '',
  separator = ', ',
  onArtistClick,
  emptyLabel = 'Artiste',
}: {
  track: Track | { artists?: { name: string; id?: string }[] };
  className?: string;
  separator?: string;
  onArtistClick?: (id: string) => void;
  emptyLabel?: string;
}) {
  const navigate = useNavigate();
  const [busyName, setBusyName] = useState<string | null>(null);
  const artists = (track.artists || []).filter(
    (a) => a?.name && !/^(inconnu|unknown|n\/a)$/i.test(a.name.trim()),
  );
  if (!artists.length) {
    return emptyLabel ? <span className={className}>{emptyLabel}</span> : null;
  }

  const go = async (a: { name: string; id?: string }) => {
    if (a.id) {
      if (onArtistClick) onArtistClick(a.id);
      else navigate(`/artist/${a.id}`);
      return;
    }
    setBusyName(a.name);
    try {
      const r = await api.search(a.name, 'artist');
      const hit =
        (r.artists || []).find(
          (x) => x.title.toLowerCase() === a.name.toLowerCase() || x.id.startsWith('UC'),
        ) || r.artists?.[0];
      if (hit?.id) {
        if (onArtistClick) onArtistClick(hit.id);
        else navigate(`/artist/${hit.id}`);
      }
    } catch {
      /* ignore */
    } finally {
      setBusyName(null);
    }
  };

  return (
    <span className={className}>
      {artists.map((a, i) => (
        <span key={`${a.name}-${a.id || i}`}>
          {i > 0 ? separator : null}
          <button
            type="button"
            disabled={busyName === a.name}
            onClick={(e) => {
              e.stopPropagation();
              void go(a);
            }}
            className="hover:underline hover:text-white disabled:opacity-60"
            title={a.id ? `Voir ${a.name}` : `Rechercher ${a.name}`}
          >
            {busyName === a.name ? '…' : a.name}
          </button>
        </span>
      ))}
    </span>
  );
}
