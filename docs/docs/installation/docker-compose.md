---
sidebar_position: 1
---

# Docker Compose (Recommended)

The easiest and recommended way to run Agam Space in production.

## Prerequisites

- Docker and Docker Compose installed
- Domain name (optional, for HTTPS)

## Basic Installation

Create a directory:

```bash
mkdir agam-space && cd agam-space
```

Create `docker-compose.yml`:

:::tip

Docker Registry Options Agam Space images are published to both:

- **Docker Hub:** `agamspace/agam-space:latest`
- **GitHub Container Registry:** `ghcr.io/agam-space/agam-space:latest`

Use either registry in the `image:` field below.

:::

### Docker Tags

Multiple image tags are available:

| Tag               | Description                              |
| ----------------- | ---------------------------------------- |
| `latest`          | Latest stable release (Alpine-based)     |
| `latest-hardened` | Latest stable release (Hardened variant) |
| `v0.2.0`          | Specific version (Alpine-based)          |
| `v0.2.0-hardened` | Specific version (Hardened variant)      |
| `dev`             | Development builds from main branch      |
| `dev-hardened`    | Development builds (Hardened variant)    |

**Multi-arch support:** All images support both `amd64` and `arm64`
architectures.

### Hardened images

Hardened images use
[Docker Hub Images (DHI)](https://www.docker.com/products/hardened-images) with
minimal attack surface and no shell access. Use `-hardened` tags for maximum
security.

**Key Differences:**

| Aspect           | Normal (`latest`)               | Hardened (`latest-hardened`)       |
| ---------------- | ------------------------------- | ---------------------------------- |
| Base image       | `node:24-bookworm-slim`         | `dhi.io/node:24.19`                |
| Shell access     | ✅ Available (`docker exec sh`) | ❌ No shell (maximum security)     |
| Init system      | Tini (signal handling)          | Direct Node.js execution           |
| Debugging        | ✅ Easy (can inspect files)     | ⚠️ Limited (no interactive access) |
| Security         | ✅ Good (minimal Alpine)        | ✅✅ Maximum (hardened base)       |
| Size             | Slightly larger                 | Minimal                            |
| Runtime behavior | Identical                       | Identical                          |

**Which to choose?**

- **Normal image**: Recommended for most users - easier to debug and
  troubleshoot
- **Hardened image**: Use in production when maximum security is required

Both images support the same features and configuration options.

### Configuration

Create `docker-compose.yml` with the following content:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: agam_space
    volumes:
      - ./data/postgres:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - agam

  agam:
    image: agamspace/agam-space:latest
    # Run as your user for easier file management (recommended)
    # Find your UID/GID with: id -u && id -g
    user: '1000:1000'
    ports:
      - '3331:3331'
    environment:
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_USERNAME: postgres
      DATABASE_PASSWORD: ${DB_PASSWORD}
      DATABASE_NAME: agam_space
      HTTP_PORT: 3331
      ALLOW_NEW_SIGNUP: 'true'
    volumes:
      - ./data:/data
    depends_on:
      - postgres
    restart: unless-stopped
    networks:
      - agam

networks:
  agam:
```

Create `.env` file:

```bash
DB_PASSWORD=your_secure_password_here
```

Set permissions:

```bash
chmod 600 .env
```

Start containers:

```bash
docker-compose up -d
```

Access at `http://localhost:3331`

## File Permissions

Agam Space runs as a non-root user for security. The **recommended approach** is
to run as your own user ID for easier file management.

### Default Approach: Use Your User ID (Recommended)

The provided `docker-compose.yml` includes the `user:` field set to `1000:1000`.
Update this to match your system user:

```yaml
services:
  agam:
    image: agamspace/agam-space:latest
    user: '1000:1000' # Replace with your UID:GID
    volumes:
      - ./data:/data
```

Find your UID/GID:

```bash
id -u  # Your UID
id -g  # Your GID
```

**Benefits:**

- ✅ Files on host are owned by your user
- ✅ Easy to browse/edit files directly on host
- ✅ No permission issues when backing up or moving files

### Alternative: Use Default UID 65532

If you prefer maximum security or multi-user systems, you can remove the `user:`
field to use the default (UID 65532), then change ownership of the data
directory:

```yaml
services:
  agam:
    image: agamspace/agam-space:latest
    # No user field - runs as 65532:65532
    volumes:
      - ./data:/data
```

Change ownership:

```bash
sudo chown -R 65532:65532 ./data
```

:::tip

**Which option to choose?**

- **Your user (1000:1000)**: ✅ **Recommended** - Easier file management, works
  great for single-user systems
- **Default UID (65532)**: Better isolation on multi-user systems, slightly more
  secure

For most self-hosted setups, **using your user ID is the best choice**.

:::

## Environment Variables

See **[Configuration Guide](../configuration/index.md)** for complete details on
configuring Agam Space.

Quick reference of essential variables:

| Variable            | Required | Default    | Description                 |
| ------------------- | -------- | ---------- | --------------------------- |
| `DATABASE_HOST`     | ✅       | -          | Database hostname           |
| `DATABASE_USERNAME` | ✅       | -          | Database user               |
| `DATABASE_PASSWORD` | ✅       | -          | Database password           |
| `DATABASE_NAME`     | No       | agam_space | Database name               |
| `HTTP_PORT`         | No       | 3331       | Server port                 |
| `ALLOW_NEW_SIGNUP`  | No       | true       | Allow new user registration |

## Reverse Proxy Setup

**Recommended:** Run Agam Space behind a reverse proxy if you're exposing it to
the internet or accessing from multiple devices. The reverse proxy provides
HTTPS encryption and better security.

Choose your reverse proxy:

**Example Caddy config:**

```
files.yourdomain.com {
    reverse_proxy localhost:3331
}
```

**Example Nginx config:**

```nginx
server {
    server_name files.yourdomain.com;
    client_max_body_size 10G;

    location / {
        proxy_pass http://localhost:3331;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Configure SSL certificates with your reverse proxy of choice.

## Updates

### Update to Latest Version

Pull new image:

```bash
docker-compose pull
```

Restart containers:

```bash
docker-compose up -d
```

Check logs:

```bash
docker-compose logs -f agam
```

### Version Pinning

To pin to specific version:

```yaml
agam:
  image: agamspace/agam-space:v0.2.0
```

## Next Steps

🚀 **[First Steps](../configuration/first-steps.md)** - Create admin account and
initial setup

💾 **[Set up backups](./backups.md)** - Automate database and file backups
