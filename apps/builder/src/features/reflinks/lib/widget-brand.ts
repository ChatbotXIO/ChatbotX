import { getPublicFileUrl } from "@chatbotx.io/utils"
import { readableForeground } from "@/features/integration-webchat/lib/brand-color"

/** Background of the default chat icon when none is saved (Tailwind gray-900). */
export const DEFAULT_WIDGET_LOGO_BACKGROUND_COLOR = "#111827"

type WidgetBrandSettings = {
  /** Storage path of the saved media library logo, if any. */
  widgetLogoPath: string | null
  widgetBrandName: string | null
  widgetBrandUrl: string | null
  widgetLogoBackgroundColor: string | null
}

type WidgetBrandTenant = {
  storageUrl: string
}

/**
 * The brand the chat widget shows, shared by the embed route and the dialog
 * preview so the two cannot drift. The powered-by line needs both a brand
 * name and a redirect URL; without both, name and URL are null and the line
 * is hidden. No logo means a null `logoUrl`, which the widget draws as the
 * default chat icon (lucide's messages-circle), drawn on the saved background
 * color in white or black, whichever reads better.
 */
export function resolveWidgetBrand(
  settings: WidgetBrandSettings,
  tenant: WidgetBrandTenant,
) {
  const logoBackgroundColor =
    settings.widgetLogoBackgroundColor || DEFAULT_WIDGET_LOGO_BACKGROUND_COLOR
  const hasPoweredBy = Boolean(
    settings.widgetBrandName && settings.widgetBrandUrl,
  )
  return {
    name: hasPoweredBy ? settings.widgetBrandName : null,
    url: hasPoweredBy ? settings.widgetBrandUrl : null,
    logoUrl: settings.widgetLogoPath
      ? getPublicFileUrl(settings.widgetLogoPath, tenant.storageUrl)
      : null,
    logoBackgroundColor,
    // `readableForeground` reads 6-digit hex only; drop any alpha suffix.
    logoForegroundColor: readableForeground(logoBackgroundColor.slice(0, 7)),
  }
}
