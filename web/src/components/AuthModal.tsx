import { useEffect, useRef, useState } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { api, setRefreshToken, setToken } from '../api';
import { useAuth } from '../store/auth';
import { useLibrary } from '../store/library';
import { Fingerprint } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
  }
}

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { login, register, loginGoogle, googleEnabled, googleClientId, user, init } = useAuth();
  const refresh = useLibrary((s) => s.refresh);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(() => import.meta.env.VITE_DEV_EMAIL || '');
  const [password, setPassword] = useState(() => import.meta.env.VITE_DEV_PASSWORD || '');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [totp, setTotp] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const googleBtn = useRef<HTMLDivElement>(null);

  const isGuest = !user || user.isGuest || user.email.includes('@local.ytmusic');

  useEffect(() => {
    if (!open || !googleEnabled || !googleClientId) return;
    const scriptId = 'google-gsi';
    const boot = () => {
      if (!window.google || !googleBtn.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (resp: { credential: string }) => {
          try {
            await loginGoogle(resp.credential);
            await refresh();
            onClose();
          } catch (e) {
            setError(String((e as Error).message || e));
          }
        },
      });
      googleBtn.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtn.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
        shape: 'pill',
      });
    };
    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.id = scriptId;
      s.onload = boot;
      document.body.appendChild(s);
    } else boot();
  }, [open, googleEnabled, googleClientId, loginGoogle, onClose, refresh]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-yt-border bg-yt-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">
              {mode === 'login' ? 'Connexion' : 'Créer un compte'}
            </h2>
            <p className="mt-1 text-sm text-yt-muted">
              Session longue sécurisée (refresh) — web, mobile PWA et desktop.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-yt-muted hover:text-white">
            ✕
          </button>
        </div>

        {!isGuest && (
          <p className="mb-3 rounded-lg bg-yt-elevated px-3 py-2 text-sm">
            Connecté : {user!.name} ({user!.email})
            {!user!.emailVerified && (
              <button
                type="button"
                className="ml-2 text-yt-red underline"
                onClick={() => void api.resendVerification().then(() => setInfo('Email renvoyé'))}
              >
                Renvoyer validation
              </button>
            )}
          </p>
        )}

        {googleEnabled && (
          <div className="mb-4 flex justify-center">
            <div ref={googleBtn} />
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-full border border-yt-border bg-yt-elevated py-2.5 text-sm font-medium hover:bg-yt-hover disabled:opacity-60"
          onClick={() => {
            setBusy(true);
            setError('');
            void (async () => {
              try {
                const options = await api.passkeyLoginOptions(email || undefined);
                const cred = await startAuthentication({ optionsJSON: options });
                const r = await api.passkeyLoginVerify(cred);
                setToken(r.token);
                if ((r as any).refreshToken) setRefreshToken((r as any).refreshToken);
                await init();
                await refresh();
                onClose();
              } catch (e) {
                setError(String((e as Error).message || e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          <Fingerprint className="h-4 w-4" /> Continuer avec une passkey
        </button>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            setInfo('');
            void (async () => {
              try {
                if (mode === 'login') {
                  try {
                    await login(email, password, needs2fa ? totp : undefined);
                  } catch (err) {
                    const msg = String((err as Error).message || err);
                    if ((err as any).needs2fa || msg.includes('2FA')) {
                      setNeeds2fa(true);
                      setError('Entre le code 2FA de ton application d’authentification');
                      return;
                    }
                    throw err;
                  }
                  await refresh();
                  onClose();
                } else {
                  await register(email, password, name || email.split('@')[0]);
                  setInfo(
                    'Compte créé — un email de validation a été envoyé. En local : Admin → Boîte mail / logs serveur.',
                  );
                  await refresh();
                }
              } catch (err) {
                setError(String((err as Error).message || err));
              }
            })();
          }}
        >
          {mode === 'register' && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom"
              className="w-full rounded-xl border border-yt-border bg-yt-bg px-3 py-2.5 text-sm outline-none focus:border-white/30"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-xl border border-yt-border bg-yt-bg px-3 py-2.5 text-sm outline-none focus:border-white/30"
          />
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe"
              className="w-full rounded-xl border border-yt-border bg-yt-bg px-3 py-2.5 pr-12 text-sm outline-none focus:border-white/30"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-yt-muted hover:text-white"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? 'Masquer' : 'Voir'}
            </button>
          </div>
          {needs2fa && (
            <input
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              placeholder="Code 2FA (6 chiffres)"
              inputMode="numeric"
              className="w-full rounded-xl border border-yt-border bg-yt-bg px-3 py-2.5 text-sm outline-none focus:border-white/30"
            />
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {info && <p className="text-sm text-emerald-400">{info}</p>}
          <button type="submit" className="w-full rounded-full bg-yt-red py-2.5 text-sm font-medium">
            {mode === 'login' ? 'Se connecter' : "S'inscrire"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-yt-muted hover:text-white"
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'));
            setNeeds2fa(false);
          }}
        >
          {mode === 'login' ? 'Créer un compte' : 'Déjà un compte ? Connexion'}
        </button>
      </div>
    </div>
  );
}
