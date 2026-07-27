import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../store/auth';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [msg, setMsg] = useState('Validation…');
  const [ok, setOk] = useState(false);
  const init = useAuth((s) => s.init);
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setMsg('Lien invalide');
      return;
    }
    void api
      .verifyEmail(token)
      .then(async () => {
        setOk(true);
        setMsg('Email validé ! Tu peux profiter de toutes les fonctions.');
        await init();
        setTimeout(() => navigate('/'), 2000);
      })
      .catch((e) => setMsg(String(e.message || e)));
  }, [params, init, navigate]);

  return (
    <div className="mx-auto max-w-md animate-fade-up rounded-2xl border border-yt-border bg-yt-surface p-8 text-center">
      <h1 className="font-display text-2xl font-semibold">Validation email</h1>
      <p className={`mt-4 text-sm ${ok ? 'text-emerald-400' : 'text-yt-muted'}`}>{msg}</p>
    </div>
  );
}
