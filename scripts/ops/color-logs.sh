#!/usr/bin/env bash
# Colorize PLM logs (style JobbingTrack)
# Usage: … | bash scripts/ops/color-logs.sh

RED=$'\033[1;31m'
GREEN=$'\033[0;32m'
BRIGHT_GREEN=$'\033[1;32m'
YELLOW=$'\033[1;33m'
ORANGE=$'\033[38;5;208m'
MAGENTA=$'\033[0;35m'
CYAN=$'\033[0;36m'
BRIGHT_CYAN=$'\033[1;36m'
DIM=$'\033[2;37m'
R=$'\033[0m'

while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" == *Error:* || "$line" == *ERROR* || "$line" == *FATAL* || "$line" == *EADDRINUSE* || "$line" == *Unhandled* || "$line" == *⨯* ]]; then
    printf '%s%s%s\n' "$RED" "$line" "$R"
    continue
  fi
  if [[ "$line" == *WARN* || "$line" == *Warning* || "$line" == *warning* ]]; then
    printf '%s%s%s\n' "$YELLOW" "$line" "$R"
    continue
  fi
  if [[ "$line" == *'[mail:'* ]]; then
    printf '%s%s%s\n' "$GREEN" "$line" "$R"
    continue
  fi

  out="$line"

  # Prefixe fichier local [ytmusic-xxx.log]
  if [[ "$out" =~ ^\[(ytmusic-[a-zA-Z0-9._-]+)\] ]]; then
    tag="${BASH_REMATCH[1]}"
    out="${MAGENTA}[${tag}]${R}${out:${#tag}+2}"
  fi

  # Horodatage [YYYY-MM-DD HH:MM:SS(.ms)]
  if [[ "$out" =~ \[([0-9]{4}-[0-9]{2}-[0-9]{2}[^\]]*)\] ]]; then
    ts="${BASH_REMATCH[1]}"
    out="${out/\[$ts\]/${DIM}[$ts]${R}}"
  fi

  # Conteneur ytmusic-*
  if [[ "$out" =~ ^(ytmusic-[a-zA-Z0-9-]+) ]]; then
    svc="${BASH_REMATCH[1]}"
    out="${MAGENTA}${svc}${R}${out:${#svc}}"
  fi

  # Méthodes HTTP
  for m in GET HEAD POST PUT DELETE PATCH; do
    out="${out// ${m} / ${BRIGHT_CYAN}${m}${R} }"
    out="${out//  ${m} /  ${BRIGHT_CYAN}${m}${R} }"
  done

  # Codes HTTP
  for code in 500 502 503 504; do
    out="${out// ${code} / ${RED}${code}${R} }"
  done
  for code in 400 401 403 404 409 422 429; do
    out="${out// ${code} / ${ORANGE}${code}${R} }"
  done
  for code in 301 302 304; do
    out="${out// ${code} / ${CYAN}${code}${R} }"
  done
  for code in 200 201 204; do
    out="${out// ${code} / ${BRIGHT_GREEN}${code}${R} }"
  done

  if [[ "$line" == *'[server]'* ]]; then
    printf '%s%s%s\n' "$CYAN" "$out" "$R"
    continue
  fi
  if [[ "$line" == *'[client]'* ]]; then
    printf '%s%s%s\n' "$BRIGHT_CYAN" "$out" "$R"
    continue
  fi

  printf '%s\n' "$out"
done
