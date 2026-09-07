import { type DatabaseClient, db } from "../../client"
import type { InboxModel } from "../../types"

/**
 * Reads of the `Inbox` row itself. The richer inbox reads (with integrations,
 * with caching) live in `inboxService`; this exists so a worker handler can
 * resolve one inbox by id without pulling the service's module graph.
 */
export const inboxRepository = {
  async findById(input: {
    id: string
    tx?: DatabaseClient
  }): Promise<InboxModel | undefined> {
    const { tx = db } = input
    return await tx.query.inboxModel.findFirst({
      where: { id: input.id },
    })
  },
}
