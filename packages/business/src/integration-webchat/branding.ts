import type { WebchatPersistentMenu } from "@chatbotx.io/database/partials"
import { isCommunity } from "../keys"
import {
  BRANDING_TITLE,
  buildBrandingUrl,
  ensureBrandingMenuEntry,
} from "../platform/branding"

/**
 * Community deployments keep the "Built with" branding entry on every
 * webchat persistent menu; re-add it when it is missing.
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
        url: buildBrandingUrl(appUrl, "webchat", isCommunity()),
      }) as WebchatPersistentMenu[])
    : persistentMenus
}
