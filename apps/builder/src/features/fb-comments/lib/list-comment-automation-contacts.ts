import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import type { CommentAutomationEventType } from "@chatbotx.io/analytics/schemas"
import { contactInboxService } from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"

/**
 * One page of a comment automation's recipients for a stats event, hydrated
 * with contact display fields. The builder drill-down dialog and the public
 * API both read through this so the row shape cannot drift. Everything is
 * workspace-scoped: an automation of another workspace yields an empty page.
 */
export async function listCommentAutomationContactRows(input: {
  workspaceId: string
  automationId: string
  eventType: CommentAutomationEventType
  page: number
  perPage: number
}) {
  const { workspaceId } = input
  const { contactInboxIds, events, contactTotal } =
    await commentAutomationAnalyticsService.getContacts(input)

  if (events.length === 0) {
    return { data: [], contactTotal, eventCount: 0 }
  }

  // Workspace-scoped: the service joins through `Contact.workspaceId`, so a
  // row whose inbox belongs to another tenant resolves to nothing rather
  // than being hydrated into this response.
  const contactInboxes = await contactInboxService.findManyByIds({
    workspaceId,
    ids: [...new Set(contactInboxIds)],
  })
  const inboxById = new Map(contactInboxes.map((c) => [c.id, c]))

  // One entry per EVENT, newest first — the same contact appears once per
  // occurrence. Several rows can share a `contactInbox`, which is why the
  // hydration is a lookup rather than a join over unique ids.
  const data = events
    .map((event) => {
      const contactInbox = inboxById.get(event.contactInboxId)
      if (!contactInbox) {
        return null
      }
      return {
        rowKey: event.rowKey,
        // The real `Contact.id`, which is what the tag actions expect.
        contactId: contactInbox.contactId,
        contactInboxId: event.contactInboxId,
        firstName: contactInbox.contact.firstName ?? null,
        lastName: contactInbox.contact.lastName ?? null,
        fullName: contactInbox.contact.fullName ?? null,
        sourceId: contactInbox.sourceId,
        avatar: contactInbox.contact.avatar ?? null,
        channel: contactInbox.channel as ChannelType,
        conversationId: contactInbox.conversation?.id ?? "",
        errorContent: event.errorContent ?? null,
        occurredAt: event.occurredAt,
        // Only a `comment:missed` row carries these; a delivery row
        // describes the reply, so they stay null and the dialog renders
        // its error column instead.
        commentText: event.commentText ?? null,
        missReason: event.missReason ?? null,
      }
    })
    .filter((row) => row !== null)

  return { data, contactTotal, eventCount: events.length }
}
