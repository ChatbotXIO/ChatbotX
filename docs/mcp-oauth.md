# MCP OAuth 2.1

The builder is the OAuth authorization server for the MCP resource server. Discovery is served at `/.well-known/oauth-authorization-server` (and the OpenID-compatible alias `/.well-known/openid-configuration`). The `/oauth/authorize` wrapper forwards to Better Auth's `/api/auth/oauth2/authorize`; token exchange and dynamic client registration use `/api/auth/oauth2/token` and `/api/auth/oauth2/register`.

The resource server publishes RFC 9728 metadata at `/.well-known/oauth-protected-resource`. Requests under `/mcp/*` advertise the canonical configured resource URL, `<builder-origin>/mcp`, rather than an endpoint-specific URL. Unauthenticated MCP endpoints challenge with `WWW-Authenticate: Bearer resource_metadata="..."`.

The provider issues JWT access tokens for the MCP resource with a five-minute lifetime. Refresh-token and consent rows remain database-backed. Revoking a client deletes its consent and refresh credentials immediately, blocking new and refreshed tokens; an already-issued access JWT can remain valid until its five-minute expiry.

The public API accepts OAuth tokens only in `Authorization: Bearer`. Only workspace owners and `superAdmin` members can authorize OAuth access; synthetic platform-support sessions are rejected. Consent binds a client to one workspace. Callers may repeat that workspace with `x-workspace-id` or the MCP URL's `?workspace_id=<id>`; a different workspace is forbidden. The `GET /api/v1/token` introspection path verifies the JWT audience and signature, enforces that workspace selection, and returns the same token context as a workspace API token.

Set `CHATBOTX_MCP_PUBLIC_URL` to the public builder origin in production. Otherwise the canonical `/mcp` resource URL is derived from request headers, which may expose an internal HTTP host behind an incorrectly configured proxy.

OAuth uses the deployment's canonical builder URL. Reseller custom domains are intentionally outside this flow; reseller sub-accounts continue to use workspace API tokens.

## Production topology

The load balancer MUST expose the builder's `/mcp/*` proxy publicly. The builder
serves RFC 9728 discovery at `/.well-known/oauth-protected-resource/mcp/*`;
that metadata and all issued access-token audiences use the single canonical
`<builder-origin>/mcp` resource URL. Set `CHATBOTX_MCP_PUBLIC_URL` to the public
builder origin so bearer challenges advertise HTTPS rather than an internal or
HTTP proxy URL.

Users can copy the current workspace URL and revoke their account-level OAuth
grants in **Settings → Integrations → ChatbotX MCP**. The grants page lists
consents, so a client with no live refresh token remains visible until revoked.
Revoking a client applies to every workspace the user administers, while an
already-issued access JWT remains valid for at most five minutes.
