import { db } from "@chatbotx.io/database/client"
import type {
  ConversationArchivedStats,
  ConversationAssignedByAdminStats,
  ConversationAssignedStats,
  ConversationFollowUpStats,
  ConversationHandoffStats,
  TimeRangeQuery,
  UniqueConversationsByAdminStats,
} from "../schemas"
import { BaseRepository } from "./base.repository"

export class ConversationStatsRepository extends BaseRepository {
  async getHandoffsByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationHandoffStats[]> {
    const { workspaceId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const dayGroup = this.buildDayGroupFromHourly(props)

    const sql = `
      SELECT
        workspace_id,
        day_group as day,
        direction,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          ${dayGroup} as day_group,
          direction,
          countMerge(handoff_count_state) as count
        FROM conversation_handoffs_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
        GROUP BY workspace_id, day_group, direction
      )
      GROUP BY workspace_id, day_group, direction
      ORDER BY day ASC, direction ASC
    `

    const result = await this.query<{
      workspace_id: string
      day: string
      direction: "to_human" | "to_bot"
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.day),
      direction: row.direction,
      count: Number(row.count),
    }))
  }

  async getFollowUpsByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationFollowUpStats[]> {
    const { workspaceId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const dayGroup = this.buildDayGroupFromHourly(props)

    const sql = `
      SELECT
        workspace_id,
        day_group as day,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          ${dayGroup} as day_group,
          countMerge(followup_count_state) as count
        FROM conversation_followups_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
        GROUP BY workspace_id, day_group
      )
      GROUP BY workspace_id, day_group
      ORDER BY day ASC
    `

    const result = await this.query<{
      workspace_id: string
      day: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.day),
      count: Number(row.count),
    }))
  }

  async getArchivedByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationArchivedStats[]> {
    const { workspaceId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const dayGroup = this.buildDayGroupFromHourly(props)

    const sql = `
      SELECT
        workspace_id,
        day_group as day,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          ${dayGroup} as day_group,
          countMerge(archived_count_state) as count
        FROM conversation_archived_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
        GROUP BY workspace_id, day_group
      )
      GROUP BY workspace_id, day_group
      ORDER BY day ASC
    `

    const result = await this.query<{
      workspace_id: string
      day: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.day),
      count: Number(row.count),
    }))
  }

  async getAssignedByDay(
    props: TimeRangeQuery,
  ): Promise<ConversationAssignedStats[]> {
    const { workspaceId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const dayGroup = this.buildDayGroupFromHourly(props)

    const sql = `
      SELECT
        workspace_id,
        day_group as day,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          ${dayGroup} as day_group,
          countMerge(assigned_count_state) as count
        FROM conversation_assigned_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
        GROUP BY workspace_id, day_group
      )
      GROUP BY workspace_id, day_group
      ORDER BY day ASC
    `

    const result = await this.query<{
      workspace_id: string
      day: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.day),
      count: Number(row.count),
    }))
  }

  async getAssignedByAdmin(
    props: TimeRangeQuery,
  ): Promise<ConversationAssignedByAdminStats[]> {
    const { workspaceId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        workspace_id,
        to_assignee,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          to_assignee,
          countMerge(assigned_count_state) as count
        FROM conversation_assigned_by_admin_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
        GROUP BY workspace_id, to_assignee
      )
      GROUP BY workspace_id, to_assignee
      ORDER BY count DESC
    `

    const clickhouseResult = await this.query<{
      workspace_id: string
      to_assignee: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    const members = await db.query.workspaceMemberModel.findMany({
      where: { workspaceId },
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    const assignmentsByUserId = new Map<string, number>()
    for (const row of clickhouseResult) {
      assignmentsByUserId.set(row.to_assignee, Number(row.count))
    }

    return members.map((member) => ({
      workspaceId,
      toAssignee: member.userId,
      count: assignmentsByUserId.get(member.userId) || 0,
      userName: member.user?.name || undefined,
      userEmail: member.user?.email || undefined,
    }))
  }

  async getUniqueConversationsByAdmin(
    props: TimeRangeQuery,
  ): Promise<UniqueConversationsByAdminStats[]> {
    const { workspaceId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        workspace_id,
        to_assignee,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          to_assignee,
          uniqMerge(unique_conversation_state) as count
        FROM unique_conversations_by_admin_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
        GROUP BY workspace_id, to_assignee
      )
      GROUP BY workspace_id, to_assignee
      ORDER BY count DESC
    `

    const clickhouseResult = await this.query<{
      workspace_id: string
      to_assignee: string
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    const members = await db.query.workspaceMemberModel.findMany({
      where: { workspaceId },
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    const countByUserId = new Map<string, number>()
    for (const row of clickhouseResult) {
      countByUserId.set(row.to_assignee, Number(row.count))
    }

    return members.map((member) => ({
      workspaceId,
      toAssignee: member.userId,
      count: countByUserId.get(member.userId) || 0,
      userName: member.user?.name || undefined,
      userEmail: member.user?.email || undefined,
    }))
  }
}

export const conversationStatsRepository = new ConversationStatsRepository()
