# Local Development Environment

This directory contains all local development tools and data for Agam Space.

## 🗂️ Structure

```
.local/
├── docker-compose.dev.yml   # PostgreSQL + Nginx proxy + MinIO for local dev
├── init-db.sql             # PostgreSQL extensions setup
├── nginx.conf              # Local reverse proxy config
├── README.md               # This file
└── data/                   # Local development data (gitignored)
    ├── postgres/           # PostgreSQL data files
    └── minio/              # MinIO (S3-compatible) object data
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

- **MinIO (S3-compatible storage)**:
  - S3 API: `http://localhost:9000`
  - Web console: http://localhost:9001
  - User: `agam_space`
  - Password: `dev_password_123`
  - A bucket named `agam-space` is created automatically on startup by the
    `minio-init` service.

## ☁️ Testing the S3 storage backend

To run the API server against MinIO instead of local filesystem storage, set
these in `apps/api-server/.env` (or your shell env) before starting the API:

```env
STORAGE_BACKEND=s3
S3_BUCKET=agam-space
S3_REGION=auto
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=agam_space
S3_SECRET_ACCESS_KEY=dev_password_123
S3_PATH_STYLE_ENDPOINT=true
```

The API server runs on the host (not in Docker) during local dev, so the
endpoint is `localhost:9000`, not `minio:9000` (that hostname only resolves
inside the Docker network). Browse uploaded chunks at http://localhost:9001
(bucket `agam-space`).

## 📋 Configuration

The development database credentials match the default `.env` configuration in
`apps/api-server/env.example`.

## 🗑️ Data Management

- **`data/` directory**: Automatically created, contains all persistent
  development data
- **Gitignored**: `data/` is excluded from git to prevent committing database
  files
- **Portable**: Each developer gets their own local database state
