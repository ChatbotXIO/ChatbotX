import type { McpOptions } from "@better-auth/mcp"
import { getMcpResourceUrl } from "./keys"

export { getMcpResourceUrl } from "./keys"

/** Scopes the MCP OAuth provider advertises and grants to registered clients. */
export const MCP_OAUTH_SCOPES = ["openid", "profile", "email", "offline_access"]

const ACCESS_TOKEN_TTL_SECONDS = 300
const REFRESH_TOKEN_TTL_SECONDS = 2_592_000

type ResourceRequestContext = {
  path: string
  query?: Record<string, unknown>
  body?: Record<string, unknown>
}

const legacyMcpTransportPaths = ["/messages", "/sse"] as const

const hasResource = (params: Record<string, unknown> | undefined): boolean => {
  const value = params?.resource
  return Array.isArray(value) ? value.length > 0 : Boolean(value)
}

const getCanonicalMcpResource = (
  params: Record<string, unknown> | undefined,
  resource: string,
): string | undefined => {
  if (!hasResource(params)) {
    return resource
  }

  const requestedResource = params?.resource
  const isLegacyMcpEndpoint =
    typeof requestedResource === "string" &&
    legacyMcpTransportPaths.some(
      (path) => requestedResource === `${resource}${path}`,
    )

  return isLegacyMcpEndpoint ? resource : undefined
}

const withCanonicalMcpResource = (
  params: Record<string, unknown> | undefined,
  resource: string,
): Record<string, unknown> | undefined => {
  const canonicalResource = getCanonicalMcpResource(params, resource)
  return canonicalResource
    ? { ...params, resource: canonicalResource }
    : undefined
}

/**
 * Better Auth rejects explicit RFC 8707 resource values that are absent from
 * its configured targets. ChatGPT's legacy SSE connector sends the transport
 * URL, while this server registers the common `/mcp` resource. Canonicalize
 * only known first-party transport endpoints; all other client-provided
 * resources remain untouched and are still rejected by Better Auth.
 */
export const defaultMcpResource = (
  ctx: ResourceRequestContext,
  resource: string = getMcpResourceUrl(),
) => {
  if (ctx.path === "/oauth2/authorize") {
    const query = withCanonicalMcpResource(ctx.query, resource)
    return query ? { context: { query } } : undefined
  }

  if (ctx.path === "/oauth2/token") {
    const body = withCanonicalMcpResource(ctx.body, resource)
    return body ? { context: { body } } : undefined
  }
  return
}

/**
 * Options for Better Auth's `mcp()` plugin. Shared by `createAuth` and the
 * schema-parity test so the test always validates the production table set.
 */
export const buildMcpPluginOptions = (
  resource: string = getMcpResourceUrl(),
): McpOptions => ({
  accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
  allowDynamicClientRegistration: true,
  allowUnauthenticatedClientRegistration: true,
  clientRegistrationDefaultApplicationType: "infer",
  clientRegistrationDefaultResources: [resource],
  clientRegistrationDefaultScopes: [...MCP_OAUTH_SCOPES],
  consentPage: "/oauth/consent",
  enforcePerClientResources: false,
  grantTypes: ["authorization_code", "refresh_token"],
  loginPage: "/oauth/sign-in",
  refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
  resource,
})
