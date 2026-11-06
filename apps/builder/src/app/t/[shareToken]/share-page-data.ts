import { templateService } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import { cache } from "react"
import { getTenantSettings } from "@/features/tenant/utils"
import { getCurrentUser } from "@/lib/auth/utils"

/** Who is viewing the share pages: one session read for a layout and its page. */
export const getShareViewer = cache(getCurrentUser)

/**
 * `generateMetadata` and the page body both need the template; `cache()`
 * dedupes the two calls into a single lookup per request.
 */
export const findPublicTemplate = cache(async (shareToken: string) =>
  templateService.findPublicByShareToken(shareToken),
)

/** The template's cover, or the tenant's icon when it has none. */
export const resolveTemplateImageUrl = async (
  imageUrl: string | null,
): Promise<string> => {
  const { storageUrl, faviconUrl } = await getTenantSettings()
  return imageUrl ? getPublicFileUrl(imageUrl, storageUrl) : faviconUrl
}
