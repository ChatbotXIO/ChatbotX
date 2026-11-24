import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  broadcastRepository,
  type ContactBroadcastCursor,
  type ContactBroadcastRow,
} from "@chatbotx.io/database/repositories"
import { type ContactAccessScope, contactService } from "../contact/service"

export type { ContactBroadcastRow } from "@chatbotx.io/database/repositories"

// Kept apart from `broadcastService`: that file is the broadcast engine, and
// this read is the one that needs `contactService`.

/**
 * The broadcasts a contact was sent, newest first. `accessScope` applies the
 * "only assigned contacts" permission, as for the contact itself, so a member
 * cannot read the history of a contact they cannot open.
 */
export async function listContactBroadcasts(
  input: {
    workspaceId: string
    contactId: string
    limit: number
    cursor?: ContactBroadcastCursor
    /** Part of the broadcast's name, or its exact id. */
    search?: string
    accessScope?: ContactAccessScope
  },
  tx: DatabaseClient = db,
): Promise<{
  data: ContactBroadcastRow[]
  nextCursor: ContactBroadcastCursor | null
}> {
  await contactService.findByIdOrFail({
    workspaceId: input.workspaceId,
    id: input.contactId,
    accessScope: input.accessScope,
    tx,
  })

  const rows = await broadcastRepository.listForContact(input, tx)
  const data = rows.slice(0, input.limit)
  const last = data.at(-1)
  return {
    data,
    nextCursor:
      rows.length > input.limit && last
        ? { schedulesAt: last.schedulesAt, broadcastId: last.broadcastId }
        : null,
  }
}
