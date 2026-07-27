import { Link } from 'react-router-dom';
import type { Track } from '../api';

/** Noms d'artistes cliquables → page artiste */
export function ArtistLinks({
  track,
  className = '',
  separator = ', ',
  onArtistClick,
}: {
  track: Track | { artists?: { name: string; id?: string }[] };
  className?: string;
  separator?: string;
  onArtistClick?: (id: string) => void;
}) {
  const artists = track.artists || [];
  if (!artists.length) {
    return <span className={className}>Artiste inconnu</span>;
  }

  return (
    <span className={className}>
      {artists.map((a, i) => (
        <span key={`${a.name}-${a.id || i}`}>
          {i > 0 ? separator : null}
          {a.id ? (
            onArtistClick ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onArtistClick(a.id!);
                }}
                className="hover:underline hover:text-white"
              >
                {a.name}
              </button>
            ) : (
              <Link
                to={`/artist/${a.id}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:underline hover:text-white"
              >
                {a.name}
              </Link>
            )
          ) : (
            <span>{a.name}</span>
          )}
        </span>
      ))}
    </span>
  );
}
