import { Innertube, UniversalCache, ClientType } from 'youtubei.js';
import { extractThumbs, mapAny, mapListItem, parseAuthorField } from './mappers.js';
import type { AlbumMeta, ArtistMeta, PlaylistMeta, Shelf, Track } from './types.js';

let yt: Innertube | null = null;

export async function getYT(): Promise<Innertube> {
  if (yt) return yt;
  yt = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    client_type: ClientType.WEB,
  });
  return yt;
}

function shelvesFrom(sections: any[]): Shelf[] {
  const shelves: Shelf[] = [];
  for (const section of sections || []) {
    const title =
      section?.header?.title?.text ||
      section?.header?.title?.toString?.() ||
      section?.title?.text ||
      section?.title?.toString?.() ||
      'Suggestions';

    const contents = section?.contents || section?.items || [];
    const items = contents
      .map((c: any) => mapAny(c))
      .filter(Boolean) as Track[];

    if (items.length) shelves.push({ title: String(title), items });
  }
  return shelves;
}

export async function getHome(): Promise<Shelf[]> {
  const innertube = await getYT();
  const home = await innertube.music.getHomeFeed();
  const sections = (home as any).sections || (home as any).contents || [];
  return shelvesFrom(Array.isArray(sections) ? sections : []);
}

export async function getHomeMore(page: number, seedIds: string[] = []): Promise<{
  shelves: Shelf[];
  hasMore: boolean;
}> {
  const innertube = await getYT();
  const shelves: Shelf[] = [];

  if (page === 1) {
    try {
      const explore = await innertube.music.getExplore();
      const sections = (explore as any).sections || (explore as any).contents || [];
      shelves.push(...shelvesFrom(Array.isArray(sections) ? sections : []));
    } catch {
      /* ignore */
    }
  } else if (page === 2) {
    const moods = [
      'focus playlist',
      'chill hits playlist',
      'workout playlist',
      'party mix playlist',
      'indie playlist',
      'jazz playlist',
    ];
    for (const q of moods) {
      try {
        const result = await innertube.music.search(q, { type: 'playlist' } as any);
        const items: Track[] = [];
        for (const shelf of (result as any).contents || []) {
          for (const item of shelf?.contents || shelf?.items || []) {
            const m = mapAny(item);
            if (m && (m.type === 'playlist' || m.id.startsWith('PL') || m.id.startsWith('VL'))) {
              items.push({ ...m, type: 'playlist' });
            }
          }
        }
        if (items.length) shelves.push({ title: q.replace(' playlist', '').replace(/^./, (c) => c.toUpperCase()), items: items.slice(0, 12) });
      } catch {
        /* ignore */
      }
    }
  } else {
    // Pages 3+ : recommandations à partir des seeds (historique / top)
    const seeds = seedIds.slice((page - 3) * 3, (page - 3) * 3 + 3);
    for (const id of seeds) {
      if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) continue;
      try {
        const { related, radio } = await getRelated(id);
        const pool = [...radio, ...related].filter((t) => isPlayableId(t.id));
        if (pool.length) {
          shelves.push({
            title: 'Recommandé pour toi',
            items: pool.slice(0, 16),
          });
        }
      } catch {
        /* ignore */
      }
    }
    // Fallback search waves
    if (!shelves.length) {
      const queries = ['new music friday', 'top songs 2024', 'viral hits', 'deep focus', 'lofi beats', 'french pop'];
      const q = queries[(page - 3) % queries.length];
      try {
        const result = await innertube.music.search(q);
        const items: Track[] = [];
        for (const shelf of (result as any).contents || []) {
          for (const item of shelf?.contents || shelf?.items || []) {
            const m = mapAny(item);
            if (m) items.push(m);
          }
        }
        if (items.length) shelves.push({ title: `À découvrir · ${q}`, items: items.slice(0, 20) });
      } catch {
        /* ignore */
      }
    }
  }

  // Dedupe shelf titles with page suffix if needed
  const titled = shelves.map((s, i) => ({
    ...s,
    title: s.title,
    items: s.items,
  }));

  return { shelves: titled, hasMore: page < 12 };
}

function isPlayableId(id: string) {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}

export async function getExplore(): Promise<Shelf[]> {
  const innertube = await getYT();
  const explore = await innertube.music.getExplore();
  const sections = (explore as any).sections || (explore as any).contents || [];
  return shelvesFrom(Array.isArray(sections) ? sections : []);
}

export async function search(query: string, filter?: string) {
  const innertube = await getYT();
  const filters =
    filter && filter !== 'all'
      ? ({ type: filter } as any)
      : undefined;
  const result = await innertube.music.search(query, filters);

  const songs: Track[] = [];
  const videos: Track[] = [];
  const albums: Track[] = [];
  const artists: Track[] = [];
  const playlists: Track[] = [];

  const pushMapped = (item: any, bucket: Track[]) => {
    const mapped = mapAny(item);
    if (mapped) bucket.push(mapped);
  };

  const contents = (result as any).contents || [];
  for (const shelf of contents) {
    const title = String(
      shelf?.header?.title?.text || shelf?.title?.text || shelf?.header?.title || '',
    ).toLowerCase();
    const shelfType = String(shelf?.type || '');
    let items = shelf?.contents || shelf?.items || [];

    // MusicCardShelf: top card + nested list items
    if (shelfType === 'MusicCardShelf') {
      if (shelf) pushMapped(shelf, songs);
      items = items.filter((i: any) => i?.type === 'MusicResponsiveListItem');
    }

    for (const item of items) {
      const mapped = mapAny(item);
      if (!mapped) continue;
      if (mapped.type === 'album' || title.includes('album')) albums.push(mapped);
      else if (mapped.type === 'artist' || title.includes('artist')) artists.push(mapped);
      else if (mapped.type === 'playlist' || title.includes('playlist') || title.includes('communaut'))
        playlists.push(mapped);
      else if (mapped.type === 'video' || title.includes('video')) videos.push(mapped);
      else songs.push(mapped);
    }
  }

  // Top result
  const top = (result as any).header || (result as any).top_result;
  let topResult: Track | null = null;
  if (top) topResult = mapAny(top?.contents?.[0] || top) || null;

  // Also try dedicated getters if present
  for (const key of ['songs', 'videos', 'albums', 'artists', 'playlists'] as const) {
    const shelf = (result as any)[key];
    const items = shelf?.contents || shelf?.items || [];
    const bucket =
      key === 'songs'
        ? songs
        : key === 'videos'
          ? videos
          : key === 'albums'
            ? albums
            : key === 'artists'
              ? artists
              : playlists;
    for (const item of items) pushMapped(item, bucket);
  }

  const uniq = (arr: Track[]) => {
    const seen = new Set<string>();
    return arr.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  };

  return {
    topResult,
    songs: uniq(songs),
    videos: uniq(videos),
    albums: uniq(albums),
    artists: uniq(artists),
    playlists: uniq(playlists),
  };
}

export async function searchSuggestions(query: string): Promise<string[]> {
  const innertube = await getYT();
  const sections = await innertube.music.getSearchSuggestions(query);
  const out: string[] = [];
  for (const section of sections || []) {
    const contents = (section as any).contents || [];
    for (const item of contents) {
      const text =
        item?.suggestion?.text ||
        item?.suggestion?.toString?.() ||
        item?.text ||
        '';
      if (text) out.push(String(text));
    }
  }
  return out;
}

export async function getTrack(videoId: string) {
  const innertube = await getYT();
  const info = await innertube.music.getInfo(videoId);
  const basic = (info as any).basic_info || {};

  let artists: { name: string; id?: string }[] = [];
  if (Array.isArray(basic.artists) && basic.artists.length) {
    artists = basic.artists.map((a: any) => ({
      name: String(a.name),
      id: a.channel_id || a.id,
    }));
  } else if (basic.author) {
    artists = parseAuthorField(String(basic.author), basic.channel_id);
  }

  let album: Track['album'] | undefined;
  if (basic.album?.id || basic.album?.name) {
    album = {
      name: String(basic.album.name || basic.album.title || 'Album'),
      id: basic.album.id || basic.album.browse_id,
    };
  }

  // Enrich missing artist IDs / album via up-next when possible
  if ((artists.length && artists.some((a) => !a.id)) || !album?.id) {
    try {
      const up = await innertube.music.getUpNext(videoId, true);
      const first = ((up as any).contents || [])
        .map((c: any) => mapListItem(c))
        .find((t: Track | null) => t && t.id === videoId) as Track | undefined;
      if (first?.artists?.length) {
        artists = artists.map((a) => {
          if (a.id) return a;
          const match = first.artists.find(
            (f) => f.name.toLowerCase() === a.name.toLowerCase() && f.id,
          );
          return match ? { name: a.name, id: match.id } : a;
        });
      }
      if (!album?.id && first?.album) album = first.album;
    } catch {
      /* ignore */
    }
  }

  // Last resort: search artist name to resolve UC id
  for (let i = 0; i < artists.length; i++) {
    if (artists[i].id) continue;
    try {
      const found = await search(artists[i].name, 'artist');
      const hit = found.artists.find(
        (a) => a.title.toLowerCase() === artists[i].name.toLowerCase() || a.id.startsWith('UC'),
      );
      if (hit?.id?.startsWith('UC')) artists[i] = { name: artists[i].name, id: hit.id };
    } catch {
      /* ignore */
    }
  }

  let thumbnails = extractThumbs(basic, info, { thumbnail: basic.thumbnail });
  if (!thumbnails.length && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    thumbnails = [
      { url: `https://i.ytimg.com/vi/${videoId}/hq720.jpg`, width: 1280, height: 720 },
      { url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, width: 480, height: 360 },
    ];
  }

  const track: Track = {
    id: videoId,
    title: String(basic.title || 'Sans titre'),
    artists,
    album,
    durationSeconds: basic.duration,
    duration: basic.duration
      ? new Date(basic.duration * 1000).toISOString().substring(14, 19)
      : undefined,
    thumbnails,
    type: 'song',
  };

  return { track, info };
}

export async function getUpNext(videoId: string): Promise<Track[]> {
  const innertube = await getYT();
  const panel = await innertube.music.getUpNext(videoId, true);
  const contents = (panel as any).contents || [];
  return contents.map((c: any) => mapListItem(c) || mapAny(c)).filter(Boolean) as Track[];
}

export async function getRelated(videoId: string): Promise<{
  related: Track[];
  radio: Track[];
}> {
  const innertube = await getYT();
  const related: Track[] = [];
  const radio: Track[] = [];

  try {
    const section = await innertube.music.getRelated(videoId);
    const contents = (section as any)?.contents || (section as any)?.items || [];
    for (const block of contents) {
      const items = block?.contents || block?.items || [block];
      for (const item of items) {
        const mapped = mapAny(item);
        if (mapped) related.push(mapped);
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const up = await getUpNext(videoId);
    radio.push(...up.filter((t) => t.id !== videoId));
  } catch {
    /* ignore */
  }

  const uniq = (arr: Track[]) => {
    const seen = new Set<string>();
    return arr.filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  };

  return { related: uniq(related), radio: uniq(radio) };
}

export async function getAlbumRadio(albumId: string): Promise<Track[]> {
  const { tracks } = await getAlbum(albumId);
  const seed = tracks.find((t) => /^[a-zA-Z0-9_-]{11}$/.test(t.id));
  if (!seed) return [];
  const { radio } = await getRelated(seed.id);
  return radio;
}

export async function getArtistRadio(artistId: string): Promise<Track[]> {
  const { songs } = await getArtist(artistId);
  const seed = songs.find((t) => /^[a-zA-Z0-9_-]{11}$/.test(t.id));
  if (!seed) return [];
  const { radio } = await getRelated(seed.id);
  return radio;
}

export async function getLyrics(videoId: string): Promise<string | null> {
  const innertube = await getYT();
  try {
    const lyrics = await innertube.music.getLyrics(videoId);
    if (!lyrics) return null;
    return String((lyrics as any).description?.text || (lyrics as any).description || '');
  } catch {
    return null;
  }
}

export async function getArtist(artistId: string): Promise<{
  artist: ArtistMeta;
  songs: Track[];
  albums: Track[];
  singles: Track[];
  videos: Track[];
  featured: Track[];
  similar: Track[];
  playlists: Track[];
}> {
  const innertube = await getYT();
  const artist = await innertube.music.getArtist(artistId);
  const header = (artist as any).header || {};
  const meta: ArtistMeta = {
    id: artistId,
    name: String(header.title?.text || header.title || 'Artiste'),
    subscribers: header.subscription_button?.subscribed_text || header.subtitle?.text,
    thumbnails: extractThumbs(header, artist),
    description: header.description?.text || (artist as any).description,
  };

  const songs: Track[] = [];
  const albums: Track[] = [];
  const singles: Track[] = [];
  const videos: Track[] = [];
  const featured: Track[] = [];
  const similar: Track[] = [];
  const playlists: Track[] = [];

  const sections = (artist as any).sections || [];
  for (const section of sections) {
    const title = String(
      section?.header?.title?.text || section?.title?.text || section?.title || '',
    ).toLowerCase();
    const items = (section.contents || [])
      .map((c: any) => mapAny(c))
      .filter(Boolean) as Track[];

    if (
      title.includes('top song') ||
      title.includes('song') ||
      title.includes('titre') ||
      title.includes('popular')
    ) {
      songs.push(...items);
    } else if (title.includes('single') || title.includes('ep')) {
      singles.push(...items.map((i) => ({ ...i, type: i.type === 'unknown' ? 'album' as const : i.type })));
    } else if (title.includes('album')) {
      albums.push(...items.map((i) => ({ ...i, type: 'album' as const })));
    } else if (title.includes('video')) {
      videos.push(...items);
    } else if (
      title.includes('fan') ||
      title.includes('similar') ||
      title.includes('also like') ||
      title.includes('might also') ||
      title.includes('artistes similaires')
    ) {
      similar.push(...items.map((i) => ({ ...i, type: 'artist' as const })));
    } else if (title.includes('featured') || title.includes('appears')) {
      featured.push(...items);
    } else if (title.includes('playlist')) {
      playlists.push(...items.map((i) => ({ ...i, type: 'playlist' as const })));
    } else if (items[0]?.type === 'artist') {
      similar.push(...items);
    } else if (items[0]?.type === 'album') {
      albums.push(...items);
    } else if (items[0]?.type === 'song' || items[0]?.type === 'video') {
      songs.push(...items);
    }
  }

  return { artist: meta, songs, albums, singles, videos, featured, similar, playlists };
}

export async function getAlbum(albumId: string): Promise<{
  album: AlbumMeta;
  tracks: Track[];
}> {
  const innertube = await getYT();
  const album = await innertube.music.getAlbum(albumId);
  const header = (album as any).header || {};
  const cover = extractThumbs(header, album);
  const meta: AlbumMeta = {
    id: albumId,
    title: String(header.title?.text || header.title || 'Album'),
    year: header.year || header.subtitle?.text,
    artists: (header.author
      ? [{ name: String(header.author.name || header.author), id: header.author.channel_id }]
      : []
    ),
    thumbnails: cover,
  };

  const contents = (album as any).contents || (album as any).sections?.[0]?.contents || [];
  const tracks = contents
    .map((c: any) => mapAny(c, cover))
    .filter(Boolean)
    .map((t: Track) => {
      if (!t.thumbnails?.length && cover.length) t.thumbnails = cover;
      if (!t.album) t.album = { name: meta.title, id: albumId };
      return t;
    }) as Track[];
  return { album: meta, tracks };
}

export async function getPlaylist(playlistId: string): Promise<{
  playlist: PlaylistMeta;
  tracks: Track[];
}> {
  const innertube = await getYT();
  const id = playlistId.startsWith('VL') ? playlistId : `VL${playlistId}`;
  const playlist = await innertube.music.getPlaylist(id);
  const header = (playlist as any).header || {};
  const cover = extractThumbs(header, playlist);
  const meta: PlaylistMeta = {
    id: playlistId,
    title: String(header.title?.text || header.title || 'Playlist'),
    author: header.author?.name || header.subtitle?.text,
    trackCount: header.second_subtitle?.text || header.song_count,
    thumbnails: cover,
    description: header.description?.text,
  };

  const contents = (playlist as any).contents || (playlist as any).items || [];
  const tracks = contents
    .map((c: any) => mapAny(c, cover))
    .filter(Boolean)
    .map((t: Track) => {
      if (!t.thumbnails?.length && cover.length) t.thumbnails = cover;
      return t;
    }) as Track[];
  return { playlist: meta, tracks };
}

export async function getAudioFormat(videoId: string) {
  const innertube = await getYT();
  const format = await innertube.getStreamingData(videoId, {
    type: 'audio',
    quality: 'bestefficiency',
  });
  const url = await format.decipher(innertube.session.player);
  return {
    url,
    mimeType: format.mime_type,
    bitrate: format.bitrate,
    contentLength: format.content_length,
  };
}
