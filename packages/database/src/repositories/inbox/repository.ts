import { and, type DatabaseClient, db, eq, isNull, lt, or } from "../../client"
import type { ChannelType } from "../../partials"
import { THREAD_CONTROL_SEEN_REFRESH_MS } from "../../partials/thread-control"
import { inboxModel } from "../../schema"
import type { InboxModel } from "../../types"

export type InboxChannelOption = { id: string; name: string }

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

  /**
   * Bounded id/name projection scoped by `workspaceId` and `channel` at the query
   * level. Used by the Calls page's inbox filter instead of
   * `inboxService.listWithIntegrationsByWorkspace`, which eager-loads all nine
   * credential-bearing integration relations just to discard non-whatsapp rows.
   */
  async listOptionsByWorkspaceAndChannel(input: {
    workspaceId: string
    channel: ChannelType
    tx?: DatabaseClient
  }): Promise<InboxChannelOption[]> {
    const { tx = db } = input
    return await tx.query.inboxModel.findMany({
      columns: { id: true, name: true },
      where: { workspaceId: input.workspaceId, channel: input.channel },
    })
  },

  /**
   * Marks the inbox as having seen conversation-routing traffic. Throttled in
   * SQL (idempotent): a write happens only when the stored value is missing or
   * older than `THREAD_CONTROL_SEEN_REFRESH_MS`, bounding this to about one
   * write per inbox per day. Returns whether a row was written.
   */
  async touchThreadControlSeen(
    input: { workspaceId: string; inboxId: string; seenAt: Date },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const staleBefore = new Date(
      input.seenAt.getTime() - THREAD_CONTROL_SEEN_REFRESH_MS,
    )
    const rows = await tx
      .update(inboxModel)
      .set({ threadControlSeenAt: input.seenAt })
      .where(
        and(
          eq(inboxModel.id, input.inboxId),
          eq(inboxModel.workspaceId, input.workspaceId),
          or(
            isNull(inboxModel.threadControlSeenAt),
            lt(inboxModel.threadControlSeenAt, staleBefore),
          ),
        ),
      )
      .returning({ id: inboxModel.id })

    return rows.length > 0
  },
}
