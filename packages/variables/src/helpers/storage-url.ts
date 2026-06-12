import { resolveTenantSettings } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"

const ABSOLUTE_URL_RE = /^https?:\/\//i

export const toPublicStorageUrl = async (
  path: string | null,
  workspaceId: string,
): Promise<string | null> => {
  if (!path) {
    return null
  }
  if (ABSOLUTE_URL_RE.test(path)) {
    return path
  }

  const { storageUrl } = await resolveTenantSettings({ workspaceId })
  return getPublicFileUrl(path, storageUrl)
}
