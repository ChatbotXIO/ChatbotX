import type { OrganizationModel } from "@chatbotx.io/database/types"

export type OrganizationUrls = {
  appUrl: string
  wsUrl: string
  assetUrl: string
}

const requireDomain = (org: OrganizationModel): string => {
  if (!org.domain) {
    throw new Error(
      `Organization "${org.id}" has no domain configured; cannot derive URLs`,
    )
  }
  return org.domain
}

/**
 * Resolve the public-facing URLs for an organization.
 * Each field falls back to a subdomain of `organization.domain` when not set
 * explicitly:
 *   appUrl   ← https://app.<domain>
 *   wsUrl    ← https://ws.<domain>
 *   assetUrl ← https://assets.<domain>
 */
export const getOrganizationUrls = (
  org: OrganizationModel,
): OrganizationUrls => ({
  appUrl: org.appUrl ?? `https://app.${requireDomain(org)}`,
  wsUrl: org.wsUrl ?? `https://ws.${requireDomain(org)}`,
  assetUrl: org.assetUrl ?? `https://assets.${requireDomain(org)}`,
})
