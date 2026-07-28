# YTMusic — commandes locales & déploiement
# Usage : make help

.DEFAULT_GOAL := help
SHELL := /bin/bash
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

.PHONY: help install dev dev-server dev-web build start deploy-local \
	clean-vite icons docker-dev docker-dev-down docker-build \
	mobile-qr mobile-hint mobile-adb mobile-install-adb test-register-adb \
	android-sync android-build android-install android-prod android \
	android-capacitor android-capacitor-prod \
	ensure-api restart-api env-check \
	update-apps status status-watch logs logs-tail logs-watch ports kill-dev \
	push-dev push-prod deploy-hint seed-users

help: ## Affiche cette aide
	@echo ""
	@echo "  YTMusic — make targets"
	@echo "  ======================"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Domaine prod  : https://ytmusic.delhomme.ovh"
	@echo "  Dev local     : http://localhost:5173  (API :8787)"
	@echo "  API           : make ensure-api  ·  restart-api  ·  kill-dev"
	@echo "  Mobile APK    : make android   (Kotlin Compose natif + API :8787)"
	@echo "  Env           : make env-check  (aligne .env / .env.example)"
	@echo "  Ops           : make status · status-watch · logs"
	@echo "  Branches      : feat/* depuis dev → merge prod"
	@echo ""

install: ## Installe les dépendances (workspaces api + web)
	cd $(ROOT) && npm install

seed-users: ## Crée/maj paul@ + dev@ (SEED_PASSWORD dans .env)
	cd $(ROOT) && node scripts/seed-users.mjs

env-check: ## Vérifie que .env et .env.example ont les mêmes clés (sans afficher de secrets)
	@chmod +x $(ROOT)/scripts/env-check.sh
	@bash $(ROOT)/scripts/env-check.sh

# API en fond via ensure-api (réutilise si déjà UP) + Vite seul sur :5173
# → plus de double bind :8787 (EADDRINUSE) ni Vite qui bascule sur :5174
dev: ## Lance API (ensure) + Vite web — logs dans logs/ytmusic-dev.log
	@chmod +x $(ROOT)/scripts/ensure-api.sh $(ROOT)/scripts/kill-dev.sh $(ROOT)/scripts/env-check.sh
	@bash $(ROOT)/scripts/env-check.sh || true
	@FORCE_RESTART=0 bash $(ROOT)/scripts/ensure-api.sh
	@# Libère Vite orphelin sur 5173/5174 sans toucher à l’API
	@bash $(ROOT)/scripts/kill-dev.sh vite-only
	@mkdir -p $(ROOT)/logs
	@echo "📝 Logs → $(ROOT)/logs/ytmusic-dev.log  ·  suivi : make logs"
	@echo "   API :8787 (ensure-api) + Vite :5173 uniquement"
	cd $(ROOT) && npm run dev:web 2>&1 | tee -a $(ROOT)/logs/ytmusic-dev.log

dev-server: ## API seule — réutilise :8787 si déjà UP, sinon démarre (fond)
	@chmod +x $(ROOT)/scripts/ensure-api.sh
	@bash $(ROOT)/scripts/ensure-api.sh
	@echo "   Relancer de force : make restart-api · logs : make logs"

ensure-api: ## Garantit l’API :8787 (réutilise si UP, sinon démarre en fond)
	@chmod +x $(ROOT)/scripts/ensure-api.sh
	@bash $(ROOT)/scripts/ensure-api.sh

restart-api: ## Tue :8787 puis relance l’API en fond
	@chmod +x $(ROOT)/scripts/ensure-api.sh
	@FORCE_RESTART=1 bash $(ROOT)/scripts/ensure-api.sh

dev-web: ## Frontend Vite seul (port 5173)
	@chmod +x $(ROOT)/scripts/kill-dev.sh
	@bash $(ROOT)/scripts/kill-dev.sh vite-only
	@mkdir -p $(ROOT)/logs
	cd $(ROOT) && npm run dev:web 2>&1 | tee -a $(ROOT)/logs/ytmusic-web.log

build: ## Build production du client (PWA)
	cd $(ROOT) && npm run build

start: ## Démarre le serveur qui sert API + web/dist
	cd $(ROOT) && npm start

deploy-local: ## build + start (prod locale sans Docker)
	cd $(ROOT) && npm run deploy:local

clean-vite: ## Vide le cache Vite (fix 504 Outdated Optimize Dep)
	rm -rf $(ROOT)/web/node_modules/.vite \
	       $(ROOT)/node_modules/.vite \
	       $(ROOT)/node_modules/web/node_modules/.vite 2>/dev/null || true
	@echo "Cache Vite nettoyé — relance : make dev"

icons: ## Régénère les icônes PWA (PNG) depuis favicon.svg
	@command -v rsvg-convert >/dev/null || (echo "installe librsvg (rsvg-convert)" && exit 1)
	cd $(ROOT)/web/public && \
	  rsvg-convert -w 192 -h 192 favicon.svg -o icon-192.png && \
	  rsvg-convert -w 512 -h 512 favicon.svg -o icon-512.png && \
	  rsvg-convert -w 180 -h 180 favicon.svg -o apple-touch-icon.png && \
	  python3 $(ROOT)/scripts/make-maskable-icons.py
	@echo "Icônes OK dans web/public/"

docker-dev: ## Conteneurs locaux (+ Mailhog :8025)
	cd $(ROOT) && npm run docker:dev

docker-dev-down: ## Stoppe les conteneurs dev
	cd $(ROOT) && npm run docker:dev:down

docker-build: ## Build image Docker locale
	cd $(ROOT) && npm run docker:build

mobile-hint: ## Affiche comment installer l’app mobile (APK + PWA)
	@echo ""
	@echo "  YTMusic sur téléphone Android"
	@echo "  -----------------------------"
	@echo "  App Kotlin native (Compose + ExoPlayer, sans WebView) :"
	@echo "    make android                      # API locale :8787"
	@echo "    make android-prod                 # API ytmusic.delhomme.ovh"
	@echo "    API_BASE_URL=http://IP:8787 make android-install"
	@echo ""
	@echo "  Legacy Capacitor (WebView) : make android-capacitor"
	@echo "  PWA (navigateur)           : make mobile-install-adb"
	@echo ""
# DEVICE=R5CT7263YJL par défaut (Samsung branché)
DEVICE ?= R5CT7263YJL

mobile-qr: ## Liste les URLs d’accès LAN pour le mobile
	@echo "URLs utiles :"
	@echo "  http://localhost:5173  (via make mobile-install-adb + adb reverse)"
	@IP=$$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($$i=="src") {print $$(i+1); exit}}'); \
	if [ -n "$$IP" ]; then echo "  http://$$IP:5173  (Wi‑Fi LAN)"; fi
	@echo "  https://ytmusic.delhomme.ovh  (prod)"
	@echo ""
	@echo "Préféré USB : make mobile-install-adb DEVICE=$(DEVICE)"

mobile-adb: ## Ouvre YTMusic sur le device (adb reverse + Chrome)
	@chmod +x $(ROOT)/scripts/mobile-install-adb.sh
	@DEVICE="$(DEVICE)" bash $(ROOT)/scripts/mobile-install-adb.sh open

mobile-install-adb: ## Installe la PWA sur le device (reverse + Chrome ?install=1)
	@chmod +x $(ROOT)/scripts/mobile-install-adb.sh
	@DEVICE="$(DEVICE)" bash $(ROOT)/scripts/mobile-install-adb.sh install

android-sync: ## Sync Capacitor legacy (sans rebuild APK)
	@chmod +x $(ROOT)/scripts/android-install.sh
	@DEVICE="$(DEVICE)" VITE_API_ORIGIN="$(VITE_API_ORIGIN)" bash $(ROOT)/scripts/android-install.sh sync

android-build: ## Compile l’APK Kotlin (Compose / Media3)
	@chmod +x $(ROOT)/scripts/kotlin-android-install.sh
	@DEVICE="$(DEVICE)" API_BASE_URL="$(or $(API_BASE_URL),$(or $(VITE_API_ORIGIN),http://127.0.0.1:8787))" bash $(ROOT)/scripts/kotlin-android-install.sh build

android-install: ## Build + installe l’APK Kotlin (ADB) — s’assure que l’API :8787 est UP
	@chmod +x $(ROOT)/scripts/kotlin-android-install.sh $(ROOT)/scripts/ensure-api.sh
	@bash $(ROOT)/scripts/ensure-api.sh
	@DEVICE="$(DEVICE)" API_BASE_URL="$(or $(API_BASE_URL),$(or $(VITE_API_ORIGIN),http://127.0.0.1:8787))" bash $(ROOT)/scripts/kotlin-android-install.sh install

android: ## Raccourci : ensure-api + APK Kotlin native
	@$(MAKE) android-install DEVICE="$(DEVICE)" API_BASE_URL="$(or $(API_BASE_URL),$(or $(VITE_API_ORIGIN),http://127.0.0.1:8787))"

android-prod: ## APK Kotlin → API https://ytmusic.delhomme.ovh + install ADB
	@chmod +x $(ROOT)/scripts/kotlin-android-install.sh
	@DEVICE="$(DEVICE)" API_BASE_URL="https://ytmusic.delhomme.ovh" bash $(ROOT)/scripts/kotlin-android-install.sh install

android-capacitor: ## Legacy : APK Capacitor (WebView) + API locale
	@chmod +x $(ROOT)/scripts/android-install.sh $(ROOT)/scripts/ensure-api.sh
	@bash $(ROOT)/scripts/ensure-api.sh
	@DEVICE="$(DEVICE)" VITE_API_ORIGIN="$(or $(VITE_API_ORIGIN),http://127.0.0.1:8787)" bash $(ROOT)/scripts/android-install.sh install

android-capacitor-prod: ## Legacy Capacitor → API prod
	@chmod +x $(ROOT)/scripts/android-install.sh
	@DEVICE="$(DEVICE)" VITE_API_ORIGIN="https://ytmusic.delhomme.ovh" bash $(ROOT)/scripts/android-install.sh install

test-register-adb: ## Recrée compte + email validation + ouvre le lien sur Android
	@cd $(ROOT) && \
	  DEVICE="$(DEVICE)" \
	  TEST_EMAIL="$(or $(TEST_EMAIL),dev@example.com)" \
	  TEST_PASSWORD="$(TEST_PASSWORD)" \
	  node scripts/test-register-verify-adb.mjs

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

logs: ## Logs récents puis suivi temps réel (Docker ou local) — Ctrl+C
	@chmod +x $(ROOT)/scripts/ops/logs.sh $(ROOT)/scripts/ops/color-logs.sh 2>/dev/null || true
	@LOGS_SINCE="$(or $(LOGS_SINCE),24h)" LOGS_TAIL="$(or $(LOGS_TAIL),500)" \
	  bash $(ROOT)/scripts/ops/logs.sh follow

logs-tail: ## Dernières lignes de logs puis quitte (LOGS_TAIL=200)
	@chmod +x $(ROOT)/scripts/ops/logs.sh $(ROOT)/scripts/ops/color-logs.sh 2>/dev/null || true
	@LOGS_TAIL="$(or $(LOGS_TAIL),200)" bash $(ROOT)/scripts/ops/logs.sh tail

logs-watch: ## Logs avec reconnexion auto (surtout Docker) — Ctrl+C
	@chmod +x $(ROOT)/scripts/ops/logs.sh $(ROOT)/scripts/ops/color-logs.sh 2>/dev/null || true
	@LOGS_SINCE="$(or $(LOGS_SINCE),24h)" LOGS_TAIL="$(or $(LOGS_TAIL),500)" \
	  bash $(ROOT)/scripts/ops/logs.sh watch

ports: ## Affiche qui écoute 5173 / 8787
	@echo "Ports YTMusic :"
	@ss -tlnp 2>/dev/null | grep -E ':5173|:8787' || netstat -tlnp 2>/dev/null | grep -E '5173|8787' || echo "  (rien)"
	@echo ""
	@for p in 5173 8787; do \
	  pids=$$(lsof -tiTCP:$$p -sTCP:LISTEN 2>/dev/null || true); \
	  if [ -n "$$pids" ]; then \
	    echo "  :$$p → $$pids"; \
	    for pid in $$pids; do \
	      printf "    "; tr '\0' ' ' < /proc/$$pid/cmdline 2>/dev/null | cut -c1-100; echo; \
	    done; \
	  fi; \
	done

kill-dev: ## Tue les process sur 5173 et 8787 (proprement)
	@chmod +x $(ROOT)/scripts/kill-dev.sh
	@bash $(ROOT)/scripts/kill-dev.sh

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
