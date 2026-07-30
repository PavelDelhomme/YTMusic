import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Compass,
  Download,
  Home,
  Library,
  ListMusic,
  Plus,
  Search,
  Settings2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PlayerBar } from './PlayerBar';
import { QueuePanel } from './QueuePanel';
import { AuthModal } from './AuthModal';
import { DevicePicker } from './DevicePicker';
import { InstallBanner } from './InstallBanner';
import { ItemActionsSheet } from './ItemActionsSheet';
import { NowPlaying, type NowPlayingTab } from './NowPlaying';
import { OnboardingWizard } from './OnboardingWizard';
import { BrandLogo } from './BrandLogo';
import { useLibrary } from '../store/library';
import { usePlayer, wireRemotePlayer, reportListenProgress, flushPlayerPersist } from '../store/player';
import { useAuth } from '../store/auth';
import { useSession } from '../store/session';
import { api } from '../api';
import { installMediaKeys } from '../lib/mediaKeys';

const links = [
  { to: '/', label: 'Accueil', icon: Home },
  { to: '/explore', label: 'Explorer', icon: Compass },
  { to: '/library', label: 'Bibliothèque', icon: Library },
  { to: '/import', label: 'Importer', icon: Upload },
  { to: '/offline', label: 'Offline', icon: Download },
];

export function Layout() {
  const refresh = useLibrary((s) => s.refresh);
  const initAuth = useAuth((s) => s.init);
  const initSession = useSession((s) => s.init);
  const remoteState = useSession((s) => s.remoteState);
  const isActivePlayer = useSession((s) => s.isActivePlayer);
  const user = useAuth((s) => s.user);
  const authLoaded = useAuth((s) => s.loaded);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const isVerifyRoute = location.pathname.startsWith('/verify-email');
  const [q, setQ] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [openSug, setOpenSug] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [nowPlayingTab, setNowPlayingTab] = useState<NowPlayingTab>('queue');
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const playlists = useLibrary((s) => s.playlists);
  const likedPlaylists = useLibrary((s) => s.likedPlaylists);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const bindAudio = usePlayer((s) => s.bindAudio);
  const hydrate = usePlayer((s) => s.hydrate);
  const setProgress = usePlayer((s) => s.setProgress);
  const setDuration = usePlayer((s) => s.setDuration);
  const next = usePlayer((s) => s.next);
  const applyRemoteState = usePlayer((s) => s.applyRemoteState);
  const currentTrack = usePlayer((s) => s.current);
  const hasPlayback = Boolean(currentTrack);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastRemoteAt = useRef(0);
  const sugReq = useRef(0);

  // Garde la barre alignée avec l’URL (évite de resoumettre / suggérer l’ancienne requête Keny…)
  useEffect(() => {
    if (!location.pathname.startsWith('/search')) return;
    const urlQ = new URLSearchParams(location.search).get('q') || '';
    setQ(urlQ);
  }, [location.pathname, location.search]);

  useEffect(() => {
    wireRemotePlayer();
    void initAuth().then(() => {
      const u = useAuth.getState().user;
      const guest = !u || u.isGuest || u.email?.includes('@local.ytmusic');
      if (!guest) {
        void refresh();
        initSession();
      }
    });
  }, [initAuth, refresh, initSession]);

  useEffect(() => {
    if (/^\/(album|artist|playlist|local)\//.test(location.pathname)) {
      setNowPlayingOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!authLoaded) return;
    const guest = !user || user.isGuest || user.email.includes('@local.ytmusic');
    if (guest) {
      if (!location.pathname.startsWith('/verify-email')) setAuthOpen(true);
      setNeedsOnboarding(false);
      return;
    }
    // Connecté → jamais laisser la popup login ouverte
    setAuthOpen(false);
    void refresh();
    initSession();
    void api
      .prefs()
      .then((r) => setNeedsOnboarding(!r.prefs?.onboardingDone))
      .catch(() => undefined);
  }, [authLoaded, user, refresh, initSession, location.pathname]);

  useEffect(() => {
    const guest = !user || user.isGuest || user.email?.includes('@local.ytmusic');
    if (guest) {
      setSuggestions([]);
      return;
    }
    const id = ++sugReq.current;
    if (!q.trim()) {
      const t = setTimeout(() => {
        api
          .suggestions('')
          .then((r) => {
            if (sugReq.current !== id) return;
            setSuggestions(r.suggestions.slice(0, 8));
          })
          .catch(() => {
            if (sugReq.current === id) setSuggestions([]);
          });
      }, 100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      api
        .suggestions(q)
        .then((r) => {
          if (sugReq.current !== id) return;
          setSuggestions(r.suggestions.slice(0, 8));
        })
        .catch(() => {
          if (sugReq.current === id) setSuggestions([]);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [q, user]);

  useEffect(() => {
    bindAudio(audioRef.current);
  }, [bindAudio]);

  // Play/pause, suivant, précédent : clavier + touches média OS, toutes pages
  useEffect(() => installMediaKeys(), []);

  useEffect(() => {
    const t = setTimeout(() => void hydrate(), 50);
    return () => clearTimeout(t);
  }, [hydrate]);

  // Persistance lecture à la fermeture / mise en arrière-plan (web + PWA)
  useEffect(() => {
    const flush = () => flushPlayerPersist();
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  useEffect(() => {
    if (!remoteState || isActivePlayer) return;
    if (remoteState.updatedAt && remoteState.updatedAt <= lastRemoteAt.current) return;
    lastRemoteAt.current = remoteState.updatedAt || Date.now();
    void applyRemoteState(remoteState, false);
  }, [remoteState, isActivePlayer, applyRemoteState]);

  const isGuest = !user || user.isGuest || user.email.includes('@local.ytmusic');
  const allowGuestPage = isVerifyRoute;

  return (
    <div className="flex h-full min-h-0 flex-col bg-yt-bg">
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-yt-border bg-yt-bg px-3 py-4 lg:flex">
          <div className="mb-6 flex items-center gap-2 px-2">
            <BrandLogo className="h-8 w-8 shrink-0" />
            <span className="font-display text-lg font-semibold tracking-tight">YTMusic</span>
          </div>
          <nav className="flex flex-col gap-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-yt-elevated text-white' : 'text-yt-muted hover:bg-yt-hover hover:text-white'
                  }`
                }
              >
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 flex min-h-0 flex-1 flex-col border-t border-yt-border pt-4">
            <button
              type="button"
              onClick={() => {
                const name = window.prompt('Nom de la playlist');
                if (!name?.trim()) return;
                void createPlaylist(name.trim()).then((pl) => {
                  if (pl?.id) navigate(`/local-playlist/${pl.id}`);
                });
              }}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-full border border-yt-border bg-yt-elevated px-3 py-2 text-sm font-medium text-white hover:bg-yt-hover"
            >
              <Plus className="h-4 w-4" /> Nouvelle playlist
            </button>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <NavLink
                to="/library"
                className="mb-0.5 flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-yt-muted hover:bg-yt-hover hover:text-white"
              >
                <ListMusic className="h-4 w-4 shrink-0 text-yt-red" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-white">Musique « J&apos;aime »</div>
                  <div className="truncate text-[11px] text-yt-muted">Titres aimés</div>
                </div>
              </NavLink>
              {playlists.map((p) => (
                <NavLink
                  key={p.id}
                  to={`/local-playlist/${p.id}`}
                  className={({ isActive }) =>
                    `mb-0.5 block rounded-lg px-2 py-2 text-left text-sm transition ${
                      isActive ? 'bg-yt-elevated text-white' : 'text-yt-muted hover:bg-yt-hover hover:text-white'
                    }`
                  }
                >
                  <div className="truncate font-medium text-white">{p.name}</div>
                  <div className="truncate text-[11px] text-yt-muted">
                    {p.tracks.length} titres · {user?.name || 'Toi'}
                  </div>
                </NavLink>
              ))}
              {likedPlaylists.slice(0, 20).map((p: any) => (
                <NavLink
                  key={`liked-pl-${p.id}`}
                  to={`/playlist/${p.id}`}
                  className={({ isActive }) =>
                    `mb-0.5 block rounded-lg px-2 py-2 text-left text-sm transition ${
                      isActive ? 'bg-yt-elevated text-white' : 'text-yt-muted hover:bg-yt-hover hover:text-white'
                    }`
                  }
                >
                  <div className="truncate font-medium text-white">{p.title || p.name}</div>
                  <div className="truncate text-[11px] text-yt-muted">Playlist sauvegardée</div>
                </NavLink>
              ))}
            </div>
          </div>

          <div className="mt-2 border-t border-yt-border pt-3">
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  isActive ? 'bg-yt-elevated text-white' : 'text-yt-muted hover:bg-yt-hover hover:text-white'
                }`
              }
              title={user?.email || 'Profil'}
            >
              <UserRound className="h-5 w-5 shrink-0" />
              <span className="min-w-0 truncate" title={user?.email || 'Profil'}>
                {isGuest ? 'Profil' : user?.email || user?.name || 'Compte'}
              </span>
            </NavLink>
            {user?.isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    isActive ? 'bg-yt-elevated text-white' : 'text-yt-muted hover:bg-yt-hover hover:text-white'
                  }`
                }
              >
                <Settings2 className="h-5 w-5" />
                Admin
              </NavLink>
            )}
            <button
              type="button"
              onClick={() => setDevicesOpen(true)}
              className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-yt-muted hover:bg-yt-hover hover:text-white"
            >
              Appareils / Cast
            </button>
            <button
              type="button"
              onClick={() => (isGuest ? setAuthOpen(true) : void logout().then(() => refresh()))}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-yt-muted hover:bg-yt-hover hover:text-white"
            >
              {user?.picture ? (
                <img src={user.picture} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <UserRound className="h-5 w-5" />
              )}
              <span className="truncate">{isGuest ? 'Se connecter' : 'Déconnexion'}</span>
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-yt-border/60 bg-yt-bg/90 px-4 py-3 backdrop-blur-md">
            <form
              className="relative mx-auto w-full max-w-xl"
              onSubmit={(e) => {
                e.preventDefault();
                if (!q.trim()) return;
                setOpenSug(false);
                navigate(`/search?q=${encodeURIComponent(q.trim())}`);
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-yt-muted" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setOpenSug(true);
                }}
                onFocus={() => setOpenSug(true)}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenSug(false);
                  setSuggestions([]);
                  if (q) setQ('');
                }}
                onBlur={() => {
                  // Laisse le temps au clic sur une suggestion
                  window.setTimeout(() => setOpenSug(false), 120);
                }}
                placeholder="Rechercher titres, albums, artistes…"
                className={`w-full rounded-full border border-yt-border bg-yt-surface py-2.5 pl-10 text-sm outline-none transition focus:border-white/30 ${
                  q ? 'pr-10' : 'pr-4'
                }`}
                aria-label="Recherche"
              />
              {q ? (
                <button
                  type="button"
                  aria-label="Effacer la recherche"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-yt-muted transition hover:bg-white/10 hover:text-white"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQ('');
                    setSuggestions([]);
                    setOpenSug(false);
                    if (location.pathname.startsWith('/search')) {
                      navigate('/search');
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
              {openSug && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-yt-border bg-yt-elevated shadow-2xl">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-yt-hover"
                      onClick={() => {
                        setQ(s);
                        setOpenSug(false);
                        navigate(`/search?q=${encodeURIComponent(s)}`);
                      }}
                    >
                      <Search className="h-3.5 w-3.5 text-yt-muted" />
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </form>
            <button
              type="button"
              onClick={() => setDevicesOpen(true)}
              className="hidden shrink-0 rounded-full bg-yt-elevated px-3 py-2 text-xs text-yt-muted hover:text-white sm:inline-flex"
            >
              Cast
            </button>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="hidden max-w-[9rem] shrink-0 truncate rounded-full bg-yt-elevated px-3 py-2 text-xs text-yt-muted hover:text-white sm:inline-flex"
              title={user?.email || 'Compte'}
            >
              {isGuest ? 'Compte' : user?.email?.split('@')[0] || user?.name?.split(' ')[0] || 'Compte'}
            </button>
          </header>

          <main
            className={`min-h-0 flex-1 overflow-y-auto px-4 pt-4 md:px-8 ${
              hasPlayback ? 'pb-40' : 'pb-24 lg:pb-28'
            }`}
          >
            {!authLoaded && <p className="text-yt-muted">Chargement…</p>}
            {authLoaded && isGuest && !allowGuestPage && (
              <div className="mx-auto max-w-md rounded-2xl border border-yt-border bg-yt-elevated p-6 text-center">
                <BrandLogo className="mx-auto mb-3 h-12 w-12" />
                <h1 className="font-display text-xl font-semibold">Compte requis</h1>
                <p className="mt-2 text-sm text-yt-muted">
                  Connecte-toi pour l’accueil, Explorer, la radio et tes recommandations personnelles.
                </p>
                <button
                  type="button"
                  onClick={() => setAuthOpen(true)}
                  className="mt-4 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium"
                >
                  Se connecter / Créer un compte
                </button>
              </div>
            )}
            {authLoaded && (!isGuest || allowGuestPage) && (
              <>
                {!isActivePlayer && !allowGuestPage && (
                  <div className="mb-4 rounded-xl border border-yt-red/30 bg-yt-red/10 px-4 py-2 text-sm">
                    Contrôle à distance — la musique joue sur un autre appareil. Tu peux tout piloter d’ici.
                  </div>
                )}
                <Outlet />
              </>
            )}
          </main>
        </div>

        {!nowPlayingOpen && <QueuePanel />}
      </div>

      {!nowPlayingOpen && (
        <nav
          className={`fixed left-0 right-0 z-30 flex overflow-x-auto border-t border-yt-border bg-yt-surface lg:hidden ${
            hasPlayback ? 'bottom-[72px] sm:bottom-[76px]' : 'bottom-0'
          }`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 py-2 text-[10px] ${
                  isActive ? 'text-white' : 'text-yt-muted'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      )}

      {/* Lecteur : toujours visible s’il y a un titre (y compris restauré) ; sinon compact desktop only */}
      {(hasPlayback || !isGuest) && (
        <PlayerBar
          expanded={nowPlayingOpen}
          compactEmpty={!hasPlayback}
          onOpenDevices={() => setDevicesOpen(true)}
          onExpand={(tab) => {
            setNowPlayingTab(tab || 'queue');
            setNowPlayingOpen(true);
          }}
          onCollapse={() => setNowPlayingOpen(false)}
        />
      )}
      <NowPlaying
        open={nowPlayingOpen}
        initialTab={nowPlayingTab}
        onClose={() => setNowPlayingOpen(false)}
      />
      <InstallBanner />
      <AuthModal
        open={(authOpen || (authLoaded && isGuest && !allowGuestPage)) && !needsOnboarding}
        onClose={() => {
          if (!isGuest) setAuthOpen(false);
        }}
      />
      {needsOnboarding && !isGuest && (
        <OnboardingWizard
          onDone={() => {
            setNeedsOnboarding(false);
            setAuthOpen(false);
            void refresh();
            // Recharge l’accueil avec les nouvelles prefs
            if (location.pathname === '/' || location.pathname === '') {
              window.location.assign('/');
            }
          }}
        />
      )}
      <DevicePicker open={devicesOpen} onClose={() => setDevicesOpen(false)} />
      <ItemActionsSheet />

      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        // Requis pour Media Session / touches média OS
        onPlay={() => {
          usePlayer.setState({ isPlaying: true });
        }}
        onPause={() => {
          usePlayer.setState({ isPlaying: false });
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          const d = e.currentTarget.duration || 0;
          setProgress(t);
          reportListenProgress(t, d);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => void next()}
      />
    </div>
  );
}
