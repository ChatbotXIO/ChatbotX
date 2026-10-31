import type { McpOptions } from "@better-auth/mcp"
import { getMcpResourceUrl } from "./keys"

export { getMcpResourceUrl } from "./keys"

/** Scopes the MCP OAuth provider advertises and grants to registered clients. */
export const MCP_OAUTH_SCOPES = ["openid", "profile", "email", "offline_access"]

const ACCESS_TOKEN_TTL_SECONDS = 300
const REFRESH_TOKEN_TTL_SECONDS = 2_592_000

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
  loginPage: "/oauth/sign-in",
  refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
  resource,
})
