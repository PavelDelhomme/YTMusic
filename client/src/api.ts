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

export type Shelf = {
  title: string;
  items: Track[];
};

export type LibraryPlaylist = {
  id: string;
  name: string;
  description: string;
  coverUrl?: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
};

export type LibraryData = {
  liked: Track[];
  likedPlaylists: any[];
  albums: any[];
  artists: any[];
  playlists: LibraryPlaylist[];
  history: Track[];
  downloaded: string[];
};

export type User = {
  id: string;
  email: string;
  name: string;
  picture?: string | null;
  hasGoogle?: boolean;
  isGuest?: boolean;
  isAdmin?: boolean;
  emailVerified?: boolean;
  totpEnabled?: boolean;
};

const TOKEN_KEY = 'ytm_token';
const DEVICE_KEY = 'ytm_device';

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

const REFRESH_KEY = 'ytm_refresh';
export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}
export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

/** Upscale / normalize CDN thumbnail URLs for crisp display */
export function resizeThumbUrl(url: string, size = 200): string {
  if (!url) return '';
  let u = url;

  if (/=w\d+-h\d+/.test(u)) {
    u = u.replace(/=w\d+-h\d+(-[^=?#]*)?/, `=w${size}-h${size}$1`);
  } else if (/=s\d+/.test(u)) {
    u = u.replace(/=s\d+(-[^=?#]*)?/, `=s${size}$1`);
  } else if (/googleusercontent\.com|ggpht\.com|yt3\.ggpht\.com|lh3\.googleusercontent/.test(u)) {
    const base = u.split('=')[0];
    u = `${base}=s${size}-c-k-c0x00ffffff-no-rj`;
  }

  const vi = u.match(/i\.ytimg\.com\/vi\/([^/]+)\//);
  if (vi) {
    const id = vi[1];
    if (size >= 640) return `https://i.ytimg.com/vi/${id}/hq720.jpg`;
    if (size >= 320) return `https://i.ytimg.com/vi/${id}/sddefault.jpg`;
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  return u;
}

/** Proxy Google CDN thumbs to avoid referrer blocks */
export function proxiedThumbUrl(url: string, size = 200): string {
  const resized = resizeThumbUrl(url, size);
  if (!resized) return '';
  if (/i\.ytimg\.com/.test(resized)) return resized;
  if (/googleusercontent|ggpht|yt3\./.test(resized)) {
    return `/api/img?u=${encodeURIComponent(resized)}`;
  }
  return resized;
}

export function thumbCandidates(
  track: Track | { thumbnails?: Track['thumbnails']; id?: string },
  size = 200,
): string[] {
  const list = [...(track.thumbnails || [])].sort((a, b) => (b.width || 0) - (a.width || 0));
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (u: string) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };
  for (const t of list) {
    const raw = resizeThumbUrl(t.url, size);
    push(proxiedThumbUrl(t.url, size));
    push(raw);
  }
  const id = (track as Track).id;
  if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
    push(`https://i.ytimg.com/vi/${id}/hq720.jpg`);
    push(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    push(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`);
  }
  return out;
}

export function thumb(track: Track | { thumbnails?: Track['thumbnails']; id?: string }, size = 200) {
  return thumbCandidates(track, size)[0] || '';
}

export function artistNames(track: Track) {
  return track.artists?.map((a) => a.name).join(', ') || 'Artiste inconnu';
}

async function req<T>(url: string, init?: RequestInit, retried = false): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Device-Id': deviceId(),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (res.status === 401 && !retried && !url.includes('/auth/')) {
    const refreshed = await tryRefresh();
    if (refreshed) return req<T>(url, init, true);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || res.statusText) as Error & { needs2fa?: boolean };
    if (body.needs2fa) err.needs2fa = true;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function tryRefresh() {
  const refreshToken = getRefreshToken();
  try {
    const r = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId() },
      body: JSON.stringify({ refreshToken }),
    });
    if (!r.ok) return false;
    const data = await r.json();
    if (data.token) setToken(data.token);
    if (data.refreshToken) setRefreshToken(data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  health: () => req<{ ok: boolean; auth: { googleEnabled: boolean; googleClientId: string | null } }>('/api/health'),
  authConfig: () => req<{ googleEnabled: boolean; googleClientId: string | null }>('/api/auth/config'),
  me: () => req<{ user: User | null }>('/api/auth/me'),
  register: (email: string, password: string, name: string) =>
    req<{ user: User; token: string; refreshToken?: string; needsEmailVerification?: boolean }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, name }),
      },
    ),
  login: (email: string, password: string, totp?: string) =>
    req<{ user: User; token: string; refreshToken?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, totp }),
    }),
  google: (credential: string) =>
    req<{ user: User; token: string; refreshToken?: string }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),
  logout: () => req<{ ok: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' }),
  refresh: (refreshToken?: string) =>
    req<{ user: User; token: string; refreshToken: string }>('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  verifyEmail: (token: string) =>
    req<{ ok: boolean; user: User }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  resendVerification: () =>
    req<{ ok: boolean }>('/api/auth/resend-verification', { method: 'POST', body: '{}' }),
  totpSetup: () => req<{ secret: string; otpauthUrl: string }>('/api/auth/2fa/setup', { method: 'POST', body: '{}' }),
  totpEnable: (secret: string, code: string) =>
    req<{ ok: boolean; user: User }>('/api/auth/2fa/enable', {
      method: 'POST',
      body: JSON.stringify({ secret, code }),
    }),
  totpDisable: (code: string) =>
    req<{ ok: boolean; user: User }>('/api/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  telemetry: (payload: Record<string, unknown>) =>
    req<{ ok: boolean }>('/api/telemetry', { method: 'POST', body: JSON.stringify(payload) }),
  adminTelemetry: (level?: string) =>
    req<{ stats: any; events: any[] }>(
      `/api/admin/telemetry${level ? `?level=${encodeURIComponent(level)}` : ''}`,
    ),
  adminMailOutbox: () => req<{ mails: any[] }>('/api/admin/mail-outbox'),
  adminSmtp: () => req<{ smtp: any; env: string; appUrl: string | null }>('/api/admin/smtp'),
  adminSmtpTest: (to?: string) =>
    req<{ ok: boolean; mode?: string; error?: string; config?: any; sent?: any }>(
      '/api/admin/smtp/test',
      { method: 'POST', body: JSON.stringify({ to }) },
    ),
  updateProfile: (patch: { name?: string; email?: string; picture?: string | null }) =>
    req<{ user: User }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(patch) }),
  passkeys: () => req<{ passkeys: any[] }>('/api/auth/passkeys'),
  passkeyRegisterOptions: () => req<any>('/api/auth/passkeys/register/options', { method: 'POST', body: '{}' }),
  passkeyRegisterVerify: (credential: unknown, name?: string) =>
    req<{ ok: boolean; passkeys: any[] }>('/api/auth/passkeys/register/verify', {
      method: 'POST',
      body: JSON.stringify({ credential, name }),
    }),
  passkeyDelete: (id: string) =>
    req<{ ok: boolean; passkeys: any[] }>(`/api/auth/passkeys/${id}`, { method: 'DELETE' }),
  passkeyLoginOptions: (email?: string) =>
    req<any>('/api/auth/passkeys/login/options', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  passkeyLoginVerify: (credential: unknown) =>
    req<{ user: User; token: string }>('/api/auth/passkeys/login/verify', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),
  deployInfo: () =>
    req<{ urls: string[]; lan: { address: string; iface: string }[]; port: number; built: boolean }>(
      '/api/deploy/info',
    ),
  adminStatus: () => req<any>('/api/admin/status'),
  adminBuild: () => req<any>('/api/admin/build', { method: 'POST', body: '{}' }),
  adminBuildStatus: () => req<any>('/api/admin/build'),

  home: () =>
    req<{
      shelves: Shelf[];
      seeds?: string[];
      hasMore?: boolean;
      page?: number;
      needsOnboarding?: boolean;
      radios?: { id: string; title: string }[];
    }>('/api/home'),
  homeMore: (page: number, seeds: string[] = []) =>
    req<{ shelves: Shelf[]; hasMore: boolean; page: number }>(
      `/api/home/more?page=${page}&seeds=${encodeURIComponent(seeds.join(','))}`,
    ),
  explore: () =>
    req<{
      shelves: Shelf[];
      needsOnboarding?: boolean;
      radios?: { id: string; title: string }[];
    }>('/api/explore'),
  search: (q: string, filter = 'all') =>
    req<{
      topResult: Track | null;
      songs: Track[];
      videos: Track[];
      albums: Track[];
      artists: Track[];
      playlists: Track[];
    }>(`/api/search?q=${encodeURIComponent(q)}&filter=${filter}`),
  suggestions: (q: string) =>
    req<{ suggestions: string[] }>(`/api/search/suggestions?q=${encodeURIComponent(q)}`),
  searchHistory: () => req<{ history: any[] }>('/api/search/history'),
  prefs: () => req<{ prefs: any; follows: any[] }>('/api/prefs'),
  savePrefs: (patch: Record<string, unknown>) =>
    req<{ prefs: any }>('/api/prefs', { method: 'PUT', body: JSON.stringify(patch) }),
  onboarding: (payload: Record<string, unknown>) =>
    req<{ prefs: any; follows: any[] }>('/api/prefs/onboarding', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  pins: () => req<{ pins: any[] }>('/api/pins'),
  addPin: (payload: Record<string, unknown>) =>
    req<{ pins: any[] }>('/api/pins', { method: 'POST', body: JSON.stringify(payload) }),
  removePin: (id: string) => req<{ pins: any[] }>(`/api/pins/${id}`, { method: 'DELETE' }),
  listen: (payload: {
    trackId: string;
    event: 'start' | 'progress' | 'complete' | 'skip';
    progressPct?: number;
    durationMs?: number;
    seedId?: string;
    track?: Track;
  }) => req<{ ok: boolean }>('/api/listen', { method: 'POST', body: JSON.stringify(payload) }),
  followArtist: (id: string, name?: string) =>
    req<{ ok: boolean; follows: any[] }>(`/api/artists/${id}/follow`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  unfollowArtist: (id: string) =>
    req<{ ok: boolean; follows: any[] }>(`/api/artists/${id}/follow`, { method: 'DELETE' }),
  recoSimilar: (trackId: string) =>
    req<{ tracks: Track[]; related: Track[]; radio: Track[] }>(`/api/reco/similar/${trackId}`),
  recoRadio: (category: string) =>
    req<{ category: any; tracks: Track[]; seed: Track | null }>(`/api/reco/radio/${category}`),
  recoRadios: () => req<{ radios: { id: string; title: string }[] }>('/api/reco/radios'),
  recoFeedback: (payload: {
    trackId: string;
    verdict: 'good' | 'bad';
    seedId?: string;
    context?: string;
  }) => req<{ ok: boolean }>('/api/reco/feedback', { method: 'POST', body: JSON.stringify(payload) }),
  adminReco: () => req<any>('/api/admin/reco'),
  adminRecoWeights: (mode: string, weights: Record<string, number>) =>
    req<any>('/api/admin/reco/weights', {
      method: 'PUT',
      body: JSON.stringify({ mode, ...weights }),
    }),
  track: (id: string) =>
    req<{ track: Track; streamUrl: string; cached: boolean }>(`/api/track/${id}`),
  upNext: (id: string) => req<{ tracks: Track[] }>(`/api/track/${id}/upnext`),
  related: (id: string) =>
    req<{ related: Track[]; radio: Track[] }>(`/api/track/${id}/related`),
  albumRadio: (id: string) => req<{ tracks: Track[] }>(`/api/album/${id}/radio`),
  artistRadio: (id: string) => req<{ tracks: Track[] }>(`/api/artist/${id}/radio`),
  lyrics: (id: string) => req<{ lyrics: string | null }>(`/api/track/${id}/lyrics`),
  artist: (id: string) =>
    req<{
      artist: { id: string; name: string; subscribers?: string; thumbnails: Track['thumbnails']; description?: string };
      songs: Track[];
      albums: Track[];
      singles: Track[];
      videos: Track[];
      featured: Track[];
      similar: Track[];
      playlists: Track[];
    }>(`/api/artist/${id}`),
  album: (id: string) =>
    req<{
      album: { id: string; title: string; year?: string; artists: Track['artists']; thumbnails: Track['thumbnails'] };
      tracks: Track[];
    }>(`/api/album/${id}`),
  playlist: (id: string) =>
    req<{
      playlist: { id: string; title: string; author?: string; trackCount?: string; thumbnails: Track['thumbnails']; description?: string };
      tracks: Track[];
    }>(`/api/playlist/${id}`),
  download: (id: string) => req<{ ok: boolean }>(`/api/download/${id}`, { method: 'POST' }),
  recordHistory: (track: Track) =>
    req<{ ok: boolean; history: Track[] }>('/api/history', {
      method: 'POST',
      body: JSON.stringify(track),
    }),
  history: () => req<{ history: Track[] }>('/api/history'),
  library: () => req<LibraryData>('/api/library'),
  like: (track: Track) =>
    req<{ liked: boolean; library: LibraryData }>('/api/library/like', {
      method: 'POST',
      body: JSON.stringify(track),
    }),
  likePlaylist: (playlist: Record<string, unknown>) =>
    req<{ liked: boolean; library: LibraryData }>('/api/library/like-playlist', {
      method: 'POST',
      body: JSON.stringify(playlist),
    }),
  saveAlbum: (album: Record<string, unknown>) =>
    req<{ library: LibraryData }>('/api/library/albums', {
      method: 'POST',
      body: JSON.stringify(album),
    }),
  removeAlbum: (id: string) =>
    req<{ library: LibraryData }>(`/api/library/albums/${id}`, { method: 'DELETE' }),
  saveArtist: (artist: Record<string, unknown>) =>
    req<{ library: LibraryData }>('/api/library/artists', {
      method: 'POST',
      body: JSON.stringify(artist),
    }),
  removeArtist: (id: string) =>
    req<{ library: LibraryData }>(`/api/library/artists/${id}`, { method: 'DELETE' }),
  createPlaylist: (name: string, description = '') =>
    req<LibraryPlaylist>('/api/library/playlists', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    }),
  updatePlaylist: (id: string, patch: { name?: string; description?: string }) =>
    req<LibraryPlaylist>(`/api/library/playlists/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deletePlaylist: (id: string) =>
    req<{ ok: boolean; library: LibraryData }>(`/api/library/playlists/${id}`, { method: 'DELETE' }),
  addToPlaylist: (playlistId: string, track: Track) =>
    req<LibraryPlaylist>(`/api/library/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify(track),
    }),
  removeFromPlaylist: (playlistId: string, trackId: string) =>
    req<LibraryPlaylist>(`/api/library/playlists/${playlistId}/tracks/${trackId}`, {
      method: 'DELETE',
    }),
  reorderPlaylist: (playlistId: string, trackIds: string[]) =>
    req<LibraryPlaylist>(`/api/library/playlists/${playlistId}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ trackIds }),
    }),
  import: (payload: { url?: string; query?: string; kind?: string; id?: string }) =>
    req<{ title: string; kind: string; added: Record<string, unknown>; library: LibraryData }>('/api/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  ytmStatus: () =>
    req<{ account: any; oauth: any }>('/api/ytm/status'),
  ytmConnectCookie: (cookie: string) =>
    req<{ ok: boolean; account: any }>('/api/ytm/connect/cookie', {
      method: 'POST',
      body: JSON.stringify({ cookie }),
    }),
  ytmConnectOauth: () =>
    req<{ ok: boolean; verificationUrl: string; userCode: string; expiresIn: number }>(
      '/api/ytm/connect/oauth',
      { method: 'POST', body: '{}' },
    ),
  ytmOauthStatus: () => req<{ status: string; error?: string; userCode?: string }>('/api/ytm/oauth/status'),
  ytmSync: () =>
    req<{ ok: boolean; stats: any; library: LibraryData; account: any }>('/api/ytm/sync', {
      method: 'POST',
      body: '{}',
    }),
  ytmDisconnect: () => req<{ ok: boolean; account: any }>('/api/ytm/disconnect', { method: 'DELETE' }),
  offlineStart: (kind: string, targetId: string) =>
    req<{ jobId: string; total: number }>('/api/offline/start', {
      method: 'POST',
      body: JSON.stringify({ kind, targetId }),
    }),
  offlineJobs: () => req<{ jobs: any[] }>('/api/offline'),
  offlineDownloads: () => req<{ downloads: any[] }>('/api/offline/downloads'),
};
