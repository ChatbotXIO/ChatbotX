import { type DatabaseClient, db, sql } from "../../client"
import { workspaceBotMessageUsageModel } from "../../schema"

class WorkspaceBotMessageUsageRepository {
  async increment(
    input: {
      count: number
      ownerId: string
      periodEnd: Date
      periodStart: Date
      tenantId: string
      workspaceId: string
    },
    client: DatabaseClient = db,
  ): Promise<void> {
    await client
      .insert(workspaceBotMessageUsageModel)
      .values(input)
      .onConflictDoUpdate({
        target: [
          workspaceBotMessageUsageModel.workspaceId,
          workspaceBotMessageUsageModel.periodStart,
        ],
        set: {
          count: sql`${workspaceBotMessageUsageModel.count} + ${input.count}`,
          updatedAt: sql`now()`,
        },
      })
  }
}

export const workspaceBotMessageUsageRepository =
  new WorkspaceBotMessageUsageRepository()
