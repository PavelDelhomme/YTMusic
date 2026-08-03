import { create } from 'zustand';
import { api, type LibraryData, type Track } from '../api';

type LibraryState = LibraryData & {
  loaded: boolean;
  refresh: () => Promise<void>;
  applyLibrary: (lib: LibraryData | null | undefined) => void;
  toggleLike: (track: Track) => Promise<boolean>;
  toggleLibrarySong: (track: Track) => Promise<boolean>;
  createPlaylist: (name: string, description?: string) => Promise<import('../api').LibraryPlaylist | undefined>;
  deletePlaylist: (id: string) => Promise<void>;
  addToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, tracks: Track[]) => Promise<void>;
  recordPlay: (track: Track) => Promise<void>;
  recordEntityPlay: (entity: {
    id: string;
    kind: 'playlist' | 'album' | 'artist' | 'mix';
    title?: string;
    thumbnails?: Track['thumbnails'];
    artists?: Track['artists'];
  }) => Promise<void>;
  isLiked: (id: string) => boolean;
  isInLibrary: (id: string) => boolean;
  hasAlbum: (id: string) => boolean;
  hasArtist: (id: string) => boolean;
  hasMix: (id: string) => boolean;
  isPlaylistLiked: (id: string) => boolean;
  saveMix: (mix: { id: string; title: string; tracks?: Track[]; covers?: Track[] }) => Promise<boolean>;
  removeMix: (id: string) => Promise<void>;
};

const empty: LibraryData = {
  songs: [],
  liked: [],
  likedPlaylists: [],
  albums: [],
  artists: [],
  mixes: [],
  playlists: [],
  history: [],
  recentEntities: [],
  downloaded: [],
};

function mergeLibrary(lib: LibraryData): LibraryData {
  const liked = Array.isArray(lib.liked) ? lib.liked : [];
  // Compat anciennes réponses API sans `songs`
  const songs = Array.isArray(lib.songs) ? lib.songs : liked;
  return {
    songs,
    liked,
    likedPlaylists: Array.isArray(lib.likedPlaylists) ? lib.likedPlaylists : [],
    albums: Array.isArray(lib.albums) ? lib.albums : [],
    artists: Array.isArray(lib.artists) ? lib.artists : [],
    mixes: Array.isArray((lib as LibraryData).mixes) ? (lib as LibraryData).mixes : [],
    playlists: Array.isArray(lib.playlists) ? lib.playlists : [],
    history: Array.isArray(lib.history) ? lib.history : [],
    recentEntities: Array.isArray((lib as LibraryData).recentEntities)
      ? (lib as LibraryData).recentEntities
      : [],
    downloaded: Array.isArray(lib.downloaded) ? lib.downloaded : [],
  };
}

export const useLibrary = create<LibraryState>((set, get) => ({
  ...empty,
  loaded: false,

  applyLibrary: (lib) => {
    if (!lib || typeof lib !== 'object') return;
    set({ ...mergeLibrary(lib), loaded: true });
  },

  refresh: async () => {
    try {
      const data = await api.library();
      set({ ...mergeLibrary(data), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  toggleLike: async (track) => {
    const wasLiked = get().isLiked(track.id);
    set((s) => ({
      liked: wasLiked
        ? s.liked.filter((t) => t.id !== track.id)
        : [track, ...s.liked.filter((t) => t.id !== track.id)],
    }));
    try {
      const r = await api.like(track);
      if (r.library) get().applyLibrary(r.library);
      else {
        set((s) => ({
          liked: r.liked
            ? [track, ...s.liked.filter((t) => t.id !== track.id)]
            : s.liked.filter((t) => t.id !== track.id),
        }));
      }
      return r.liked;
    } catch {
      set((s) => ({
        liked: wasLiked
          ? [track, ...s.liked.filter((t) => t.id !== track.id)]
          : s.liked.filter((t) => t.id !== track.id),
      }));
      throw new Error('like failed');
    }
  },

  toggleLibrarySong: async (track) => {
    const wasSaved = get().isInLibrary(track.id);
    set((s) => ({
      songs: wasSaved
        ? s.songs.filter((t) => t.id !== track.id)
        : [track, ...s.songs.filter((t) => t.id !== track.id)],
    }));
    try {
      const r = await api.toggleLibrarySong(track);
      if (r.library) get().applyLibrary(r.library);
      else {
        set((s) => ({
          songs: r.saved
            ? [track, ...s.songs.filter((t) => t.id !== track.id)]
            : s.songs.filter((t) => t.id !== track.id),
        }));
      }
      return r.saved;
    } catch {
      set((s) => ({
        songs: wasSaved
          ? [track, ...s.songs.filter((t) => t.id !== track.id)]
          : s.songs.filter((t) => t.id !== track.id),
      }));
      throw new Error('library song failed');
    }
  },

  createPlaylist: async (name, description = '') => {
    const pl = await api.createPlaylist(name, description);
    await get().refresh();
    return pl;
  },

  deletePlaylist: async (id) => {
    const { library } = await api.deletePlaylist(id);
    get().applyLibrary(library);
  },

  addToPlaylist: async (playlistId, track) => {
    await api.addToPlaylist(playlistId, track);
    await get().refresh();
  },

  addTracksToPlaylist: async (playlistId, tracks) => {
    const seen = new Set<string>();
    for (const t of tracks) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      await api.addToPlaylist(playlistId, t);
    }
    await get().refresh();
  },

  recordPlay: async (track: Track) => {
    // Optimistic seulement — l’écriture serveur passe par api.listen (évite double compteur)
    set((s) => ({
      history: [track, ...s.history.filter((t) => t.id !== track.id)].slice(0, 500),
    }));
  },

  recordEntityPlay: async (entity) => {
    const asTrack: Track = {
      id: entity.id,
      title: entity.title || entity.id,
      type: entity.kind,
      artists: entity.artists || [],
      thumbnails: entity.thumbnails || [],
    };
    set((s) => ({
      recentEntities: [asTrack, ...s.recentEntities.filter((t) => t.id !== entity.id)].slice(0, 40),
    }));
    try {
      const { entities } = await api.recordEntityPlay(entity);
      set({ recentEntities: entities });
    } catch {
      /* keep optimistic */
    }
  },

  isLiked: (id) => get().liked.some((t) => t.id === id),
  isInLibrary: (id) => get().songs.some((t) => t.id === id),
  hasAlbum: (id) => get().albums.some((a) => a.id === id),
  hasArtist: (id) => get().artists.some((a) => a.id === id),
  hasMix: (id) => get().mixes.some((m) => m.id === id),
  isPlaylistLiked: (id) => get().likedPlaylists.some((p) => p.id === id),
  saveMix: async (mix) => {
    const r = await api.saveMix(mix);
    if (r.library) get().applyLibrary(r.library);
    return r.saved;
  },
  removeMix: async (id) => {
    const r = await api.removeMix(id);
    get().applyLibrary(r.library);
  },
}));
