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
LOGS_TAIL="${LOGS_TAIL:-500}"
LOG_FILE="${LOG_FILE:-$ROOT/logs/ytmusic-dev.log}"

set_term_title() {
  # Ignore si pas de TTY (make/CI)
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
  # Conteneurs du projet ytmusic
  local args
  # shellcheck disable=SC2046
  args=$(compose_args)
  # shellcheck disable=SC2086
  if docker compose $args ps -q --status running 2>/dev/null | grep -q .; then
    return 0
  fi
  # Noms connus même hors compose courant
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qE '^ytmusic' && return 0
  return 1
}

follow_docker() {
  local args
  args=$(compose_args)
  set_term_title "YTMusic Logs"
  echo "📋 Logs YTMusic (Docker)"
  echo "========================"
  echo "⏹️  Ctrl+C pour quitter"
  echo "🔧 LOGS_SINCE=${LOGS_SINCE}  LOGS_TAIL=${LOGS_TAIL}"
  echo "   Compose : docker compose $args"
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
  echo "⏹️  Ctrl+C pour quitter"
  echo ""
  local names
  names=$(docker ps --format '{{.Names}}' | grep -E '^ytmusic' || true)
  if [[ -z "$names" ]]; then
    return 1
  fi
  # shellcheck disable=SC2086
  docker logs -f -t --tail="${LOGS_TAIL}" $names 2>&1 | bash "$COLOR"
}

follow_local_file() {
  mkdir -p "$ROOT/logs"
  touch "$LOG_FILE"
  set_term_title "YTMusic Logs"
  echo "📋 Logs YTMusic (local · $LOG_FILE)"
  echo "==================================="
  echo "⏹️  Ctrl+C pour quitter"
  echo "💡 Écrit par : make dev  (tee → logs/ytmusic-dev.log)"
  echo "🔧 LOGS_TAIL=${LOGS_TAIL}"
  echo ""
  if [[ "$MODE" == "tail" ]]; then
    tail -n "${LOGS_TAIL}" "$LOG_FILE" 2>&1 | bash "$COLOR"
    return $?
  fi
  # Affiche les dernières lignes puis suit
  tail -n "${LOGS_TAIL}" -F "$LOG_FILE" 2>&1 | bash "$COLOR"
}

follow_watch_docker() {
  local args
  args=$(compose_args)
  set_term_title "YTMusic Logs"
  echo "📋 logs-watch — reconnexion auto — Ctrl+C pour quitter"
  echo "   since=${LOGS_SINCE} tail=${LOGS_TAIL}"
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

# Local npm/tsx
if [[ -f "$LOG_FILE" ]] || ss -tln 2>/dev/null | grep -qE ':5173|:8787'; then
  if [[ ! -f "$LOG_FILE" ]] || [[ ! -s "$LOG_FILE" ]]; then
    echo "⚠️  Mode local détecté (ports 5173/8787) mais pas encore de fichier log."
    echo "   Relance le serveur avec : make kill-dev && make dev"
    echo "   (make dev écrit dans logs/ytmusic-dev.log)"
    echo ""
    mkdir -p "$ROOT/logs"
    touch "$LOG_FILE"
    echo "   En attente d’écritures dans $LOG_FILE …"
  fi
  follow_local_file
  exit $?
fi

echo "⚠️  Rien à suivre."
echo "   Local  : make dev          puis  make logs"
echo "   Docker : make docker-dev   puis  make logs"
exit 1
