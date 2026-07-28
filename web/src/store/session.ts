import { create } from 'zustand';
import {
  sessionSocket,
  type PlaybackState,
  type RemoteDevice,
  getDeviceName,
  setDeviceName,
} from '../lib/session';

type SessionState = {
  connected: boolean;
  deviceId: string | null;
  devices: RemoteDevice[];
  activePlayerId: string | null;
  remoteState: PlaybackState | null;
  /** true when THIS device is the active audio player */
  isActivePlayer: boolean;
  init: () => void;
  setActive: (deviceId: string) => void;
  transferHere: () => void;
  transferTo: (deviceId: string, state?: Partial<PlaybackState>) => void;
  sendCommand: (command: Record<string, unknown>) => void;
  publishState: (state: Partial<PlaybackState>) => void;
  renameDevice: (name: string) => void;
  deviceName: string;
};

export const useSession = create<SessionState>((set, get) => ({
  connected: false,
  deviceId: null,
  devices: [],
  activePlayerId: null,
  remoteState: null,
  isActivePlayer: true,
  deviceName: getDeviceName(),

  init: () => {
    sessionSocket.connect({
      onRegistered: (deviceId) => set({ deviceId, connected: true }),
      onSnapshot: ({ devices, activePlayerId, state }) => {
        const me = sessionSocket.id;
        set({
          devices,
          activePlayerId,
          remoteState: state,
          isActivePlayer: !activePlayerId || activePlayerId === me,
          connected: true,
          deviceId: me,
        });
      },
      onState: (state, activePlayerId) => {
        const me = sessionSocket.id;
        set({
          remoteState: state,
          activePlayerId,
          isActivePlayer: !activePlayerId || activePlayerId === me,
        });
      },
      onActiveChanged: (activePlayerId, state) => {
        const me = sessionSocket.id;
        set({
          activePlayerId,
          remoteState: state,
          isActivePlayer: !activePlayerId || activePlayerId === me,
        });
      },
      onBecomePlayer: (state, autoplay) => {
        set({ isActivePlayer: true, remoteState: state });
        // Player store listens via custom event
        window.dispatchEvent(
          new CustomEvent('ytm-become-player', { detail: { state, autoplay } }),
        );
      },
      onCommand: (command) => {
        window.dispatchEvent(new CustomEvent('ytm-remote-command', { detail: command }));
      },
    });
  },

  setActive: (deviceId) => sessionSocket.setActive(deviceId),

  transferHere: () => {
    const me = get().deviceId || sessionSocket.id;
    get().transferTo(me);
  },

  transferTo: (deviceId, state) => {
    sessionSocket.transfer(deviceId, state);
  },

  sendCommand: (command) => sessionSocket.command(command),

  publishState: (state) => {
    if (get().isActivePlayer) sessionSocket.publishState(state);
  },

  renameDevice: (name) => {
    setDeviceName(name);
    sessionSocket.rename(name);
    set({ deviceName: name });
  },
}));
