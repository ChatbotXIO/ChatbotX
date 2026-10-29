import type { McpOAuthGrant } from "@chatbotx.io/business"

export type McpOAuthGrantDto = Omit<
  McpOAuthGrant,
  | "firstAuthorizedAt"
  | "lastRefreshedAt"
  | "accessTokenExpiresAt"
  | "refreshTokenExpiresAt"
> & {
  firstAuthorizedAt: string
  lastRefreshedAt: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
}

export const toMcpOAuthGrantDto = (grant: McpOAuthGrant): McpOAuthGrantDto => ({
  ...grant,
  firstAuthorizedAt: grant.firstAuthorizedAt.toISOString(),
  lastRefreshedAt: grant.lastRefreshedAt.toISOString(),
  accessTokenExpiresAt: grant.accessTokenExpiresAt.toISOString(),
  refreshTokenExpiresAt: grant.refreshTokenExpiresAt.toISOString(),
})
