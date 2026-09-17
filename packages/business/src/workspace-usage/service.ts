import { count as countFn, db, sql } from "@chatbotx.io/database/client"
import {
  contactModel,
  inboxModel,
  workspaceMemberModel,
  workspaceModel,
  workspaceUsageModel,
} from "@chatbotx.io/database/schema"
import type { WorkspaceUsageModel } from "@chatbotx.io/database/types"
import { LiveCounterStore } from "../quota-shared/live-counter-store"

export type ReconcileWorkspaceCounts = {
  workspaceIds: string[]
  contactsByWorkspace: Map<string, number>
  channelsByWorkspace: Map<string, number>
  membersByWorkspace: Map<string, number>
}

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

  /**
   * `sync-user-quota.ts` reconcileWorkspaceUsage: the workspace-id list plus
   * the three grouped counts (contacts / channels / team members) the
   * display-only `WorkspaceUsage` breakdown is re-grounded from. MAC counts
   * come from `@chatbotx.io/analytics`'s `macRepository`, which stays called
   * from the handler and is merged with this method's result there.
   */
  async loadReconcileCounts(): Promise<ReconcileWorkspaceCounts> {
    const [workspaces, contactCounts, channelCounts, memberCounts] =
      await Promise.all([
        db.select({ id: workspaceModel.id }).from(workspaceModel),
        db
          .select({ workspaceId: contactModel.workspaceId, used: countFn() })
          .from(contactModel)
          .groupBy(contactModel.workspaceId),
        db
          .select({ workspaceId: inboxModel.workspaceId, used: countFn() })
          .from(inboxModel)
          .groupBy(inboxModel.workspaceId),
        db
          .select({
            workspaceId: workspaceMemberModel.workspaceId,
            used: countFn(),
          })
          .from(workspaceMemberModel)
          .groupBy(workspaceMemberModel.workspaceId),
      ])

    return {
      workspaceIds: workspaces.map((row) => row.id),
      contactsByWorkspace: new Map(
        contactCounts.map((row) => [row.workspaceId, row.used]),
      ),
      channelsByWorkspace: new Map(
        channelCounts.map((row) => [row.workspaceId, row.used]),
      ),
      membersByWorkspace: new Map(
        memberCounts.map((row) => [row.workspaceId, row.used]),
      ),
    }
  }

  /** `sync-user-quota.ts` reconcileWorkspaceUsage: upsert the reconciled snapshot. */
  async upsertReconciled(input: {
    workspaceId: string
    contactsUsed: number
    channelsUsed: number
    teamMembersUsed: number
    macUsed: number
  }): Promise<void> {
    const {
      workspaceId,
      contactsUsed,
      channelsUsed,
      teamMembersUsed,
      macUsed,
    } = input
    await db
      .insert(workspaceUsageModel)
      .values({
        workspaceId,
        contactsUsed,
        channelsUsed,
        teamMembersUsed,
        macUsed,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: workspaceUsageModel.workspaceId,
        set: {
          contactsUsed,
          channelsUsed,
          teamMembersUsed,
          macUsed,
          syncedAt: new Date(),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
  }
}

export const workspaceUsageService = new WorkspaceUsageService()
export { WORKSPACE_USAGE_LABEL }
