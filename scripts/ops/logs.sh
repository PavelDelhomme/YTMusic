#!/usr/bin/env bash
# make logs — suivi type JobbingTrack (Docker compose OU fichiers locaux)
# Modes : follow (défaut) | tail | watch | history
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1
MODE="${1:-follow}"
COLOR="$ROOT/scripts/ops/color-logs.sh"
chmod +x "$COLOR" 2>/dev/null || true

LOGS_SINCE="${LOGS_SINCE:-24h}"
LOGS_TAIL="${LOGS_TAIL:-80}"
LOG_DIR="$ROOT/logs"
ARCH_DIR="$LOG_DIR/archive"
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

print_banner() {
  echo "📋 Logs PLM ($1)"
  echo "========================"
  echo "⏹  Ctrl+C pour quitter"
  echo "🔧 LOGS_SINCE=${LOGS_SINCE}  LOGS_TAIL=${LOGS_TAIL}"
  echo "📜 Historique archives : make logs-history   ·  rotation : make logs-archive"
  echo ""
}

dump_archives() {
  local n="${1:-200}"
  if [[ ! -d "$ARCH_DIR" ]]; then
    echo "  (pas encore d’archives — make logs-archive)"
    return 0
  fi
  local files
  mapfile -t files < <(ls -1t "$ARCH_DIR"/*.log 2>/dev/null | head -n 8 || true)
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "  (archives vides)"
    return 0
  fi
  echo "──── archives récentes (extraits) ────"
  local f base
  for f in "${files[@]}"; do
    base="$(basename "$f")"
    echo "── $base (dernieres $n lignes) ──"
    tail -n "$n" "$f" 2>/dev/null | sed "s/^/[archive:$base] /" | bash "$COLOR" || true
    echo ""
  done
}

follow_docker() {
  local args
  args=$(compose_args)
  set_term_title "PLM Logs"
  print_banner "Docker"
  # shellcheck disable=SC2086
  if [[ "$MODE" == "tail" ]]; then
    docker compose $args logs -t --tail="${LOGS_TAIL}" 2>&1 | bash "$COLOR"
    return $?
  fi
  if [[ "$MODE" == "history" ]]; then
    # shellcheck disable=SC2086
    docker compose $args logs -t --since="${LOGS_SINCE:-168h}" --tail="${LOGS_TAIL:-2000}" 2>&1 | bash "$COLOR"
    echo ""
    echo "──── suivi en direct ────"
  fi
  # shellcheck disable=SC2086
  docker compose $args logs -f -t --since="${LOGS_SINCE}" --tail="${LOGS_TAIL}" 2>&1 | bash "$COLOR"
}

follow_docker_by_name() {
  set_term_title "PLM Logs"
  print_banner "docker logs par nom"
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

# invent=1 → ajoute horodatage si absent (suivi live)
# invent=0 → conserve tel quel (historique fichier)
stamp_lines() {
  local invent="${1:-1}"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^\[(ytmusic-[a-zA-Z0-9._-]+)\][[:space:]]+(.*) ]]; then
      local tag="${BASH_REMATCH[1]}"
      local rest="${BASH_REMATCH[2]}"
      if [[ "$rest" =~ ^\[[0-9]{4}-[0-9]{2}-[0-9]{2} ]]; then
        printf '[%s] %s\n' "$tag" "$rest"
      elif [[ "$invent" == "1" ]]; then
        printf '[%s] [%s] %s\n' "$tag" "$(date '+%Y-%m-%d %H:%M:%S')" "$rest"
      else
        printf '[%s] %s\n' "$tag" "$rest"
      fi
    elif [[ "$line" =~ ^\[[0-9]{4}-[0-9]{2}-[0-9]{2} ]]; then
      printf '%s\n' "$line"
    elif [[ -z "$line" ]]; then
      printf '\n'
    elif [[ "$invent" == "1" ]]; then
      printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$line"
    else
      printf '%s\n' "$line"
    fi
  done
}

follow_local_files() {
  ensure_log_files
  set_term_title "PLM Logs"
  print_banner "local · multi-fichiers"
  echo "💡 API  → logs/ytmusic-server.log   (make ensure-api / restart-api)"
  echo "💡 Vite → logs/ytmusic-dev.log      (make up / make dev)"
  echo "🕒 Horodatage local YYYY-MM-DD HH:MM:SS (+ ms côté API Node)"
  echo ""

  if [[ "$MODE" == "history" ]]; then
    dump_archives "${LOGS_TAIL:-200}"
  fi

  local f base
  for f in "${LOG_FILES[@]}"; do
    base="$(basename "$f")"
    if [[ -s "$f" ]]; then
      echo "──── $base (dernieres ${LOGS_TAIL} lignes) ────"
      tail -n "${LOGS_TAIL}" "$f" 2>/dev/null \
        | sed "s/^/[$base] /" \
        | stamp_lines 0 \
        | bash "$COLOR" || true
      echo ""
    fi
  done
  if [[ "$MODE" == "tail" ]]; then
    return 0
  fi
  echo "──── suivi en direct (tail -F) ────"
  # Prefixe le nom de fichier (tail -F multi) puis horodate si besoin
  tail -n 0 -F "${LOG_FILES[@]}" 2>&1 \
    | awk '
      BEGIN { cur = "log" }
      /^==> / {
        if (match($0, /\/([^\/]+\.log)/)) {
          s = substr($0, RSTART+1, RLENGTH-1)
          # s = "name.log" after matching "/name.log"
          n = split(s, parts, "/")
          cur = parts[n]
        }
        next
      }
      { print "[" cur "] " $0; fflush() }
    ' \
    | stamp_lines 1 \
    | bash "$COLOR"
}

follow_watch_docker() {
  local args
  args=$(compose_args)
  set_term_title "PLM Logs"
  print_banner "watch · reconnexion auto"
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
follow_local_files
exit $?
