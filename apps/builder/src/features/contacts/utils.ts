import { useTenantSettings } from "@/features/tenant"
import type { ContactResource } from "./schemas/resource"

type ContactInboxReadTimestamp = {
  contactLastReadAt?: Date | null
}

export function getLatestContactLastReadAt(
  contactInboxes?: ContactInboxReadTimestamp[] | null,
): Date | null {
  return (
    contactInboxes
      ?.map((contactInbox) => contactInbox.contactLastReadAt)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  )
}

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
