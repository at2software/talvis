# =============================================================================
#  TALVIS — Development image
#
#  Serves the Laravel backend via PHP-FPM + nginx (port 8000) and the Angular
#  frontend via `ng serve` with live reload (port 4200).
#
#  Use with docker-compose.yml which volume-mounts source for live reloading:
#    ./backend   →  /var/www/backend   (live PHP code)
#    ./frontend  →  /var/www/frontend  (live Angular code)
#
#  Named volumes preserve installed packages across code reloads:
#    backend_vendor   →  /var/www/backend/vendor
#    frontend_modules →  /var/www/frontend/node_modules
#
#  Access:
#    Frontend (live reload):  http://localhost:4200
#    Backend API (direct):    http://localhost:8000
# =============================================================================

FROM php:8.4-fpm-alpine

RUN apk add --no-cache \
        nodejs npm \
        nginx supervisor \
        ca-certificates curl openssl \
        mariadb-client \
        libzip libpng libxml2 oniguruma icu-libs libwebp \
    && apk add --no-cache --virtual .build-deps \
        libzip-dev libpng-dev libxml2-dev oniguruma-dev icu-dev curl-dev libwebp-dev \
    && docker-php-ext-configure gd --with-webp \
    && docker-php-ext-install \
        pdo_mysql zip gd xml mbstring bcmath intl opcache curl pcntl \
    && apk del .build-deps

# Install Composer
RUN curl -sS https://getcomposer.org/installer \
    | php -- --install-dir=/usr/local/bin --filename=composer

# PHP-FPM: run workers as nginx user so they can write to storage/
RUN printf '[www]\nuser = nginx\ngroup = nginx\n' \
    > /usr/local/etc/php-fpm.d/zzz-talvis.conf

# ng serve proxy config — routes /backend → PHP API, /app → Reverb WebSocket
COPY docker/ng-proxy.conf.json /etc/talvis/ng-proxy.conf.json

# ── Backend (overridden by volume mount in dev) ───────────────────────────────
WORKDIR /var/www/backend
COPY backend/ .

RUN composer install --no-dev --optimize-autoloader --no-interaction --no-scripts --quiet \
    && mkdir -p \
        storage/app/public \
        storage/framework/cache \
        storage/framework/sessions \
        storage/framework/views \
        storage/framework/testing \
        storage/logs \
        bootstrap/cache \
    && chown -R nginx:nginx /var/www/backend \
    && chmod -R 775 storage bootstrap/cache

# ── Frontend source (overridden by volume mount — node_modules in named volume) ─
COPY frontend/ /var/www/frontend/

# ── Config files ─────────────────────────────────────────────────────────────
COPY docker/nginx.dev.conf         /etc/nginx/nginx.conf
COPY docker/supervisord.dev.conf   /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh          /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh \
    && chmod +x /entrypoint.sh \
    && mkdir -p /var/log/supervisor

# 3200 = nginx (proxies to ng serve for live reload — same port as production)
# 8000 = nginx backend API
# 4200 = ng serve (internal only, not exposed externally)
EXPOSE 3200 8000

VOLUME ["/var/www/backend/storage"]

ENTRYPOINT ["/entrypoint.sh"]
