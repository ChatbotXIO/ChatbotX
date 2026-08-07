import { getPublicFileUrl } from "@chatbotx.io/utils"
import { useTenantSettings } from "@/features/tenant"

export function getUserAvatarUrl(
  image: string | null | undefined,
  storageUrl: string,
): string | undefined {
  return image ? getPublicFileUrl(image, storageUrl) : undefined
}

export function useUserAvatarUrl(
  image: string | null | undefined,
): string | undefined {
  const { storageUrl } = useTenantSettings()
  return getUserAvatarUrl(image, storageUrl)
}
