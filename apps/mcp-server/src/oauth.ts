import type { IncomingMessage } from "node:http"
import { env } from "./env"

const oauthScopes = ["openid", "profile", "email", "offline_access"]
const protectedResourcePath = "/.well-known/oauth-protected-resource"
const apiPathSuffixPattern = /\/api\/?$/
const trailingSlashPattern = /\/$/

export const resolveIssuer = () =>
  (
    env.CHATBOTX_MCP_OAUTH_ISSUER ??
    env.CHATBOTX_API_URL.replace(apiPathSuffixPattern, "")
  ).replace(trailingSlashPattern, "")

export const resolveResourceUrl = (
  req: IncomingMessage,
  pathSuffix: string,
) => {
  const publicUrl = env.CHATBOTX_MCP_PUBLIC_URL
  const protocol =
    resolveHeaderValue(req.headers["x-forwarded-proto"]) || "http"
  const host = resolveHeaderValue(req.headers.host) || "localhost"
  const origin = publicUrl ? new URL(publicUrl).origin : `${protocol}://${host}`
  return new URL(pathSuffix, origin).toString()
}

export const buildProtectedResourceMetadata = (
  req: IncomingMessage,
  pathSuffix: string,
) => ({
  resource: resolveResourceUrl(req, pathSuffix),
  authorization_servers: [resolveIssuer()],
  scopes_supported: oauthScopes,
  bearer_methods_supported: ["header"],
})

export const buildWwwAuthenticate = (
  req: IncomingMessage,
  pathSuffix: string,
  error?: "invalid_token",
) => {
  const metadataUrl = resolveResourceUrl(
    req,
    `${protectedResourcePath}${pathSuffix}`,
  )
  const attributes = [`resource_metadata="${metadataUrl}"`]
  if (error) {
    attributes.unshift(
      'error_description="The supplied access token is invalid or expired"',
      `error="${error}"`,
    )
  }
  return `Bearer ${attributes.join(", ")}`
}

const resolveHeaderValue = (value: string | string[] | undefined) => {
  if (typeof value === "string") {
    return value.trim()
  }
  return value?.find((item) => item.trim().length > 0)?.trim() ?? ""
}
