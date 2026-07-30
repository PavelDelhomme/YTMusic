# YTMusic — commandes locales & déploiement (style JobbingTrack)
# Usage : make help

.DEFAULT_GOAL := help
SHELL := /bin/bash
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

# Couleurs (comme JobbingTrack)
C_CYAN  := \033[0;36m
C_GREEN := \033[0;32m
C_YELL  := \033[1;33m
C_DIM   := \033[0;90m
C_BOLD  := \033[1m
C_RESET := \033[0m

DEVICE ?= R5CT7263YJL

.PHONY: help install seed-users test-verify-email env-check \
	dev up up-full down down-clean restart restart-api ensure-api \
	dev-server dev-web build start deploy-local clean-vite icons \
	docker-dev docker-dev-down docker-build \
	mobile-qr mobile-hint mobile-adb mobile-install-adb test-register-adb \
	android-sync android-build android-install android-prod android \
	android-capacitor android-capacitor-prod \
	update-apps status status-watch \
	logs logs-tail logs-watch logs-history logs-archive \
	db-status db-backup \
	ports kill-dev push-dev push-prod deploy-hint

help: ## Affiche cette aide colorée
	@echo ""
	@printf "$(C_BOLD)  YTMusic — make targets$(C_RESET)\n"
	@echo "  ======================"
	@echo ""
	@printf "  $(C_GREEN)▶ Démarrage$(C_RESET)\n"
	@grep -E '^(up|up-full|down|down-clean|restart|dev|ensure-api|restart-api|dev-server|dev-web):.*?##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "    $(C_CYAN)%-20s$(C_RESET) %s\n", $$1, $$2}'
	@echo ""
	@printf "  $(C_GREEN)▶ Logs & statut$(C_RESET)\n"
	@grep -E '^(status|status-watch|logs|logs-tail|logs-watch|logs-history|logs-archive|ports):.*?##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "    $(C_CYAN)%-20s$(C_RESET) %s\n", $$1, $$2}'
	@echo ""
	@printf "  $(C_GREEN)▶ Base de données$(C_RESET)\n"
	@grep -E '^(db-status|db-backup|seed-users):.*?##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "    $(C_CYAN)%-20s$(C_RESET) %s\n", $$1, $$2}'
	@echo ""
	@printf "  $(C_GREEN)▶ Mobile Android$(C_RESET)\n"
	@grep -E '^(android|android-prod|android-install|android-build|mobile-):.*?##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "    $(C_CYAN)%-20s$(C_RESET) %s\n", $$1, $$2}'
	@echo ""
	@printf "  $(C_GREEN)▶ Build / Docker / Git$(C_RESET)\n"
	@grep -E '^(install|build|start|deploy-local|docker-|icons|clean-vite|env-check|push-|deploy-hint|update-apps|test-):.*?##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "    $(C_CYAN)%-20s$(C_RESET) %s\n", $$1, $$2}'
	@echo ""
	@printf "  $(C_DIM)Domaine prod : https://ytmusic.delhomme.ovh$(C_RESET)\n"
	@printf "  $(C_DIM)Dev local    : make up-full  ·  make logs  ·  make android$(C_RESET)\n"
	@printf "  $(C_DIM)Branches     : feat/* depuis dev → merge prod$(C_RESET)\n"
	@echo ""

# ---------------------------------------------------------------------------
# Démarrage
# ---------------------------------------------------------------------------

install: ## Installe les dépendances (workspaces api + web)
	cd $(ROOT) && npm install

seed-users: ## Crée/maj paul@ + dev@ (SEED_PASSWORD dans .env)
	cd $(ROOT) && node scripts/seed-users.mjs

test-verify-email: ## Teste validation email (API locale)
	cd $(ROOT) && node scripts/test-verify-email.mjs

test-search: ## Batterie tests recherche (ranking + live YouTube)
	cd $(ROOT) && npx tsx scripts/test-search.mjs

env-check: ## Vérifie que .env et .env.example ont les mêmes clés
	@chmod +x $(ROOT)/scripts/env-check.sh
	@bash $(ROOT)/scripts/env-check.sh

dev: ## API (ensure) + Vite au premier plan — logs ytmusic-dev.log
	@chmod +x $(ROOT)/scripts/ensure-api.sh $(ROOT)/scripts/kill-dev.sh $(ROOT)/scripts/env-check.sh
	@bash $(ROOT)/scripts/env-check.sh || true
	@FORCE_RESTART=0 bash $(ROOT)/scripts/ensure-api.sh
	@bash $(ROOT)/scripts/kill-dev.sh vite-only
	@mkdir -p $(ROOT)/logs
	@printf "$(C_YELL)📝 Logs → $(ROOT)/logs/ytmusic-dev.log  ·  suivi : make logs$(C_RESET)\n"
	@echo "   API :8787 (ensure-api) + Vite :5173 uniquement"
	@echo "   Astuce fond : make up / make up-full"
	cd $(ROOT) && npm run dev:web 2>&1 | tee -a $(ROOT)/logs/ytmusic-dev.log

up: ## API + Vite en fond (setsid) — terminal libre
	@chmod +x $(ROOT)/scripts/dev-up.sh
	@bash $(ROOT)/scripts/dev-up.sh
	@printf '%s\n' up > "$(ROOT)/.ytmusic-stack-mode" 2>/dev/null || true

up-full: ## Reset propre + API + Vite + status (+ seed optionnel)
	@printf "$(C_BOLD)🚀 up-full YTMusic$(C_RESET)\n"
	@echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
	@chmod +x $(ROOT)/scripts/kill-dev.sh $(ROOT)/scripts/dev-up.sh $(ROOT)/scripts/env-check.sh
	@bash $(ROOT)/scripts/env-check.sh || true
	@bash $(ROOT)/scripts/kill-dev.sh || true
	@mkdir -p $(ROOT)/logs $(ROOT)/data
	@bash $(ROOT)/scripts/dev-up.sh
	@printf '%s\n' up-full > "$(ROOT)/.ytmusic-stack-mode" 2>/dev/null || true
	@echo ""
	@$(MAKE) --no-print-directory status
	@echo ""
	@printf "$(C_GREEN)✅ up-full OK$(C_RESET) — web http://127.0.0.1:5173  ·  api :8787\n"
	@printf "$(C_DIM)   make logs · make android · make db-status$(C_RESET)\n"

down: ## Arrête API + Vite locaux (données SQLite intactes)
	@chmod +x $(ROOT)/scripts/kill-dev.sh
	@bash $(ROOT)/scripts/kill-dev.sh
	@rm -f "$(ROOT)/.ytmusic-stack-mode"
	@printf "$(C_GREEN)✅ Stack locale arrêtée$(C_RESET) (data/ytmusic.db conservée)\n"

down-clean: ## Arrêt + archive logs (DB intacte)
	@$(MAKE) --no-print-directory logs-archive || true
	@$(MAKE) --no-print-directory down

restart: ## down + up-full
	@$(MAKE) --no-print-directory down
	@$(MAKE) --no-print-directory up-full

dev-server: ## API seule — réutilise :8787 si déjà UP
	@chmod +x $(ROOT)/scripts/ensure-api.sh
	@bash $(ROOT)/scripts/ensure-api.sh
	@echo "   Relancer de force : make restart-api · logs : make logs"

ensure-api: ## Garantit l’API :8787 (réutilise si UP)
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
	@echo "Cache Vite nettoyé — relance : make up"

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

# ---------------------------------------------------------------------------
# Mobile
# ---------------------------------------------------------------------------

mobile-hint: ## Affiche comment installer l’app mobile (APK + PWA)
	@echo ""
	@echo "  YTMusic sur téléphone Android"
	@echo "  -----------------------------"
	@echo "  App Kotlin native (Compose + ExoPlayer) :"
	@echo "    make android                      # API locale :8787"
	@echo "    make android-prod                 # API ytmusic.delhomme.ovh"
	@echo "    API_BASE_URL=http://IP:8787 make android-install"
	@echo ""
	@echo "  Legacy Capacitor (WebView) : make android-capacitor"
	@echo "  PWA (navigateur)           : make mobile-install-adb"
	@echo ""

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

android-install: ## Build + installe l’APK Kotlin (ADB) — ensure-api
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
	@echo "  Web + PWA : push prod → CI GHCR → Portainer/Watchtower"
	@echo "  APK Kotlin : make android / make android-prod"
	@echo "  Docs : docs/DNS-ET-INSTALL.md  DEPLOY.md"
	@echo ""

# ---------------------------------------------------------------------------
# Statut & logs
# ---------------------------------------------------------------------------

status: ## Statut coloré API / Vite / Docker / DB
	@echo ""
	@printf "$(C_BOLD)📊 Statut YTMusic$(C_RESET)\n"
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
	  printf "\033[1;90m⚪ DOWN\033[0m %-22s \033[0;90m:5173 (make up)\033[0m\n" "client"; \
	fi
	@echo ""
	@if [ -f "$(ROOT)/data/ytmusic.db" ]; then \
	  printf "  \033[1;32m✅ DB\033[0m    %-22s %s\n" "sqlite" "$$(du -h "$(ROOT)/data/ytmusic.db" | awk '{print $$1}')"; \
	else \
	  printf "  \033[1;33m⚠ DB\033[0m    %-22s \033[0;90mabsente\033[0m\n" "sqlite"; \
	fi
	@MODE=$$(cat "$(ROOT)/.ytmusic-stack-mode" 2>/dev/null || true); \
	if [ -n "$$MODE" ]; then printf "  \033[0;90m📌 dernier mode : %s\033[0m\n" "$$MODE"; fi
	@echo ""
	@echo "🐳 Conteneurs docker (ytmusic*) :"
	@echo ""
	@found=0; \
	for c in $$(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -E 'ytmusic|mailhog' || true); do \
	  found=1; \
	  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$$c"; then \
	    ports=$$(docker ps --filter "name=^$$c$$" --format '{{.Ports}}' 2>/dev/null); \
	    st=$$(docker ps --filter "name=^$$c$$" --format '{{.Status}}' 2>/dev/null); \
	    printf "  \033[1;32m✅ UP\033[0m   %-28s %s\n" "$$c" "$$ports"; \
	    printf "         \033[0;90m%s\033[0m\n" "$$st"; \
	  else \
	    st=$$(docker ps -a --filter "name=^$$c$$" --format '{{.Status}}' 2>/dev/null); \
	    printf "  \033[1;31m❌ DOWN\033[0m %-28s \033[0;90m%s\033[0m\n" "$$c" "$$st"; \
	  fi; \
	done; \
	if [ "$$found" = "0" ]; then \
	  printf "  \033[0;90m(aucun conteneur ytmusic — make docker-dev ou make up)\033[0m\n"; \
	fi
	@echo ""
	@echo "📱 ADB :"
	@adb devices -l 2>/dev/null | awk 'NR>1 && NF{ \
	  if($$2=="device") printf "  \033[1;32m✅\033[0m %s\n", $$0; \
	  else if($$2=="unauthorized") printf "  \033[1;33m⚠ unauthorized\033[0m %s  → accepte la popup USB\n", $$1; \
	  else if($$2=="offline") printf "  \033[1;31m❌ offline\033[0m %s\n", $$1; \
	  else printf "  \033[0;90m· %s\033[0m\n", $$0; \
	}' || echo "  (adb indisponible)"
	@echo ""
	@LAN=$$(hostname -I 2>/dev/null | awk '{print $$1}'); \
	if [ -n "$$LAN" ]; then echo "  LAN → http://$$LAN:5173"; fi
	@echo ""

status-watch: ## Rafraîchit make status en boucle (INTERVAL=4)
	@chmod +x $(ROOT)/scripts/status-watch.sh 2>/dev/null || true
	@INTERVAL="$(or $(INTERVAL),4)" CLEAR="$(or $(CLEAR),1)" bash $(ROOT)/scripts/status-watch.sh

logs: ## Logs colorés + suivi temps réel (Docker ou local) — Ctrl+C
	@chmod +x $(ROOT)/scripts/ops/logs.sh $(ROOT)/scripts/ops/color-logs.sh
	@LOGS_SINCE="$(or $(LOGS_SINCE),24h)" LOGS_TAIL="$(or $(LOGS_TAIL),500)" \
	  bash $(ROOT)/scripts/ops/logs.sh follow

logs-tail: ## Dernières lignes puis quitte (LOGS_TAIL=200)
	@chmod +x $(ROOT)/scripts/ops/logs.sh $(ROOT)/scripts/ops/color-logs.sh
	@LOGS_TAIL="$(or $(LOGS_TAIL),200)" bash $(ROOT)/scripts/ops/logs.sh tail

logs-watch: ## Logs avec reconnexion auto (Docker) — Ctrl+C
	@chmod +x $(ROOT)/scripts/ops/logs.sh $(ROOT)/scripts/ops/color-logs.sh
	@LOGS_SINCE="$(or $(LOGS_SINCE),24h)" LOGS_TAIL="$(or $(LOGS_TAIL),500)" \
	  bash $(ROOT)/scripts/ops/logs.sh watch

logs-history: ## Archives + historique puis suivi — Ctrl+C
	@chmod +x $(ROOT)/scripts/ops/logs.sh $(ROOT)/scripts/ops/color-logs.sh
	@LOGS_SINCE="$(or $(LOGS_SINCE),168h)" LOGS_TAIL="$(or $(LOGS_TAIL),2000)" \
	  bash $(ROOT)/scripts/ops/logs.sh history

logs-archive: ## Rotate les logs locaux vers logs/archive/
	@chmod +x $(ROOT)/scripts/ops/archive-logs.sh
	@bash $(ROOT)/scripts/ops/archive-logs.sh

# ---------------------------------------------------------------------------
# Base de données
# ---------------------------------------------------------------------------

db-status: ## Stats SQLite (users, likes, refresh, orphans)
	@chmod +x $(ROOT)/scripts/db-ops.sh
	@bash $(ROOT)/scripts/db-ops.sh status

db-backup: ## Backup data/ytmusic.db → data/backups/
	@chmod +x $(ROOT)/scripts/db-ops.sh
	@bash $(ROOT)/scripts/db-ops.sh backup

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

kill-dev: ## Alias de down — tue 5173 et 8787
	@$(MAKE) --no-print-directory down

push-dev: ## Push la branche courante vers origin
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
	@echo "  LOCAL : make up-full && make android"
	@echo "  DEV   : git push origin dev → image :dev"
	@echo "  PROD  : make push-prod → :latest / :prod"
	@echo "  Docs  : docs/DNS-ET-INSTALL.md  DEPLOY.md"
	@echo ""
