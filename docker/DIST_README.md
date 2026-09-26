# TALVIS __VERSION__

TALVIS is an open-source business management suite for service-oriented teams.
This release package is production-ready — no build tools required.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (Engine 24+ or Docker Desktop)
- [Docker Compose](https://docs.docker.com/compose/) (v2, included with Docker Desktop)

## Quick Start

### 1. Configure your environment

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | Description | Example |
|---|---|---|
| `APP_URL` | Public URL of the backend API | `http://your-server:3200/backend` |
| `ADMIN_EMAIL` | E-mail for the first admin account | `admin@example.com` |
| `ADMIN_PASSWORD` | Password for the first admin account | *(choose a strong password)* |
| `DB_PASSWORD` | MariaDB password for the talvis user | *(choose a strong password)* |
| `DB_ROOT_PASSWORD` | MariaDB root password | *(choose a strong password)* |

All other variables have sensible defaults and can be left unchanged for a first run.

Behind a TLS-terminating reverse proxy, set `APP_URL` to the public `https://` URL and
make sure the proxy sends `X-Forwarded-Proto`. Proxies on loopback or a private network
are trusted out of the box; for anything else set `TRUSTED_PROXIES` (a comma-separated
list of IPs/CIDRs, or `*`). `CORS_ALLOWED_ORIGINS` defaults to the origin of `APP_URL`.

### 2. Start TALVIS

```bash
docker compose up -d
```

Docker will pull the MariaDB image, build the TALVIS image, run migrations, and seed
the admin account automatically on first start. This takes about 1–2 minutes.

### 3. Open in your browser

| Service | Default URL |
|---|---|
| TALVIS frontend | http://localhost:3200 |
| Backend API | http://localhost:3200/backend |

Log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you configured above.

## Authentication

TALVIS supports two authentication modes, set via `APP_AUTH` in `.env`:

| Value | Description |
|---|---|
| `token` | Built-in token authentication (default) |
| `keycloak` | Keycloak SSO — also set `KEYCLOAK_BASE_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, and `KEYCLOAK_REALM_PUBLIC_KEY` |

## Ports

| Variable | Default | Description |
|---|---|---|
| `FRONTEND_PORT` | `3200` | Port TALVIS is reachable on |
| `BACKEND_PORT` | `8000` | Direct PHP-FPM port (usually not needed externally) |
| `DB_PORT_HOST` | `3308` | MariaDB port exposed on the host (for external DB access) |

## Updating

```bash
docker compose pull   # if using a registry image
docker compose up -d --build
```

Or replace the `dist/` folder and `backend/` folder with the new release and rebuild:

```bash
docker compose up -d --build
```

Migrations run automatically on every container start.

## Data persistence

All application data is stored in named Docker volumes:

| Volume | Contents |
|---|---|
| `talvis_db_data` | MariaDB database |
| `talvis_storage_data` | Uploaded files and application storage |

To back up your data:

```bash
docker run --rm \
  -v talvis_storage_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/talvis-storage-backup.tar.gz /data
```

## Upgrading from NEXUS (1.3.x and earlier)

TALVIS is the new name of NEXUS. This release renames the Docker project, image and volumes, so an
existing installation needs a one-time migration:

```bash
cp /path/to/old-nexus/.env .
bash upgrade-from-nexus.sh        # add your project name if you used 'docker compose -p'
docker compose up -d
```

The script stops the old containers, copies the `nexus_*` volumes into `talvis_*` volumes and pins
the old database defaults in `.env`. The old volumes are kept until you remove them.

## Building from source

If you want to modify TALVIS, the `frontend/` and `backend/` source directories are
included in this package. The `docker/` folder also contains a `Dockerfile.src` that
performs a full multi-stage build (requires Node.js 22+ on the build machine or uses
Docker's build stage):

```bash
docker build -f docker/Dockerfile.src -t talvis:custom .
```

## Support & Contributing

- GitHub: https://github.com/at2software/talvis
- Issues: https://github.com/at2software/talvis/issues
- License: GNU AGPL v3 or later — see the LICENSE file. Copyright (C) 2026 at² GmbH
