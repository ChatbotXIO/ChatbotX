import type { IncomingMessage } from "node:http"
import { env } from "./env"
import { resolveHeaderValue } from "./http-headers"

// Keep in sync with MCP_OAUTH_SCOPES in packages/auth/src/mcp-config.ts;
// mcp-server does not depend on @chatbotx.io/auth.
const oauthScopes = ["openid", "profile", "email", "offline_access"]
export const protectedResourcePrefix = "/.well-known/oauth-protected-resource"
const apiPathSuffixPattern = /\/api\/?$/
const trailingSlashPattern = /\/$/

const resolveIssuer = () =>
  (
    env.CHATBOTX_MCP_OAUTH_ISSUER ??
    env.CHATBOTX_API_URL.replace(apiPathSuffixPattern, "")
  ).replace(trailingSlashPattern, "")

const resolvePublicOrigin = (req: IncomingMessage): string => {
  const publicUrl = env.CHATBOTX_MCP_PUBLIC_URL
  if (publicUrl) {
    return new URL(publicUrl).origin
  }

  const protocol =
    resolveHeaderValue(req.headers["x-forwarded-proto"]) || "http"
  const host =
    resolveHeaderValue(req.headers["x-forwarded-host"]) ||
    resolveHeaderValue(req.headers.host) ||
    "localhost"
  return `${protocol}://${host}`
}

const resolveMcpResourceUrl = (req: IncomingMessage): string =>
  new URL("/mcp", resolvePublicOrigin(req))
    .toString()
    .replace(trailingSlashPattern, "")

const resolveMetadataUrl = (req: IncomingMessage, pathSuffix: string): string =>
  new URL(pathSuffix, resolvePublicOrigin(req)).toString()

export const buildProtectedResourceMetadata = (req: IncomingMessage) => ({
  resource: resolveMcpResourceUrl(req),
  authorization_servers: [resolveIssuer()],
  scopes_supported: oauthScopes,
  bearer_methods_supported: ["header"],
})

export const buildWwwAuthenticate = (
  req: IncomingMessage,
  pathSuffix: string,
  error?: "invalid_token",
) => {
  const metadataPath = env.CHATBOTX_MCP_PUBLIC_URL
    ? `${protectedResourcePrefix}/mcp${pathSuffix}`
    : `${protectedResourcePrefix}${pathSuffix}`
  const metadataUrl = resolveMetadataUrl(req, metadataPath)
  const attributes = [`resource_metadata="${metadataUrl}"`]
  if (error) {
    attributes.unshift(
      'error_description="The supplied access token is invalid or expired"',
      `error="${error}"`,
    )
  }
  return `Bearer ${attributes.join(", ")}`
}
