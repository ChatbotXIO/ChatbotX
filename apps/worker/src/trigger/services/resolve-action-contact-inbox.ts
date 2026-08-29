import type { ContactInboxWorkspaceRow } from "@chatbotx.io/database/repositories"
import { contactInboxRepository } from "@chatbotx.io/database/repositories"

export type ResolveActionContactInboxInput = {
  workspaceId: string
  contactId: string
  contactInboxId?: string
}

/**
 * Resolves the `ContactInbox` a Trigger action should attribute against.
 *
 * The correctness boundary here is the **producer inventory**, not the
 * event-type enum: every producer call site that already holds a
 * `ContactInbox` in scope when it fires a trigger-matchable event threads
 * that inbox's id through the event's metadata bag, all the way to this
 * resolver. A call site with no `ContactInbox` in scope simply omits it —
 * there is nothing to thread. This function's only job is to prefer a
 * threaded id, when one both exists and validates, over the fallback.
 *
 * - **Attributable events** (tags, custom fields, newContact, referrals,
 *   sequence subscribe/unsubscribe, broadcast unsubscribe) have producers
 *   that thread `contactInboxId`. When it's present, it must still validate
 *   — workspace- AND contact-scoped — before being trusted: a stale/foreign
 *   id (e.g. from a contact merge) falls through to the fallback instead of
 *   attributing to the wrong contact's inbox.
 * - **Schema-precludes-attribution events**
 *   (`conversationTransferredToHuman/ToBot`, `archived`, `followUp`,
 *   `conversationAssigned/Unassigned`, `contactInfoUpdated`,
 *   `dateTimeBasedTrigger`) never carry a `contactInboxId` — `Conversation`
 *   has no inbox/contactInbox column, so no producer could thread one even
 *   in principle.
 *
 * Both cases converge on the same fallback: the contact's
 * most-recently-active inbox across every channel
 * (`findMostRecentByContact`). For schema-precludes-attribution events this
 * is the pre-existing, intentional behavior for that whole event class —
 * not a gap to close.
 */
export async function resolveActionContactInbox(
  input: ResolveActionContactInboxInput,
): Promise<ContactInboxWorkspaceRow | null> {
  const { workspaceId, contactId, contactInboxId } = input

  if (contactInboxId) {
    const threaded = await contactInboxRepository.findByIdForContact({
      id: contactInboxId,
      contactId,
      workspaceId,
    })
    if (threaded) {
      return threaded
    }
  }

  return await contactInboxRepository.findMostRecentByContact({
    contactId,
    workspaceId,
  })
}
