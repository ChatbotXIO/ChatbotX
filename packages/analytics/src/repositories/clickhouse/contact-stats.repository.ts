import { db } from "@chatbotx.io/database/client"
import {
  fillContactStatsMonthlySeries,
  fillDailyContactStats,
  fillDailyNewContactsSeries,
  fillDailyTotalContactsSeries,
  fillMonthlyNewContactsSeries,
  fillTotalContactsMonthlySeries,
  shouldUseMonthlyGranularity,
} from "../../lib/time-series"
import type {
  ContactCountsSchema,
  ContactEventType,
  ContactStats,
  ContactsByDimension,
  HumanAgentStats,
  MessagesByAdminStats,
  MessagesBySenderStats,
  TimeRangeQuery,
  UniqueContactsByAdminStats,
} from "../../schemas"
import { BaseRepository } from "./base.repository"
import { conversationStatsRepository } from "./conversation-stats.repository"

export class ContactStatsRepository extends BaseRepository {
  async getStatsByMinute(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, eventTypes } = props
    const timeFilter = this.buildTimestampFilter({
      ...props,
      field: "minute",
    })
    const eventTypeFilter = this.buildEventTypeFilter(eventTypes)

    const sql = `
      SELECT
        workspace_id,
        minute,
        event_type,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contact_stats_minute
      WHERE workspace_id = {workspaceId:String}
        AND ${timeFilter.sql}
        ${eventTypeFilter.sql}
      GROUP BY workspace_id, minute, event_type
      ORDER BY minute ASC, event_type ASC
    `

    const result = await this.query<{
      workspace_id: string
      minute: string
      event_type: ContactEventType
      count: string
      unique_contacts: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
      ...eventTypeFilter.params,
    })

    return result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.minute),
      eventType: row.event_type,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))
  }

  async getStatsByHour(
    props: TimeRangeQuery,
    eventTypes?: ContactEventType[],
  ): Promise<ContactStats[]> {
    const { workspaceId } = props
    const timeFilter = this.buildTimestampFilter({
      ...props,
      field: "hour",
    })
    const eventTypeFilter = this.buildEventTypeFilter(eventTypes)

    const sql = `
      SELECT
        workspace_id,
        hour,
        event_type,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contact_stats_hourly
      WHERE workspace_id = {workspaceId:String}
        AND ${timeFilter.sql}
        ${eventTypeFilter.sql}
      GROUP BY workspace_id, hour, event_type
      ORDER BY hour ASC, event_type ASC
    `

    const result = await this.query<{
      workspace_id: string
      hour: string
      event_type: ContactEventType
      count: string
      unique_contacts: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
      ...eventTypeFilter.params,
    })

    return result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.hour),
      eventType: row.event_type,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))
  }

  async getStatsByMonth(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { eventTypes } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const eventTypeFilter = this.buildEventTypeFilter(props.eventTypes)
    const monthGroup = this.buildMonthGroupFromHourly(props)

    const sql = `
      SELECT
        workspace_id,
        month_group as month,
        event_type,
        sum(count) as count,
        sum(unique_contacts) as unique_contacts
      FROM (
        SELECT
          workspace_id,
          ${monthGroup} as month_group,
          event_type,
          countMerge(event_count_state) as count,
          uniqMerge(unique_contacts_state) as unique_contacts
        FROM contact_stats_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
          ${eventTypeFilter.sql}
        GROUP BY workspace_id, month_group, event_type
      )
      GROUP BY workspace_id, month_group, event_type
      ORDER BY month ASC, event_type ASC
    `

    const result = await this.query<{
      workspace_id: string
      month: string
      event_type: ContactEventType
      count: string
      unique_contacts: string
    }>(sql, {
      workspaceId: props.workspaceId,
      ...timeFilter.params,
      ...eventTypeFilter.params,
    })

    const rows = result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.month),
      eventType: row.event_type,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))

    if (!eventTypes || eventTypes.length === 0) {
      return rows
    }

    return fillContactStatsMonthlySeries({
      ...props,
      rows,
      eventTypes,
    })
  }

  async getStatsByDay(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { workspaceId, eventTypes } = props
    if (shouldUseMonthlyGranularity(props)) {
      return this.getStatsByMonth({
        ...props,
        eventTypes,
      })
    }

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const eventTypeFilter = this.buildEventTypeFilter(props.eventTypes)
    const dayGroup = this.buildDayGroupFromHourly(props)

    const sql = `
      SELECT
        workspace_id,
        day_group as day,
        event_type,
        sum(count) as count,
        sum(unique_contacts) as unique_contacts
      FROM (
        SELECT
          workspace_id,
          ${dayGroup} as day_group,
          event_type,
          countMerge(event_count_state) as count,
          uniqMerge(unique_contacts_state) as unique_contacts
        FROM contact_stats_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
          ${eventTypeFilter.sql}
        GROUP BY workspace_id, day_group, event_type
      )
      GROUP BY workspace_id, day_group, event_type
      ORDER BY day ASC, event_type ASC
    `

    const result = await this.query<{
      workspace_id: string
      day: string
      event_type: ContactEventType
      count: string
      unique_contacts: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
      ...eventTypeFilter.params,
    })

    const rows = result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.day),
      eventType: row.event_type,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))

    if (!eventTypes || eventTypes.length === 0) {
      return rows
    }

    return fillDailyContactStats({
      ...props,
      rows,
      eventTypes,
    })
  }

  async getTotalContactsByMonth(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const { workspaceId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const monthGroup = this.buildMonthGroupFromHourly(props)

    const sql = `
      WITH hourly AS (
        SELECT
          hour,
          countMergeIf(event_count_state, event_type = 'contact_created')
            - countMergeIf(event_count_state, event_type = 'contact_deleted') AS net
        FROM contact_stats_hourly
        WHERE workspace_id = {workspaceId:String}
          AND hour <= toDateTime({to:UInt32}, {timezone:String})
          AND event_type IN ('contact_created', 'contact_deleted')
        GROUP BY hour
      )
      SELECT
        'baseline' AS kind,
        toStartOfMonth(toDate(toDateTime({from:UInt32}, {timezone:String}))) AS month,
        coalesce(sum(net), 0) AS value
      FROM hourly
      WHERE hour < toDateTime(toStartOfMonth(toDateTime({from:UInt32}, {timezone:String})), {timezone:String})
      UNION ALL
      SELECT
        'series' AS kind,
        month,
        sum(month_net) OVER (ORDER BY month ASC) AS value
      FROM (
        SELECT
          ${monthGroup} AS month,
          sum(net) AS month_net
        FROM hourly
        WHERE hour >= toDateTime(toStartOfMonth(toDateTime({from:UInt32}, {timezone:String})), {timezone:String})
        GROUP BY month
      )
    `

    const rows = await this.query<{
      kind: "baseline" | "series"
      month: string
      value: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    let baselineTotal = 0
    const raw: ContactCountsSchema[] = []
    for (const row of rows) {
      if (row.kind === "baseline") {
        baselineTotal = Number(row.value)
      } else {
        raw.push({
          date: new Date(row.month),
          count: Number(row.value),
        })
      }
    }

    raw.sort((a, b) => a.date.getTime() - b.date.getTime())

    const rawWithBaseline = raw.map((r) => ({
      date: r.date,
      count: baselineTotal + r.count,
    }))

    return fillTotalContactsMonthlySeries({
      ...props,
      raw: rawWithBaseline,
      initialTotal: baselineTotal,
    })
  }

  async getContactCountsPerDay(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const { workspaceId } = props

    if (shouldUseMonthlyGranularity(props)) {
      return this.getTotalContactsByMonth(props)
    }

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const dayGroup = this.buildDayGroupFromHourly(props)

    const sql = `
      WITH hourly AS (
        SELECT
          hour,
          countMergeIf(event_count_state, event_type = 'contact_created')
            - countMergeIf(event_count_state, event_type = 'contact_deleted') AS net
        FROM contact_stats_hourly
        WHERE workspace_id = {workspaceId:String}
          AND hour <= toDateTime({to:UInt32}, {timezone:String})
          AND event_type IN ('contact_created', 'contact_deleted')
        GROUP BY hour
      )
      SELECT
        'baseline' AS kind,
        toDate(toDateTime({from:UInt32}, {timezone:String})) AS day,
        coalesce(sum(net), 0) AS value
      FROM hourly
      WHERE hour < toStartOfDay(toDateTime({from:UInt32}, {timezone:String}))
      UNION ALL
      SELECT
        'series' AS kind,
        day,
        sum(day_net) OVER (ORDER BY day ASC) AS value
      FROM (
        SELECT
          ${dayGroup} AS day,
          sum(net) AS day_net
        FROM hourly
        WHERE hour >= toStartOfDay(toDateTime({from:UInt32}, {timezone:String}))
        GROUP BY day
      )
    `

    const rows = await this.query<{
      kind: "baseline" | "series"
      day: string
      value: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    let baselineTotal = 0
    const raw: ContactCountsSchema[] = []
    for (const row of rows) {
      if (row.kind === "baseline") {
        baselineTotal = Number(row.value)
      } else {
        raw.push({
          date: new Date(row.day),
          count: Number(row.value),
        })
      }
    }

    raw.sort((a, b) => a.date.getTime() - b.date.getTime())

    const rawWithBaseline = raw.map((r) => ({
      date: r.date,
      count: baselineTotal + r.count,
    }))

    return fillDailyTotalContactsSeries({
      ...props,
      raw: rawWithBaseline,
      initialTotal: baselineTotal,
    })
  }

  async getNewContactsPerDay(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    if (shouldUseMonthlyGranularity(props)) {
      return this.getNewContactsPerMonth(props)
    }

    const { workspaceId } = props

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const dayGroup = this.buildDayGroupFromHourly(props)

    const sql = `
      SELECT
        ${dayGroup} AS day,
        uniqMerge(unique_contacts_state) AS new_contacts
      FROM contact_stats_hourly
      WHERE workspace_id = {workspaceId:String}
        AND ${timeFilter.sql}
        AND event_type = 'contact_created'
      GROUP BY day
      ORDER BY day ASC
    `

    const result = await this.query<{
      day: string
      new_contacts: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    const raw = result.map((row) => ({
      date: new Date(row.day),
      count: Number(row.new_contacts),
    }))

    return fillDailyNewContactsSeries({ ...props, raw })
  }

  async getNewContactsPerMonth(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const timeFilter = this.buildHourlyTimestampFilter(props)
    const monthGroup = this.buildMonthGroupFromHourly(props)

    const sql = `
      SELECT
        ${monthGroup} AS month,
        uniqMerge(unique_contacts_state) AS new_contacts
      FROM contact_stats_hourly
      WHERE workspace_id = {workspaceId:String}
        AND ${timeFilter.sql}
        AND event_type = 'contact_created'
      GROUP BY month
      ORDER BY month ASC
    `

    const result = await this.query<{
      month: string
      new_contacts: string
    }>(sql, {
      workspaceId: props.workspaceId,
      ...timeFilter.params,
    })

    const raw = result.map((row) => ({
      date: new Date(row.month),
      count: Number(row.new_contacts),
    }))

    return fillMonthlyNewContactsSeries({ ...props, raw })
  }

  async getNewContactsCount(props: TimeRangeQuery): Promise<number> {
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        uniqMerge(unique_contacts_state) AS new_contacts
      FROM contact_stats_hourly
      WHERE workspace_id = {workspaceId:String}
        AND ${timeFilter.sql}
        AND event_type = 'contact_created'
    `

    const result = await this.query<{
      new_contacts: string
    }>(sql, {
      workspaceId: props.workspaceId,
      ...timeFilter.params,
    })

    return result[0]?.new_contacts ? Number(result[0].new_contacts) : 0
  }

  async getContactsCount(props: TimeRangeQuery): Promise<number> {
    const inboxes = await db.query.inboxModel.findMany({
      where: { workspaceId: props.workspaceId },
      with: {
        contactStats: true,
      },
    })

    const total = inboxes.reduce(
      (sum, inbox) => sum + (inbox.contactStats?.totalContacts ?? 0),
      0,
    )

    return total
  }

  // async getContactsCount(props: TimeRangeQuery): Promise<number> {
  //   const timeFilter = this.buildHourlyTimestampFilter(props)

  //   const sql = `
  //     SELECT
  //       countMerge(event_count_state) as count
  //     FROM contact_stats_hourly
  //     WHERE workspace_id = {workspaceId:String}
  //       AND ${timeFilter.sql}
  //   `

  //   const result = await this.query<{
  //     count: string
  //   }>(sql, {
  //     workspaceId: props.workspaceId,
  //     ...timeFilter.params,
  //   })

  //   return result[0]?.count ? Number(result[0].count) : 0
  // }

  async getContactsByDimension(
    props: TimeRangeQuery & {
      dimension: "country" | "channel"
    },
  ): Promise<ContactsByDimension[]> {
    const { dimension } = props
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        ${dimension} as dimension,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contacts_by_${dimension}_hourly
      WHERE workspace_id = {workspaceId:String}
        AND ${timeFilter.sql}
      GROUP BY dimension
      ORDER BY count DESC
    `

    const result = await this.query<{
      dimension: string
      count: string
      unique_contacts: string
    }>(sql, {
      workspaceId: props.workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      dimension: row.dimension,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))
  }

  getContactsByCountry(props: TimeRangeQuery): Promise<ContactsByDimension[]> {
    return this.getContactsByDimension({
      ...props,
      dimension: "country",
    })
  }

  async getContactsByChannel(
    props: TimeRangeQuery,
  ): Promise<ContactsByDimension[]> {
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        channel as dimension,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contacts_by_channel_hourly
      WHERE workspace_id = {workspaceId:String}
        AND ${timeFilter.sql}
      GROUP BY channel
      ORDER BY count DESC
    `

    const result = await this.query<{
      dimension: string
      count: string
      unique_contacts: string
    }>(sql, {
      workspaceId: props.workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      dimension: row.dimension,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))
  }

  async getActiveContactsCount(props: TimeRangeQuery): Promise<number> {
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        uniqMerge(active_contacts_state) as active_contacts
      FROM active_contacts_hourly
      WHERE workspace_id = {workspaceId:String}
        AND ${timeFilter.sql}
    `

    const result = await this.query<{ active_contacts: string }>(sql, {
      workspaceId: props.workspaceId,
      ...timeFilter.params,
    })

    return Number(result[0]?.active_contacts ?? 0)
  }

  async getContactsBySource(
    props: TimeRangeQuery,
  ): Promise<ContactsByDimension[]> {
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        source as dimension,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contacts_by_source_hourly
      WHERE workspace_id = {workspaceId:String}
        AND ${timeFilter.sql}
      GROUP BY source
      ORDER BY count DESC
    `

    const result = await this.query<{
      dimension: string
      count: string
      unique_contacts: string
    }>(sql, {
      workspaceId: props.workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      dimension: row.dimension,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))
  }

  async getMessagesBySender(
    props: TimeRangeQuery,
    granularity: "day" | "month" = "day",
  ): Promise<MessagesBySenderStats[]> {
    const { workspaceId } = props
    const effectiveGranularity =
      granularity === "day" && shouldUseMonthlyGranularity(props)
        ? "month"
        : granularity
    const timeFilter = this.buildHourlyTimestampFilter(props)
    const timeGroup =
      effectiveGranularity === "month"
        ? this.buildMonthGroupFromHourly(props)
        : this.buildDayGroupFromHourly(props)

    const sql = `
      SELECT
        workspace_id,
        time_group as timestamp,
        channel,
        sender_type,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          ${timeGroup} as time_group,
          channel,
          sender_type,
          countMerge(event_count_state) as count
        FROM contact_stats_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
          AND event_type IN ('contact_message_out')
          AND sender_type != ''
        GROUP BY workspace_id, time_group, channel, sender_type
      )
      GROUP BY workspace_id, time_group, channel, sender_type
      ORDER BY timestamp ASC, channel ASC, sender_type ASC
    `

    const result = await this.query<{
      workspace_id: string
      timestamp: string
      channel: string
      sender_type: "bot" | "human"
      count: string
    }>(sql, {
      workspaceId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      workspaceId: row.workspace_id,
      timestamp: new Date(row.timestamp),
      channel: row.channel,
      senderType: row.sender_type,
      count: Number(row.count),
    }))
  }

  async getMessagesByAdmin(
    props: TimeRangeQuery,
  ): Promise<MessagesByAdminStats[]> {
    const { workspaceId } = props
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        workspace_id,
        admin_id,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          admin_id,
          countMerge(message_count_state) as count
        FROM messages_by_admin_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
        GROUP BY workspace_id, admin_id
      )
      GROUP BY workspace_id, admin_id
      ORDER BY count DESC
    `

    const clickhouseResult = await this.query<{
      workspace_id: string
      admin_id: string
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
      countByUserId.set(row.admin_id, Number(row.count))
    }

    return members.map((member) => ({
      workspaceId,
      adminId: member.userId,
      count: countByUserId.get(member.userId.toString()) || 0,
      userName: member.user?.name || undefined,
      userEmail: member.user?.email || undefined,
    }))
  }

  async getUniqueContactsByAdmin(
    props: TimeRangeQuery,
  ): Promise<UniqueContactsByAdminStats[]> {
    const { workspaceId } = props
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        workspace_id,
        admin_id,
        sum(count) as count
      FROM (
        SELECT
          workspace_id,
          admin_id,
          uniqMerge(unique_contacts_state) as count
        FROM contacts_by_admin_hourly
        WHERE workspace_id = {workspaceId:String}
          AND ${timeFilter.sql}
        GROUP BY workspace_id, admin_id
      )
      GROUP BY workspace_id, admin_id
      ORDER BY count DESC
    `

    const clickhouseResult = await this.query<{
      workspace_id: string
      admin_id: string
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
      countByUserId.set(row.admin_id, Number(row.count))
    }

    return members.map((member) => ({
      workspaceId,
      toAssignee: member.userId,
      count: countByUserId.get(member.userId.toString()) || 0,
      userName: member.user?.name || undefined,
      userEmail: member.user?.email || undefined,
    }))
  }

  async getHumanAgentStats(props: TimeRangeQuery): Promise<HumanAgentStats[]> {
    const { workspaceId } = props

    const [messagesByAdmin, contactsByAdmin, assignedByAdmin] =
      await Promise.all([
        this.getMessagesByAdmin(props),
        this.getUniqueContactsByAdmin(props),
        conversationStatsRepository.getAssignedByAdmin(props),
      ])

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

    const messagesByUserId = new Map<string, number>()
    for (const stat of messagesByAdmin) {
      messagesByUserId.set(stat.adminId.toString(), stat.count)
    }

    const contactsByUserId = new Map<string, number>()
    for (const stat of contactsByAdmin) {
      contactsByUserId.set(stat.toAssignee.toString(), stat.count)
    }

    const assignedByUserId = new Map<string, number>()
    for (const stat of assignedByAdmin) {
      assignedByUserId.set(stat.toAssignee, stat.count)
    }

    return members.map((member) => ({
      workspaceId,
      adminId: member.userId,
      messagesSent: messagesByUserId.get(member.userId.toString()) || 0,
      uniqueContacts: contactsByUserId.get(member.userId.toString()) || 0,
      assignedConversations:
        assignedByUserId.get(member.userId.toString()) || 0,
      userName: member.user?.name || undefined,
      userEmail: member.user?.email || undefined,
    }))
  }
}

export const contactStatsRepository = new ContactStatsRepository()
