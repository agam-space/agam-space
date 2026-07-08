---
sidebar_position: 6
---

# FAQ

## General

### What is Agam Space?

Self-hosted file storage with client-side encryption. Think Dropbox, but files
are encrypted on your device before upload and the server can't read them.

### Is it ready for production?

No. It's in beta. Works for personal use but expect bugs. Not recommended for
mission-critical data.

### Is it open source?

Yes. AGPL-3.0 license.

### Who made this?

Personal project by someone interested in security and self-hosting. Not a
company or large team.

## Features

### Can I share files with others?

Not yet. Sharing is planned but not implemented. Each user's data is isolated.

### Does it work on mobile?

The web UI is responsive and works on phones/tablets. It's also installable as a
Progressive Web App (PWA) - add it to your home screen for an app-like
experience with its own icon and no browser address bar. No native apps yet.

### What file types can I preview?

- PDF
- Images (JPEG, PNG, GIF, WebP)
- Text files (can also edit)

Video and audio preview planned.

### Is there a file size limit?

No hard limit, but large files (>5GB) may be slow. Browser memory constraints
apply.

### Can I sync files like Dropbox?

No automatic sync. You manually upload/download. Desktop sync client planned.

## Security

### How secure is it?

Files encrypted with XChaCha20-Poly1305 before upload. Standard, well-tested
cryptography. Server can't read your files.

**But:** Not professionally audited. Use at your own risk.

### What if I forget my master password?

Use your recovery key (displayed during setup and accessible in Settings).
Without recovery key or master password, your data is unrecoverable. This is
intentional.

### Can the admin read my files?

No. Even if you self-host and control the server, the encrypted data cannot be
decrypted without your master password.

### What if the server gets hacked?

Hackers get encrypted data they can't decrypt (assuming strong master password).
Your files remain safe.

### Is end-to-end encryption really necessary?

Depends on your threat model:

- **Useful if:** You don't trust server operator, concerned about server
  breaches
- **Overkill if:** You just want file storage and trust yourself/your server

Regular self-hosted solutions (Nextcloud without E2EE) are fine for many people.

## Installation

### What are the system requirements?

- 2GB RAM minimum
- 10GB+ disk (plus whatever storage you need for files)
- Docker and Docker Compose
- x86_64 or ARM64 CPU

### Can I use S3 for storage?

Yes. Set `STORAGE_BACKEND=s3` with your bucket and credentials. Works with AWS
S3 and S3-compatible providers (Cloudflare R2, MinIO, Backblaze B2). See
[Configuration Reference](./configuration/configuration-reference.md#storage-backend).

### How do I backup my data?

Backup the PostgreSQL database and your encrypted file storage - either the
`files/` directory (local backend) or your S3 bucket (S3 backend, via your
provider's own backup/replication tools). Encrypted files are useless without
the database (contains encryption metadata). See
[Backups](./installation/backups.md).

### Can I run it without Docker?

Technically yes, but not documented. Docker is the supported deployment method.

### Does it support LDAP/SSO?

Basic SSO support exists but not well-tested. LDAP not implemented.

## Usage

### How do I set storage quotas?

Via database query. Default is 10GB per user. See
[User Management](./configuration/user-management.md#storage-quotas) for SQL
examples.

### Can I use it as a team?

Multiple users work, but no collaboration features. Everyone has separate
encrypted storage. No sharing, no comments, no permissions.

### What happens to deleted files?

Moved to trash. Auto-deleted after 30 days. Can restore or manually empty trash.

### Can I access it from anywhere?

Yes, if exposed to internet with HTTPS (use reverse proxy). Or VPN/Tailscale for
private access.

## Comparison

### vs Nextcloud

**Nextcloud pros:**

- Mature, stable, well-documented
- Rich features (calendar, contacts, office)
- Active development, large community
- Professional support available

**Agam Space pros:**

- Simpler E2EE implementation
- Modern tech stack
- Lighter weight

Choose Nextcloud if you need a proven solution. Choose Agam Space if you're
tinkering.

### vs Seafile

**Seafile pros:**

- Faster for large files
- Desktop sync clients
- Stable and mature

**Agam Space pros:**

- Web-native (no client install needed)
- Simpler architecture

Seafile is probably better for most people.

### vs Ente/Mega

**Ente/Mega pros:**

- Managed service (no self-hosting)
- Mobile apps
- Photo-focused features (Ente)
- Actually tested by real users

**Agam Space pros:**

- Self-hosted (full control)
- No monthly fees

Use Ente if you want photos backed up easily. Use Agam Space if you like
tinkering with self-hosted stuff.

## Development

### Can I contribute?

Sure. It's open source. Check GitHub issues or open new ones.

### What's the tech stack?

- **Frontend:** Next.js (React), TypeScript, Web Crypto API
- **Backend:** NestJS, PostgreSQL, Drizzle ORM
- **Deployment:** Docker, Docker Compose
- **Crypto:** libsodium (via libsodium-wrappers)

### Why did you build this?

Existing E2EE file storage solutions had gaps. Wanted to learn modern E2EE
patterns. Scratching my own itch.

### What's next?

See the [Roadmap](./features/roadmap) for possible features under consideration.

No timeline commitments. Features built as time permits.

## Troubleshooting

### Files won't upload

- Check browser console for errors
- Verify storage quota not exceeded
- Check disk space on server
- Try smaller files first

### Can't unlock after login

- Verify master password is correct
- Check browser console for errors
- Try clearing browser cache
- Check if CMK setup completed successfully

### Slow performance

- Large files take time to encrypt/decrypt
- Check server resources (CPU, memory)
- Consider chunk size (configurable)
- Browser memory limits apply

### Docker container won't start

```bash
docker-compose logs
```

Common issues:

- Database connection failed (check credentials)
- Port already in use (change port)
- Volume permission issues (check ownership)

Still stuck? Open a GitHub issue with logs.
