import { create } from 'zustand';
import { api, type LibraryData, type Track } from '../api';

type LibraryState = LibraryData & {
  loaded: boolean;
  refresh: () => Promise<void>;
  applyLibrary: (lib: LibraryData) => void;
  toggleLike: (track: Track) => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<import('../api').LibraryPlaylist | void>;
  deletePlaylist: (id: string) => Promise<void>;
  addToPlaylist: (playlistId: string, track: Track) => Promise<void>;
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

export const useLibrary = create<LibraryState>((set, get) => ({
  ...empty,
  loaded: false,

  applyLibrary: (lib) => set({ ...empty, ...lib, loaded: true }),

  refresh: async () => {
    const data = await api.library();
    set({ ...empty, ...data, loaded: true });
  },

  toggleLike: async (track) => {
    const { library } = await api.like(track);
    get().applyLibrary(library);
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

  recordPlay: async (track: Track) => {
    // Optimistic: appear instantly even if listen is interrupted
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
