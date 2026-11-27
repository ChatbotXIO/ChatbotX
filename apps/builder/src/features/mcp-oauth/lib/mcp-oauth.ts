import {
  MCP_CONNECTOR_PROFILES,
  MCP_OAUTH_SCOPES,
} from "@chatbotx.io/auth/mcp-config"
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

/**
 * The OAuth resource a client must request for an MCP path. A connector
 * profile path (`/mcp/openai`, `/mcp/claude`, and anything under it) is its
 * own resource and token audience; every other `/mcp/*` path shares `/mcp`.
 * RFC 9728 clients require `resource` to match the URL they connect to.
 */
export const resolveMcpResourceForPath = (resourcePath: string): string => {
  const mcpUrl = getMcpPublicUrl()
  const mcpPath = getMcpPublicPath()
  const profile = MCP_CONNECTOR_PROFILES.find((candidate) => {
    const profilePath = `${mcpPath}/${candidate}`
    return (
      resourcePath === profilePath || resourcePath.startsWith(`${profilePath}/`)
    )
  })
  return profile ? `${mcpUrl}/${profile}` : mcpUrl
}
