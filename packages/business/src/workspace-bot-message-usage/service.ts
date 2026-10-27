import { anchoredPeriod } from "@chatbotx.io/analytics"
import { workspaceBotMessageUsageRepository } from "@chatbotx.io/database/repositories/workspace-bot-message-usage"
import { BaseService } from "../base.service"
import { userQuotaService } from "../user-quota/service"

const calendarPeriod = (now: Date) => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

class WorkspaceBotMessageUsageService extends BaseService {
  async increment(input: {
    count: number
    ownerId: string
    tenantId: string
    workspaceId: string
  }): Promise<void> {
    const quota = await userQuotaService.getForUser(input.ownerId)
    const now = new Date()
    const period = quota?.periodStart
      ? anchoredPeriod(now, quota.periodStart)
      : calendarPeriod(now)

    await workspaceBotMessageUsageRepository.increment({
      count: input.count,
      ownerId: input.ownerId,
      periodEnd: period.end,
      periodStart: period.start,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
    })
  }
}

export const workspaceBotMessageUsageService =
  new WorkspaceBotMessageUsageService()
