import type { Track } from './types.js';

export type Thumb = { url: string; width?: number; height?: number };

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const v = value as { text?: string; toString?: () => string };
    if (typeof v.text === 'string') return v.text;
    if (typeof v.toString === 'function') {
      const s = v.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return '';
}

/** Collect every possible thumbnail array from a YT Music node */
export function extractThumbs(...sources: any[]): Thumb[] {
  const out: Thumb[] = [];
  const seen = new Set<string>();

  const pushList = (list: any) => {
    if (!list) return;
    const arr = Array.isArray(list)
      ? list
      : Array.isArray(list.contents)
        ? list.contents
        : Array.isArray(list.thumbnails)
          ? list.thumbnails
          : list.url
            ? [list]
            : [];
    for (const t of arr) {
      const url = String(t?.url || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push({
        url,
        width: typeof t.width === 'number' ? t.width : undefined,
        height: typeof t.height === 'number' ? t.height : undefined,
      });
    }
  };

  for (const src of sources) {
    if (!src) continue;
    pushList(src.thumbnails);
    pushList(src.thumbnail);
    pushList(src.thumbnail?.contents);
    pushList(src.thumbnail?.thumbnails);
    pushList(src.header?.thumbnail?.contents);
    pushList(src.header?.thumbnails);
    pushList(src.header?.thumbnail);
    // Cropped / immersive variants
    pushList(src.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails);
    pushList(src.musicThumbnailRenderer?.thumbnail?.thumbnails);
  }

  return out.sort((a, b) => (b.width || 0) - (a.width || 0));
}

/** Upscale / normalize image URL for crisp display */
export function resizeThumbUrl(url: string, size = 544): string {
  if (!url) return '';
  let u = url;

  // googleusercontent / yt3 : =w544-h544-l90-rj or =w544-h544
  if (/=w\d+-h\d+/.test(u)) {
    u = u.replace(/=w\d+-h\d+(-[^=]*)?/, `=w${size}-h${size}$1`);
  } else if (/=s\d+/.test(u)) {
    u = u.replace(/=s\d+(-[^=]*)?/, `=s${size}$1`);
  } else if (/googleusercontent\.com/.test(u) && !/[?&=]/.test(u.split('/').pop() || '')) {
    // bare lh3 id without size — append
    u = `${u}=s${size}`;
  }

  // YouTube video thumbs → highest quality available
  const vi = u.match(/i\.ytimg\.com\/vi\/([^/]+)\//);
  if (vi) {
    const id = vi[1];
    if (size >= 640) return `https://i.ytimg.com/vi/${id}/hq720.jpg`;
    if (size >= 320) return `https://i.ytimg.com/vi/${id}/sddefault.jpg`;
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  return u;
}

export function bestThumbUrl(thumbs: Thumb[], size = 544): string {
  if (!thumbs?.length) return '';
  const sorted = [...thumbs].sort((a, b) => (b.width || 0) - (a.width || 0));
  return resizeThumbUrl(sorted[0].url, size);
}

function isJunkArtistName(name: string) {
  return (
    !name ||
    name === '•' ||
    /^(song|album|playlist|video|ep|single|artist)$/i.test(name) ||
    /^\d+:\d+$/.test(name) ||
    /^\d{4}$/.test(name) ||
    /plays?/i.test(name) ||
    /views?/i.test(name) ||
    /monthly audience/i.test(name)
  );
}

function pageTypeOf(run: any): string {
  return (
    run?.endpoint?.payload?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType ||
    run?.endpoint?.metadata?.page_type ||
    ''
  );
}

function artistsFromRuns(runs: any[] | undefined): { name: string; id?: string }[] {
  if (!Array.isArray(runs)) return [];
  const out: { name: string; id?: string }[] = [];
  for (const r of runs) {
    const name = String(r?.text || '')
      .replace(/^[&,•]\s*/, '')
      .replace(/\s*[&,•]\s*$/, '')
      .trim();
    if (isJunkArtistName(name)) continue;
    const browseId = r?.endpoint?.payload?.browseId as string | undefined;
    const pageType = pageTypeOf(r);
    const isArtist =
      Boolean(browseId?.startsWith('UC')) ||
      pageType.includes('ARTIST') ||
      (!pageType && browseId && !browseId.startsWith('MPREb_') && !browseId.startsWith('VL'));
    if (browseId && isArtist) {
      out.push({ name, id: browseId });
    } else if (!browseId && name && !/^[•&|,]+$/.test(name)) {
      if (!out.some((a) => a.name === name)) out.push({ name });
    }
  }
  return out;
}

function splitAuthorString(author: string, channelId?: string): { name: string; id?: string }[] {
  const parts = author
    .split(/\s*(?:&|,| feat\.? | ft\.? | featuring )\s*/i)
    .map((p) => p.trim())
    .filter((p) => p && !isJunkArtistName(p));
  return parts.map((name, i) => ({
    name,
    id: i === 0 ? channelId : undefined,
  }));
}

export function artistsFrom(item: any): { name: string; id?: string }[] {
  if (Array.isArray(item?.artists) && item.artists.length) {
    return item.artists
      .map((a: any) => ({
        name: String(a.name || 'Inconnu'),
        id: a.channel_id || a.id,
      }))
      .filter((a: { name: string }) => !isJunkArtistName(a.name));
  }

  if (item?.author?.name) {
    return splitAuthorString(String(item.author.name), item.author.channel_id);
  }

  if (Array.isArray(item?.authors) && item.authors.length) {
    return item.authors
      .map((a: any) => ({
        name: String(a.name || 'Inconnu'),
        id: a.channel_id,
      }))
      .filter((a: { name: string }) => !isJunkArtistName(a.name));
  }

  const flex = item?.flex_columns || [];
  for (let i = 1; i < flex.length; i++) {
    const fromRuns = artistsFromRuns(flex[i]?.title?.runs);
    const withIds = fromRuns.filter((a) => a.id);
    if (withIds.length) return withIds;
  }
  for (let i = 1; i < flex.length; i++) {
    const fromRuns = artistsFromRuns(flex[i]?.title?.runs).filter((a) => a.id || !isJunkArtistName(a.name));
    const cleaned = fromRuns.filter((a) => a.id || (a.name.length < 80 && !a.name.includes(' - ')));
    if (cleaned.some((a) => a.id)) return cleaned.filter((a) => a.id);
    if (cleaned.length && cleaned.every((a) => a.name.length < 60)) return cleaned;
  }

  for (let i = 1; i < flex.length; i++) {
    const text = asText(flex[i]?.title);
    if (!text.includes('•')) continue;
    const parts = text.split('•').map((p: string) => p.trim());
    const start = /^(song|album|playlist|video|ep|single)$/i.test(parts[0] || '') ? 1 : 0;
    const chunk = parts[start];
    if (!chunk || isJunkArtistName(chunk)) continue;
    if (/^\d/.test(chunk) || /views?/i.test(chunk)) continue;
    return splitAuthorString(chunk);
  }

  return [];
}

function inferType(id: string, item: any): Track['type'] {
  const explicit = item.item_type;
  if (
    explicit === 'song' ||
    explicit === 'video' ||
    explicit === 'album' ||
    explicit === 'playlist' ||
    explicit === 'artist'
  ) {
    return explicit;
  }

  const pageType =
    item.endpoint?.payload?.browseEndpointContextSupportedConfigs
      ?.browseEndpointContextMusicConfig?.pageType || '';

  if (pageType.includes('ARTIST') || id.startsWith('UC')) return 'artist';
  if (pageType.includes('ALBUM') || id.startsWith('MPREb_') || id.startsWith('OLAK5')) return 'album';
  if (pageType.includes('PLAYLIST') || id.startsWith('PL') || id.startsWith('VL') || id.startsWith('RD'))
    return 'playlist';
  if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return 'song';
  return 'unknown';
}

export function mapListItem(item: any, fallbackThumbs?: Thumb[]): Track | null {
  if (!item || item.type === 'Message') return null;

  const id =
    item.id ||
    item.endpoint?.payload?.videoId ||
    item.overlay?.content?.endpoint?.payload?.videoId ||
    item.overlay?.endpoint?.payload?.videoId ||
    item.menu?.top_level_buttons?.[0]?.endpoint?.payload?.videoId ||
    item.endpoint?.payload?.browseId ||
    item.endpoint?.payload?.playlistId;

  if (!id) return null;

  let title = asText(item.title) || asText(item.name);
  if (!title && item.item_type === 'artist') {
    title = asText(item.flex_columns?.[0]?.title) || 'Artiste';
  }
  if (!title) title = 'Sans titre';

  const durationText = item.duration?.text || asText(item.duration);
  const durationSeconds = item.duration?.seconds;
  const type = inferType(String(id), item);

  let artists = artistsFrom(item);
  if (type === 'artist' && !artists.length) {
    artists = [{ name: title, id: String(id) }];
  }

  let thumbnails = extractThumbs(item);
  if (!thumbnails.length && fallbackThumbs?.length) thumbnails = fallbackThumbs;

  // Video id fallback art
  if (!thumbnails.length && /^[a-zA-Z0-9_-]{11}$/.test(String(id))) {
    thumbnails = [
      { url: `https://i.ytimg.com/vi/${id}/hq720.jpg`, width: 1280, height: 720 },
      { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, width: 480, height: 360 },
    ];
  }

  return {
    id: String(id),
    title,
    artists,
    album: item.album
      ? { name: String(item.album.name), id: item.album.id }
      : undefined,
    duration: durationText || undefined,
    durationSeconds,
    thumbnails,
    type,
  };
}

export function mapTwoRowItem(item: any, fallbackThumbs?: Thumb[]): Track | null {
  if (!item) return null;
  const id =
    item.id ||
    item.endpoint?.payload?.browseId ||
    item.endpoint?.payload?.videoId ||
    item.endpoint?.payload?.playlistId;
  if (!id) return null;

  const title = asText(item.title) || 'Sans titre';
  const type = inferType(String(id), item);
  let artists = artistsFrom(item);
  if (type === 'artist' && !artists.length) {
    artists = [{ name: title, id: String(id) }];
  }

  let thumbnails = extractThumbs(item);
  if (!thumbnails.length && fallbackThumbs?.length) thumbnails = fallbackThumbs;
  if (!thumbnails.length && /^[a-zA-Z0-9_-]{11}$/.test(String(id))) {
    thumbnails = [
      { url: `https://i.ytimg.com/vi/${id}/hq720.jpg`, width: 1280, height: 720 },
      { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, width: 480, height: 360 },
    ];
  }

  return {
    id: String(id),
    title,
    artists,
    thumbnails,
    type,
    duration: item.duration?.text,
  };
}

export function mapAny(item: any, fallbackThumbs?: Thumb[]): Track | null {
  if (!item) return null;
  if (item.type === 'MusicCardShelf') {
    const nested = item.contents?.[0] || item.header;
    return mapAny(nested, fallbackThumbs);
  }
  if (item.type === 'ItemSection') {
    const nested = item.contents?.[0];
    return mapAny(nested, fallbackThumbs);
  }
  if (item.type === 'MusicResponsiveListItem' || item.flex_columns) {
    return mapListItem(item, fallbackThumbs);
  }
  if (item.type === 'MusicTwoRowItem') return mapTwoRowItem(item, fallbackThumbs);
  return mapListItem(item, fallbackThumbs) || mapTwoRowItem(item, fallbackThumbs);
}

export function parseAuthorField(author: string, channelId?: string) {
  return splitAuthorString(author, channelId);
}

export function bestThumb(track: Track, size = 544): string {
  return bestThumbUrl(track.thumbnails || [], size);
}
