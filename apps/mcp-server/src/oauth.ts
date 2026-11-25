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

/**
 * Connector profiles with their own path, OAuth resource and token audience
 * (`<origin>/mcp/<profile>`). Keep in sync with MCP_CONNECTOR_PROFILES in
 * packages/auth/src/keys.ts; mcp-server does not depend on @chatbotx.io/auth.
 */
export const CONNECTOR_PROFILES = ["openai", "claude"] as const

export type ConnectorProfile = (typeof CONNECTOR_PROFILES)[number]

export const resolveProfileResourceUrl = (
  req: IncomingMessage,
  profile: ConnectorProfile,
): string => `${resolveMcpResourceUrl(req)}/${profile}`

/**
 * Whether a verified token audience is a connector-profile resource
 * (`…/mcp/<profile>`). Matched on the URL path, not the request origin, so a
 * profile token is recognised whatever host the request arrived on.
 */
export const isConnectorProfileAudience = (audience: string): boolean => {
  let pathname: string
  try {
    pathname = new URL(audience).pathname.replace(trailingSlashPattern, "")
  } catch {
    return false
  }
  return CONNECTOR_PROFILES.some((profile) =>
    pathname.endsWith(`/mcp/${profile}`),
  )
}

/**
 * The `aud` claim of a JWT, read WITHOUT verifying it. Only for reject-only
 * decisions (e.g. refusing a profile token while introspection is down);
 * never grant access from it. Not a JWT, or no `aud`: an empty list.
 */
export const unverifiedJwtAudiences = (token: string): string[] => {
  const payload = token.split(".")[1]
  if (!payload) {
    return []
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { aud?: unknown }
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    return audiences.filter(
      (audience): audience is string => typeof audience === "string",
    )
  } catch {
    return []
  }
}

const isPathOrBelow = (pathname: string, base: string): boolean =>
  pathname === base || pathname.startsWith(`${base}/`)

/**
 * The connector profile a path belongs to, if any: its route below
 * `CHATBOTX_MCP_BASE_PATH` (`/claude`), or protected-resource metadata at or
 * below `/.well-known/oauth-protected-resource[/mcp]/<profile>` (matching the
 * builder's `resolveMcpResourceForPath`). Exact segments only, so a route
 * such as `/claude/x` is never mistaken for one.
 */
export const profileForPath = (
  pathname: string,
): ConnectorProfile | undefined =>
  CONNECTOR_PROFILES.find(
    (profile) =>
      pathname === `/${profile}` ||
      isPathOrBelow(pathname, `${protectedResourcePrefix}/${profile}`) ||
      isPathOrBelow(pathname, `${protectedResourcePrefix}/mcp/${profile}`),
  )

export const buildProtectedResourceMetadata = (
  req: IncomingMessage,
  pathname = "",
) => {
  const profile = profileForPath(pathname)
  return {
    resource: profile
      ? resolveProfileResourceUrl(req, profile)
      : resolveMcpResourceUrl(req),
    authorization_servers: [resolveIssuer()],
    scopes_supported: oauthScopes,
    bearer_methods_supported: ["header"],
  }
}

/**
 * The bearer challenge for a route below `CHATBOTX_MCP_BASE_PATH`
 * (`/messages`, `/sse`, `/claude`, `/openai`).
 */
export const buildWwwAuthenticate = (
  req: IncomingMessage,
  route: string,
  error?: "invalid_token",
) => {
  // A connector profile is always advertised at its exact public path.
  const profile = profileForPath(route)
  let metadataPath = `${protectedResourcePrefix}${env.CHATBOTX_MCP_BASE_PATH}${route}`
  if (profile) {
    metadataPath = `${protectedResourcePrefix}/mcp/${profile}`
  } else if (env.CHATBOTX_MCP_PUBLIC_URL) {
    metadataPath = `${protectedResourcePrefix}/mcp${route}`
  }
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
