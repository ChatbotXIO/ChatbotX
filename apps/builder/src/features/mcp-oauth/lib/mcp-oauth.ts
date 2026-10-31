import { MCP_OAUTH_SCOPES } from "@chatbotx.io/auth/mcp-config"
import { env } from "@/env"

const trailingSlash = /\/$/

export const mcpOAuthScopes = MCP_OAUTH_SCOPES

// Mirrors `getMcpResourceUrl` in `@chatbotx.io/auth` (the token audience), but
// reads the builder's validated env so pages and routes share one source.
export const getMcpPublicUrl = (): string =>
  (
    env.MCP_PUBLIC_URL ??
    new URL("/mcp", env.NEXT_PUBLIC_BUILDER_URL).toString()
  ).replace(trailingSlash, "")

export const getMcpPublicPath = (): string =>
  new URL(getMcpPublicUrl()).pathname.replace(trailingSlash, "")
