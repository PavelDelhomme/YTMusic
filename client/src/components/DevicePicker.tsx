import { useEffect, useState } from 'react';
import { Cast, Check, Laptop, MonitorPlay, Smartphone, Tv } from 'lucide-react';
import { useSession } from '../store/session';
import { usePlayer } from '../store/player';
import { castToChromecast, isCastAvailable } from '../lib/cast';

function DeviceIcon({ type }: { type: string }) {
  if (type === 'tv') return <Tv className="h-4 w-4" />;
  if (type === 'mobile') return <Smartphone className="h-4 w-4" />;
  if (type === 'desktop') return <Laptop className="h-4 w-4" />;
  return <MonitorPlay className="h-4 w-4" />;
}

export function DevicePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { devices, activePlayerId, deviceId, deviceName, setActive, transferTo, renameDevice } =
    useSession();
  const player = usePlayer();
  const [name, setName] = useState(deviceName);
  const [castMsg, setCastMsg] = useState('');

  useEffect(() => setName(deviceName), [deviceName]);

  if (!open) return null;

  const snapshot = () => ({
    current: player.current,
    queue: player.queue,
    queueIndex: player.queueIndex,
    isPlaying: player.isPlaying,
    progress: player.progress,
    duration: player.duration,
    volume: player.volume,
    shuffle: player.shuffle,
    repeat: player.repeat,
    updatedAt: Date.now(),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-yt-border bg-yt-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Appareils</h2>
          <button type="button" onClick={onClose} className="text-yt-muted hover:text-white">
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm text-yt-muted">
          Lance la musique sur un PC / Linux / TV et contrôle tout depuis le mobile (file, titres,
          volume…).
        </p>

        <label className="mb-1 block text-xs text-yt-muted">Nom de cet appareil</label>
        <div className="mb-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-xl border border-yt-border bg-yt-bg px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => renameDevice(name.trim() || deviceName)}
            className="rounded-xl bg-yt-elevated px-3 text-sm"
          >
            OK
          </button>
        </div>

        <div className="mb-4 space-y-2">
          {devices.map((d) => {
            const active = d.id === activePlayerId;
            const isMe = d.id === deviceId;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  if (active) return;
                  transferTo(d.id, snapshot());
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  active ? 'bg-yt-red/20 ring-1 ring-yt-red/50' : 'bg-yt-elevated hover:bg-yt-hover'
                }`}
              >
                <DeviceIcon type={d.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {d.name}
                    {isMe ? ' (cet appareil)' : ''}
                  </div>
                  <div className="text-xs text-yt-muted">
                    {d.type} · {active ? 'En lecture ici' : 'Disponible'}
                  </div>
                </div>
                {active && <Check className="h-4 w-4 text-yt-red" />}
              </button>
            );
          })}
          {!devices.length && (
            <p className="text-sm text-yt-muted">Aucun autre appareil connecté avec le même compte.</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              if (deviceId) setActive(deviceId);
            }}
            className="rounded-full bg-white px-4 py-2.5 text-sm font-medium text-black"
          >
            Lire sur cet appareil
          </button>

          <button
            type="button"
            onClick={() => {
              window.open('/tv', '_blank', 'noopener');
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white"
          >
            <Tv className="h-4 w-4" /> Ouvrir le mode TV / récepteur
          </button>

          {isCastAvailable() && player.current && (
            <button
              type="button"
              onClick={() => {
                void castToChromecast(player.current!)
                  .then(() => setCastMsg('Cast lancé vers Chromecast'))
                  .catch((e) => setCastMsg(String(e.message || e)));
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-yt-elevated px-4 py-2.5 text-sm text-yt-muted hover:text-white"
            >
              <Cast className="h-4 w-4" /> Cast Chromecast
            </button>
          )}
        </div>

        {castMsg && <p className="mt-3 text-xs text-yt-muted">{castMsg}</p>}
      </div>
    </div>
  );
}
