# YTMusic — commandes locales & déploiement
# Usage : make help

.DEFAULT_GOAL := help
SHELL := /bin/bash
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

.PHONY: help install dev dev-server dev-client build start deploy-local \
	clean-vite icons docker-dev docker-dev-down docker-build \
	mobile-qr mobile-hint mobile-adb update-apps status status-watch logs ports kill-dev \
	push-dev push-prod deploy-hint

help: ## Affiche cette aide
	@echo ""
	@echo "  YTMusic — make targets"
	@echo "  ======================"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Domaine prod  : https://ytmusic.delhomme.ovh"
	@echo "  Dev local     : http://localhost:5173  (API :8787)"
	@echo "  Mobile LAN    : make mobile-qr / make mobile-adb DEVICE=R5CT7263YJL"
	@echo "  Ops           : make status · status-watch · logs"
	@echo "  Branches      : feat/* depuis dev → merge prod"
	@echo ""

install: ## Installe les dépendances (workspaces server + client)
	cd $(ROOT) && npm install

dev: ## Lance API + Vite (web/PWA) en parallèle
	cd $(ROOT) && npm run dev

dev-server: ## API seule (port 8787)
	cd $(ROOT) && npm run dev:server

dev-client: ## Frontend Vite seul (port 5173)
	cd $(ROOT) && npm run dev:client

build: ## Build production du client (PWA)
	cd $(ROOT) && npm run build

start: ## Démarre le serveur qui sert API + client/dist
	cd $(ROOT) && npm start

deploy-local: ## build + start (prod locale sans Docker)
	cd $(ROOT) && npm run deploy:local

clean-vite: ## Vide le cache Vite (fix 504 Outdated Optimize Dep)
	rm -rf $(ROOT)/client/node_modules/.vite \
	       $(ROOT)/node_modules/.vite \
	       $(ROOT)/node_modules/client/node_modules/.vite 2>/dev/null || true
	@echo "Cache Vite nettoyé — relance : make dev"

icons: ## Régénère les icônes PWA (PNG) depuis favicon.svg
	@command -v rsvg-convert >/dev/null || (echo "installe librsvg (rsvg-convert)" && exit 1)
	cd $(ROOT)/client/public && \
	  rsvg-convert -w 192 -h 192 favicon.svg -o icon-192.png && \
	  rsvg-convert -w 512 -h 512 favicon.svg -o icon-512.png && \
	  rsvg-convert -w 180 -h 180 favicon.svg -o apple-touch-icon.png && \
	  python3 $(ROOT)/scripts/make-maskable-icons.py
	@echo "Icônes OK dans client/public/"

docker-dev: ## Conteneurs locaux (+ Mailhog :8025)
	cd $(ROOT) && npm run docker:dev

docker-dev-down: ## Stoppe les conteneurs dev
	cd $(ROOT) && npm run docker:dev:down

docker-build: ## Build image Docker locale
	cd $(ROOT) && npm run docker:build

mobile-hint: ## Affiche comment installer l’app mobile (PWA)
	@echo ""
	@echo "  Installer YTMusic sur téléphone (même Wi‑Fi en local)"
	@echo "  ----------------------------------------------------"
	@echo "  1. make dev   (ou ouvre https://ytmusic.delhomme.ovh)"
	@echo "  2. Sur le téléphone, ouvre l’URL LAN / le domaine"
	@echo "  3. Bannière « Installer » ou :"
	@echo "     Android Chrome → ⋮ → Installer l’application"
	@echo "     iPhone Safari  → Partager → Sur l’écran d’accueil"
	@echo "  4. Connecte-toi avec ton compte app (email / passkey)"
	@echo "  5. Mises à jour = recharger l’app (service worker auto)"
	@echo ""
	@echo "  QR / URLs : page Admin ou Profil dans l’app"
	@echo "  make mobile-qr  → tente d’afficher les URLs LAN"
	@echo ""

mobile-qr: ## Liste les URLs d’accès LAN pour le mobile
	@echo "URLs utiles :"
	@echo "  http://localhost:5173"
	@hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$$' | while read ip; do \
	  echo "  http://$$ip:5173"; \
	done || true
	@echo "  https://ytmusic.delhomme.ovh  (prod)"
	@echo ""
	@echo "Admin → QR code dans l’app une fois connecté en admin."
	@echo "ADB   → make mobile-adb DEVICE=R5CT7263YJL"

# DEVICE=R5CT7263YJL par défaut (Samsung branché)
DEVICE ?= R5CT7263YJL
mobile-adb: ## Ouvre l’URL LAN sur le device ADB (Chrome)
	@set -e; \
	adb devices | grep -q "$(DEVICE)" || (echo "Device $(DEVICE) introuvable — adb devices :" && adb devices && exit 1); \
	IP=$$(hostname -I 2>/dev/null | awk '{print $$1}'); \
	URL="$${MOBILE_URL:-http://$$IP:5173}"; \
	echo "→ $$URL sur $(DEVICE)"; \
	adb -s "$(DEVICE)" shell am start -a android.intent.action.VIEW -d "$$URL" >/dev/null || \
	  adb -s "$(DEVICE)" shell monkey -p com.android.chrome -c android.intent.category.LAUNCHER 1 >/dev/null; \
	echo "OK — connecte-toi avec ton compte (obligatoire)"

update-apps: ## Rappel : comment MAJ web / mobile / desktop
	@echo ""
	@echo "  Mises à jour (sans store, sans pubs)"
	@echo "  -----------------------------------"
	@echo "  Web + PWA mobile/desktop :"
	@echo "    git push sur prod → CI build GHCR → Portainer/Watchtower tire l’image"
	@echo "    Les clients PWA se mettent à jour au prochain lancement (SW autoUpdate)"
	@echo ""
	@echo "  Linux / Windows / mac (PWA installée) :"
	@echo "    Même chose — c’est la PWA du domaine ; pas de binaire séparé requis"
	@echo ""
	@echo "  Electron (optionnel) :"
	@echo "    npm run dev:desktop   # puis rebuild desktop quand tu packs"
	@echo ""
	@echo "  Préprod / tests : branche dev → image :dev"
	@echo ""

status: ## Statut coloré API / Vite / Docker (UP/DOWN)
	@echo ""
	@echo "📊 Statut YTMusic"
	@echo "================="
	@echo ""
	@printf "  "; \
	if curl -fsS --max-time 2 http://127.0.0.1:8787/api/health >/tmp/ytm-health.json 2>/dev/null; then \
	  VER=$$(python3 -c "import json;d=json.load(open('/tmp/ytm-health.json'));print(d.get('version','?'),d.get('ref',''))" 2>/dev/null || echo ok); \
	  printf "\033[1;32m✅ UP\033[0m   %-22s \033[0;36m8787\033[0m  %s\n" "api" "$$VER"; \
	else \
	  printf "\033[1;31m❌ DOWN\033[0m %-22s \033[0;90m:8787\033[0m\n" "api"; \
	fi
	@printf "  "; \
	if curl -fsS --max-time 2 -o /dev/null http://127.0.0.1:5173/ 2>/dev/null; then \
	  printf "\033[1;32m✅ UP\033[0m   %-22s \033[0;36m5173\033[0m  vite\n" "client"; \
	else \
	  printf "\033[1;90m⚪ DOWN\033[0m %-22s \033[0;90m:5173 (make dev)\033[0m\n" "client"; \
	fi
	@echo ""
	@echo "🐳 Conteneurs docker (ytmusic*) :"
	@echo ""
	@found=0; \
	for c in $$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E 'ytmusic|mailhog' || true); do \
	  found=1; \
	  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$$c"; then \
	    st=$$(docker ps --filter "name=^$$c$$" --format '{{.Status}}' 2>/dev/null); \
	    ports=$$(docker ps --filter "name=^$$c$$" --format '{{.Ports}}' 2>/dev/null); \
	    printf "  \033[1;32m✅ UP\033[0m   %-28s %s\n" "$$c" "$$ports"; \
	    printf "         \033[0;90m%s\033[0m\n" "$$st"; \
	  else \
	    st=$$(docker ps -a --filter "name=^$$c$$" --format '{{.Status}}' 2>/dev/null); \
	    printf "  \033[1;31m❌ DOWN\033[0m %-28s \033[0;90m%s\033[0m\n" "$$c" "$$st"; \
	  fi; \
	done; \
	if [ "$$found" = "0" ]; then \
	  printf "  \033[0;90m(aucun conteneur ytmusic — make docker-dev ou make dev)\033[0m\n"; \
	fi
	@echo ""
	@echo "📱 ADB :"
	@adb devices 2>/dev/null | awk 'NR>1 && $$2=="device"{printf "  \033[1;32m✅\033[0m %s\n", $$1}' || echo "  (adb indisponible)"
	@echo ""
	@LAN=$$(hostname -I 2>/dev/null | awk '{print $$1}'); \
	if [ -n "$$LAN" ]; then echo "  LAN → http://$$LAN:5173"; fi
	@echo ""

status-watch: ## Rafraîchit make status en boucle (INTERVAL=4)
	@chmod +x $(ROOT)/scripts/status-watch.sh 2>/dev/null || true
	@INTERVAL="$(or $(INTERVAL),4)" CLEAR="$(or $(CLEAR),1)" bash $(ROOT)/scripts/status-watch.sh

logs: ## Logs Docker ytmusic (+ mailhog) en temps réel — Ctrl+C
	@echo "📋 Logs YTMusic (docker compose)"
	@echo "================================"
	@echo "⏹️  Ctrl+C pour quitter"
	@echo "🔧 LOGS_TAIL=$${LOGS_TAIL:-200}  (ex. LOGS_TAIL=500 make logs)"
	@echo ""
	@cd $(ROOT) && \
	  if [ -f docker-compose.dev.yml ]; then \
	    docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f --tail=$${LOGS_TAIL:-200} 2>/dev/null \
	    || docker compose -f docker-compose.dev.yml logs -f --tail=$${LOGS_TAIL:-200} 2>/dev/null \
	    || (echo "⚠️  Conteneurs arrêtés ? → make docker-dev" && exit 1); \
	  else \
	    docker compose logs -f --tail=$${LOGS_TAIL:-200} 2>/dev/null \
	    || (echo "⚠️  Conteneurs arrêtés ? → make docker-dev" && exit 1); \
	  fi

ports: ## Affiche qui écoute 5173 / 8787
	@ss -tlnp 2>/dev/null | grep -E ':5173|:8787' || netstat -tlnp 2>/dev/null | grep -E '5173|8787' || true

kill-dev: ## Tue les process sur 5173 et 8787
	@fuser -k 5173/tcp 2>/dev/null || true
	@fuser -k 8787/tcp 2>/dev/null || true
	@echo "Ports libérés"

push-dev: ## Push la branche courante vers origin (intégration)
	cd $(ROOT) && git push -u origin HEAD

push-prod: ## Merge dev → prod localement puis push (ATTENTION prod)
	@echo "Merge dev → prod puis push…"
	cd $(ROOT) && git fetch origin && \
	  git checkout prod && git pull origin prod && \
	  git merge origin/dev -m "merge: promu dev → prod" && \
	  git push origin prod && \
	  git checkout -

deploy-hint: ## Guide déploiement Portainer / NPM / mobile
	@echo ""
	@echo "  Déploiement"
	@echo "  -----------"
	@echo "  LOCAL + téléphone (même Wi‑Fi) :"
	@echo "    make dev"
	@echo "    make mobile-qr          # ouvre http://IP:5173 sur Android/iPhone"
	@echo "    Admin → QR code"
	@echo ""
	@echo "  DEV distant (image :dev) :"
	@echo "    git push origin dev     # CI → ghcr.io/.../ytmusic:dev"
	@echo "    Portainer stack : YTMUSIC_IMAGE=...:dev"
	@echo ""
	@echo "  PRÉPROD : même VPS, autre domaine ytmusic-preprod.delhomme.ovh"
	@echo "    APP_ENV=preprod APP_URL=https://ytmusic-preprod.delhomme.ovh"
	@echo ""
	@echo "  PROD :"
	@echo "    make push-prod          # ou PR GitHub dev → prod"
	@echo "    CI → :latest / :prod → Watchtower / Portainer pull"
	@echo "    NPM : ytmusic.delhomme.ovh → ytmusic:8787 + websockets"
	@echo ""
	@echo "  PWA déjà installée : se met à jour au prochain lancement (SW)"
	@echo "  Docs : docs/DNS-ET-INSTALL.md  DEPLOY.md"
	@echo ""
