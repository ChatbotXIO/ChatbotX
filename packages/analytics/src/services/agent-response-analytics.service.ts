import {
  agentResponseStatsRepository,
  type InsertAgentResponseEventRow,
  messageStatsRepository,
} from "../repositories/postgres"
import type { AgentResponseSeriesRow, FilteredTimeRangeQuery } from "../schemas"

export class AgentResponseAnalyticsService {
  recordEvents(payloads: InsertAgentResponseEventRow[]): Promise<void> {
    return agentResponseStatsRepository.insertEvents(payloads)
  }

  /**
   * Per-admin, per-day series (day bucketed in `props.timezone`) with member
   * names merged exactly like `getHumanAgentStats`. Only CURRENT members
   * appear; departed agents drop out.
   */
  async getAgentResponseSeries(
    props: FilteredTimeRangeQuery,
  ): Promise<AgentResponseSeriesRow[]> {
    const [daily, members] = await Promise.all([
      agentResponseStatsRepository.getDailyAveragesByAdmin(props),
      messageStatsRepository.fetchWorkspaceMembers(props.workspaceId),
    ])
    const memberByAdminId = new Map(members.map((m) => [String(m.userId), m]))

    return daily.flatMap((row) => {
      const member = memberByAdminId.get(row.adminId)
      if (!member) {
        return []
      }
      return [
        {
          ...row,
          workspaceId: props.workspaceId,
          userName: member.user?.name ?? undefined,
          userEmail: member.user?.email ?? undefined,
        },
      ]
    })
  }
}

export const agentResponseAnalyticsService = new AgentResponseAnalyticsService()
