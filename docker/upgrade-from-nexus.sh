#!/usr/bin/env bash
# =============================================================================
#  TALVIS — one-time upgrade of a NEXUS (<= 1.3.x) Docker installation
#
#  Run it from the directory that holds .env and docker-compose.yml, with the
#  .env of your NEXUS installation copied in:
#    bash upgrade-from-nexus.sh              ← release tarball
#    bash docker/upgrade-from-nexus.sh       ← source checkout
#    bash upgrade-from-nexus.sh my-project   ← if you started NEXUS with -p
#
#  Stops the old containers, copies the old volumes into new talvis_* volumes
#  and pins the old database defaults in .env. The old volumes are kept.
# =============================================================================

set -euo pipefail

OLD="${1:-nexus}"
NEW="talvis"
VOLUMES=(db_data storage_data)

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()    { echo -e "  ${GREEN}✓${NC}  $1"; }
abort() { echo -e "\n${RED}${BOLD}✗  $1${NC}\n" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || abort "docker is not installed or not on PATH"
[[ -f .env ]] || abort "No .env here — copy the .env of your NEXUS installation into this directory first."

docker volume inspect "${OLD}_db_data" >/dev/null 2>&1 \
    || abort "Volume ${OLD}_db_data not found — nothing to migrate. Pass your old project name if you used 'docker compose -p'."

for v in "${VOLUMES[@]}"; do
    if docker volume inspect "${NEW}_${v}" >/dev/null 2>&1; then
        abort "Volume ${NEW}_${v} already exists — refusing to overwrite it."
    fi
done

echo -e "\n${CYAN}${BOLD}▶  Stopping NEXUS containers (project '${OLD}')${NC}"
OLD_CONTAINERS=$(docker ps -aq --filter "label=com.docker.compose.project=${OLD}")
if [[ -n "$OLD_CONTAINERS" ]]; then
    docker rm -f $OLD_CONTAINERS >/dev/null
    ok "Removed $(echo "$OLD_CONTAINERS" | wc -w | tr -d ' ') container(s)"
else
    ok "No running containers"
fi

echo -e "\n${CYAN}${BOLD}▶  Copying volumes${NC}"
for v in "${VOLUMES[@]}"; do
    docker volume inspect "${OLD}_${v}" >/dev/null 2>&1 || continue
    docker volume create \
        --label "com.docker.compose.project=${NEW}" \
        --label "com.docker.compose.volume=${v}" \
        "${NEW}_${v}" >/dev/null
    docker run --rm -v "${OLD}_${v}:/from:ro" -v "${NEW}_${v}:/to" alpine sh -c 'cp -a /from/. /to/'
    ok "${OLD}_${v} → ${NEW}_${v}"
done

echo -e "\n${CYAN}${BOLD}▶  Pinning database settings in .env${NC}"
pin_default() {
    local key="$1" val="$2"
    if grep -q "^${key}=" .env; then
        ok "${key} already set"
    else
        printf '\n%s=%s' "$key" "$val" >> .env
        ok "${key}=${val} (NEXUS default — the existing database was created with it)"
    fi
}
pin_default DB_DATABASE      nexus
pin_default DB_USERNAME      nexus
pin_default DB_PASSWORD      nexus
pin_default DB_ROOT_PASSWORD nexus_root
echo >> .env

echo ""
echo -e "${GREEN}${BOLD}Migration complete.${NC}"
echo ""
echo "  Start TALVIS:            docker compose up -d"
echo "  Once everything works, remove the old volumes:"
echo "    docker volume rm $(printf "${OLD}_%s " "${VOLUMES[@]}")"
echo ""
