import { type DatabaseClient, db } from "../../client"
import type { ChannelType } from "../../partials"
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
}
