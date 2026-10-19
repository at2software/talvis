#!/bin/sh
# Prepares the bind-mounted checkout before the API starts. Only the "app" service sets
# TALVIS_SETUP; Reverb and the scheduler wait for it to become healthy, so composer never
# runs twice at once against the shared vendor volume.
set -e

if [ "${TALVIS_SETUP:-0}" = 1 ]; then
    [ -f .env ] || cp .env.example .env

    # vendor/ is a named volume: install on first start and whenever composer.lock changes.
    lock_hash="$(md5sum composer.lock | cut -d' ' -f1)"
    if [ "$(cat vendor/.composer-lock-hash 2>/dev/null)" != "$lock_hash" ]; then
        composer install --no-interaction --no-progress
        echo "$lock_hash" > vendor/.composer-lock-hash
    fi

    grep -q '^APP_KEY=base64:' .env || php artisan key:generate --force

    # A config cache written on the host would pin DB_HOST=127.0.0.1 and ignore compose.yaml.
    php artisan config:clear

    # Every model save broadcasts DataChanged synchronously, and Reverb only starts once
    # this container is healthy - so migrations and the seeding they run must not broadcast.
    BROADCAST_CONNECTION=log php artisan migrate --force
fi

exec "$@"
