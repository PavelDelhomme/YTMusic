import { getToken } from '../api';
import type { Track } from '../api';

export type DeviceType = 'web' | 'mobile' | 'desktop' | 'tv';

export type RemoteDevice = {
  id: string;
  name: string;
  type: DeviceType;
  canPlay: boolean;
  isActive: boolean;
  lastSeen: number;
};

export type PlaybackState = {
  current: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  updatedAt: number;
};

type Handlers = {
  onSnapshot?: (data: { devices: RemoteDevice[]; activePlayerId: string | null; state: PlaybackState }) => void;
  onState?: (state: PlaybackState, activePlayerId: string | null) => void;
  onCommand?: (command: any) => void;
  onBecomePlayer?: (state: PlaybackState, autoplay?: boolean) => void;
  onActiveChanged?: (activePlayerId: string | null, state: PlaybackState) => void;
  onRegistered?: (deviceId: string) => void;
};

const DEVICE_KEY = 'ytm_device';
const NAME_KEY = 'ytm_device_name';

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getDeviceName() {
  return localStorage.getItem(NAME_KEY) || guessDefaultName();
}

export function setDeviceName(name: string) {
  localStorage.setItem(NAME_KEY, name);
}

function guessDefaultName() {
  const ua = navigator.userAgent;
  if (/TV|SmartTV|WebOS|Tizen/i.test(ua)) return 'Télé';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'Téléphone';
  if ((window as any).ytmDesktop?.isDesktop) return 'Ordinateur (desktop)';
  return `Navigateur · ${navigator.platform || 'Web'}`;
}

export function guessDeviceType(): DeviceType {
  const ua = navigator.userAgent;
  if (/TV|SmartTV|WebOS|Tizen/i.test(ua) || location.pathname.startsWith('/tv')) return 'tv';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'mobile';
  if ((window as any).ytmDesktop?.isDesktop) return 'desktop';
  return 'web';
}

export class SessionSocket {
  private ws: WebSocket | null = null;
  private handlers: Handlers = {};
  private deviceId = getDeviceId();
  private reconnectTimer: number | null = null;
  private intentionalClose = false;

  get id() {
    return this.deviceId;
  }

  connect(handlers: Handlers) {
    this.handlers = handlers;
    this.intentionalClose = false;
    this.open();
  }

  private open() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const host = location.host;
    // In vite dev, proxy /ws to API; fallback direct to 8787 if needed
    const token = getToken() || '';
    const qs = new URLSearchParams({
      device: this.deviceId,
      token,
    });
    const url = `${proto}://${host}/ws?${qs}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.send({
        type: 'register',
        deviceId: this.deviceId,
        name: getDeviceName(),
        deviceType: guessDeviceType(),
        canPlay: true,
      });
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      switch (msg.type) {
        case 'registered':
          this.deviceId = msg.deviceId;
          this.handlers.onRegistered?.(msg.deviceId);
          break;
        case 'snapshot':
          this.handlers.onSnapshot?.(msg);
          break;
        case 'state':
          this.handlers.onState?.(msg.state, msg.activePlayerId);
          break;
        case 'command':
          this.handlers.onCommand?.(msg.command);
          break;
        case 'become_player':
          this.handlers.onBecomePlayer?.(msg.state, msg.autoplay);
          break;
        case 'active_changed':
          this.handlers.onActiveChanged?.(msg.activePlayerId, msg.state);
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (!this.intentionalClose) {
        this.reconnectTimer = window.setTimeout(() => this.open(), 1500);
      }
    };
  }

  send(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ ...payload, deviceId: this.deviceId }));
  }

  publishState(state: Partial<PlaybackState>) {
    this.send({ type: 'state_update', state });
  }

  command(command: Record<string, unknown>) {
    this.send({ type: 'command', command });
  }

  setActive(targetId: string) {
    this.send({ type: 'set_active', targetId });
  }

  transfer(targetId: string, state?: Partial<PlaybackState>) {
    this.send({ type: 'transfer_and_play', targetId, state });
  }

  rename(name: string) {
    setDeviceName(name);
    this.send({ type: 'rename', name });
  }

  close() {
    this.intentionalClose = true;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

export const sessionSocket = new SessionSocket();
