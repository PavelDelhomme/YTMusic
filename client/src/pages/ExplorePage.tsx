import { useEffect, useState } from 'react';
import { api, type Shelf } from '../api';
import { ShelfRow } from '../components/MediaCard';

export function ExplorePage() {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .explore()
      .then((r) => setShelves(r.shelves))
      .catch((e) => setError(String(e.message || e)));
  }, []);

  return (
    <div className="animate-fade-up">
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">Explorer</h1>
      {error && <p className="text-sm text-yt-muted">{error}</p>}
      {shelves.map((shelf) => (
        <ShelfRow key={shelf.title} title={shelf.title} items={shelf.items} />
      ))}
    </div>
  );
}
