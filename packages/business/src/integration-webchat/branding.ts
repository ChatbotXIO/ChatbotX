import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { WebchatPersistentMenu } from "@chatbotx.io/database/partials"
import { isCommunity } from "../keys"
import {
  BRANDING_TITLE,
  buildBrandingUrl,
  ensureBrandingMenuEntry,
} from "../platform/branding"
import { resolveWorkspaceAppUrl } from "../platform/settings"

/**
 * Community deployments keep exactly one "Built with" entry on every
 * webchat persistent menu. Resolving the workspace app URL is deferred until
 * the community branding write is actually required.
 */
export const brandWebchatMenus = async ({
  persistentMenus,
  workspaceId,
  tx,
}: {
  persistentMenus: WebchatPersistentMenu[] | undefined
  workspaceId: string
  tx?: DatabaseClient
}): Promise<WebchatPersistentMenu[] | undefined> => {
  if (!(isCommunity() && persistentMenus)) {
    return persistentMenus
  }

  const brandingUrl = buildBrandingUrl(
    await resolveWorkspaceAppUrl({ workspaceId, tx }),
    "webchat",
    true,
  )
  const brandingMenuCount = persistentMenus.filter(
    (menu) =>
      menu.type === "url" &&
      (menu.label === BRANDING_TITLE || menu.url === brandingUrl),
  ).length
  const lastMenu = persistentMenus.at(-1)
  if (
    brandingMenuCount === 1 &&
    lastMenu?.type === "url" &&
    lastMenu.label === BRANDING_TITLE &&
    lastMenu.url === brandingUrl
  ) {
    return persistentMenus
  }

  const menus = persistentMenus.filter(
    (menu) =>
      menu.type !== "url" ||
      (menu.label !== BRANDING_TITLE && menu.url !== brandingUrl),
  )
  return ensureBrandingMenuEntry(menus, {
    label: BRANDING_TITLE,
    url: brandingUrl,
  })
}
