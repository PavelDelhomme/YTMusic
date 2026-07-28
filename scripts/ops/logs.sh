#!/usr/bin/env bash
# make logs — suivi type JobbingTrack (Docker compose OU fichiers locaux)
# Modes : follow (défaut) | tail | watch
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1
MODE="${1:-follow}"
COLOR="$ROOT/scripts/ops/color-logs.sh"
chmod +x "$COLOR" 2>/dev/null || true

LOGS_SINCE="${LOGS_SINCE:-24h}"
LOGS_TAIL="${LOGS_TAIL:-80}"
LOG_DIR="$ROOT/logs"
# API (ensure-api) + Vite (make dev) — les deux flux
LOG_FILES=(
  "$LOG_DIR/ytmusic-server.log"
  "$LOG_DIR/ytmusic-dev.log"
  "$LOG_DIR/ytmusic-web.log"
)

set_term_title() {
  { printf '\033]0;%s\007' "$1" >/dev/tty; } 2>/dev/null || true
}
trap 'set_term_title ""' EXIT

compose_args() {
  if [[ -f docker-compose.dev.yml ]]; then
    echo "-f docker-compose.dev.yml"
  else
    echo "-f docker-compose.yml"
  fi
}

docker_running() {
  local args
  # shellcheck disable=SC2046
  args=$(compose_args)
  # shellcheck disable=SC2086
  if docker compose $args ps -q --status running 2>/dev/null | grep -q .; then
    return 0
  fi
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qE '^ytmusic' && return 0
  return 1
}

follow_docker() {
  local args
  args=$(compose_args)
  set_term_title "YTMusic Logs"
  echo "📋 Logs YTMusic (Docker)"
  echo "========================"
  echo "⏹  Ctrl+C pour quitter"
  echo "🔧 LOGS_SINCE=${LOGS_SINCE}  LOGS_TAIL=${LOGS_TAIL}"
  echo ""
  # shellcheck disable=SC2086
  if [[ "$MODE" == "tail" ]]; then
    docker compose $args logs -t --tail="${LOGS_TAIL}" 2>&1 | bash "$COLOR"
    return $?
  fi
  # shellcheck disable=SC2086
  docker compose $args logs -f -t --since="${LOGS_SINCE}" --tail="${LOGS_TAIL}" 2>&1 | bash "$COLOR"
}

follow_docker_by_name() {
  set_term_title "YTMusic Logs"
  echo "📋 Logs YTMusic (docker logs par nom)"
  echo "===================================="
  echo "⏹  Ctrl+C pour quitter"
  echo ""
  local names
  names=$(docker ps --format '{{.Names}}' | grep -E '^ytmusic' || true)
  [[ -z "$names" ]] && return 1
  # shellcheck disable=SC2086
  docker logs -f -t --tail="${LOGS_TAIL}" $names 2>&1 | bash "$COLOR"
}

ensure_log_files() {
  mkdir -p "$LOG_DIR"
  local f
  for f in "${LOG_FILES[@]}"; do
    touch "$f"
  done
}

follow_local_files() {
  ensure_log_files
  set_term_title "YTMusic Logs"
  echo "📋 Logs YTMusic (local · multi-fichiers)"
  echo "======================================="
  echo "⏹  Ctrl+C pour quitter"
  echo "💡 API  → logs/ytmusic-server.log   (make ensure-api / restart-api)"
  echo "💡 Vite → logs/ytmusic-dev.log      (make dev)"
  echo "🔧 LOGS_TAIL=${LOGS_TAIL}"
  echo ""
  # Affiche un extrait récent de chaque fichier (étiqueté)
  local f base
  for f in "${LOG_FILES[@]}"; do
    base="$(basename "$f")"
    if [[ -s "$f" ]]; then
      echo "──── $base (dernieres ${LOGS_TAIL} lignes) ────"
      tail -n "${LOGS_TAIL}" "$f" 2>/dev/null | sed "s/^/[$base] /" | bash "$COLOR" || true
      echo ""
    fi
  done
  if [[ "$MODE" == "tail" ]]; then
    return 0
  fi
  echo "──── suivi en direct (tail -F) ────"
  # -F : suit même si le fichier est tronqué / recréé (restart-api)
  tail -n 0 -F "${LOG_FILES[@]}" 2>&1 | bash "$COLOR"
}

follow_watch_docker() {
  local args
  args=$(compose_args)
  set_term_title "YTMusic Logs"
  echo "📋 logs-watch — reconnexion auto — Ctrl+C pour quitter"
  echo ""
  trap 'echo ""; echo "⏹ logs-watch arrêté."; exit 130' INT
  while true; do
    # shellcheck disable=SC2086
    if ! docker compose $args ps -q --status running 2>/dev/null | grep -q .; then
      echo "[logs-watch] Aucun conteneur running — nouvel essai dans 5s…"
      sleep 5
      continue
    fi
    set +e
    # shellcheck disable=SC2086
    docker compose $args logs -f -t --since="${LOGS_SINCE}" --tail="${LOGS_TAIL}" 2>&1 | bash "$COLOR"
    dc="${PIPESTATUS[0]:-1}"
    set -e
    if [[ "$dc" == "130" ]]; then exit 130; fi
    echo "[logs-watch] Flux coupé (code ${dc}) — reconnexion dans 3s…"
    sleep 3
  done
}

# ---- dispatch ----
if docker_running; then
  if [[ "$MODE" == "watch" ]]; then
    follow_watch_docker
  else
    follow_docker || follow_docker_by_name
  fi
  exit $?
fi

# Local npm/tsx — toujours suivre les fichiers (même vides)
if ss -tln 2>/dev/null | grep -qE ':5173|:5174|:8787' || true; then
  follow_local_files
  exit $?
fi

echo "⚠️  Rien à suivre."
echo "   Local  : make kill-dev && make ensure-api && make dev"
echo "   Docker : make docker-dev   puis  make logs"
exit 1
