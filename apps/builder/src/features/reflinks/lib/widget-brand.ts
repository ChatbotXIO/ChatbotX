import { getPublicFileUrl } from "@chatbotx.io/utils"

type WidgetBrandSettings = {
  /** Storage path of the saved media library logo, if any. */
  widgetLogoPath: string | null
  widgetBrandName: string | null
  widgetBrandUrl: string | null
}

type WidgetBrandTenant = {
  storageUrl: string
  faviconUrl?: string | null
}

/**
 * The brand the chat widget shows, shared by the embed route and the dialog
 * preview so the two cannot drift. The powered-by line needs both a brand
 * name and a redirect URL; without both, name and URL are null and the line
 * is hidden. No logo means the app logo.
 */
export function resolveWidgetBrand(
  settings: WidgetBrandSettings,
  tenant: WidgetBrandTenant,
) {
  const hasPoweredBy = Boolean(
    settings.widgetBrandName && settings.widgetBrandUrl,
  )
  return {
    name: hasPoweredBy ? settings.widgetBrandName : null,
    url: hasPoweredBy ? settings.widgetBrandUrl : null,
    // A square icon: the toggle is a small round button, where the wide (and
    // white) light logo renders blank.
    logoUrl: settings.widgetLogoPath
      ? getPublicFileUrl(settings.widgetLogoPath, tenant.storageUrl)
      : tenant.faviconUrl || null,
  }
}
