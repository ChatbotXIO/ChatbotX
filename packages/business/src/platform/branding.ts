import type { ChannelType } from "@chatbotx.io/database/partials"

/**
 * Label used for the self-promotion "Built with" persistent-menu entry. Kept as
 * a single source of truth so the builder UI, the integration settings actions,
 * and the worker all agree on the same string.
 */
export const BRANDING_TITLE = "⚡ Built with chatbotx.io"

/**
 * Build the canonical branding URL for a channel's persistent menu. Pure — the
 * caller supplies the resolved `appUrl` and an `isCommunity` flag from its own
 * (client- or server-safe) env so this module pulls in no env dependencies.
 */
export function buildBrandingUrl(
  appUrl: string,
  channel: ChannelType,
  isCommunity: boolean,
): string {
  const url = new URL(appUrl)
  url.searchParams.set("ref", isCommunity ? "selfhosted" : "cloud")
  url.searchParams.set("channel", channel)

  return url.toString()
}

/** Persistent-menu item shape needed to locate the branding entry. */
type BrandableMenuItem = { type: string; url?: string }

/**
 * Return a copy of `menus` with the branding entry (matched by `brandingUrl`)
 * moved to the end, so the self-promotion link always renders last. Items are
 * left untouched when no branding entry is present. Shared by the Messenger and
 * Instagram settings actions and the per-user persistent-menu worker so every
 * path orders the menu identically.
 */
export function moveBrandingMenuLast<T extends BrandableMenuItem>(
  menus: readonly T[],
  brandingUrl: string,
): T[] {
  const result = [...menus]
  const brandingIndex = result.findIndex(
    (menu) => menu.type === "url" && menu.url === brandingUrl,
  )
  if (brandingIndex !== -1) {
    result.push(...result.splice(brandingIndex, 1))
  }

  return result
}

/** Shape of the url-type persistent-menu entry the branding link uses. */
type BrandingMenuEntry = { label: string; type: "url"; url: string }

/**
 * Return a copy of `menus` guaranteed to contain the branding entry (matched
 * by `entry.url`), appending it when absent. Pure, like `moveBrandingMenuLast`.
 * Community deployments run stored menus through this on the read path (and
 * normalize on write) so the "Built with" link cannot be stripped by editing
 * the persisted rows or posting directly to the update action.
 */
export function ensureBrandingMenuEntry<T extends BrandableMenuItem>(
  menus: readonly T[],
  entry: { label: string; url: string },
): (T | BrandingMenuEntry)[] {
  const hasBranding = menus.some(
    (menu) => menu.type === "url" && menu.url === entry.url,
  )
  if (hasBranding) {
    return [...menus]
  }

  return [...menus, { label: entry.label, type: "url", url: entry.url }]
}
