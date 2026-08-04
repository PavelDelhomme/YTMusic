import { create } from 'zustand';
import type { Track } from '../api';

export type ItemActionsOpts = {
  queueIndex?: number;
  /** Si défini, affiche « Supprimer de la playlist » */
  playlistId?: string;
  onRemoveFromPlaylist?: () => void;
};

type State = {
  item: Track | null;
  opts: ItemActionsOpts;
  open: (item: Track, opts?: ItemActionsOpts) => void;
  close: () => void;
};

export const useItemActions = create<State>((set) => ({
  item: null,
  opts: {},
  open: (item, opts = {}) => set({ item, opts }),
  close: () => set({ item: null, opts: {} }),
}));
