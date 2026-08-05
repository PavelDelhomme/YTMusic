#!/usr/bin/env bash
# Relie le stream du VPS à ton API locale (IP maison = YouTube OK, sans cookies DevTools).
#
# Prérequis : API locale UP (make up / ensure-api) + SSH pavel-server.
#
# Usage :
#   bash scripts/link-home-stream.sh          # ouvre le tunnel + active STREAM_UPSTREAM sur le VPS
#   bash scripts/link-home-stream.sh status
#   bash scripts/link-home-stream.sh stop
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env" 2>/dev/null || true
  set +a
fi

SSH_HOST="${DEPLOY_SSH:-pavel-server}"
LOCAL_API="${HOME_STREAM_LOCAL:-http://127.0.0.1:8787}"
REMOTE_PORT="${HOME_STREAM_PORT:-18787}"
PID_FILE="${XDG_RUNTIME_DIR:-/tmp}/ytmusic-home-stream.ssh.pid"
CMD="${1:-start}"

case "$CMD" in
  status)
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "tunnel UP pid=$(cat "$PID_FILE") → ${SSH_HOST}:${REMOTE_PORT}"
    else
      echo "tunnel DOWN"
    fi
    curl -fsS --max-time 3 "${LOCAL_API}/api/health" >/dev/null && echo "API locale OK" || echo "API locale KO"
    ssh -o BatchMode=yes -o ConnectTimeout=8 "$SSH_HOST" \
      "docker exec ytmusic printenv STREAM_UPSTREAM 2>/dev/null || true"
    exit 0
    ;;
  stop)
    if [[ -f "$PID_FILE" ]]; then
      kill "$(cat "$PID_FILE")" 2>/dev/null || true
      rm -f "$PID_FILE"
    fi
    pkill -f "ssh.*-R ${REMOTE_PORT}:127.0.0.1:8787" 2>/dev/null || true
    echo "tunnel stoppé (STREAM_UPSTREAM reste dans le conteneur jusqu’au prochain redeploy)"
    exit 0
    ;;
esac

echo "==> ensure-api local…"
FORCE_RESTART=0 bash "$ROOT/scripts/ensure-api.sh" >/dev/null

if ! curl -fsS --max-time 3 "${LOCAL_API}/api/health" >/dev/null; then
  echo "API locale injoignable sur ${LOCAL_API}" >&2
  exit 1
fi

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "==> tunnel déjà actif pid=$(cat "$PID_FILE")"
else
  echo "==> tunnel SSH -R ${REMOTE_PORT}:127.0.0.1:8787 → $SSH_HOST"
  # shellcheck disable=SC2029
  ssh -f -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -R "${REMOTE_PORT}:127.0.0.1:8787" "$SSH_HOST"
  # retrouve le pid
  pgrep -n -f "ssh.*-R ${REMOTE_PORT}:127.0.0.1:8787" >"$PID_FILE" || true
  echo "    pid=$(cat "$PID_FILE" 2>/dev/null || echo '?')"
fi

echo "==> active STREAM_UPSTREAM dans le conteneur ytmusic…"
# host.docker.internal (Docker ≥20.10) ou gateway bridge
ssh -o BatchMode=yes "$SSH_HOST" bash -s <<REMOTE
set -euo pipefail
# Ajoute host-gateway si possible (ignore si déjà présent / ancien docker)
docker inspect ytmusic >/dev/null
# Test reachability depuis le conteneur
UP=""
for cand in \
  "http://172.17.0.1:${REMOTE_PORT}" \
  "http://host.docker.internal:${REMOTE_PORT}" \
  "http://10.0.0.1:${REMOTE_PORT}"
do
  if docker run --rm --network container:ytmusic curlimages/curl:8.5.0 \
      -fsS --max-time 3 "\${cand}/api/health" >/dev/null 2>&1 \
    || docker exec ytmusic curl -fsS --max-time 3 "\${cand}/api/health" >/dev/null 2>&1; then
    UP="\$cand"
    break
  fi
done
# Fallback : le port SSH -R est sur le host loopback — socat vers 0.0.0.0 si besoin
if [[ -z "\$UP" ]]; then
  if curl -fsS --max-time 2 "http://127.0.0.1:${REMOTE_PORT}/api/health" >/dev/null 2>&1; then
    # Publie 127.0.0.1:${REMOTE_PORT} vers le bridge docker via socat si dispo
    if command -v socat >/dev/null 2>&1; then
      pkill -f "socat.*TCP-LISTEN:18788" 2>/dev/null || true
      nohup socat TCP-LISTEN:18788,fork,reuseaddr TCP:127.0.0.1:${REMOTE_PORT} >/tmp/ytm-socat.log 2>&1 &
      sleep 0.3
      UP="http://172.17.0.1:18788"
    else
      UP="http://172.17.0.1:${REMOTE_PORT}"
    fi
  fi
fi
if [[ -z "\$UP" ]]; then
  echo "Impossible d’atteindre le tunnel depuis Docker — vérifie ssh -R / GatewayPorts" >&2
  exit 1
fi
echo "STREAM_UPSTREAM=\$UP"
# Recrée le conteneur avec l’env (garde image + volumes)
IMG=\$(docker inspect -f '{{.Config.Image}}' ytmusic)
NAME=ytmusic
# Récupère le compose du stack Portainer si possible, sinon docker run minimal
if [[ -f /tmp/ytm-stream-upstream.env ]]; then rm -f /tmp/ytm-stream-upstream.env; fi
echo "STREAM_UPSTREAM=\$UP" >/tmp/ytm-stream-upstream.env
# Injecte via docker update n’existe pas pour env → restart avec --env-file merge
# Astuce : écrit un fichier lu au boot si l’image le supportait — sinon recreate.
CID=\$(docker inspect -f '{{.Id}}' ytmusic)
# Utilise docker commit? Non. On set via un fichier dans le volume data + wrapper.
# Solution simple : fichier /app/data/stream-upstream.url lu par l’API (ajouté côté code).
echo "\$UP" | docker exec -i ytmusic sh -c 'cat > /app/data/stream-upstream.url'
docker restart ytmusic >/dev/null
echo "OK — fichier /app/data/stream-upstream.url + restart"
REMOTE

echo ""
echo "✅ Tunnel maison actif."
echo "   Laisse ce PC allumé (et ce script / le ssh -R) pour que le son marche sur le VPS."
echo "   Stop : bash scripts/link-home-stream.sh stop"
echo "   Test : curl -I https://ytmusic.delhomme.ovh/api/health"
