import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import { db } from './db.js';
import type { Track } from './types.js';

export type DeviceType = 'web' | 'mobile' | 'desktop' | 'tv';

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

export type DeviceInfo = {
  id: string;
  name: string;
  type: DeviceType;
  canPlay: boolean;
  lastSeen: number;
};

type ConnectedDevice = DeviceInfo & {
  ws: WebSocket;
  userId: string;
};

type UserHub = {
  devices: Map<string, ConnectedDevice>;
  activePlayerId: string | null;
  state: PlaybackState;
};

const hubs = new Map<string, UserHub>();

function emptyState(): PlaybackState {
  return {
    current: null,
    queue: [],
    queueIndex: 0,
    isPlaying: false,
    progress: 0,
    duration: 0,
    volume: 0.9,
    shuffle: false,
    repeat: 'off',
    updatedAt: Date.now(),
  };
}

function loadPersistedState(userId: string): PlaybackState | null {
  try {
    const row = db.prepare('SELECT payload FROM playback_state WHERE user_id = ?').get(userId) as
      | { payload: string }
      | undefined;
    if (!row?.payload) return null;
    const parsed = JSON.parse(row.payload) as PlaybackState;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...emptyState(),
      ...parsed,
      queue: Array.isArray(parsed.queue) ? parsed.queue : [],
      updatedAt: parsed.updatedAt || Date.now(),
    };
  } catch {
    return null;
  }
}

function persistState(userId: string, state: PlaybackState) {
  try {
    db.prepare(
      `INSERT INTO playback_state (user_id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    ).run(userId, JSON.stringify(state), Date.now());
  } catch {
    /* ignore */
  }
}

function getHub(userId: string): UserHub {
  let hub = hubs.get(userId);
  if (!hub) {
    hub = {
      devices: new Map(),
      activePlayerId: null,
      state: loadPersistedState(userId) || emptyState(),
    };
    hubs.set(userId, hub);
  }
  return hub;
}

function setHubState(userId: string, hub: UserHub, patch: Partial<PlaybackState>) {
  hub.state = {
    ...hub.state,
    ...patch,
    updatedAt: Date.now(),
  };
  persistState(userId, hub.state);
}

function publicDevices(hub: UserHub) {
  return [...hub.devices.values()].map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    canPlay: d.canPlay,
    isActive: d.id === hub.activePlayerId,
    lastSeen: d.lastSeen,
  }));
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(hub: UserHub, payload: unknown, exceptId?: string) {
  for (const d of hub.devices.values()) {
    if (exceptId && d.id === exceptId) continue;
    send(d.ws, payload);
  }
}

function pushSnapshot(hub: UserHub, to?: ConnectedDevice) {
  const payload = {
    type: 'snapshot',
    devices: publicDevices(hub),
    activePlayerId: hub.activePlayerId,
    state: hub.state,
  };
  if (to) send(to.ws, payload);
  else broadcast(hub, payload);
}

export function handleSessionMessage(
  userId: string,
  ws: WebSocket,
  raw: string,
  meta: { defaultName?: string },
) {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  const hub = getHub(userId);
  const type = String(msg.type || '');

  if (type === 'register') {
    const id = String(msg.deviceId || randomUUID());
    const device: ConnectedDevice = {
      id,
      name: String(msg.name || meta.defaultName || 'Appareil'),
      type: (msg.deviceType || 'web') as DeviceType,
      canPlay: msg.canPlay !== false,
      lastSeen: Date.now(),
      ws,
      userId,
    };
    hub.devices.set(id, device);
    if (!hub.activePlayerId && device.canPlay) {
      hub.activePlayerId = id;
    }
    send(ws, { type: 'registered', deviceId: id });
    pushSnapshot(hub);
    return id;
  }

  const deviceId = String(msg.deviceId || '');
  const device = hub.devices.get(deviceId);
  if (device) device.lastSeen = Date.now();

  switch (type) {
    case 'ping':
      send(ws, { type: 'pong', t: Date.now() });
      break;

    case 'rename':
      if (device && msg.name) {
        device.name = String(msg.name);
        pushSnapshot(hub);
      }
      break;

    case 'set_active': {
      const targetId = String(msg.targetId || '');
      const target = hub.devices.get(targetId);
      if (target?.canPlay) {
        hub.activePlayerId = targetId;
        send(target.ws, {
          type: 'become_player',
          state: hub.state,
        });
        broadcast(hub, { type: 'active_changed', activePlayerId: targetId, state: hub.state });
        pushSnapshot(hub);
      }
      break;
    }

    case 'state_update': {
      if (hub.activePlayerId && deviceId && deviceId !== hub.activePlayerId) {
        break;
      }
      const s = msg.state || {};
      setHubState(userId, hub, s);
      broadcast(
        hub,
        { type: 'state', state: hub.state, activePlayerId: hub.activePlayerId },
        deviceId,
      );
      break;
    }

    case 'command': {
      const active = hub.activePlayerId ? hub.devices.get(hub.activePlayerId) : null;
      if (!active) {
        if (device?.canPlay) {
          hub.activePlayerId = device.id;
          send(device.ws, { type: 'command', command: msg.command, from: deviceId });
          pushSnapshot(hub);
        }
        break;
      }
      send(active.ws, {
        type: 'command',
        command: msg.command,
        from: deviceId,
      });
      broadcast(
        hub,
        { type: 'command_echo', command: msg.command, from: deviceId },
        active.id,
      );
      break;
    }

    case 'transfer_and_play': {
      const targetId = String(msg.targetId || '');
      const target = hub.devices.get(targetId);
      if (!target?.canPlay) break;
      if (msg.state) {
        setHubState(userId, hub, msg.state);
      }
      hub.activePlayerId = targetId;
      send(target.ws, { type: 'become_player', state: hub.state, autoplay: true });
      broadcast(hub, {
        type: 'active_changed',
        activePlayerId: targetId,
        state: hub.state,
      });
      pushSnapshot(hub);
      break;
    }

    case 'get_snapshot':
      if (device) pushSnapshot(hub, device);
      else {
        send(ws, {
          type: 'snapshot',
          devices: publicDevices(hub),
          activePlayerId: hub.activePlayerId,
          state: hub.state,
        });
      }
      break;

    default:
      break;
  }
}

export function detachSocket(ws: WebSocket) {
  for (const [userId, hub] of hubs) {
    for (const [id, device] of hub.devices) {
      if (device.ws === ws) {
        hub.devices.delete(id);
        if (hub.activePlayerId === id) {
          const next = [...hub.devices.values()].find((d) => d.canPlay);
          hub.activePlayerId = next?.id || null;
          if (next) {
            send(next.ws, { type: 'become_player', state: hub.state });
          }
        }
        persistState(userId, hub.state);
        pushSnapshot(hub);
        if (hub.devices.size === 0) hubs.delete(userId);
        return;
      }
    }
  }
}

export function getHubPublic(userId: string) {
  const hub = getHub(userId);
  return {
    devices: publicDevices(hub),
    activePlayerId: hub.activePlayerId,
    state: hub.state,
  };
}

/** HTTP : publier l’état de lecture (mobile sans WS). */
export function publishPlaybackState(userId: string, patch: Partial<PlaybackState>) {
  const hub = getHub(userId);
  setHubState(userId, hub, patch);
  broadcast(hub, { type: 'state', state: hub.state, activePlayerId: hub.activePlayerId });
  return getHubPublic(userId);
}
