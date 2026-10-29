import type { McpOAuthGrant } from "@chatbotx.io/business"

export type McpOAuthGrantDto = {
  activeUntil: string | null
  clientIcon: string | null
  clientId: string
  clientName: string
  firstAuthorizedAt: string
  lastRefreshedAt: string | null
  scopes: string[]
}

const toHttpsIcon = (icon: string | null): string | null => {
  if (!icon) {
    return null
  }

  try {
    return new URL(icon).protocol === "https:" ? icon : null
  } catch {
    return null
  }
}

export const toMcpOAuthGrantDto = (grant: McpOAuthGrant): McpOAuthGrantDto => ({
  activeUntil: grant.activeUntil?.toISOString() ?? null,
  clientIcon: toHttpsIcon(grant.clientIcon),
  clientId: grant.clientId,
  clientName: grant.clientName,
  firstAuthorizedAt: grant.firstAuthorizedAt.toISOString(),
  lastRefreshedAt: grant.lastRefreshedAt?.toISOString() ?? null,
  scopes: grant.scopes,
})
