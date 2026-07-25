import { db } from "@chatbotx.io/database/client"
import { workspaceUsageModel } from "@chatbotx.io/database/schema"
import type { WorkspaceUsageModel } from "@chatbotx.io/database/types"
import { LiveCounterStore } from "../quota-shared/live-counter-store"

export type WorkspaceUsageMetric =
  | "contacts"
  | "channels"
  | "teamMembers"
  | "botMessages"
  | "mac"

const WORKSPACE_USAGE_LABEL = "workspace-usage"

class WorkspaceUsageService {
  private readonly store = new LiveCounterStore<WorkspaceUsageModel>({
    label: WORKSPACE_USAGE_LABEL,
    table: workspaceUsageModel,
    idColumn: workspaceUsageModel.workspaceId,
    idKey: "workspaceId",
    // The shared store has the broader quota metric union; `WorkspaceUsage`
    // only tracks the metrics below. `usedColumns` is a partial map so
    // `getLiveCounts` never cold-seeds a Redis field for an unmapped metric
    // from an unrelated column.
    usedColumns: {
      contacts: workspaceUsageModel.contactsUsed,
      channels: workspaceUsageModel.channelsUsed,
      teamMembers: workspaceUsageModel.teamMembersUsed,
      botMessages: workspaceUsageModel.botMessagesUsed,
      mac: workspaceUsageModel.macUsed,
    },
    getUsed: (row, metric) => {
      if (!row) {
        return 0
      }
      switch (metric) {
        case "contacts":
          return row.contactsUsed
        case "channels":
          return row.channelsUsed
        case "teamMembers":
          return row.teamMembersUsed
        case "botMessages":
          return row.botMessagesUsed
        case "mac":
          return row.macUsed
        default:
          return 0
      }
    },
    fetchRow: (workspaceId) =>
      db.query.workspaceUsageModel
        .findFirst({ where: { workspaceId } })
        .then((row) => row ?? null),
  })

  async increment(
    workspaceId: string,
    metric: WorkspaceUsageMetric,
    count = 1,
  ): Promise<void> {
    await this.store.consume(workspaceId, metric, count)
  }

  async decrement(
    workspaceId: string,
    metric: WorkspaceUsageMetric,
    count = 1,
  ): Promise<void> {
    await this.store.release(workspaceId, metric, count)
  }

  async getUsage(workspaceId: string): Promise<{
    contactsUsed: number
    channelsUsed: number
    teamMembersUsed: number
    botMessagesUsed: number
    macUsed: number
  }> {
    const counts = await this.store.getLiveCounts(workspaceId)
    return {
      contactsUsed: counts.contacts,
      channelsUsed: counts.channels,
      teamMembersUsed: counts.teamMembers,
      botMessagesUsed: counts.botMessages,
      macUsed: counts.mac,
    }
  }

  async invalidate(workspaceId: string): Promise<void> {
    await this.store.invalidate(workspaceId)
  }
}

export const workspaceUsageService = new WorkspaceUsageService()
export { WORKSPACE_USAGE_LABEL }
