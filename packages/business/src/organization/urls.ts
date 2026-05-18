import type { OrganizationModel } from "@chatbotx.io/database/types"
import type { PlatformSettings } from "../platform"

const requireDomain = (org: OrganizationModel): string => {
  if (!org.domain) {
    throw new Error(
      `Organization "${org.id}" has no domain configured; cannot derive URLs`,
    )
  }
  return org.domain
}

/**
 * Resolve the info and public-facing URLs for an organization.
 * Each field falls back to a subdomain of `organization.domain` when not set
 * explicitly:
 *   appUrl   ← https://app.<domain>
 *   wsUrl    ← https://ws.<domain>
 *   assetUrl ← https://assets.<domain>
 */
export const resolvePlatformSettingsByOrganization = (
  org: OrganizationModel,
): PlatformSettings => ({
  name: org.name,
  logo: org.logo,
  theme: org.theme,
  customJS: org.customJS,
  customCSS: org.customCSS,
  appUrl: org.appUrl ?? `https://app.${requireDomain(org)}`,
  realtimeUrl: org.wsUrl ?? `https://ws.${requireDomain(org)}`,
  assetUrl: org.assetUrl ?? `https://assets.${requireDomain(org)}`,
})
