import { resolveTenantSettings } from "@chatbotx.io/business"
import { toPublicStorageUrl as resolvePublicStorageUrl } from "@chatbotx.io/business/utils"

export const toPublicStorageUrl = async (
  path: string | null,
  workspaceId: string,
): Promise<string | null> => {
  if (!path) {
    return null
  }
  const { storageUrl } = await resolveTenantSettings({ workspaceId })
  return resolvePublicStorageUrl(path, storageUrl)
}
