export type Track = {
  id: string;
  title: string;
  artists: { name: string; id?: string }[];
  album?: { name: string; id?: string };
  duration?: string;
  durationSeconds?: number;
  thumbnails: { url: string; width?: number; height?: number }[];
  type: 'song' | 'video' | 'album' | 'playlist' | 'artist' | 'unknown';
};

export type PlaylistMeta = {
  id: string;
  title: string;
  author?: string;
  trackCount?: string;
  thumbnails: { url: string; width?: number; height?: number }[];
  description?: string;
};

export type ArtistMeta = {
  id: string;
  name: string;
  subscribers?: string;
  thumbnails: { url: string; width?: number; height?: number }[];
  description?: string;
};

export type AlbumMeta = {
  id: string;
  title: string;
  year?: string;
  artists: { name: string; id?: string }[];
  thumbnails: { url: string; width?: number; height?: number }[];
};

export type Shelf = {
  title: string;
  items: Track[];
};

export type LocalPlaylist = {
  id: string;
  name: string;
  createdAt: number;
  trackIds: string[];
  tracks: Track[];
};

export type LibraryData = {
  liked: Track[];
  playlists: LocalPlaylist[];
  history: Track[];
  downloaded: string[];
};
