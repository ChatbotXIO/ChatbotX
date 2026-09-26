import {
  contactInboxService,
  resolveContactAvatarUrl,
} from "@chatbotx.io/business"

type ContactWithAvatar = {
  id: string
  avatar: string | null
}

export async function resolveContactAvatars<T extends ContactWithAvatar>(
  contacts: readonly T[],
  workspaceId: string,
): Promise<T[]> {
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
        (key) => key,
      ),
    })),
  )
}
