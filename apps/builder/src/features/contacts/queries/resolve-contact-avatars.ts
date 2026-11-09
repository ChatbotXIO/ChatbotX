import {
  contactInboxService,
  resolveContactAvatarUrl,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { toPublicStorageUrl } from "@chatbotx.io/business/utils"

type ContactWithAvatar = {
  id: string
  avatar: string | null
}

/**
 * Builder responses use signed app-proxy URLs for mirrored avatars so the
 * browser never has to resolve private RustFS/Docker hostnames. Public API
 * responses can request absolute object URLs with `publicUrls: true`.
 */
export async function resolveContactAvatars<T extends ContactWithAvatar>(
  contacts: readonly T[],
  workspaceId: string,
  options: { publicUrls?: boolean } = {},
): Promise<T[]> {
  const storageUrl = options.publicUrls
    ? (await resolveTenantSettings({ workspaceId })).storageUrl
    : null
  const finalize = (key: string) =>
    storageUrl ? toPublicStorageUrl(key, storageUrl) : key

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
        undefined,
        { proxyStoredAvatar: !options.publicUrls },
      ),
    })),
  )
}
