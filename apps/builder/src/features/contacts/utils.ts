import { getPublicFileUrl } from "@chatbotx.io/utils"
import { hasRealAvatar } from "@chatbotx.io/utils/no-avatar-sentinel"
import { useTenantSettings } from "@/features/tenant"
import type { ContactResource } from "./schema/resource"

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

  // A no-avatar sentinel (`no_avatar.jpg?time=…`) is a "we tried and there is no
  // avatar" marker, not a real key — finalizing it would render a broken image,
  // so fall back to the initials avatar instead.
  return hasRealAvatar(contact.avatar)
    ? getPublicFileUrl(contact.avatar, storageUrl)
    : undefined
}
