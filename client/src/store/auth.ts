import { create } from 'zustand';
import { api, setToken, type User } from '../api';
import { sessionSocket } from '../lib/session';
import { useSession } from './session';

type AuthState = {
  user: User | null;
  googleEnabled: boolean;
  googleClientId: string | null;
  loaded: boolean;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  loginGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
};

function reconnectSession() {
  sessionSocket.close();
  useSession.getState().init();
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  googleEnabled: false,
  googleClientId: null,
  loaded: false,

  init: async () => {
    try {
      const [cfg, me] = await Promise.all([api.authConfig(), api.me()]);
      set({
        googleEnabled: cfg.googleEnabled,
        googleClientId: cfg.googleClientId,
        user: me.user,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  login: async (email, password) => {
    const r = await api.login(email, password);
    setToken(r.token);
    set({ user: r.user });
    reconnectSession();
  },

  register: async (email, password, name) => {
    const r = await api.register(email, password, name);
    setToken(r.token);
    set({ user: r.user });
    reconnectSession();
  },

  loginGoogle: async (credential) => {
    const r = await api.google(credential);
    setToken(r.token);
    set({ user: r.user });
    reconnectSession();
  },

  logout: async () => {
    await api.logout().catch(() => undefined);
    setToken(null);
    const me = await api.me();
    set({ user: me.user });
    reconnectSession();
  },
}));
