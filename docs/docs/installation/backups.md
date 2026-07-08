---
sidebar_position: 2
---

# Backups

How to back up and restore your Agam Space data.

## What to back up

Two things, both required:

- **PostgreSQL database** - user accounts, file metadata, folder structure, and
  the encrypted key envelopes
- **Your encrypted file chunks** - `./data/files` on disk if using the local
  storage backend, or your S3 bucket if using
  [`STORAGE_BACKEND=s3`](../configuration/configuration-reference.md#storage-backend)

You can skip `./data/cache` and `./data/logs` - they're regenerated
automatically.

**Important:** the database and files are useless without each other. The
database holds the encrypted keys; the files hold the encrypted data. Back up
both.

The files are already encrypted client-side - you can copy them using any method
you like without any extra encryption step, whether they're on disk or in a
bucket.

If you're using the S3 backend, skip the "Back up the files" and "Restore the
files" sections below and instead rely on your S3 provider's own backup
mechanism (e.g. S3 versioning, cross-region replication, or a scheduled
`aws s3 sync`/`rclone sync` to a second bucket).

## Back up the database

```bash
docker exec agam-space-postgres-1 pg_dump -U postgres agam_space > backup.sql
```

If you're not sure of your Postgres container name:

```bash
docker ps --format '{{.Names}}' | grep postgres
```

## Back up the files

Copy `./data/files` however you prefer - `cp`, `rsync`, cloud storage, etc.

```bash
rsync -a ./data/files/ /your/backup/location/files/
```

## Restore

Stop the containers:

```bash
docker-compose down
```

Start Postgres and restore the database:

```bash
docker-compose up -d postgres
sleep 5
cat backup.sql | docker exec -i agam-space-postgres-1 psql -U postgres agam_space
```

Restore the files:

```bash
rm -rf ./data/files
cp -r /your/backup/location/files ./data/files
chown -R 1000:1000 ./data/files
```

Update the UID:GID to match the `user:` field in your `docker-compose.yml`.

Start everything:

```bash
docker-compose up -d
```

## Next Steps

🔧 **[Configuration Reference](../configuration/configuration-reference.md)** -
All environment variables and config options
