import { create } from 'zustand';
import { api } from '../api';

export type PinRow = {
  id: string;
  kind: string;
  targetId: string;
  payload?: unknown;
};

type PinsState = {
  pins: PinRow[];
  loaded: boolean;
  refresh: () => Promise<void>;
  isPinned: (targetId: string) => boolean;
  pinIdFor: (targetId: string) => string | null;
  togglePin: (item: {
    id: string;
    type?: string;
    title?: string;
    [k: string]: unknown;
  }) => Promise<'pinned' | 'unpinned'>;
};

export const usePins = create<PinsState>((set, get) => ({
  pins: [],
  loaded: false,
  refresh: async () => {
    try {
      const r = await api.pins();
      set({ pins: (r.pins || []) as PinRow[], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  isPinned: (targetId) => get().pins.some((p) => p.targetId === targetId),
  pinIdFor: (targetId) => get().pins.find((p) => p.targetId === targetId)?.id || null,
  togglePin: async (item) => {
    const existing = get().pinIdFor(item.id);
    if (existing) {
      const r = await api.removePin(existing);
      set({ pins: (r.pins || []) as PinRow[], loaded: true });
      return 'unpinned';
    }
    const payload = {
      ...item,
      id: item.id,
      type: item.type || 'song',
      title: item.title || (item as { name?: string }).name || item.id,
      artists: Array.isArray(item.artists) ? item.artists : [],
      thumbnails: Array.isArray(item.thumbnails) ? item.thumbnails : [],
    };
    const r = await api.addPin({
      kind: payload.type,
      targetId: item.id,
      payload,
      id: item.id,
    });
    set({ pins: (r.pins || []) as PinRow[], loaded: true });
    return 'pinned';
  },
}));
