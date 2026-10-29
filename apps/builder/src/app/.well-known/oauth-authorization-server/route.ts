import { env } from "@/env"
import { mcpOAuthScopes } from "@/features/mcp-oauth/lib/oauth-metadata"

// Better Auth's oAuthDiscoveryMetadata advertises /mcp/jwks and /mcp/userinfo,
// but the MCP plugin does not serve either endpoint.

export const GET = () =>
  Response.json(
    {
      issuer: env.BETTER_AUTH_URL,
      authorization_endpoint: `${env.BETTER_AUTH_URL}/oauth/authorize`,
      token_endpoint: `${env.BETTER_AUTH_URL}/api/auth/mcp/token`,
      registration_endpoint: `${env.BETTER_AUTH_URL}/api/auth/mcp/register`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: [
        "client_secret_basic",
        "client_secret_post",
        "none",
      ],
      scopes_supported: mcpOAuthScopes,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    },
  )
