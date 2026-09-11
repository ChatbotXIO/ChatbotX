import type { ContactEventData } from "@chatbotx.io/analytics/schemas"
import type { ContactInboxWithAnalytics } from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"

// Shared row-shape between the private (`privateListBroadcastContactsAPI`)
// and public (`broadcastsPublicRouter.listContacts`) broadcast-recipients
// routes — both join the same `contactEventMap`/`contactInbox` pair per
// `contactInboxId`, differing only in the private route's extra
// `conversationId` field (an internal builder-navigation detail dropped
// from the public API's response schema, see `schema/public.ts`).
export type BroadcastContactRow = {
  contactId: string
  contactInboxId: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  sourceId: string | null
  avatar: string | null
  channel: ChannelType
  errorContent: string | null
  occurredAt: string
}

export function mapBroadcastContactRow(
  contactInboxId: string,
  eventData: ContactEventData | undefined,
  contactInbox: ContactInboxWithAnalytics | undefined,
): BroadcastContactRow | null {
  if (!(eventData && contactInbox)) {
    return null
  }
  return {
    contactId: eventData.contactId,
    contactInboxId,
    firstName: contactInbox.contact.firstName ?? null,
    lastName: contactInbox.contact.lastName ?? null,
    fullName: contactInbox.contact.fullName ?? null,
    sourceId: contactInbox.sourceId,
    avatar: contactInbox.contact.avatar ?? null,
    channel: contactInbox.channel as ChannelType,
    errorContent: eventData.errorContent ?? null,
    occurredAt: eventData.occurredAt,
  }
}
