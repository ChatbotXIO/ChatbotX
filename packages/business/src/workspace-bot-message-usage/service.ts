import { anchoredPeriod } from "@chatbotx.io/analytics"
import { db } from "@chatbotx.io/database/client"
import { upsertWorkspaceBotMessageUsage } from "@chatbotx.io/database/repositories/workspace-bot-message-usage"
import { BaseService } from "../base.service"

const calendarPeriod = (now: Date) => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

class WorkspaceBotMessageUsageService extends BaseService {
  async increment(input: {
    count: number
    workspaceId: string
  }): Promise<void> {
    const workspace = await db.query.workspaceModel.findFirst({
      where: { id: input.workspaceId },
      columns: { ownerId: true, tenantId: true },
    })
    if (!workspace) {
      return
    }

    const quota = await db.query.userQuotaModel.findFirst({
      where: { userId: workspace.ownerId },
      columns: { periodStart: true },
    })
    const now = new Date()
    const period = quota?.periodStart
      ? anchoredPeriod(now, quota.periodStart)
      : calendarPeriod(now)

    await upsertWorkspaceBotMessageUsage({
      count: input.count,
      ownerId: workspace.ownerId,
      periodEnd: period.end,
      periodStart: period.start,
      tenantId: workspace.tenantId,
      workspaceId: input.workspaceId,
    })
  }
}

export const workspaceBotMessageUsageService =
  new WorkspaceBotMessageUsageService()
