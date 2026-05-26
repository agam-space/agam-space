---
sidebar_position: 7
---

# User Management

Manage users, configure storage quotas, and control user access through the
admin panel.

## Admin Panel

Access the admin panel at `/admin` (requires admin role).

### User List

View all users with:

- User Details
- Account status (Active/Disabled)
- Current storage usage and quota

### User Actions

**Manage Storage Quota:**

- Click on a user's quota to edit it
- Set custom quota or unlimited
- Changes apply immediately

**Change User Status:**

- **Disable User:** Prevents login while preserving all data
  - User cannot log in
  - Existing sessions are terminated
  - All data remains intact
  - Can be re-enabled later
- **Delete User:** User is deleted and cannot log in
  - User is marked as deleted
  - All sessions terminated immediately
  - All data remains intact

:::info Planned Feature

For deleted users, automatic data deletion after a grace period is planned for
future releases.

:::

## Add New Users

### Option 1: Enable Public Signup

Enable signups temporarily:

```yaml
ALLOW_NEW_SIGNUP: 'true'
```

Restart:

```bash
docker-compose restart agam
```

Share signup link: `https://files.yourdomain.com/signup`

After signup, disable it:

```yaml
ALLOW_NEW_SIGNUP: 'false'
docker-compose restart agam
```

### Option 2: SSO Auto-Create

Enable SSO and set auto-create:

```yaml
SSO_ISSUER: 'https://auth.yourdomain.com'
SSO_CLIENT_ID: 'agam-space'
SSO_CLIENT_SECRET: 'your-secret'
SSO_REDIRECT_URI: 'https://files.yourdomain.com/api/v1/auth/sso/oidc/callback'
SSO_AUTO_CREATE_USER: 'true'
```

Users logging in via SSO will automatically have accounts created.

See [SSO Configuration](./sso.md) for detailed setup.

### Option 3: Invite Codes

Create invite codes from the admin panel to control user registration:

1. Navigate to `/admin` → **Invite Codes**
2. Click **Create Invite Code**
3. Configure options:
   - **Email** (optional) - Pre-assign to specific email
   - **Max Uses** - How many times the code can be used
   - **Expiration** (optional) - When the code expires
4. Share the invite URL with new users

When `ALLOW_NEW_SIGNUP` is disabled, users must provide a valid invite code to
register.

## Storage Quotas

Default quota: 10GB per user (configurable via `DEFAULT_USER_STORAGE_QUOTA`)

### Using Admin Panel

Navigate to `/admin` and click on any user's quota to edit it. You can set a
custom quota or mark it as unlimited.

### Using Database (Alternative)

View quotas:

```bash
docker exec -it agam-space-postgres-1 psql -U postgres -d agam_space -c \
  "SELECT username, storage_quota, storage_used FROM users;"
```

Set custom quota:

```bash
docker exec -it agam-space-postgres-1 psql -U postgres -d agam_space -c \
  "UPDATE users SET storage_quota = 53687091200 WHERE username = 'john';"
```

Common quota values (in bytes):

- 50GB: `53687091200`
- 100GB: `107374182400`
- 1TB: `1099511627776`

Set unlimited quota:

```bash
docker exec -it agam-space-postgres-1 psql -U postgres -d agam_space -c \
  "UPDATE users SET storage_quota = NULL WHERE username = 'john';"
```

## User Status Management

### Disable User (Temporary)

Navigate to `/admin`, find the user, and click "Actions" → "Disable". User
cannot log in, but data is preserved.

### Re-enable User

Navigate to `/admin`, find the disabled user, and click "Actions" → "Activate".

### Delete User

Navigate to `/admin`, find the user, click "Actions" → "Delete", and confirm.
User is marked as deleted and cannot log in.

## Monitor Storage Usage

**Via Admin Panel:**

View real-time storage usage in the user list at `/admin`.

**Via Database:**

```bash
docker exec -it agam-space-postgres-1 psql -U postgres -d agam_space -c \
  "SELECT username,
          pg_size_pretty(storage_used::bigint) as used,
          pg_size_pretty(storage_quota::bigint) as quota,
          status
   FROM users
   ORDER BY storage_used DESC;"
```

## User Roles

Agam Space has three roles:

- **Owner:** The first user to register. Full admin access and cannot be deleted
  or demoted.
- **Admin:** Users promoted by the Owner. Can manage users, quotas, and invite
  codes.
- **User:** Standard user access to their own encrypted storage.

## Best Practices

1. **Disable instead of delete** for temporary access removal
2. **Set appropriate quotas** based on user needs and available storage
3. **Monitor storage usage** regularly to prevent quota issues
4. **Use SSO** for centralized user management in organizations
5. **Keep admin accounts secure** with strong passwords and 2FA (via SSO)

## Troubleshooting

### User Cannot Upload Files

Check if the user has reached their quota limit in the admin panel and increase
it if needed.

### Disabled User Still Has Access

Existing sessions may still be active. The user will be logged out on next
request or when they try to access protected resources.

### Deleted User Data Not Removed

Deleted users are marked as deleted in the database, but their encrypted data
remains on the server. To permanently remove user data, you must manually delete
their files from the storage directory. Automatic cleanup will be added in a
future release.
