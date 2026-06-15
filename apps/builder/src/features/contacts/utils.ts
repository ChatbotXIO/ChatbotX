import { useTenantSettings } from "@/features/tenant"
import type { ContactResource } from "./schemas/resource"

export function useAvatarUrl(
  contact?: ContactResource | null,
): string | undefined {
  const { storageUrl } = useTenantSettings()
  if (!contact) {
    return
  }

  return contact.avatar
    ? new URL(contact.avatar, storageUrl).toString()
    : undefined
}
