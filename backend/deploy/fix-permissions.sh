#!/usr/bin/env bash
# Resets ownership and modes on the deployed tree. Idempotent - the CI deploy job calls
# it via sudo on every deploy. Must run as root.
set -euo pipefail

APP_DIR="${1:-/var/www/html/backend}"
DEPLOY_USER="${2:-${SUDO_USER:-nexusadmin}}"
WEB_GROUP="www-data"

if [[ $EUID -ne 0 ]]; then
    echo "must run as root" >&2
    exit 1
fi

# storage/ has two writers: DEPLOY_USER (sync, Reverb) and WEB_GROUP (PHP-FPM, the
# schedule:run cron). Shared group + setgid is what replaces the former mode 777.
usermod -aG "$WEB_GROUP" "$DEPLOY_USER"

chown -R "$DEPLOY_USER:$WEB_GROUP" "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 0750 {} +
find "$APP_DIR" -type f -exec chmod 0640 {} +

chmod 0750 "$APP_DIR/artisan"
find "$APP_DIR/deploy" -name '*.sh' -exec chmod 0750 {} +
if [[ -d "$APP_DIR/vendor/bin" ]]; then
    find "$APP_DIR/vendor/bin" -type f -exec chmod 0750 {} +
fi

for dir in storage bootstrap/cache; do
    find "$APP_DIR/$dir" -type d -exec chmod 2770 {} +
    find "$APP_DIR/$dir" -type f -exec chmod 0660 {} +
done
