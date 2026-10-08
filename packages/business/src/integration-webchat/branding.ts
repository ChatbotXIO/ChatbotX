import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { WebchatPersistentMenu } from "@chatbotx.io/database/partials"
import { isCommunity } from "../keys"
import {
  BRANDING_TITLE,
  buildBrandingUrl,
  ensureBrandingMenuEntry,
} from "../platform/branding"
import { resolveTenantSettings } from "../platform/settings"

const isWebchatBrandingUrl = (url: string | undefined): boolean => {
  if (!url) {
    return false
  }

  try {
    const parsedUrl = new URL(url)
    return (
      parsedUrl.searchParams.get("channel") === "webchat" &&
      ["selfhosted", "cloud"].includes(parsedUrl.searchParams.get("ref") ?? "")
    )
  } catch {
    return false
  }
}

/**
 * Community deployments keep exactly one "Built with" entry on every
 * webchat persistent menu. Resolving tenant settings is deferred until the
 * community branding write is actually required.
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

  const { appUrl } = await resolveTenantSettings({ workspaceId, tx })
  const menus = persistentMenus.filter(
    (menu) =>
      menu.type !== "url" ||
      (menu.label !== BRANDING_TITLE && !isWebchatBrandingUrl(menu.url)),
  )

  return ensureBrandingMenuEntry(menus, {
    label: BRANDING_TITLE,
    url: buildBrandingUrl(appUrl, "webchat", true),
  })
}
