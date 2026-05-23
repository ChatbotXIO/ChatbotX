import { usePlatformSettings } from "@/features/platform"
import type { ContactResource } from "./schemas/resource"

export function useAvatarUrl(
  contact?: ContactResource | null,
): string | undefined {
  const { storageUrl } = usePlatformSettings()
  if (!contact) {
    return
  }

  return contact.avatar
    ? new URL(contact.avatar, storageUrl).toString()
    : undefined
}
