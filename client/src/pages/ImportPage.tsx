import { useState } from 'react';
import { api } from '../api';
import { useLibrary } from '../store/library';
import { Download, Link2, Loader2 } from 'lucide-react';

export function ImportPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const applyLibrary = useLibrary((s) => s.applyLibrary);

  const run = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const result = await api.import({ url: input.trim(), query: input.trim() });
      applyLibrary(result.library);
      setMessage(
        `Importé : ${result.title} (${result.kind}) — ${JSON.stringify(result.added)}`,
      );
      setInput('');
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">Importer</h1>
      <p className="mb-6 text-sm text-yt-muted">
        Colle une URL YouTube / YouTube Music (titre, album, artiste, playlist) ou un nom à rechercher.
        Les contenus sont ajoutés à ta bibliothèque synchronisée.
      </p>

      <div className="rounded-2xl border border-yt-border bg-yt-elevated p-4">
        <label className="mb-2 flex items-center gap-2 text-sm text-yt-muted">
          <Link2 className="h-4 w-4" /> URL ou recherche
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="https://music.youtube.com/playlist?list=... ou Daft Punk"
          className="w-full resize-none rounded-xl border border-yt-border bg-yt-bg px-3 py-2.5 text-sm outline-none focus:border-white/30"
        />
        <button
          type="button"
          disabled={loading || !input.trim()}
          onClick={() => void run()}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-yt-red px-5 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Importer dans ma bibliothèque
        </button>
      </div>

      {message && (
        <p className="mt-4 rounded-xl border border-emerald-900/50 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-8 space-y-2 text-sm text-yt-muted">
        <p>Exemples acceptés :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Lien watch / music.youtube.com</li>
          <li>ID playlist (PL…, VL…, RD…)</li>
          <li>ID album (MPREb_…)</li>
          <li>Chaîne artiste (UC…)</li>
        </ul>
      </div>
    </div>
  );
}
