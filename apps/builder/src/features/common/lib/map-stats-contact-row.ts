import type { ContactEventData } from "@chatbotx.io/analytics/schemas"
import type { ContactInboxWithAnalytics } from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"

// Shared row-shape across every "stats contacts" route that pairs a
// `ContactEventData` with its `ContactInboxWithAnalytics` per
// `contactInboxId` — broadcasts (`privateListBroadcastContactsAPI`,
// `broadcastsPublicRouter.listContacts`) and sequences
// (`privateListSequenceStepContactsAPI`). All feed the same
// `StatsContactsDialog` → `addContactTagAction` /
// `bulkTagStatsContactsAction` path, which requires `contactId` to be the
// real **Contact** id (`eventData.contactId`) — NOT the ContactInbox id
// (`contactInbox.id`). A caller that emits the wrong one tags the wrong
// contact silently; see the broadcasts/sequences private-route call sites
// for how `conversationId` (only some callers need it) is layered on top.
export type StatsContactRow = {
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

export function mapStatsContactRow(
  contactInboxId: string,
  eventData: ContactEventData | undefined,
  contactInbox: ContactInboxWithAnalytics | undefined,
): StatsContactRow | null {
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
