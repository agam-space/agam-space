# Local Development Environment

This directory contains all local development tools and data for Agam Space.

## 🗂️ Structure

```
.local/
├── docker-compose.dev.yml   # PostgreSQL + Nginx proxy + Garage for local dev
├── garage.toml             # Garage (S3-compatible) config
├── init-db.sql             # PostgreSQL extensions setup
├── nginx.conf              # Local reverse proxy config
├── README.md               # This file
└── data/                   # Local development data (gitignored)
    ├── postgres/           # PostgreSQL data files
    └── garage/             # Garage (S3-compatible) object data
```

## 🚀 Quick Start

Run these from the project root (they wrap
`docker compose -f .local/docker-compose.dev.yml`):

```bash
pnpm infra:up        # Start Postgres + proxy
pnpm infra:down      # Stop services
pnpm infra:restart   # Restart services
pnpm infra:status    # Show container status
pnpm infra:logs      # Tail logs
pnpm infra:reset     # Stop, wipe data/, and start fresh (⚠️ destroys all data!)
```

### Access Services

- **PostgreSQL**: `localhost:5432`
  - Database: `agam_space`
  - User: `agam_space`
  - Password: `dev_password_123`

- **Proxy**: http://localhost:3333 (fronts the API/web dev servers via
  `nginx.conf`)

- **Garage (S3-compatible storage)**:
  - S3 API: `http://localhost:3900`
  - Admin API: `http://localhost:3903`
  - Access key: `agam_space`
  - Secret key: `dev_password_123_dev_password_123`
  - A bucket named `agam-space` and the above access key are created
    automatically on startup (Garage's built-in `--default-bucket` bootstrap -
    see `garage.toml` and the `garage` service's `command` in
    `docker-compose.dev.yml`).
  - We switched from MinIO to Garage in 2026 - MinIO's community edition was
    archived with no more releases or Docker images, so it's no longer a good
    fit for a maintained local dev default. Garage is Apache-2.0 licensed and
    actively maintained by [Deuxfleurs](https://garagehq.deuxfleurs.fr/).

## ☁️ Testing the S3 storage backend

To run the API server against Garage instead of local filesystem storage, set
these in `apps/api-server/.env` (or your shell env) before starting the API:

```env
STORAGE_BACKEND=s3
S3_BUCKET=agam-space
S3_REGION=garage
S3_ENDPOINT=http://localhost:3900
S3_ACCESS_KEY_ID=agam_space
S3_SECRET_ACCESS_KEY=dev_password_123_dev_password_123
S3_PATH_STYLE_ENDPOINT=true
```

**`S3_REGION` must be exactly `garage`** (not `auto`) - unlike MinIO, Garage
validates the region against its own `s3_region` config (`.local/garage.toml`)
and rejects requests with a mismatched region.

The API server runs on the host (not in Docker) during local dev, so the
endpoint is `localhost:3900`, not `garage:3900` (that hostname only resolves
inside the Docker network). Inspect the bucket via the CLI:

```bash
docker exec agam-space-garage /garage bucket list
docker exec agam-space-garage /garage bucket info agam-space
```

## 📋 Configuration

The development database credentials match the default `.env` configuration in
`apps/api-server/env.example`.

## 🗑️ Data Management

- **`data/` directory**: Automatically created, contains all persistent
  development data
- **Gitignored**: `data/` is excluded from git to prevent committing database
  files
- **Portable**: Each developer gets their own local database state
