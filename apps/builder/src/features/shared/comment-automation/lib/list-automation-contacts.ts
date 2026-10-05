import { commentAutomationAnalyticsService } from "@chatbotx.io/analytics"
import type {
  CommentAutomationEventType,
  ListCommentAutomationContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { contactInboxService } from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"

/**
 * One page of the contacts behind a comment automation stat column, newest
 * first. Shared by the private drill-down dialog and the public analytics API
 * so both hydrate rows the same way.
 *
 * `total` is the column's counter — the caller already has it (the dialog
 * renders it; the public API reads it off the automation row) — so the page
 * never re-counts. Same contract as `privateListBroadcastContactsAPI`.
 */
export async function listCommentAutomationContacts(input: {
  workspaceId: string
  automationId: string
  eventType?: CommentAutomationEventType
  total: number
  page: number
  perPage: number
}): Promise<ListCommentAutomationContactsResponse> {
  const { workspaceId, automationId, eventType, total, page, perPage } = input
  const emptyPage = {
    data: [],
    total,
    contactTotal: 0,
    page,
    pageCount: 0,
  }

  if (!eventType) {
    return emptyPage
  }

  const { contactInboxIds, events, contactTotal } =
    await commentAutomationAnalyticsService.getContacts({
      workspaceId,
      automationId,
      eventType,
      page,
      perPage,
    })

  if (events.length === 0) {
    return emptyPage
  }

  // Workspace-scoped: the service joins through `Contact.workspaceId`, so a
  // row whose inbox belongs to another tenant resolves to nothing rather
  // than being hydrated into this response.
  const contactInboxes = await contactInboxService.findManyByIds({
    workspaceId,
    ids: [...new Set(contactInboxIds)],
  })
  const inboxById = new Map(contactInboxes.map((c) => [c.id, c]))
  const pageCount = Math.ceil(total / perPage)

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

  return { data, total, contactTotal, page, pageCount }
}
