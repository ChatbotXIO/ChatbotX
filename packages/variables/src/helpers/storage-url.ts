import { resolveTenantSettings } from "@chatbotx.io/business"
import { toPublicStorageUrl as resolvePublicStorageUrl } from "@chatbotx.io/business/utils"

export function toPublicStorageUrl(
  path: string,
  workspaceId: string,
): Promise<string>
export function toPublicStorageUrl(
  path: null,
  workspaceId: string,
): Promise<null>
export function toPublicStorageUrl(
  path: string | null,
  workspaceId: string,
): Promise<string | null>
export async function toPublicStorageUrl(
  path: string | null,
  workspaceId: string,
): Promise<string | null> {
  if (!path) {
    return null
  }
  const { storageUrl } = await resolveTenantSettings({ workspaceId })
  return resolvePublicStorageUrl(path, storageUrl)
}
