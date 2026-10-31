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

const hasResource = (params: Record<string, unknown> | undefined): boolean => {
  const value = params?.resource
  return Array.isArray(value) ? value.length > 0 : Boolean(value)
}

/**
 * Better Auth `hooks.before` helper: a client that omits the RFC 8707
 * `resource` parameter would receive an opaque access token the MCP resource
 * server cannot verify. This deployment has exactly one resource, so default
 * it on `/oauth2/authorize` (query) and `/oauth2/token` (body).
 */
export const defaultMcpResource = (
  ctx: ResourceRequestContext,
  resource: string = getMcpResourceUrl(),
) => {
  if (ctx.path === "/oauth2/authorize" && !hasResource(ctx.query)) {
    return { context: { query: { ...ctx.query, resource } } }
  }
  if (ctx.path === "/oauth2/token" && !hasResource(ctx.body)) {
    return { context: { body: { ...ctx.body, resource } } }
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
