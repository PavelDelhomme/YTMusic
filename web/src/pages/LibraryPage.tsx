import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../store/library';
import { TrackRow } from '../components/TrackRow';
import { Heart, Play, Plus, Shuffle, Trash2 } from 'lucide-react';
import { usePlayer } from '../store/player';
import { MediaCard } from '../components/MediaCard';
import { CoverImage } from '../components/CoverImage';
import type { Track } from '../api';

function shuffleTracks(tracks: Track[]) {
  const copy = [...tracks];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function LibraryPage() {
  const { songs, liked, playlists, history, albums, artists, likedPlaylists, createPlaylist, deletePlaylist } =
    useLibrary();
  const playQueue = usePlayer((s) => s.playQueue);
  const [tab, setTab] = useState<'titres' | 'liked' | 'playlists' | 'albums' | 'artists' | 'history'>('titres');
  const [name, setName] = useState('');

  const tabs = [
    ['titres', 'Titres'],
    ['liked', "J'aime"],
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
            Titres enregistrés dans ta bibliothèque (indépendant des J&apos;aime).
          </p>
          {songs.length === 0 ? (
            <p className="text-yt-muted">
              Aucun titre. Utilise « Enregistrer dans la bibliothèque » sur un morceau.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void playQueue(songs, 0)}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
                >
                  <Play className="h-4 w-4 fill-white" /> Tout lire
                </button>
                <button
                  type="button"
                  onClick={() => void playQueue(shuffleTracks(songs), 0)}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-5 py-2.5 text-sm font-medium text-yt-muted hover:text-white"
                >
                  <Shuffle className="h-4 w-4" /> Aléatoire
                </button>
              </div>
              {songs.map((t) => (
                <TrackRow key={t.id} track={t} queue={songs} showAlbum />
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'liked' && (
        <div>
          <p className="mb-4 text-sm text-yt-muted">
            Tes titres aimés — le cœur uniquement, sans obligation de les enregistrer.
          </p>
          {liked.length === 0 ? (
            <p className="text-yt-muted">Aucun J&apos;aime pour l&apos;instant.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void playQueue(liked, 0)}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
                >
                  <Play className="h-4 w-4 fill-white" /> Tout lire
                </button>
                <button
                  type="button"
                  onClick={() => void playQueue(shuffleTracks(liked), 0)}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-5 py-2.5 text-sm font-medium text-yt-muted hover:text-white"
                >
                  <Shuffle className="h-4 w-4" /> Aléatoire
                </button>
              </div>
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
            <p className="text-yt-muted">L&apos;historique apparaîtra dès que tu lances un titre.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void playQueue(history, 0)}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
                >
                  <Play className="h-4 w-4 fill-white" /> Tout lire
                </button>
                <button
                  type="button"
                  onClick={() => void playQueue(shuffleTracks(history), 0)}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-5 py-2.5 text-sm font-medium text-yt-muted hover:text-white"
                >
                  <Shuffle className="h-4 w-4" /> Aléatoire
                </button>
              </div>
              {history.map((t) => (
                <TrackRow key={t.id} track={t} queue={history} showAlbum />
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'albums' && (
        <div>
          {albums.length === 0 ? (
            <p className="text-yt-muted">Ajoute des albums via Importer ou le bouton « Ajouter à la bibliothèque ».</p>
          ) : (
            <>
              <p className="mb-4 text-sm text-yt-muted">Ouvre un album pour Lecture ou Aléatoire.</p>
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
            </>
          )}
        </div>
      )}

      {tab === 'artists' && (
        <div>
          {artists.length === 0 ? (
            <p className="text-yt-muted">Ajoute des artistes à ta bibliothèque pour les retrouver ici.</p>
          ) : (
            <>
              <p className="mb-4 text-sm text-yt-muted">Ouvre un artiste pour ses titres et sa radio.</p>
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
            </>
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

          {(() => {
            const allLocalTracks = playlists
              .flatMap((p) => p.tracks || [])
              .filter((t) => /^[a-zA-Z0-9_-]{11}$/.test(t.id));
            const unique = [...new Map(allLocalTracks.map((t) => [t.id, t])).values()];
            if (unique.length === 0) {
              return playlists.length + likedPlaylists.length > 0 ? (
                <p className="mb-4 text-sm text-yt-muted">Ouvre une playlist pour lancer la lecture.</p>
              ) : null;
            }
            return (
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void playQueue(unique, 0)}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
                >
                  <Play className="h-4 w-4 fill-white" /> Tout lire
                </button>
                <button
                  type="button"
                  onClick={() => void playQueue(shuffleTracks(unique), 0)}
                  className="inline-flex items-center gap-2 rounded-full bg-yt-elevated px-5 py-2.5 text-sm font-medium text-yt-muted hover:text-white"
                >
                  <Shuffle className="h-4 w-4" /> Aléatoire
                </button>
              </div>
            );
          })()}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
