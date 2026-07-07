---
sidebar_position: 5
---

# Architecture

Technical overview of Agam Space's system architecture and implementation
details. This guide is for developers and contributors who want to understand or
modify the codebase.

**For security guarantees and threat model, see [Security](./security/).**

## System Overview

Agam Space is built on a **zero-knowledge architecture** where all encryption
happens client-side. The server stores and serves encrypted data but cannot
decrypt it.

The system consists of three main components:

```
┌─────────────┐
│  Web Client │  ← All encryption/decryption happens here
│  (React)    │  ← Master password never leaves this layer
└──────┬──────┘
       │ HTTPS/REST (only encrypted data transmitted)
       │
┌──────▼──────┐      ┌──────────────┐
│ API Server  │◄─────┤  PostgreSQL  │
│  (NestJS)   │      │   Database   │  ← Stores only encrypted data
└──────┬──────┘      └──────────────┘
       │
       │
┌──────▼──────┐
│   Storage   │  ← Stores only encrypted file chunks
│ (Local/S3)  │
└─────────────┘
```

**Web Client** - React application that handles all encryption/decryption
client-side. Master password and CMK never leave the browser.

**API Server** - NestJS backend that manages authentication, metadata, and
encrypted file storage. Cannot decrypt user data.

**PostgreSQL** - Database for user accounts, encrypted metadata, and wrapped
encryption keys. All sensitive data is encrypted.

**Storage** - File system or S3-compatible storage for encrypted file chunks.
Only stores encrypted binary blobs.

**Key principle:** The server operator (even if it's you) cannot access user
files without their master password. This is enforced by cryptography, not
access controls.

## Technology Stack

### Backend

- **Framework**: NestJS with Fastify
- **Language**: TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js (Local + SSO via OIDC)
- **Storage**: Local filesystem or S3-compatible object storage

### Frontend

- **Framework**: React with Next.js 14
- **Language**: TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **State Management**: Zustand
- **Encryption**: WebCrypto API

## Encryption Architecture

**Zero-knowledge design:** All encryption happens client-side in the browser.
The server never has access to plaintext data, encryption keys, or master
passwords.

**Technical implementation:**

- Client-side encryption using WebCrypto API
- Server stores only encrypted blobs and wrapped keys
- All sensitive metadata encrypted in database JSONB columns
- No plaintext data ever transmitted or stored server-side

For detailed security model, threat analysis, and user-facing security
guarantees, see [Security](./security/).

### Key Hierarchy

```
Master Password (user input, never sent to server)
    │
    ├─► Argon2id KDF (runs in browser)
    │
    ▼ Password-Derived Key (used to encrypt CMK)
    |
Cryptographic Master Key (CMK - random 32 bytes)
    │ (wrapped with password-derived key, stored on server encrypted)
    │
    ├─► Identity Seed (random 32 bytes, encrypted with CMK)
    │   │
    │   ├─► Ed25519 Keypair (signKey - for signing operations)
    │   │
    │   └─► X25519 Keypair (encKey - for encryption/sharing)
    │
    ├─► Folder Key (per folder, encrypted with CMK or parent key)
    │       │
    │       └─► File Encryption Key (FEK, per file)
    │               │
    │               └─► Encrypted File Chunks (stored on server)
    │
    ├─► Recovery Key (optional, can decrypt CMK)
    │
    └─► Device Keys (X25519 keypair for WebAuthn unlock)
```

### Encryption Primitives

**Symmetric encryption**: XChaCha20-Poly1305  
**Key derivation**: Argon2id  
**Asymmetric crypto**: X25519 (device unlock, future sharing)  
**Hashing**: SHA-256

### What Gets Encrypted

Client-side before upload:

- File contents (chunked, each chunk encrypted separately)
- File names
- Folder names
- Tags and custom metadata
- File MIME types

Server stores only:

- Encrypted blobs
- Folder hierarchy (IDs and parent relationships)
- User accounts and roles
- Upload timestamps
- Storage quotas and usage

## Authentication Flow

### Local Authentication

```
1. User enters email + password
2. Server verifies credentials
3. Server issues session token
4. Client prompts for master password
5. Client derives CMK from master password (Argon2id)
6. CMK stored in memory (optionally encrypted in IndexedDB for auto-unlock)
```

**Auto-unlock feature (optional):** If enabled in settings, the CMK is encrypted
with a key derived from server nonce + client seed and stored in IndexedDB. This
allows seamless unlock across page reloads and new tabs for 15 minutes (until
server nonce rotates). The client seed is shared across tabs via
BroadcastChannel for cross-tab sync. See
[Auto-unlock](./security/cmk-unlock#3-auto-unlock-on-page-reload-optional) for
security implications.

**Two-layer protection:** Every API request requires a valid session token. Even
if the CMK is obtained (via XSS or device compromise), an attacker cannot make
API requests without a valid session. Both are required to access encrypted
data.

See [Security](./security/) for detailed security model and trade-offs.

### SSO/OIDC Flow

```
1. User clicks "Login with Google/GitHub"
2. Redirect to OIDC provider
3. Provider authenticates user
4. Callback with authorization code
5. Server exchanges code for tokens
6. Server creates/links user account
7. Session issued
8. Client prompts for master password (as above)
```

### Device Unlock (WebAuthn)

```
1. User registers device (Touch ID/Face ID/Windows Hello)
2. WebAuthn generates device keypair
3. CMK encrypted with device public key
4. On subsequent logins: WebAuthn challenge
5. Device private key decrypts CMK
6. User unlocked without typing master password
```

## File Upload Flow

```
1. User selects file(s) in web UI
2. Client generates random FEK (File Encryption Key)
3. Client encrypts FEK with Folder Key
4. Client chunks file (default 5MB chunks)
5. Each chunk encrypted with FEK using XChaCha20-Poly1305
6. Client uploads encrypted chunks to server
7. Server stores chunks without decrypting
8. Server stores encrypted metadata (filename, FEK)
9. Upload marked complete after all chunks uploaded
```

## File Download Flow

```
1. User requests file download
2. Client fetches encrypted metadata from server
3. Client decrypts FEK using Folder Key
4. Server streams encrypted chunks
5. Client decrypts each chunk with FEK
6. Decrypted data assembled in browser
7. File saved or displayed to user
```

## Database Schema

### Key Tables

**users** - User accounts, roles, encrypted CMK wrapper  
**sessions** - Active user sessions  
**folders** - Folder metadata (encrypted names, parent relationships)  
**files** - File metadata (encrypted names, size, chunks)  
**chunks** - Individual file chunks (encrypted blob references)  
**device_keys** - WebAuthn device credentials  
**storage_quota** - Per-user storage limits and usage

All sensitive metadata (names, tags) stored encrypted in JSONB columns.

## Folder Structure

Folders form a tree:

- Root folder per user (ID = null means root)
- Each folder has parent_id pointing to parent
- Folder keys encrypted with parent folder key or CMK
- Efficient traversal via recursive queries

### Server-Side Storage Structure

How encrypted files are physically stored on disk:

**Example:** User uploads `Documents/passport.pdf`

**What user sees:**

```
My Files/
  Documents/
    passport.pdf
```

**What's stored on server filesystem:**

```
/data/files/
  u-01H2K3M4N5P6Q7R8S9/           ← User ID (ULID)
    f-01H9X8W7V6U5T4S3R2/          ← File ID (ULID)
      chunk-0                      ← Encrypted chunk (binary)
      chunk-1                      ← Encrypted chunk (binary)
      chunk-2                      ← Encrypted chunk (binary)
```

**What's in the database:**

- File ID: `01H9X8W7V6U5T4S3R2` (visible)
- Encrypted filename: `xk9mP2...` (server cannot decrypt "passport.pdf")
- Encrypted folder name: `7hQ3z...` (server cannot decrypt "Documents")
- File size: `2.4 MB` (visible, for quota)
- Chunk count: `3` (visible)
- Encrypted FEK: `wrapped with folder key` (server cannot decrypt)

**Server sees:**

- Random file/folder IDs
- Encrypted binary chunks on disk
- File sizes and timestamps
- Parent-child folder relationships (structure, not names)

**Server CANNOT see:**

- Folder names ("Documents")
- File names ("passport.pdf")
- File contents

## Deployment Architecture

### Development

```
┌─────────────┐
│  Next.js    │ :3000
│  Dev Server │
└─────────────┘

┌─────────────┐
│  NestJS     │ :3331
│  Dev Server │
└─────────────┘

┌─────────────┐
│ PostgreSQL  │ :5432
└─────────────┘
```

### Production (Docker Compose)

```
        ┌────────────────┐
        │ Reverse Proxy  │
        │ (Nginx/Caddy)  │
        │   Port 443     │
        └────────┬───────┘
                 │
        ┌────────▼────────┐
        │  Agam Space API │
        │   (Container)   │
        │   Port 3331     │
        └────────┬────────┘
                 │
        ┌────────▼────────┐
        │   PostgreSQL    │
        │   (Container)   │
        └─────────────────┘
```

## Development Setup

See the repository README for local development setup instructions.

Key commands:

```bash
# Install dependencies
pnpm install

# Start dev servers
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## Contributing

Architecture decisions and major changes should be discussed in GitHub issues
before implementation. See CONTRIBUTING.md for guidelines.
