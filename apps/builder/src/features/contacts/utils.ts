import { usePlatformSettings } from "@/features/platform"
import type { ContactResource } from "./schemas/resource"

export function useAvatarUrl(
  contact?: ContactResource | null,
): string | undefined {
  const { assetUrl } = usePlatformSettings()
  if (!contact) {
    return
  }

  return contact.avatar
    ? new URL(contact.avatar, assetUrl).toString()
    : undefined
}
