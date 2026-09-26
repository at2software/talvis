#!/usr/bin/env bash
# =============================================================================
#  TALVIS FOSS — Production Build Script
#
#  Builds the Angular frontend and assembles a self-contained production
#  package in dist/ that can be deployed with:
#
#    cd dist && docker compose up -d
#
#  No external tools required beyond node/npm.
#
#  Usage (from the repository root):
#    bash build-prod.sh          ← build dist/
#    bash build-prod.sh --tar    ← build dist/ and create TALVIS-x.y.z.tar.gz
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$SCRIPT_DIR/dist"
CREATE_TAR=false

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
step()  { echo -e "\n${CYAN}${BOLD}▶  $1${NC}"; }
ok()    { echo -e "  ${GREEN}✓${NC}  $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC}  $1"; }
abort() { echo -e "\n${RED}${BOLD}✗  ERROR: $1${NC}\n" >&2; exit 1; }

[[ "${1:-}" == "--tar" ]] && CREATE_TAR=true

command -v node >/dev/null 2>&1 || abort "node is not installed or not on PATH"
command -v npm  >/dev/null 2>&1 || abort "npm is not installed or not on PATH"

VERSION="$(cat "$SCRIPT_DIR/VERSION" 2>/dev/null | tr -d '[:space:]' || echo "0.0.0")"

# =============================================================================
# 1. Build Angular frontend
# =============================================================================
step "Building Angular frontend (this may take a few minutes)"

NODE_VER="$(node --version 2>/dev/null | grep -E '^v[0-9]' || echo 'n/a')"
NPM_VER="$(npm --version 2>/dev/null | grep -E '^[0-9]' || echo 'n/a')"
ok "Node ${NODE_VER}  /  npm ${NPM_VER}"

(
    cd "$SCRIPT_DIR/frontend"
    rm -f package-lock.json
    npm install --legacy-peer-deps
    ok "Dependencies installed"

    node scripts/generate-model-registry.js
    ok "Model registry generated"

    # Build en first, then move aside — the second build clears the output dir
    npx ng build --configuration=production,en
    mv dist/talvis/browser/en "$SCRIPT_DIR/en-build-tmp"
    ok "English build complete"

    npx ng build --configuration=production,de
    mv "$SCRIPT_DIR/en-build-tmp" dist/talvis/browser/en
    ok "Angular build complete (en + de)"
)

# =============================================================================
# 2. Assemble dist/
# =============================================================================
step "Assembling dist/"

rm -rf "$DIST"
mkdir -p "$DIST/docker"

# Backend source
cp -r "$SCRIPT_DIR/backend" "$DIST/backend"
ok "backend/ copied"

# Pre-built Angular assets
mv "$SCRIPT_DIR/frontend/dist/talvis/browser" "$DIST/frontend"
ok "frontend/ copied (pre-built Angular)"

# Docker config — Dockerfile.prod is the prebuilt variant (no Node stage needed)
cp "$SCRIPT_DIR/docker/Dockerfile.prod"  "$DIST/docker/Dockerfile"
cp "$SCRIPT_DIR/docker/entrypoint.sh"    "$DIST/docker/entrypoint.sh"
cp "$SCRIPT_DIR/docker/nginx.conf"       "$DIST/docker/nginx.conf"
cp "$SCRIPT_DIR/docker/supervisord.conf" "$DIST/docker/supervisord.conf"
cp "$SCRIPT_DIR/docker/upgrade-from-nexus.sh" "$DIST/upgrade-from-nexus.sh"
ok "docker/ copied"

# Production docker-compose.yml
cat > "$DIST/docker-compose.yml" << 'COMPOSE_EOF'
name: talvis

services:

  talvis:
    build:
      context: .
      dockerfile: docker/Dockerfile
    image: talvis:latest
    restart: unless-stopped
    ports:
      - "${FRONTEND_PORT:-3200}:3200"
      - "${BACKEND_PORT:-8000}:8000"
      # Port 6001 (Reverb) is proxied through nginx at /app — no direct exposure needed
    environment:
      APP_URL:                   "${APP_URL:-http://localhost:3200/backend}"
      APP_AUTH:                  "${APP_AUTH:-token}"
      DB_HOST:                   db
      DB_PORT:                   3306
      DB_DATABASE:               "${DB_DATABASE:-talvis}"
      DB_USERNAME:               "${DB_USERNAME:-talvis}"
      DB_PASSWORD:               "${DB_PASSWORD:-talvis}"
      ADMIN_EMAIL:               "${ADMIN_EMAIL:-admin@example.com}"
      ADMIN_PASSWORD:            "${ADMIN_PASSWORD:-changeme}"
      MAIL_MAILER:               "${MAIL_MAILER:-log}"
      MAIL_HOST:                 "${MAIL_HOST:-}"
      MAIL_PORT:                 "${MAIL_PORT:-587}"
      MAIL_FROM_ADDRESS:         "${MAIL_FROM_ADDRESS:-noreply@example.com}"
      KEYCLOAK_BASE_URL:         "${KEYCLOAK_BASE_URL:-}"
      KEYCLOAK_REALM:            "${KEYCLOAK_REALM:-}"
      KEYCLOAK_CLIENT_ID:        "${KEYCLOAK_CLIENT_ID:-}"
      KEYCLOAK_REALM_PUBLIC_KEY: "${KEYCLOAK_REALM_PUBLIC_KEY:-}"
      LOG_LEVEL:                 "${LOG_LEVEL:-error}"
      REVERB_APP_ID:             "${REVERB_APP_ID:-talvis}"
      REVERB_APP_KEY:            "${REVERB_APP_KEY:-talvis-key}"
      REVERB_APP_SECRET:         "${REVERB_APP_SECRET:-talvis-secret}"
      REVERB_HOST:               "0.0.0.0"
      REVERB_PORT:               "6001"
      REVERB_SCHEME:             "${REVERB_SCHEME:-http}"
    volumes:
      - storage_data:/var/www/backend/storage
    depends_on:
      db:
        condition: service_healthy

  db:
    image: mariadb:11
    restart: unless-stopped
    ports:
      - "${DB_PORT_HOST:-3308}:3306"
    environment:
      MYSQL_DATABASE:      "${DB_DATABASE:-talvis}"
      MYSQL_USER:          "${DB_USERNAME:-talvis}"
      MYSQL_PASSWORD:      "${DB_PASSWORD:-talvis}"
      MYSQL_ROOT_PASSWORD: "${DB_ROOT_PASSWORD:-talvis_root}"
    volumes:
      - db_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      start_period: 10s
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  db_data:
  storage_data:
COMPOSE_EOF
ok "docker-compose.yml written"

# .env.example, VERSION
cp "$SCRIPT_DIR/.env.example" "$DIST/.env.example"
cp "$SCRIPT_DIR/LICENSE" "$DIST/LICENSE"
echo "$VERSION" > "$DIST/VERSION"
ok ".env.example and VERSION written"

# README — use docker/DIST_README.md template if present, otherwise generate minimal one
if [[ -f "$SCRIPT_DIR/docker/DIST_README.md" ]]; then
    sed "s/__VERSION__/${VERSION}/g" "$SCRIPT_DIR/docker/DIST_README.md" > "$DIST/README.md"
else
    cat > "$DIST/README.md" << README_EOF
# TALVIS v${VERSION}

## Quick Start

\`\`\`bash
cp .env.example .env
# Edit .env to set APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD, DB_PASSWORD, DB_ROOT_PASSWORD
docker compose up -d
\`\`\`

Then open http://localhost:3200
README_EOF
fi
ok "README.md written"

# Clean up Angular build artefacts from source
rm -rf "$SCRIPT_DIR/frontend/dist" "$SCRIPT_DIR/frontend/node_modules"
ok "Cleaned frontend build artefacts"

# =============================================================================
# 3. Optional tarball
# =============================================================================
if [[ "$CREATE_TAR" == true ]]; then
    step "Creating tarball"
    TARBALL="$SCRIPT_DIR/TALVIS-${VERSION}.tar.gz"
    rm -f "$TARBALL"
    tar -czf "$TARBALL" -C "$SCRIPT_DIR" --transform "s|^dist|TALVIS-${VERSION}|" dist
    TARBALL_SIZE="$(du -sh "$TARBALL" | cut -f1)"
    ok "TALVIS-${VERSION}.tar.gz  (${TARBALL_SIZE})"
fi

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}${BOLD}Production build v${VERSION} complete!${NC}"
echo ""
echo -e "  ${CYAN}Production package${NC}  dist/  ←  cd dist && docker compose up -d"
if [[ "$CREATE_TAR" == true ]]; then
    echo -e "  ${CYAN}Release tarball    ${NC}  TALVIS-${VERSION}.tar.gz"
fi
echo ""
