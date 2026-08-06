#!/usr/bin/env bash
# Archive / rotation des logs locaux PLM → logs/archive/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="$ROOT/logs"
ARCH_DIR="$LOG_DIR/archive"
KEEP_ARCHIVES="${KEEP_ARCHIVES:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$ARCH_DIR"

FILES=(
  ytmusic-server.log
  ytmusic-dev.log
  ytmusic-web.log
  ytmusic-client.log
)

echo "📦 Archive logs PLM → logs/archive/"
echo "======================================"
archived=0
for name in "${FILES[@]}"; do
  src="$LOG_DIR/$name"
  if [[ -f "$src" && -s "$src" ]]; then
    dest="$ARCH_DIR/${name%.log}-$STAMP.log"
    cp "$src" "$dest"
    : > "$src"
    echo "  ✅ $name → archive/$(basename "$dest") ($(wc -l < "$dest" | tr -d ' ') lignes)"
    archived=$((archived + 1))
  fi
done

# Purge archives anciennes
mapfile -t old < <(ls -1t "$ARCH_DIR"/*.log 2>/dev/null | tail -n +"$((KEEP_ARCHIVES + 1))" || true)
for f in "${old[@]:-}"; do
  [[ -n "${f:-}" && -f "$f" ]] || continue
  rm -f "$f"
  echo "  🗑️  purge $(basename "$f")"
done

if [[ "$archived" -eq 0 ]]; then
  echo "  (rien à archiver — fichiers vides ou absents)"
fi
echo ""
echo "💡 Historique : make logs-history"
echo "   Suivi      : make logs"
