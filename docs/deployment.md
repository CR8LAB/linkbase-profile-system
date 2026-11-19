# JWT signing secret

The backend validates `JWT_SECRET` before it starts listening. Generate a fresh,
cryptographically random key for each environment. Do not reuse a key between
development, staging, and production, and do not expose it through a `VITE_`
frontend variable.

With Node.js installed, generate a 32-byte key in canonical base64url form:

```sh
node -e "process.stdout.write('base64url:' + require('node:crypto').randomBytes(32).toString('base64url') + '\n')"
```

Set the complete command output as the backend's `JWT_SECRET` secret environment
variable. The backend also accepts the explicit `hex:` prefix followed by an
even-length hexadecimal encoding of at least 32 decoded bytes. The prefix
removes ambiguity between encodings; unprefixed values are rejected. Never put
the generated key in source control, logs, or client-side configuration.

For an existing unprefixed key that is already at least 32 UTF-8 bytes and is
not a placeholder, the secret-management workflow can encode those exact UTF-8
bytes as unpadded base64url and prepend `base64url:`. This changes the
representation while preserving the HMAC key bytes, so existing JWT signatures
remain valid. Do not display or paste the value into logs or a terminal. If the
existing key is too short or is a placeholder, do not deploy this validation
change until a separately approved key rotation is planned.

Replacing the active key invalidates all JWTs signed with the previous key, so
users will need to sign in again. Coordinate key replacement across all backend
instances.

## Production URL configuration

Production frontend builds require `VITE_API_BASE_URL` and
`VITE_PUBLIC_APP_URL`. Set each to an HTTPS origin with no path, credentials,
query, or fragment. Production backend startup similarly requires
`PUBLIC_APP_URL` as an HTTPS origin and `FRONTEND_ORIGINS` as a comma-separated
list of explicit HTTPS origins. Wildcards and HTTP origins are rejected.
Development keeps its localhost HTTP defaults. The backend fails startup before
opening its listener if production URL configuration is missing or invalid.
