import { Innertube, UniversalCache, ClientType } from 'youtubei.js';
import { extractThumbs, mapAny, mapListItem, parseAuthorField, artistsFromHeader, extractYear } from './mappers.js';
import { getFullLibrary, getHistory } from './library.js';
import { listFollows, listSearchHistory } from './prefs.js';
import {
  dedupeArtists,
  foldText,
  mergeTracks,
  pickTopResult,
  rankByQuery,
  shelfBucketFromTitle,
  tokenize,
  type SearchPersonalization,
} from './searchRank.js';
import type { AlbumMeta, ArtistMeta, PlaylistMeta, Shelf, Track } from './types.js';

let yt: Innertube | null = null;

/** `m:ss` ou `h:mm:ss` si ≥ 1 h (évite `164:16`). */
function formatDurationClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const total = Math.floor(totalSeconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

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

type SearchBuckets = {
  topResult: Track | null;
  songs: Track[];
  videos: Track[];
  albums: Track[];
  artists: Track[];
  playlists: Track[];
};

function emptyBuckets(): SearchBuckets {
  return { topResult: null, songs: [], videos: [], albums: [], artists: [], playlists: [] };
}

function collectFromResult(result: any): SearchBuckets {
  const buckets = emptyBuckets();

  const push = (mapped: Track | null | undefined, forced?: keyof Omit<SearchBuckets, 'topResult'>) => {
    if (!mapped?.id) return;
    if (forced) {
      buckets[forced].push(mapped);
      return;
    }
    if (mapped.type === 'album') buckets.albums.push(mapped);
    else if (mapped.type === 'artist') buckets.artists.push(mapped);
    else if (mapped.type === 'playlist') buckets.playlists.push(mapped);
    else if (mapped.type === 'video') buckets.videos.push(mapped);
    else buckets.songs.push(mapped);
  };

  const contents = result?.contents || [];
  for (const shelf of contents) {
    const title = String(
      shelf?.header?.title?.text || shelf?.title?.text || shelf?.header?.title || '',
    );
    const shelfBucket = shelfBucketFromTitle(title);
    const shelfType = String(shelf?.type || '');
    let items = shelf?.contents || shelf?.items || [];

    // MusicCardShelf: carte top + liste imbriquée — bucket selon le type mappé
    if (shelfType === 'MusicCardShelf') {
      if (shelf) {
        const card = mapAny(shelf);
        if (card) {
          if (card.type === 'artist') push(card, 'artists');
          else if (card.type === 'album') push(card, 'albums');
          else if (card.type === 'playlist') push(card, 'playlists');
          else if (card.type === 'video') push(card, 'videos');
          else push(card, 'songs');
          if (!buckets.topResult) buckets.topResult = card;
        }
      }
      items = items.filter((i: any) => i?.type === 'MusicResponsiveListItem');
    }

    for (const item of items) {
      const mapped = mapAny(item);
      if (!mapped) continue;
      if (shelfBucket) push(mapped, shelfBucket);
      else push(mapped);
    }
  }

  const top = result?.header || result?.top_result;
  if (top && !buckets.topResult) {
    buckets.topResult = mapAny(top?.contents?.[0] || top) || null;
  }

  for (const key of ['songs', 'videos', 'albums', 'artists', 'playlists'] as const) {
    const shelf = result?.[key];
    const items = shelf?.contents || shelf?.items || [];
    for (const item of items) {
      const mapped = mapAny(item);
      if (mapped) buckets[key].push(mapped);
    }
  }

  return buckets;
}

async function innertubeSearch(query: string, filter?: string) {
  const innertube = await getYT();
  const filters =
    filter && filter !== 'all' ? ({ type: filter } as any) : undefined;
  return innertube.music.search(query, filters);
}

function buildSearchPersonalization(userId: string): SearchPersonalization {
  const artistWeights = new Map<string, number>();
  const bump = (name: string | undefined | null, w: number) => {
    const f = foldText(String(name || ''));
    if (f.length < 2) return;
    artistWeights.set(f, (artistWeights.get(f) || 0) + w);
  };

  try {
    for (const f of listFollows(userId)) {
      bump(f.artist_name, 6);
      try {
        const p = JSON.parse(f.payload || '{}');
        bump(p?.name || p?.title, 4);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const lib = getFullLibrary(userId);
    for (const t of lib.liked || []) {
      for (const a of t.artists || []) bump(a.name, 4);
    }
    for (const a of lib.artists || []) bump(a.name || a.title, 5);
  } catch {
    /* ignore */
  }

  try {
    for (const t of getHistory(userId, 60)) {
      for (const a of t.artists || []) bump(a.name, 3);
    }
  } catch {
    /* ignore */
  }

  try {
    for (const s of listSearchHistory(userId, 40)) {
      const qq = String(s.query || '');
      const toks = tokenize(qq);
      if (toks.length >= 2) {
        bump(toks.slice(-2).join(' '), 3);
        bump(toks.slice(-3).join(' '), 2);
      }
      if (toks.length <= 3) bump(qq, 2);
    }
  } catch {
    /* ignore */
  }

  const artistNames = [...artistWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([n]) => n);

  let trackIds: string[] = [];
  try {
    trackIds = getHistory(userId, 80).map((t) => t.id);
  } catch {
    trackIds = [];
  }

  return { artistNames, trackIds };
}

export async function search(
  query: string,
  filter?: string,
  opts?: { userId?: string },
) {
  const q = String(query || '').trim();
  if (!q) return emptyBuckets();

  const filterNorm = filter && filter !== 'all' ? filter : 'all';
  const personalization = opts?.userId ? buildSearchPersonalization(opts.userId) : undefined;

  let primary: any;
  let songExtra: any = null;
  let artistExtra: any = null;
  let albumExtra: any = null;

  if (filterNorm === 'all') {
    [primary, songExtra, artistExtra, albumExtra] = await Promise.all([
      innertubeSearch(q),
      innertubeSearch(q, 'song').catch(() => null),
      innertubeSearch(q, 'artist').catch(() => null),
      innertubeSearch(q, 'album').catch(() => null),
    ]);
  } else {
    primary = await innertubeSearch(q, filterNorm);
  }

  const main = collectFromResult(primary);
  const fromSongs = songExtra ? collectFromResult(songExtra) : emptyBuckets();
  const fromArtists = artistExtra ? collectFromResult(artistExtra) : emptyBuckets();
  const fromAlbums = albumExtra ? collectFromResult(albumExtra) : emptyBuckets();

  const personalSongs: Track[] = [];
  const personalArtists: Track[] = [];
  if (
    (filterNorm === 'all' || filterNorm === 'song') &&
    tokenize(q).length <= 2 &&
    personalization?.artistNames?.length
  ) {
    const hints = personalization.artistNames
      .filter((name) => name && !foldText(q).includes(name))
      .slice(0, 3);
    const extras = await Promise.all(
      hints.map((name) => innertubeSearch(`${q} ${name}`, 'song').catch(() => null)),
    );
    for (const extra of extras) {
      if (!extra) continue;
      const b = collectFromResult(extra);
      personalSongs.push(...b.songs);
      personalArtists.push(...b.artists);
    }
  }

  const songs = rankByQuery(
    mergeTracks(personalSongs, fromSongs.songs, main.songs, fromSongs.videos.slice(0, 5)),
    q,
    personalization,
  );
  const artists = dedupeArtists(
    rankByQuery(
      mergeTracks(fromArtists.artists, main.artists, personalArtists),
      q,
      personalization,
    ),
    q,
  );
  const albums = rankByQuery(mergeTracks(fromAlbums.albums, main.albums), q, personalization);
  const videos = rankByQuery(mergeTracks(main.videos, fromSongs.videos), q, personalization);
  const playlists = rankByQuery(main.playlists, q, personalization);

  const topResult = pickTopResult(
    q,
    {
      topResult: main.topResult || fromSongs.topResult || fromArtists.topResult,
      songs,
      artists,
      albums,
      videos,
      playlists,
    },
    personalization,
  );

  if (filterNorm === 'song') {
    const only = rankByQuery(
      mergeTracks(personalSongs, main.songs, main.videos),
      q,
      personalization,
    );
    return {
      topResult: only[0] || topResult,
      songs: only,
      videos: [],
      albums: [],
      artists: [],
      playlists: [],
    };
  }
  if (filterNorm === 'video') {
    const only = rankByQuery(main.videos.length ? main.videos : main.songs, q, personalization);
    return { topResult: only[0] || null, songs: [], videos: only, albums: [], artists: [], playlists: [] };
  }
  if (filterNorm === 'album') {
    const only = rankByQuery(main.albums, q, personalization);
    return { topResult: only[0] || null, songs: [], videos: [], albums: only, artists: [], playlists: [] };
  }
  if (filterNorm === 'artist') {
    // Préférer les vrais artistes ; si YT renvoie peu, enrichir via topResult / all
    let only = rankByQuery(main.artists, q, personalization);
    if (only.length < 3) {
      const all = await innertubeSearch(q).catch(() => null);
      if (all) {
        const extra = collectFromResult(all);
        const merged = mergeTracks(only, extra.artists);
        if (extra.topResult?.type === 'artist') merged.unshift(extra.topResult);
        only = rankByQuery(merged, q, personalization);
      }
    }
    if (main.topResult?.type === 'artist') {
      only = mergeTracks([main.topResult], only);
    }
    only = dedupeArtists(only, q);
    return { topResult: only[0] || null, songs: [], videos: [], albums: [], artists: only, playlists: [] };
  }
  if (filterNorm === 'playlist') {
    const only = rankByQuery(main.playlists, q, personalization);
    return { topResult: only[0] || null, songs: [], videos: [], albums: [], artists: [], playlists: only };
  }

  return {
    topResult,
    songs,
    videos,
    albums,
    artists,
    playlists,
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
    duration: basic.duration != null ? formatDurationClock(basic.duration) : undefined,
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

export async function getLyrics(videoId: string): Promise<{
  lyrics: string | null;
  timed: { startMs: number; text: string }[] | null;
}> {
  const innertube = await getYT();
  try {
    const lyrics = await innertube.music.getLyrics(videoId);
    if (!lyrics) return { lyrics: null, timed: null };
    const anyL = lyrics as any;
    const text = String(anyL.description?.text || anyL.description || anyL.lyrics?.text || '');
    const timedSrc =
      anyL.lyrics?.lines ||
      anyL.timed_lyrics ||
      anyL.timedLyrics ||
      anyL.contents?.timed_lyrics?.lines ||
      [];
    const timed: { startMs: number; text: string }[] = [];
    if (Array.isArray(timedSrc)) {
      for (const line of timedSrc) {
        const startMs = Number(line.start_time_ms ?? line.startMs ?? line.start_ms ?? line.tStartMs ?? NaN);
        const lineText = String(line.text || line.lyric_line || line.snippet?.text || '').trim();
        if (Number.isFinite(startMs) && lineText) timed.push({ startMs, text: lineText });
      }
    }
    return {
      lyrics: text || (timed.length ? timed.map((l) => l.text).join('\n') : null),
      timed: timed.length ? timed : null,
    };
  } catch {
    return { lyrics: null, timed: null };
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

  let artists = artistsFromHeader(header);
  const year =
    extractYear(header.year) ||
    extractYear(header.subtitle) ||
    extractYear(header.second_subtitle) ||
    undefined;

  const contents = (album as any).contents || (album as any).sections?.[0]?.contents || [];
  const tracks = contents
    .map((c: any) => mapAny(c, cover))
    .filter(Boolean)
    .map((t: Track) => {
      if (!t.thumbnails?.length && cover.length) t.thumbnails = cover;
      if (!t.album) t.album = { name: String(header.title?.text || header.title || 'Album'), id: albumId };
      return t;
    }) as Track[];

  // Fallback : artistes les plus fréquents dans les pistes
  if (!artists.length) {
    const counts = new Map<string, { name: string; id?: string; n: number }>();
    for (const t of tracks) {
      for (const a of t.artists || []) {
        if (!a.name) continue;
        const key = (a.id || a.name).toLowerCase();
        const cur = counts.get(key);
        if (cur) cur.n += 1;
        else counts.set(key, { name: a.name, id: a.id, n: 1 });
      }
    }
    artists = [...counts.values()]
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .map(({ name, id }) => ({ name, id }));
  }

  // Enrichir les pistes sans artiste
  if (artists.length) {
    for (const t of tracks) {
      if (!t.artists?.length) t.artists = artists;
    }
  }

  const meta: AlbumMeta = {
    id: albumId,
    title: String(header.title?.text || header.title || 'Album'),
    year,
    artists,
    thumbnails: cover,
  };

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
  const fromHeaderArtists = artistsFromHeader(header);
  const meta: PlaylistMeta = {
    id: playlistId,
    title: String(header.title?.text || header.title || 'Playlist'),
    author:
      (typeof header.author === 'string' ? header.author : header.author?.name) ||
      fromHeaderArtists[0]?.name ||
      undefined,
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
