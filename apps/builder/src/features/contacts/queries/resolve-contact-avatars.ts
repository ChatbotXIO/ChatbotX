import {
  contactInboxService,
  resolveContactAvatarUrl,
} from "@chatbotx.io/business"
import { createAvatarFinalizer } from "./avatar-finalizer"

type ContactWithAvatar = {
  id: string
  avatar: string | null
}

/**
 * `publicUrls: true` also turns a stored storage key into its absolute URL for
 * callers with no client-side resolver (the public API). The builder UI keeps
 * the key and resolves it in the browser.
 */
export async function resolveContactAvatars<T extends ContactWithAvatar>(
  contacts: readonly T[],
  workspaceId: string,
  options: { publicUrls?: boolean } = {},
): Promise<T[]> {
  if (contacts.length === 0) {
    return []
  }
  const finalize = createAvatarFinalizer(workspaceId, options)
  const contactInboxes = await contactInboxService.listByContactIds({
    workspaceId,
    contactIds: contacts.map((contact) => contact.id),
  })
  const contactInboxesByContactId = new Map<string, typeof contactInboxes>()

  for (const contactInbox of contactInboxes) {
    const rows = contactInboxesByContactId.get(contactInbox.contactId) ?? []
    rows.push(contactInbox)
    contactInboxesByContactId.set(contactInbox.contactId, rows)
  }

  return await Promise.all(
    contacts.map(async (contact) => ({
      ...contact,
      avatar: await resolveContactAvatarUrl(
        {
          workspaceId,
          contact,
          contactInboxes: contactInboxesByContactId.get(contact.id) ?? [],
        },
        finalize,
      ),
    })),
  )
}
