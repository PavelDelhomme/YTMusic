import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../store/library';
import { TrackRow } from '../components/TrackRow';
import { Heart, Plus, Trash2 } from 'lucide-react';
import { usePlayer } from '../store/player';
import { MediaCard } from '../components/MediaCard';
import { CoverImage } from '../components/CoverImage';

export function LibraryPage() {
  const { liked, playlists, history, albums, artists, likedPlaylists, createPlaylist, deletePlaylist } =
    useLibrary();
  const playQueue = usePlayer((s) => s.playQueue);
  const [tab, setTab] = useState<'titres' | 'playlists' | 'albums' | 'artists' | 'history'>('titres');
  const [name, setName] = useState('');

  const tabs = [
    ['titres', 'Titres'],
    ['playlists', 'Playlists'],
    ['albums', 'Albums'],
    ['artists', 'Artistes'],
    ['history', 'Historique'],
  ] as const;

  return (
    <div className="animate-fade-up">
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">Bibliothèque</h1>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-1.5 text-sm ${
              tab === id ? 'bg-white text-black' : 'bg-yt-elevated text-yt-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'titres' && (
        <div>
          <p className="mb-4 text-sm text-yt-muted">
            Tes titres aimés — playlist automatique mise à jour dès que tu likes un morceau.
          </p>
          {liked.length === 0 ? (
            <p className="text-yt-muted">Aucun titre pour l'instant. Like un morceau pour le retrouver ici.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void playQueue(liked, 0)}
                className="mb-4 rounded-full bg-yt-red px-5 py-2 text-sm font-medium"
              >
                Tout lire
              </button>
              {liked.map((t) => (
                <TrackRow key={t.id} track={t} queue={liked} showAlbum />
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div>
          <p className="mb-4 text-sm text-yt-muted">
            Tous les titres démarrés, même si tu n’as pas tout écouté.
          </p>
          {history.length === 0 ? (
            <p className="text-yt-muted">L'historique apparaîtra dès que tu lances un titre.</p>
          ) : (
            history.map((t) => <TrackRow key={t.id} track={t} queue={history} showAlbum />)
          )}
        </div>
      )}

      {tab === 'albums' && (
        <div>
          {albums.length === 0 ? (
            <p className="text-yt-muted">Ajoute des albums via Importer ou le bouton « Ajouter à la bibliothèque ».</p>
          ) : (
            <div className="shelf-scroll">
              {albums.map((a: any) => (
                <MediaCard
                  key={a.id}
                  item={{
                    id: a.id,
                    title: a.title,
                    artists: a.artists || [],
                    thumbnails: a.thumbnails || [],
                    type: 'album',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'artists' && (
        <div>
          {artists.length === 0 ? (
            <p className="text-yt-muted">Ajoute des artistes à ta bibliothèque pour les retrouver ici.</p>
          ) : (
            <div className="shelf-scroll">
              {artists.map((a: any) => (
                <MediaCard
                  key={a.id}
                  item={{
                    id: a.id,
                    title: a.name || a.title,
                    artists: [],
                    thumbnails: a.thumbnails || [],
                    type: 'artist',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'playlists' && (
        <div>
          <form
            className="mb-6 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void createPlaylist(name.trim());
              setName('');
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de la playlist"
              className="flex-1 rounded-full border border-yt-border bg-yt-surface px-4 py-2 text-sm outline-none focus:border-white/30"
            />
            <button
              type="submit"
              className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black"
            >
              <Plus className="h-4 w-4" /> Créer
            </button>
          </form>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Playlist automatique : Titres aimés */}
            <button
              type="button"
              onClick={() => setTab('titres')}
              className="rounded-xl bg-yt-elevated p-4 text-left transition hover:bg-yt-hover"
            >
              <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-yt-red to-yt-red-dim">
                <Heart className="h-16 w-16 fill-white text-white" />
              </div>
              <div className="font-medium">Titres aimés</div>
              <div className="text-xs text-yt-muted">
                Playlist automatique · {liked.length} titre{liked.length !== 1 ? 's' : ''}
              </div>
            </button>

            {likedPlaylists.map((p: any) => (
              <Link
                key={p.id}
                to={`/playlist/${p.id}`}
                className="rounded-xl bg-yt-elevated p-4 transition hover:bg-yt-hover"
              >
                <div className="mb-3 aspect-square overflow-hidden rounded-lg bg-yt-border">
                  <CoverImage
                    item={{ title: p.title, thumbnails: p.thumbnails || [] }}
                    size={400}
                    rounded="lg"
                  />
                </div>
                <div className="font-medium">{p.title}</div>
                <div className="text-xs text-yt-muted">{p.author || 'YouTube'} · aimée</div>
              </Link>
            ))}

            {playlists.map((p) => (
              <div key={p.id} className="rounded-xl bg-yt-elevated p-4 transition hover:bg-yt-hover">
                <Link to={`/local-playlist/${p.id}`} className="block">
                  <div className="mb-3 aspect-square overflow-hidden rounded-lg bg-yt-border">
                    <CoverImage
                      item={
                        p.coverUrl
                          ? { title: p.name, thumbnails: [{ url: p.coverUrl }] }
                          : p.tracks[0] || { title: p.name, thumbnails: [] }
                      }
                      size={400}
                      rounded="lg"
                    />
                  </div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-yt-muted">{p.tracks.length} titres</div>
                </Link>
                <button
                  type="button"
                  onClick={() => void deletePlaylist(p.id)}
                  className="mt-3 flex items-center gap-1 text-xs text-yt-muted hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
