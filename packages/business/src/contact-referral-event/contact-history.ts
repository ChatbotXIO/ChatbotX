import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type ContactAdTouch,
  type ContactAdTouchCursor,
  contactReferralEventRepository,
} from "@chatbotx.io/database/repositories"
import { type ContactAccessScope, contactService } from "../contact/service"

// Kept apart from `contactReferralEventService`: this is the one read that needs
// `contactService` (and the module graph behind it), while the writers and
// lookups there run on the inbound-message and conversion paths.

/**
 * A contact's ad touches, newest first. `accessScope` applies the "only
 * assigned contacts" permission, as for the contact itself.
 */
export async function listContactAdTouches(
  input: {
    workspaceId: string
    contactId: string
    limit: number
    cursor?: ContactAdTouchCursor
    accessScope?: ContactAccessScope
  },
  tx: DatabaseClient = db,
): Promise<{
  data: ContactAdTouch[]
  nextCursor: ContactAdTouchCursor | null
}> {
  await contactService.findByIdOrFail({
    workspaceId: input.workspaceId,
    id: input.contactId,
    accessScope: input.accessScope,
    tx,
  })

  const rows = await contactReferralEventRepository.listAdTouchesByContact(
    input,
    tx,
  )
  const data = rows.slice(0, input.limit)
  const last = data.at(-1)
  return {
    data,
    nextCursor:
      rows.length > input.limit && last
        ? { occurredAt: last.occurredAt, id: last.id }
        : null,
  }
}
