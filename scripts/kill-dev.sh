#!/usr/bin/env bash
# Libère les ports 5173 / 8787 (process YTMusic / node / vite / tsx)
set -euo pipefail

free_one() {
  local port="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  fi
  if [[ -z "$pids" ]] && command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "${port}/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true)"
  fi
  if [[ -z "$pids" ]]; then
    echo "  :$port — libre"
    return 0
  fi
  echo "  :$port — kill $pids"
  for pid in $pids; do
    if [[ -r "/proc/$pid/cmdline" ]]; then
      echo "    $(tr '\0' ' ' <"/proc/$pid/cmdline" | cut -c1-100)"
    fi
    kill "$pid" 2>/dev/null || true
  done
  sleep 0.4
  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill -9 $pids 2>/dev/null || true
  fi
  fuser -k "${port}/tcp" 2>/dev/null || true
}

echo "==> kill-dev"
free_one 5173
free_one 8787
# Process orphelins fréquents
pkill -f "tsx watch src/index.ts" 2>/dev/null || true
pkill -f "vite.*YTMusic|vite.*client" 2>/dev/null || true
echo "✅ Ports 5173 / 8787 libérés"
