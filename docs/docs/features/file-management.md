# File Management

Upload, organize, preview, and manage your encrypted files.

## Upload

Drag and drop files or use the file picker to upload. Files are encrypted in
your browser before upload.

**Features:**

- Chunk-based upload (8MB chunks by default, configurable up to 32MB)
- Each chunk encrypted separately for better performance
- Parallel chunk encryption in browser
- Real-time progress tracking
- Drag-and-drop or file picker
- Multiple file selection

Large files are split into chunks and encrypted in parallel - faster uploads,
better memory usage, and automatic resume (future support) if your connection
drops.

## Download

Download single files or select multiple files for bulk download. Files are
decrypted in your browser after download.

**Features:**

- Chunks fetched and decrypted in browser
- Reassembled into original file
- Single file or bulk download
- Original filenames preserved

## Organization

Create folders to organize your files. Nested folders are supported with
unlimited depth.

**Features:**

- Create, rename, and delete folders
- Move files and folders between locations
- Nested folders (unlimited depth)
- Multi-select operations (move, delete multiple items at once)

Folder names are encrypted just like file names - the server cannot see your
folder structure.

## Preview

Preview files directly in your browser without downloading. Supported file
types:

- **PDF** - Full PDF viewer with page navigation
- **Images** - JPEG, PNG, GIF, WebP
- **Text** - Plain text files

Files are decrypted in memory for preview - they're never stored unencrypted on
disk.

## Trash

Deleted files and folders move to trash instead of being permanently deleted.

**Features:**

- Restore deleted items anytime before permanent deletion
- Empty trash manually to free up quota space immediately
- Auto-deletion: Items in trash older than the configured interval (default: 7
  days) are automatically moved to permanent deletion
- Configurable via `TRASH_CLEANUP_INTERVAL_DAYS` (range: 1-30 days)

Items in trash still count toward your storage quota until permanently deleted.

**How auto-deletion works:**

A background job runs every 5 minutes to clean up old trashed items. Items that
have been in trash longer than `TRASH_CLEANUP_INTERVAL_DAYS` are automatically
marked for permanent deletion and removed from the server.

## Public Sharing

Share files or folders with anyone via a link. Recipients don't need an account.

**How it works:**

1. Right-click any file or folder
2. Select "Share"
3. Set password (optional) and expiry (default 2 days)
4. Copy the share URL
5. Send URL to recipients

The URL contains an encryption key. Recipients need the full URL to decrypt
content.

**Managing shares:**

- View all shares in Settings → Public Shares
- Revoke shares anytime to invalidate the URL
- Expired shares automatically deleted

See [Public Sharing](./public-sharing.md) for details.

## Storage quotas

Each user has a storage quota that limits how much data they can upload.

**Features:**

- Per-user storage limits with real-time tracking
- Configurable quotas (including unlimited)
- Upload blocked when quota exceeded
- View current usage in settings

Admin can set quotas per user. See
[User Management](../configuration/user-management) for quota configuration.

## Storage backend

Files are stored encrypted using either the local server filesystem or an
S3-compatible object store, with an efficient directory/key structure shared
across both backends.

### Physical storage structure

Agam Space uses 2-level sharding to distribute files evenly across directories,
preventing any single folder from having too many files (which can slow down
filesystems).

**Directory structure:**

```
<FILES_DIR>/
  └── u-<userId>/
      └── f/
          └── <shard1>/
              └── <shard2>/
                  └── <fileId>/
                      ├── chunk-0
                      ├── chunk-1
                      └── chunk-2
```

**How sharding works:**

File IDs are ULIDs (unique, time-sortable identifiers). The last 16 characters
are random. Sharding uses:

- **shard1**: First character of the random part
- **shard2**: Next 2 characters of the random part

This creates up to 16 × 256 = 4,096 possible directories, distributing files
evenly even with millions of files.

**Example:**

For file ID `01JKB3XYZ9ABCD1234567890` (last 16 chars: `9ABCD1234567890`):

- shard1 = `9`
- shard2 = `AB`
- Path: `f/9/AB/01JKB3XYZ9ABCD1234567890/`

Inside this directory, chunks are stored as `chunk-0`, `chunk-1`, etc.

**Benefits:**

- No folder ever has more than a few thousand files
- Filesystem operations remain fast even with millions of files
- Works efficiently on all filesystems (ext4, NTFS, APFS, etc.)

### Current implementation

- Local filesystem storage (default) or S3-compatible object storage
  (`STORAGE_BACKEND=s3`), including AWS S3, Cloudflare R2, Garage, MinIO, and
  Backblaze B2
- Configurable storage path (local) or bucket/credentials/endpoint (S3)
- 2-level sharding for efficient file distribution, same key structure on both
  backends

See
[Configuration Reference](../configuration/configuration-reference#storage-backend)
for S3 setup.
