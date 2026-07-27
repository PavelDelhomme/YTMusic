#!/usr/bin/env bash
# Colorize YTMusic logs (docker compose ou fichiers locaux)
# Usage: … | bash scripts/ops/color-logs.sh

RED=$'\033[1;31m'
GREEN=$'\033[0;32m'
BRIGHT_GREEN=$'\033[1;32m'
YELLOW=$'\033[1;33m'
ORANGE=$'\033[38;5;208m'
MAGENTA=$'\033[0;35m'
CYAN=$'\033[0;36m'
BRIGHT_CYAN=$'\033[1;36m'
R=$'\033[0m'

while IFS= read -r line || [ -n "$line" ]; do
  if [[ "$line" == *Error:* || "$line" == *ERROR* || "$line" == *FATAL* || "$line" == *EADDRINUSE* || "$line" == *Unhandled* ]]; then
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
  if [[ "$line" == *' 50'* || "$line" == *' 51'* || "$line" == *' 52'* || "$line" == *' 53'* ]]; then
    printf '%s%s%s\n' "$RED" "$line" "$R"
    continue
  fi
  if [[ "$line" == *' 40'* || "$line" == *' 41'* || "$line" == *' 42'* || "$line" == *' 43'* || "$line" == *' 44'* || "$line" == *' 45'* ]]; then
    printf '%s%s%s\n' "$ORANGE" "$line" "$R"
    continue
  fi
  if [[ "$line" == *'[server]'* ]]; then
    printf '%s%s%s\n' "$CYAN" "$line" "$R"
    continue
  fi
  if [[ "$line" == *'[client]'* ]]; then
    printf '%s%s%s\n' "$BRIGHT_CYAN" "$line" "$R"
    continue
  fi
  if [[ "$line" == ytmusic* ]]; then
    printf '%s%s%s\n' "$MAGENTA" "$line" "$R"
    continue
  fi
  if [[ "$line" == *' 20'* ]]; then
    printf '%s%s%s\n' "$BRIGHT_GREEN" "$line" "$R"
    continue
  fi
  printf '%s\n' "$line"
done
