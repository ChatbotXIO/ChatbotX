# MCP OAuth 2.1

The builder is the OAuth authorization server for the MCP resource server. Discovery is served at `/.well-known/oauth-authorization-server` (and the OpenID-compatible alias `/.well-known/openid-configuration`). Discovery advertises Better Auth's `/api/auth/oauth2/authorize`, `/api/auth/oauth2/token` and `/api/auth/oauth2/register` directly. The first authorization shows the consent screen at `/oauth/consent`, where the workspace is chosen; later authorizations reuse the stored consent and its workspace. `/oauth/sign-in` sends the user back to the authorize endpoint after login.

The resource server publishes RFC 9728 metadata at `/.well-known/oauth-protected-resource`. Requests under `/mcp/*` advertise the canonical configured resource URL, `<builder-origin>/mcp`, rather than an endpoint-specific URL. Unauthenticated MCP endpoints challenge with `WWW-Authenticate: Bearer resource_metadata="..."`.

The provider issues JWT access tokens for the MCP resource with a five-minute lifetime. Refresh-token and consent rows remain database-backed. Revoking a client deletes its consent and refresh credentials immediately. The public API rejects the client's access JWT on the next request because it requires a live consent; only the MCP server's introspection cache can keep an already-issued token usable, for at most its five-minute expiry.

The public API accepts OAuth tokens only in `Authorization: Bearer`. Only workspace owners and `superAdmin` members can authorize OAuth access; synthetic platform-support sessions are rejected. Consent binds a client to one workspace. Callers may repeat that workspace with `x-workspace-id` or the MCP URL's `?workspace_id=<id>`; a different workspace is forbidden. The `GET /api/v1/token` introspection path verifies the JWT audience and signature, enforces that workspace selection, and returns the same token context as a workspace API token.

Two variables describe the same resource URL and must agree:

- Builder `MCP_PUBLIC_URL` is the full resource URL, defaulting to `<NEXT_PUBLIC_BUILDER_URL>/mcp`. It is the `aud` of every issued access token and the `resource` in the builder's protected-resource metadata.
- MCP server `CHATBOTX_MCP_PUBLIC_URL` is the public origin only; the server appends `/mcp` to advertise its resource. Without it, the origin is derived from request headers, which may expose an internal HTTP host behind an incorrectly configured proxy, so set it in production.

Keep `MCP_PUBLIC_URL` equal to `<CHATBOTX_MCP_PUBLIC_URL origin>/mcp`. If they differ, clients request a resource the tokens are not issued for, and every request is rejected with 401 after an otherwise successful OAuth flow.

OAuth uses the deployment's canonical builder URL. Reseller custom domains are intentionally outside this flow; reseller sub-accounts continue to use workspace API tokens.

## Better Auth 1.7 deployment

The authorization-server issuer is the canonical builder origin (for example,
`https://app.chatbotx.io`); discovery metadata and issued access tokens use
that same issuer. MCP clients should send the RFC 8707 `resource` parameter
with the canonical MCP resource URL. The authorization server supplies it for
legacy clients that omit it because this deployment has exactly one resource.

Deploy this upgrade in a maintenance window. Magic links issued in the previous
five minutes, OAuth state issued in the previous ten minutes, and existing MCP
OAuth access tokens are invalidated by the schema and token-format change.
Clients must authorize again. Confidential clients migrated from
`client_secret_post` must register again because the migration assigns
`client_secret_basic`; do not modify the applied migration.

If the OIDC provider never echoes the ID-token nonce, set
`AUTH_OAUTH_DISABLE_NONCE_BINDING=true` (weakens replay protection). Sign-out
stays local; the provider's `end_session_endpoint` is not followed.

If the MCP resource is not HTTPS (and not loopback), the builder now fails at
startup with a clear error instead of issuing unusable tokens. If the JWKS
endpoint is unreachable, MCP calls return 503 rather than 500.

Generic OIDC providers must update their registered redirect URI to
`<broker-origin>/api/auth/callback/oidc`. MCP resources must use HTTPS except
on loopback hosts during local development.

## Production topology

The load balancer MUST expose the builder's `/mcp/*` proxy publicly. The builder
serves RFC 9728 discovery at `/.well-known/oauth-protected-resource/mcp/*`;
that metadata and all issued access-token audiences use the single canonical
`MCP_PUBLIC_URL` resource (default `<builder-origin>/mcp`). Set the MCP server's
`CHATBOTX_MCP_PUBLIC_URL` to the same public origin so bearer challenges
advertise HTTPS rather than an internal or HTTP proxy URL.

Connector profiles have their own resource and token audience:
`<MCP_PUBLIC_URL>/openai` (ChatGPT, Codex) and `<MCP_PUBLIC_URL>/claude` (the
Claude directory connector and plugin). Their `OAuthResource` rows are seeded
from `buildMcpPluginOptions` (`resources`); a resource without a row fails
authorize and token requests with `invalid_target`. Protected-resource
metadata for `/mcp/openai` and `/mcp/claude` (and paths under them) names that
exact resource, because RFC 9728 clients require it to match the URL they
connect to. A profile token never authenticates `/mcp/messages` or another
profile. Add a profile to `MCP_CONNECTOR_PROFILES` in
`packages/auth/src/keys.ts` and `CONNECTOR_PROFILES` in
`apps/mcp-server/src/oauth.ts` together.

For an OpenAI Plugin directory submission, the builder also serves the portal's
exact domain-verification token as uncached plain text at
`/.well-known/openai-apps-challenge`. Set the server-only
`OPENAI_APPS_DOMAIN_CHALLENGE` variable to the token supplied by the portal;
the production URL is `https://app.chatbotx.io/.well-known/openai-apps-challenge`.
A white-label domain never serves it (404).

An access token must carry exactly one MCP audience: a token minted for
several MCP resources at once is rejected, so a profile token can never
authenticate `/mcp/messages` and the reverse. While token introspection is
unavailable, `/mcp/messages` still fails open for API keys but reads a JWT's
unverified `aud` and refuses a connector-profile token (reject-only).

Users can copy the connection URLs and revoke their account-level OAuth
grants in **Settings → Integrations → MCP connector**
(`/space/<id>/settings/integrations/mcp`; the old `chatbotx-mcp` slug
redirects). On a white-label domain the page shows a "not available on this
domain" notice instead of connect URLs, because the MCP endpoint and its OAuth
sign-in are on the platform host only; the grants list stays. The grants page lists
consents, so a client with no live refresh token remains visible until revoked.
Revoking a client applies to every workspace the user administers, while the
MCP server's introspection cache can keep an already-issued access JWT usable for at most five minutes.
