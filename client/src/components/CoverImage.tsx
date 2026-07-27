import { useEffect, useMemo, useState } from 'react';
import { thumbCandidates, type Track } from '../api';

type Props = {
  item:
    | Track
    | { thumbnails?: Track['thumbnails']; title?: string; name?: string; type?: string; id?: string };
  size?: number;
  className?: string;
  rounded?: 'md' | 'lg' | 'full' | 'none';
  alt?: string;
};

function initialOf(item: Props['item']) {
  const t = (item as Track).title || (item as { name?: string }).name || '?';
  return t.trim().charAt(0).toUpperCase() || '?';
}

function radiusClass(rounded: Props['rounded']) {
  if (rounded === 'full') return 'rounded-full';
  if (rounded === 'lg') return 'rounded-lg';
  if (rounded === 'none') return '';
  return 'rounded-md';
}

export function CoverImage({ item, size = 200, className = '', rounded = 'md', alt = '' }: Props) {
  const candidates = useMemo(() => thumbCandidates(item, size), [item, size]);
  const [idx, setIdx] = useState(0);
  const r = radiusClass(rounded);

  useEffect(() => {
    setIdx(0);
  }, [candidates.join('|')]);

  const src = candidates[idx] || '';

  return (
    <div className={`relative h-full w-full overflow-hidden ${r} ${className}`}>
      <div
        className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#3a3a3a] to-[#1a1a1a] text-lg font-semibold text-white/70"
        aria-hidden
      >
        {initialOf(item)}
      </div>
      {src ? (
        <img
          key={src}
          src={src}
          alt={alt}
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setIdx((i) => i + 1)}
        />
      ) : null}
    </div>
  );
}
