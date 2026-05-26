---
sidebar_position: 2
---

# Single Sign-On

Configure SSO authentication with OIDC-compatible providers.

:::info Important

SSO only handles authentication. Encryption keys are still derived from your
master password, which you must set separately after first login.

:::

## Supported Providers

Any OIDC-compatible provider works:

- Authelia
- Authentik
- Keycloak
- Zitadel
- Google
- GitHub
- Microsoft
- Auth0

## SSO with Authelia

### Configure Authelia

Add Agam Space as a client in Authelia config (`configuration.yml`):

```yaml
identity_providers:
  oidc:
    clients:
      - id: agam-space
        description: Agam Space File Storage
        secret: your_random_secret_here_min_32_chars
        redirect_uris:
          - https://files.yourdomain.com/api/v1/auth/sso/oidc/callback
        scopes:
          - openid
          - email
          - profile
        grant_types:
          - authorization_code
        response_types:
          - code
```

Generate a secure secret:

```bash
openssl rand -base64 32
```

Restart Authelia:

```bash
docker-compose restart authelia
```

### Configure Agam Space

Add to your `docker-compose.yml`:

```yaml
agam:
  environment:
    # ...existing variables...

    # SSO Configuration
    SSO_ISSUER: 'https://auth.yourdomain.com'
    SSO_CLIENT_ID: 'agam-space'
    SSO_CLIENT_SECRET: 'your_random_secret_here_min_32_chars'
    SSO_REDIRECT_URI: 'https://files.yourdomain.com/api/v1/auth/sso/oidc/callback'
    SSO_AUTO_CREATE_USER: 'false'
    DOMAIN: 'https://files.yourdomain.com'
```

Restart Agam Space:

```bash
docker-compose restart agam
```

### Test SSO Login

1. Open Agam Space login page
2. Click **Sign in with SSO**
3. Redirects to Authelia
4. Login with Authelia credentials
5. Redirects back to Agam Space
6. First SSO login creates a new account
7. Set master password (still required for encryption)

## SSO with Authentik

### Create Provider in Authentik

1. Login to Authentik admin panel
2. Go to **Applications** → **Providers**
3. Click **Create** → **OAuth2/OpenID Provider**
4. Configure:
   - Name: `Agam Space`
   - Client type: `Confidential`
   - Redirect URIs: `https://files.yourdomain.com/api/v1/auth/sso/oidc/callback`
   - Scopes: `openid`, `email`, `profile`
5. Save and copy Client ID and Client Secret

### Create Application

1. Go to **Applications**
2. Click **Create**
3. Configure:
   - Name: `Agam Space`
   - Slug: `agam-space`
   - Provider: Select the provider created above
4. Save

### Configure Agam Space

```yaml
agam:
  environment:
    SSO_ISSUER: 'https://auth.yourdomain.com/application/o/agam-space/'
    SSO_CLIENT_ID: 'your-authentik-client-id'
    SSO_CLIENT_SECRET: 'your-authentik-client-secret'
    SSO_REDIRECT_URI: 'https://files.yourdomain.com/api/v1/auth/sso/oidc/callback'
    SSO_AUTO_CREATE_USER: 'false'
    DOMAIN: 'https://files.yourdomain.com'
```

## SSO with Keycloak

### Create Client

1. Login to Keycloak admin console
2. Select your realm
3. Go to **Clients** → **Create**
4. Configure:
   - Client ID: `agam-space`
   - Client Protocol: `openid-connect`
   - Root URL: `https://files.yourdomain.com`
5. Click **Save**

### Configure Client

1. Access Type: `confidential`
2. Valid Redirect URIs:
   `https://files.yourdomain.com/api/v1/auth/sso/oidc/callback`
3. Save
4. Go to **Credentials** tab and copy Client Secret

### Configure Agam Space

```yaml
agam:
  environment:
    SSO_ISSUER: 'https://keycloak.yourdomain.com/realms/your-realm'
    SSO_CLIENT_ID: 'agam-space'
    SSO_CLIENT_SECRET: 'your-keycloak-client-secret'
    SSO_REDIRECT_URI: 'https://files.yourdomain.com/api/v1/auth/sso/oidc/callback'
    SSO_AUTO_CREATE_USER: 'false'
    DOMAIN: 'https://files.yourdomain.com'
```

## Configuration Variables

See [Configuration Reference](../configuration/) for all SSO environment
variables.

## Disable Password Login (planned for future release)

To use SSO-only authentication:

```yaml
ALLOW_PASSWORD_LOGIN: 'false'
```

## Troubleshooting

**SSO button doesn't appear:**

- Check all required SSO variables are set (SSO_ISSUER, SSO_CLIENT_ID,
  SSO_CLIENT_SECRET, SSO_REDIRECT_URI)
- Restart Agam Space after adding variables
- Check browser console for errors

**Redirect URI mismatch:**

- Check callback URL matches exactly in SSO provider
- Must be: `https://files.yourdomain.com/api/v1/auth/sso/oidc/callback`
- HTTPS required (not http)

**Authentication failed:**

- Check client ID and secret are correct
- Verify SSO_ISSUER URL is correct
- Check SSO provider logs

**Still asks for master password:**

- This is normal! Master password encrypts your files
- SSO handles authentication, not encryption
