#!/usr/bin/env bash
# Déploiement depuis Admin local (APP_ENV=local uniquement).
# Usage :
#   bash scripts/admin-deploy-prod.sh web
#   bash scripts/admin-deploy-prod.sh apk
#   bash scripts/admin-deploy-prod.sh all
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="${1:-web}"
PROD_URL="${DEPLOY_URL:-${PROD_APP_URL:-https://ytmusic.delhomme.ovh}}"
PROD_URL="${PROD_URL%/}"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env" 2>/dev/null || true
  set +a
fi

APP_ENV_NOW="${APP_ENV:-local}"
if [[ "$APP_ENV_NOW" != "local" && "${ALLOW_REMOTE_ADMIN_DEPLOY:-0}" != "1" ]]; then
  echo "Refus : APP_ENV=$APP_ENV_NOW (déploiement Admin réservé au local)" >&2
  exit 2
fi

deploy_web() {
  echo "==> Web : merge origin/dev → prod + push (image GHCR)"
  git fetch origin
  local current
  current="$(git branch --show-current)"
  git checkout prod
  git pull origin prod
  git merge origin/dev -m "merge: promu dev → prod (admin)"
  git push origin prod
  git checkout "$current"
  echo "==> Push prod OK — GitHub Actions build ghcr.io/…/ytmusic:latest"

  if [[ -n "${PORTAINER_WEBHOOK_URL:-}" ]]; then
    echo "==> Attente 90s (build image) puis webhook Portainer…"
    sleep "${PORTAINER_WEBHOOK_WAIT_SECS:-90}"
    echo "==> POST Portainer webhook"
    curl -fsS -X POST "$PORTAINER_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d '{}' || echo "Webhook Portainer a échoué (stack à Pull & Redeploy manuellement)"
  else
    echo "==> Astuce : définis PORTAINER_WEBHOOK_URL dans .env pour redeploy auto"
    echo "    Sinon : Portainer → stack ytmusic → Pull and redeploy"
  fi
}

deploy_apk() {
  echo "==> APK : build + upload vers $PROD_URL"
  DEPLOY_URL="$PROD_URL" \
    API_BASE_URL="$PROD_URL" \
    BUILD_FIRST=1 \
    bash "$ROOT/scripts/publish-apk-remote.sh"
  echo "==> APK publiée : $PROD_URL/api/deploy/apk"
}

case "$MODE" in
  web) deploy_web ;;
  apk) deploy_apk ;;
  all)
    deploy_web
    deploy_apk
    ;;
  *)
    echo "Usage: $0 web|apk|all" >&2
    exit 1
    ;;
esac

echo ""
echo "==> Terminé ($MODE)"
