---
sidebar_position: 2
---

# Configuration Reference

Complete reference for all configuration options in Agam Space. Each option can
be set via **environment variables** or **config file**.

:::tip

This page shows both configuration methods side-by-side. Use environment
variables for Docker deployments, or config file for advanced setups.

:::

## Required Variables

These must be set for Agam Space to run:

| Environment Variable | Config File Property | Description                  | Example                |
| -------------------- | -------------------- | ---------------------------- | ---------------------- |
| `DATABASE_HOST`      | `database.host`      | PostgreSQL database hostname | `postgres`             |
| `DATABASE_USERNAME`  | `database.username`  | Database user                | `postgres`             |
| `DATABASE_PASSWORD`  | `database.password`  | Database password            | `your_secure_password` |

## Server Configuration

| Environment Variable | Config File Property | Default      | Description                                            |
| -------------------- | -------------------- | ------------ | ------------------------------------------------------ |
| `HTTP_PORT`          | `server.port`        | `3331`       | Port the server listens on                             |
| `HTTP_HOST`          | `server.host`        | `0.0.0.0`    | Host address to bind to                                |
| `NODE_ENV`           | `server.nodeEnv`     | `production` | Environment mode (`production`, `development`, `test`) |
| `API_PREFIX`         | `server.apiPrefix`   | `api/v1`     | API endpoint prefix                                    |

## Database Configuration

| Environment Variable          | Config File Property         | Default      | Description                       |
| ----------------------------- | ---------------------------- | ------------ | --------------------------------- |
| `DATABASE_HOST`               | `database.host`              | _required_   | Database hostname                 |
| `DATABASE_PORT`               | `database.port`              | `5432`       | Database port                     |
| `DATABASE_USERNAME`           | `database.username`          | _required_   | Database username                 |
| `DATABASE_PASSWORD`           | `database.password`          | _required_   | Database password                 |
| `DATABASE_NAME`               | `database.database`          | `agam_space` | Database name                     |
| `DATABASE_SSL`                | `database.ssl`               | `false`      | Enable SSL connection             |
| `DATABASE_MAX_CONNECTIONS`    | `database.maxConnections`    | `100`        | Maximum database connections      |
| `DATABASE_CONNECTION_TIMEOUT` | `database.connectionTimeout` | `30000`      | Connection timeout (milliseconds) |

## Account & User Management

| Environment Variable         | Config File Property              | Default       | Description                                   |
| ---------------------------- | --------------------------------- | ------------- | --------------------------------------------- |
| `ALLOW_NEW_SIGNUP`           | `account.allowNewSignup`          | `true`        | Allow new user registration                   |
| `DEFAULT_USER_STORAGE_QUOTA` | `account.defaultUserStorageQuota` | `10000000000` | Default storage quota per user (bytes) - 10GB |

**Storage quota examples:**

- 5GB: `5000000000`
- 10GB: `10000000000` (default)
- 50GB: `50000000000`
- 100GB: `100000000000`

## File Storage Configuration

| Environment Variable          | Config File Property             | Default              | Description                             |
| ----------------------------- | -------------------------------- | -------------------- | --------------------------------------- |
| `DATA_DIR`                    | `directories.dataDir`            | `/data`              | Root data directory                     |
| `FILES_DIR`                   | `directories.filesDir`           | `${DATA_DIR}/files`  | File storage directory                  |
| `CONFIG_DIR`                  | `directories.configDir`          | `${DATA_DIR}/config` | Configuration directory                 |
| `LOG_DIR`                     | `directories.logDir`             | `${DATA_DIR}/logs`   | Logs directory                          |
| `CACHE_DIR`                   | `directories.cacheDir`           | `${DATA_DIR}/cache`  | Cache directory                         |
| `MAX_FILE_SIZE`               | `files.maxFileSize`              | `1000000000`         | Max file size in bytes (1GB)            |
| `CHUNK_SIZE`                  | `files.chunkSize`                | `8000000`            | Chunk size for file uploads (8MB)       |
| `TRASH_CLEANUP_INTERVAL_DAYS` | `files.trashCleanupIntervalDays` | `7`                  | Days before auto-deleting trashed files |

## Security Configuration

| Environment Variable | Config File Property      | Default | Description                                |
| -------------------- | ------------------------- | ------- | ------------------------------------------ |
| `SESSION_TIMEOUT`    | `security.sessionTimeout` | `7d`    | Session timeout (e.g., `7d`, `24h`, `30m`) |

## Documentation

| Environment Variable | Config File Property | Default | Description             |
| -------------------- | -------------------- | ------- | ----------------------- |
| `DOCS_ENABLED`       | `docs.enabled`       | `false` | Enable Swagger API docs |
| `DOCS_PATH`          | `docs.path`          | `docs`  | Path to access API docs |

Access Swagger docs at: `http://localhost:3331/docs`

## Single Sign-On (SSO) - Optional

Enable SSO with OIDC providers like Authelia, Authentik, Keycloak, etc.

| Environment Variable   | Config File Property | Required | Description                                            |
| ---------------------- | -------------------- | -------- | ------------------------------------------------------ |
| `SSO_ISSUER`           | `sso.issuer`         | Yes      | OIDC issuer URL                                        |
| `SSO_CLIENT_ID`        | `sso.clientId`       | Yes      | OIDC client ID                                         |
| `SSO_CLIENT_SECRET`    | `sso.clientSecret`   | Yes      | OIDC client secret                                     |
| `SSO_REDIRECT_URI`     | `sso.redirectUri`    | Yes      | Callback URL after authentication                      |
| `SSO_AUTO_CREATE_USER` | `sso.autoCreateUser` | No       | Auto-create user on first SSO login (default: `false`) |

**Example SSO configuration:**

Environment variables:

```env
SSO_ISSUER=https://auth.yourdomain.com
SSO_CLIENT_ID=agam-space-client
SSO_CLIENT_SECRET=your_secret_here
SSO_REDIRECT_URI=https://files.yourdomain.com/api/v1/auth/sso/oidc/callback
SSO_AUTO_CREATE_USER=false
```

Config file:

```json
{
  "sso": {
    "issuer": "https://auth.yourdomain.com",
    "clientId": "agam-space-client",
    "clientSecret": "your_secret_here",
    "redirectUri": "https://files.yourdomain.com/api/v1/auth/sso/oidc/callback",
    "autoCreateUser": false
  }
}
```

See [SSO Configuration Guide](./sso.md) for detailed setup.

## WebAuthn - Optional

Required only if using WebAuthn for biometric device unlock.

| Environment Variable | Config File Property | Required | Description                                                      |
| -------------------- | -------------------- | -------- | ---------------------------------------------------------------- |
| `WEBAUTHN_ORIGIN`    | `webauthn.origin`    | Yes      | Full URL of your site (e.g., `https://files.yourdomain.com`)     |
| `WEBAUTHN_RPID`      | `webauthn.rpId`      | No       | Relying Party ID (usually your domain) - defaults to `localhost` |
| `DOMAIN`             | `domain.domain`      | No       | Your domain name (used for cookies)                              |

**Example WebAuthn configuration:**

Environment variables:

```env
DOMAIN=yourdomain.com
WEBAUTHN_ORIGIN=https://files.yourdomain.com
WEBAUTHN_RPID=yourdomain.com
```

Config file:

```json
{
  "domain": {
    "domain": "yourdomain.com"
  },
  "webauthn": {
    "origin": "https://files.yourdomain.com",
    "rpId": "yourdomain.com"
  }
}
```

:::info

WebAuthn is used for biometric unlock (Touch ID, Face ID, Windows Hello) on
trusted devices. Not required for basic functionality.

:::

## Complete Examples

### Minimal Configuration

```env
# Database (required)
DATABASE_HOST=postgres
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_secure_password
DATABASE_NAME=agam_space

# Server (optional - these are defaults)
HTTP_PORT=3331

# Account
ALLOW_NEW_SIGNUP=true
```

### Production Configuration

```env
# Database
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=your_secure_password
DATABASE_NAME=agam_space
DATABASE_SSL=false

# Server
HTTP_PORT=3331
HTTP_HOST=0.0.0.0
NODE_ENV=production

# Account - disable signups after creating your account
ALLOW_NEW_SIGNUP=false
DEFAULT_USER_STORAGE_QUOTA=50000000000

# File Storage
MAX_FILE_SIZE=2000000000
TRASH_CLEANUP_INTERVAL_DAYS=14

# WebAuthn
DOMAIN=yourdomain.com
WEBAUTHN_ORIGIN=https://files.yourdomain.com
WEBAUTHN_RPID=yourdomain.com

# Documentation - disable in production
DOCS_ENABLED=false
```

## Environment Variable Precedence

Agam Space loads configuration in this order (later overrides earlier):

1. **Default values** (from config schema)
2. **Environment variables** (from `.env` file or Docker)
3. **Runtime overrides** (rarely used)

## Validation

All environment variables are validated on startup. If required variables are
missing or invalid values are provided, the application will fail to start with
a clear error message.

## Source of Truth

This documentation is kept in sync with the configuration schema at:
`apps/api-server/src/config/config.schema.ts`

If you find any discrepancies, please report them!
