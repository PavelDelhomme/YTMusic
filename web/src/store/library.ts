import { create } from 'zustand';
import { api, type LibraryData, type Track } from '../api';

type LibraryState = LibraryData & {
  loaded: boolean;
  refresh: () => Promise<void>;
  applyLibrary: (lib: LibraryData | null | undefined) => void;
  toggleLike: (track: Track) => Promise<boolean>;
  createPlaylist: (name: string, description?: string) => Promise<import('../api').LibraryPlaylist | undefined>;
  deletePlaylist: (id: string) => Promise<void>;
  addToPlaylist: (playlistId: string, track: Track) => Promise<void>;
  addTracksToPlaylist: (playlistId: string, tracks: Track[]) => Promise<void>;
  recordPlay: (track: Track) => Promise<void>;
  isLiked: (id: string) => boolean;
  hasAlbum: (id: string) => boolean;
  hasArtist: (id: string) => boolean;
  isPlaylistLiked: (id: string) => boolean;
};

const empty: LibraryData = {
  liked: [],
  likedPlaylists: [],
  albums: [],
  artists: [],
  playlists: [],
  history: [],
  downloaded: [],
};

function mergeLibrary(lib: LibraryData): LibraryData {
  return {
    liked: Array.isArray(lib.liked) ? lib.liked : [],
    likedPlaylists: Array.isArray(lib.likedPlaylists) ? lib.likedPlaylists : [],
    albums: Array.isArray(lib.albums) ? lib.albums : [],
    artists: Array.isArray(lib.artists) ? lib.artists : [],
    playlists: Array.isArray(lib.playlists) ? lib.playlists : [],
    history: Array.isArray(lib.history) ? lib.history : [],
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
    // Optimiste : l’UI affiche tout de suite « Dans la bibliothèque » / retrait
    set((s) => ({
      liked: wasLiked
        ? s.liked.filter((t) => t.id !== track.id)
        : [track, ...s.liked.filter((t) => t.id !== track.id)],
    }));
    try {
      const r = await api.like(track);
      if (r.library) {
        get().applyLibrary(r.library);
      } else {
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
    set((s) => ({
      history: [track, ...s.history.filter((t) => t.id !== track.id)].slice(0, 500),
    }));
    try {
      const { history } = await api.recordHistory(track);
      set({ history });
    } catch {
      /* keep optimistic entry */
    }
  },

  isLiked: (id) => get().liked.some((t) => t.id === id),
  hasAlbum: (id) => get().albums.some((a) => a.id === id),
  hasArtist: (id) => get().artists.some((a) => a.id === id),
  isPlaylistLiked: (id) => get().likedPlaylists.some((p) => p.id === id),
}));
