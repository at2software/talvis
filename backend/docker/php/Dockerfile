# PHP 8.4 as on production, with the extensions TALVIS needs and the MariaDB client that
# "php artisan migrate" uses to load database/schema/mysql-schema.sql into an empty database.
# The code itself is not copied in: compose.yaml bind-mounts the checkout to /app.
FROM php:8.4-cli

COPY --from=ghcr.io/mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions bcmath exif gd intl opcache pcntl pdo_mysql zip \
 && apt-get update \
 && apt-get install -y --no-install-recommends git mariadb-client unzip \
 && rm -rf /var/lib/apt/lists/* \
 && { command -v mysql >/dev/null || ln -s "$(command -v mariadb)" /usr/local/bin/mysql; }

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY php.ini $PHP_INI_DIR/conf.d/zz-talvis.ini
COPY --chmod=755 entrypoint.sh /usr/local/bin/talvis-entrypoint

WORKDIR /app
ENTRYPOINT ["talvis-entrypoint"]
