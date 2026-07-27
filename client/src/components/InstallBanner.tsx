import { useEffect, useState } from 'react';
import { Download, MonitorSmartphone, Share2, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone() {
  const mq = window.matchMedia('(display-mode: standalone)').matches;
  const ios = (window.navigator as any).standalone === true;
  const twa = document.referrer.includes('android-app://');
  return mq || ios || twa;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isMobile() {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function isDesktop() {
  return !isMobile();
}

/** Bannière d’install : uniquement si l’app n’est PAS déjà installée (tous hosts). */
export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const dismissedKey = `ytm_install_dismissed:${location.host}`;

  useEffect(() => {
    // Déjà en mode app (Edge/Chrome installé, PWA iOS, etc.) → ne rien proposer
    if (isStandalone()) return;
    if (localStorage.getItem(dismissedKey) === '1') return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    // iOS : pas d’event BIP → hint manuel
    if (isIos()) {
      const t = setTimeout(() => setVisible(true), 3000);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBip);
      };
    }

    // Desktop / Android : attendre BIP ; sinon hint soft après délai (Edge/Chrome)
    const t = setTimeout(() => {
      if (!isStandalone()) setVisible(true);
    }, isDesktop() ? 6000 : 4000);

    return () => {
      clearTimeout(t);
      window.removeEventListener('beforeinstallprompt', onBip);
    };
  }, [dismissedKey]);

  if (!visible || isStandalone()) return null;

  const dismiss = () => {
    localStorage.setItem(dismissedKey, '1');
    setVisible(false);
    setIosHint(false);
  };

  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        localStorage.setItem(dismissedKey, '1');
        setVisible(false);
      }
      setDeferred(null);
      return;
    }
    setIosHint(true);
  };

  const hostHint = location.host || 'cet appareil';

  return (
    <div className="fixed bottom-[92px] left-3 right-3 z-40 mx-auto max-w-lg animate-fade-up md:left-auto md:right-4">
      <div className="rounded-2xl border border-yt-border bg-yt-surface/95 p-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-yt-red">
            {isMobile() ? (
              <Download className="h-5 w-5 text-white" />
            ) : (
              <MonitorSmartphone className="h-5 w-5 text-white" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-semibold">
              {isMobile() ? 'Installer sur mobile' : 'Installer sur cet ordinateur'}
            </div>
            <p className="mt-0.5 text-xs text-yt-muted">
              {hostHint} — plein écran, hors-ligne, comme une vraie app.
            </p>
            {iosHint && (
              <p className="mt-2 rounded-lg bg-yt-elevated px-2.5 py-2 text-[11px] leading-relaxed text-yt-muted">
                {isIos() ? (
                  <>
                    iPhone/iPad : <Share2 className="inline h-3 w-3" /> Partager → « Sur l&apos;écran
                    d&apos;accueil ».
                  </>
                ) : (
                  <>
                    Edge / Chrome : menu ⋮ → « Applications » → « Installer YTMusic » (ou icône ⊕ dans
                    la barre d&apos;adresse).
                  </>
                )}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void install()}
                className="rounded-full bg-white px-3.5 py-1.5 text-xs font-medium text-black"
              >
                {deferred ? 'Installer' : 'Comment installer'}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full bg-yt-elevated px-3.5 py-1.5 text-xs text-yt-muted hover:text-white"
              >
                Plus tard
              </button>
            </div>
          </div>
          <button type="button" onClick={dismiss} className="text-yt-muted hover:text-white" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
