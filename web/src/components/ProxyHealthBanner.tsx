import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiUrl } from '../api';

type Health = {
  ok?: boolean;
  youtubeCookies?: { configured?: boolean; hint?: string };
};

/**
 * - Local DEV : Vite proxy mort (/api → HTML SPA)
 * - Prod : cookies YouTube absents → play/pause OK mais skip / silence
 */
export function ProxyHealthBanner() {
  const [proxyBroken, setProxyBroken] = useState(false);
  const [cookiesMissing, setCookiesMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
        const ctype = res.headers.get('content-type') || '';
        const text = await res.text();
        const looksHtml = ctype.includes('text/html') || text.trimStart().startsWith('<!');
        if (import.meta.env.DEV) {
          if (!cancelled) setProxyBroken(!res.ok || looksHtml || !text.includes('"ok"'));
        }
        if (!looksHtml && text.includes('"ok"')) {
          try {
            const data = JSON.parse(text) as Health;
            const missing = data.youtubeCookies?.configured === false;
            // Afficher surtout hors local (VPS) — en local YouTube marche souvent sans cookies
            if (!cancelled) {
              setCookiesMissing(missing && !import.meta.env.DEV);
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        if (!cancelled && import.meta.env.DEV) setProxyBroken(true);
      }
    };
    void check();
    const t = window.setInterval(check, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  if (proxyBroken) {
    return (
      <div className="fixed inset-x-0 top-0 z-[100] border-b border-red-500/40 bg-red-950 px-4 py-3 text-sm text-red-100 shadow-lg">
        <p className="font-medium">API locale injoignable via Vite (proxy :5173 → :8787 mort)</p>
        <p className="mt-1 text-red-200/90">
          Dans un terminal : <code className="text-white">make ensure-api</code> puis redémarre Vite (
          <code className="text-white">make clean-vite && npm run dev:web</code>), ensuite Ctrl+Shift+R.
        </p>
      </div>
    );
  }

  if (cookiesMissing) {
    return (
      <div className="fixed inset-x-0 top-0 z-[100] border-b border-amber-500/40 bg-amber-950 px-4 py-3 text-sm text-amber-50 shadow-lg">
        <p className="font-medium">Pas de son / titres qui sautent : cookies YouTube manquants sur le serveur</p>
        <p className="mt-1 text-amber-100/90">
          YouTube bloque l’IP du VPS. Va dans{' '}
          <Link to="/admin" className="underline hover:text-white">
            Admin → Cookies YouTube
          </Link>{' '}
          et colle le header Cookie depuis youtube.com (DevTools), ou utilise Importer → cookies YTM.
        </p>
      </div>
    );
  }

  return null;
}
