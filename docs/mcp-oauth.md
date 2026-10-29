# MCP OAuth 2.1

The builder is the OAuth authorization server for the MCP resource server. Discovery is served at `/.well-known/oauth-authorization-server` (and the OpenID-compatible alias `/.well-known/openid-configuration`). The authorization endpoint is `/oauth/authorize`; it forces the Better Auth MCP plugin's consent flow before forwarding to `/api/auth/mcp/authorize`. Tokens and dynamic client registration are provided by `/api/auth/mcp/token` and `/api/auth/mcp/register`.

The resource server publishes RFC 9728 metadata at `/.well-known/oauth-protected-resource` and challenges an unauthenticated MCP endpoint with `WWW-Authenticate: Bearer resource_metadata="..."`.

OAuth access tokens are opaque database-backed tokens and are stored in plaintext by Better Auth, like its session rows. Refresh grants retain old token rows, so expired refresh-token rows are purged daily. The Better Auth MCP plugin ignores stored consent rows; forcing `prompt=consent` is the only way to show the consent screen and must remain in place.

The public API accepts OAuth tokens only in `Authorization: Bearer`. Only workspace owners and `superAdmin` members can authorize OAuth access; synthetic platform-support sessions are rejected. When an account has multiple workspaces, callers must provide `x-workspace-id`; the MCP URL can carry the equivalent `?workspace_id=<id>`. The `GET /api/v1/token` introspection path enforces that workspace selection and returns the same token context as a workspace API token.

Set `CHATBOTX_MCP_PUBLIC_URL` in production. Otherwise the advertised protected-resource URL is derived from request headers, which may expose an internal host behind an incorrectly configured proxy.

OAuth uses the deployment's canonical builder URL. Reseller custom domains are intentionally outside this flow; reseller sub-accounts continue to use workspace API tokens.
