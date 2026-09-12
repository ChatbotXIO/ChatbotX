import {
  BRANDING_TITLE,
  buildBrandingUrl,
  ensureBrandingMenuEntry,
} from "@chatbotx.io/business/branding"
import type {
  ChannelType,
  WebchatPersistentMenu,
} from "@chatbotx.io/database/partials"
import { isCommunity } from "@/env"

export { BRANDING_TITLE } from "@chatbotx.io/business/branding"

export function getBrandingUrl(channel: ChannelType, appUrl: string) {
  return buildBrandingUrl(appUrl, channel, isCommunity())
}

/**
 * Community deployments keep the "Built with" branding entry on every
 * webchat persistent menu; re-adds it when missing. Shared by the create and
 * update paths (actions and public API) so they cannot drift.
 */
export function applyWebchatBranding(
  persistentMenus: WebchatPersistentMenu[],
  appUrl: string,
): WebchatPersistentMenu[]
export function applyWebchatBranding(
  persistentMenus: WebchatPersistentMenu[] | undefined,
  appUrl: string,
): WebchatPersistentMenu[] | undefined
export function applyWebchatBranding(
  persistentMenus: WebchatPersistentMenu[] | undefined,
  appUrl: string,
): WebchatPersistentMenu[] | undefined {
  return isCommunity() && persistentMenus
    ? (ensureBrandingMenuEntry(persistentMenus, {
        label: BRANDING_TITLE,
        url: getBrandingUrl("webchat", appUrl),
      }) as WebchatPersistentMenu[])
    : persistentMenus
}
