---
sidebar_position: 1
slug: /
---

# Introduction

Agam Space is a self-hosted, **zero-knowledge**, end-to-end encrypted file
storage platform.

**Zero-knowledge means:**

- Your master password never leaves your device
- All encryption happens in your browser before upload
- The server stores only encrypted data - it cannot decrypt your files
- Even the server admin cannot access your data
- File names, folder names, and all metadata are encrypted

:::info

Understanding zero-knowledge and the trust model helps you make informed
decisions. Read the [trust model](./security/trust-model) before trying.

:::

Think of it as a self-hosted alternative to Mega or Proton Drive - encrypted
cloud storage you control, with true privacy guaranteed by cryptography, not
trust.

Built for users who want control over their data without sacrificing privacy,
and to share storage with family and friends without invading theirs.

**About the name:** Agam (அகம்) comes from Tamil language and refers to the
inner, personal world, distinct from what is public. It reflects our commitment
to keeping your data private and encrypted.

![Agam Space](/img/hero.png)

## Current status

:::danger Early Development Warning

Agam Space is in early beta and **not ready for production use**. Bugs and data
loss are possible.

**Do not use as your only backup.** Keep copies of important files elsewhere.
Once stable, this warning will be removed.

:::

Agam Space is in **beta** stage and under active development. Core features work
but expect bugs and breaking changes.

**What works:**

- File upload/download with client-side encryption
- Folder organization
- File previews (PDF, images, text)
- Trash bin (30-day retention)
- WebAuthn device unlock
- Storage quota enforcement
- Public sharing — share files or folders via a link (no account needed)
- SSO via OIDC (Authelia, Authentik, Keycloak, etc.)
- Invite codes for controlled user registration

**Known limitations:**

- No mobile apps (web UI is responsive)
- No file versioning
- Local storage only (no S3 yet)

## Why Agam Space?

**The E2EE gap in self-hosted storage**

True end-to-end encryption is rare in the self-hosted space. Nextcloud has E2EE
but its broken and has no promising future. Most other popular solutions
(ownCloud, FileRun, Pydio) don't offer it at all.

The usual workaround? Full-disk encryption on the server. But that only protects
against physical theft - not compromised servers, rogue admins, or anyone with
root access. Your files are still readable to anyone who can access the running
system.

**Personal motivation**

With over a decade in software development and a strong interest in application
security and architecture, I wanted to build something real. Have fun solving
hard problems.

**Sharing with family and friends**

I've always wanted to offer file storage to family and friends on my homelab,
but hesitated. Without true privacy, it felt wrong - I could technically access
their files. They knew it too, which made them hesitant to use it.

Projects like Ente Photos showed this works - you can run a service for people
you care about while respecting their privacy. That motivated me to build Agam
Space. Now I can offer storage to family and friends where even I can't read
their files.

## What Agam Space is Not

**Not a photo backup solution**  
Looking for E2EE photo storage? Check out [Ente](https://ente.io) -
purpose-built for photos with mobile apps, face recognition, and automatic
backups. It's awesome.

**Not a general file browser or server file manager**  
Need to browse server files, share drives, or manage media on your server? Try
[FileBrowser](https://github.com/filebrowser/filebrowser) or
[FileGator](https://filegator.io) - excellent for accessing and sharing your
server's filesystem.

**Not a feature-rich platform**  
Need calendar, contacts, office suite, and extensive integrations? Try
[Nextcloud](https://nextcloud.com) - mature, feature-rich, and well-supported.
It's great if you want Dropbox/Google Drive features without the encryption
overhead.

Agam Space is specifically for **private encrypted storage** where even the
server admin can't read your files.

## How it works

1. **Sign up** - First user becomes admin
2. **Set master password** - Creates your Cryptographic Master Key (CMK)
3. **Save recovery key** - One-time backup to recover your CMK
4. **Upload files** - Encrypted in browser before upload
5. **Access anywhere** - Unlock with master password or biometric on trusted
   devices

Your master password is used once to derive your CMK and never leaves your
device. The server only sees encrypted data.

## Next steps

✨ **[Features](./features)** - What Agam Space can do

🚀 **[Quick Start](./quick-start)** - Get running in 5 minutes

📖 **[Installation](./installation)** - Production setup guide

🔒 **[Security](./security)** - How encryption works

🏗️ **[Architecture](./architecture)** - Technical deep dive
