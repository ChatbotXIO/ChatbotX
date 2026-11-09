# Mobile app authentication

The native mobile app signs in through the better-auth plugin `mobileAuth()`
(`packages/auth/src/mobile-auth.ts`). No browser session is ever kept: the app
holds a 10-minute access JWT (audience `<builder>/api`) and a rotating,
hashed-at-rest refresh token.

`POST /api/auth/mobile/token` takes one of four grants and always answers with
the same `MobileTokenResponse`:

| `grantType`     | Used for                                                       |
| --------------- | -------------------------------------------------------------- |
| `password`      | Email + password                                               |
| `exchange_code` | End of the browser social flow (Google/Facebook), PKCE         |
| `refresh_token` | Rotating a refresh token                                       |
| `id_token`      | Native provider sign-in (today: Sign in with Apple on iOS)     |

## Sign in with Apple (iOS)

App Store guideline 4.8 requires it once the app offers Google/Facebook login.
The flow is native: `ASAuthorizationAppleIDProvider` returns an `identityToken`
(a JWT signed by Apple, `aud` = the app's bundle ID) and the server only
verifies it. There is no redirect and no client secret (.p8 key).

### Configuration

```bash
# Comma-separated iOS bundle IDs; each white-label brand has its own.
APPLE_APP_BUNDLE_IDS=com.example.brand-a,com.example.brand-b
```

Unset (or blank) disables the grant: the endpoint answers
`404 PROVIDER_NOT_ENABLED`. The Apple provider is registered on the default
auth instance only. It is deliberately not part of `SOCIAL_PROVIDERS`, so there
is no per-tenant credential, no web button and no callback relay for Apple.

### Request

```http
POST /api/auth/mobile/token
Content-Type: application/json

{
  "grantType": "id_token",
  "provider": "apple",
  "idToken": "<ASAuthorizationAppleIDCredential.identityToken>",
  "nonce": "<raw nonce>",
  "user": { "name": { "firstName": "Ada", "lastName": "Lovelace" } },
  "deviceId": "<optional install id>"
}
```

- **`nonce`**: generate a random string, send `SHA256(nonce)` to Apple in the
  authorization request and the **raw** `nonce` here. The server accepts the
  token's `nonce` claim when it equals the raw value or its SHA-256 hex. The
  field is optional in the API, but without it the server cannot detect a
  replayed identity token (valid for one hour), so the app should always send it.
- **`user.name`**: Apple returns the name only on the very first authorization
  for an app. Send it in that same call; it cannot be fetched later.
- **`deviceId`**: optional; generated when omitted, as for the other grants.

### Response

`200` with the same body as the `password` grant (`tokenType`, `accessToken`,
`expiresIn`, `expiresAt`, `refreshToken`, `refreshTokenExpiresAt`, `deviceId`,
`mustChangePassword`). Store it the same way.

| Status | `code`                | Meaning                                                         |
| ------ | --------------------- | --------------------------------------------------------------- |
| 400    | (validation)          | Unsupported `provider`, missing or oversized `idToken`          |
| 401    | `INVALID_ID_TOKEN`    | Bad signature, issuer, audience, expiry or nonce; no email/sub  |
| 401    | `OAUTH_LINK_ERROR`    | Account could not be linked or created                          |
| 403    | `FORBIDDEN`           | Signup is disabled (`AUTH_DISABLE_SIGNUP`) and the user is new  |
| 404    | `PROVIDER_NOT_ENABLED`| `APPLE_APP_BUNDLE_IDS` is not configured                        |

### What the server does

`authenticateWithIdToken` mirrors the id-token branch of better-auth's
`signInSocial`:

1. `verifyProviderIdToken` checks the signature against Apple's JWKS, the
   issuer (`https://appleid.apple.com`), `aud` in `APPLE_APP_BUNDLE_IDS`, an
   age of at most one hour, and the nonce.
2. `provider.getUserInfo` reads the profile (email, name, `email_verified`,
   which Apple sends as a boolean or the string `"true"`).
3. `handleOAuthUserInfo` creates or links the user, so everything a web social
   sign-in gets applies: account linking (`apple` is a trusted provider), the
   signup gate, `claimUnverifiedAccountBeforeLink`, the bootstrap `UserQuota`
   row and tenant stamping. The tenant comes from the `x-domain` header, as for
   every other `/api/auth/*` call.
4. The browser session that call creates is deleted again, then a refresh token
   is issued and the token response is built.

Placeholder accounts (an unverified local user with the same email) can be
claimed by Apple only when the identity token attests `email_verified`
(`packages/auth/src/claim-unverified-account.ts`). That removes the
placeholder's earlier logins and sessions, as for Google.

### Rate limiting

The builder-level password throttle (`password-grant-rate-limit.ts`) lets
`id_token` through untouched because the grant carries no password. The
better-auth rate limit on `/mobile/token` (3 requests per 10 seconds per IP)
still applies.

### Not covered

- **Web Sign in with Apple** and per-tenant Apple credentials. They would need a
  Services ID and a .p8 key, and could be added later through
  `platformCredentialService` like Google.
- **Token revocation on account deletion.** App Store guideline 5.1.1(v)
  expects the app to revoke the Apple token via `appleid.apple.com/auth/revoke`
  when a user deletes their account. That needs the .p8 key and the
  `authorizationCode`, so it is a follow-up if the app offers account deletion.
