# Deployment

Agam Space is designed for self-hosted deployment using Docker.

## Docker deployment

The recommended way to run Agam Space is with Docker Compose.

**Features:**

- All-in-one Docker image (API server + web UI)
- PostgreSQL database (separate container)
- Multi-architecture support (amd64, arm64)
- Easy updates with new image versions

**Images available:**

- **Standard image:** `agamspace/agam-space:latest`
- **Hardened image:** `agamspace/agam-space-hardened:latest` (minimal attack
  surface, runs as non-root)

See [Installation - Docker Compose](../installation/docker-compose) for setup
instructions.

## Storage backend

File chunks can be stored on the container's local filesystem (default) or in an
S3-compatible bucket (AWS S3, Cloudflare R2, Garage, MinIO, Backblaze B2, etc) -
useful if you want storage decoupled from the host running the container. See
[Storage Backend](../configuration/configuration-reference.md#storage-backend)
for setup.

## Self-hosted benefits

Running Agam Space on your own infrastructure gives you:

- **Full data control** - Your encrypted files stay on your hardware
- **No vendor lock-in** - Open-source, you own the stack
- **Privacy** - No third party has access to your server
- **Customization** - Configure quotas, storage paths, and settings

## Platform support

**Current:**

- **Web UI** - Responsive interface works on desktop, tablet, and mobile
  browsers
- **Installable PWA** - Add to your home screen on mobile or desktop for an
  app-like experience, no app store needed
- **No installation needed** - Access via any modern browser

**Browser requirements:**

- Modern browser with Web Crypto API support (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- WebAuthn support for biometric unlock (optional)
