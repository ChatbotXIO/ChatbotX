import {
  fillContactStatsMonthlySeries,
  fillDailyContactStats,
  fillDailyTotalContactsSeries,
  fillTotalContactsMonthlySeries,
  shouldUseMonthlyGranularity,
} from "../lib/time-series"
import type {
  ContactCountsSchema,
  ContactEventType,
  ContactStats,
  ContactsByDimension,
  MessagesBySenderStats,
  TimeRangeQuery,
} from "../schemas"
import { BaseRepository } from "./base.repository"

export class ContactStatsRepository extends BaseRepository {
  async getStatsByMinute(
    props: TimeRangeQuery & {
      eventTypes?: ContactEventType[]
    },
  ): Promise<ContactStats[]> {
    const { chatbotId, eventTypes } = props
    const timeFilter = this.buildTimestampFilter({
      ...props,
      field: "minute",
    })
    const eventTypeFilter = this.buildEventTypeFilter(eventTypes)

    const sql = `
      SELECT
        chatbot_id,
        minute,
        event_type,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contact_stats_minute
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
        ${eventTypeFilter}
      GROUP BY chatbot_id, minute, event_type
      ORDER BY minute ASC, event_type ASC
    `

    const result = await this.query<{
      chatbot_id: string
      minute: string
      event_type: ContactEventType
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      chatbotId: row.chatbot_id,
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
    const { chatbotId } = props
    const timeFilter = this.buildTimestampFilter({
      ...props,
      field: "hour",
    })
    const eventTypeFilter = this.buildEventTypeFilter(eventTypes)

    const sql = `
      SELECT
        chatbot_id,
        hour,
        event_type,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contact_stats_hourly
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
        ${eventTypeFilter}
      GROUP BY chatbot_id, hour, event_type
      ORDER BY hour ASC, event_type ASC
    `

    const result = await this.query<{
      chatbot_id: string
      hour: string
      event_type: ContactEventType
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      chatbotId: row.chatbot_id,
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
        chatbot_id,
        month_group as month,
        event_type,
        sum(count) as count,
        sum(unique_contacts) as unique_contacts
      FROM (
        SELECT
          chatbot_id,
          ${monthGroup} as month_group,
          event_type,
          countMerge(event_count_state) as count,
          uniqMerge(unique_contacts_state) as unique_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND ${timeFilter.sql}
          ${eventTypeFilter}
        GROUP BY chatbot_id, month_group, event_type
      )
      GROUP BY chatbot_id, month_group, event_type
      ORDER BY month ASC, event_type ASC
    `

    const result = await this.query<{
      chatbot_id: string
      month: string
      event_type: ContactEventType
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId: props.chatbotId,
      ...timeFilter.params,
    })

    const rows = result.map((row) => ({
      chatbotId: row.chatbot_id,
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
    const { chatbotId, eventTypes } = props
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
        chatbot_id,
        day_group as day,
        event_type,
        sum(count) as count,
        sum(unique_contacts) as unique_contacts
      FROM (
        SELECT
          chatbot_id,
          ${dayGroup} as day_group,
          event_type,
          countMerge(event_count_state) as count,
          uniqMerge(unique_contacts_state) as unique_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND ${timeFilter.sql}
          ${eventTypeFilter}
        GROUP BY chatbot_id, day_group, event_type
      )
      GROUP BY chatbot_id, day_group, event_type
      ORDER BY day ASC, event_type ASC
    `

    const result = await this.query<{
      chatbot_id: string
      day: string
      event_type: ContactEventType
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId,
      ...timeFilter.params,
    })

    const rows = result.map((row) => ({
      chatbotId: row.chatbot_id,
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
    const timeFilter = this.buildHourlyTimestampFilter(props)
    const monthGroup = this.buildMonthGroupFromHourly(props)

    const baselineSql = `
      WITH hourly_created AS (
        SELECT
          hour,
          countMerge(event_count_state) AS created_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND hour < toStartOfMonth(toDateTime({from:UInt32}, {timezone:String}))
          AND event_type = 'contact_created'
        GROUP BY hour
      ),
      hourly_deleted AS (
        SELECT
          hour,
          countMerge(event_count_state) AS deleted_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND hour < toStartOfMonth(toDateTime({from:UInt32}, {timezone:String}))
          AND event_type = 'contact_deleted'
        GROUP BY hour
      )
      SELECT
        sum(created_contacts) - sum(deleted_contacts) AS baseline_total
      FROM hourly_created
      FULL OUTER JOIN hourly_deleted USING (hour)
    `

    const createdSql = `
      WITH hourly AS (
        SELECT
          hour,
          countMerge(event_count_state) AS created_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND hour <= toDateTime({to:UInt32}, {timezone:String})
          AND event_type = 'contact_created'
        GROUP BY hour
      ),
      monthly AS (
        SELECT
          ${monthGroup} as month,
          sum(created_contacts) AS created_contacts
        FROM hourly
        GROUP BY month
      ),
      cumulative AS (
        SELECT
          month,
          sum(created_contacts) OVER (ORDER BY month ASC) AS total_contacts
        FROM monthly
      )
      SELECT
        month,
        total_contacts
      FROM cumulative
      WHERE month >= toStartOfMonth(toDateTime({from:UInt32}, {timezone:String}))
      ORDER BY month ASC
    `

    const deletedSql = `
      WITH hourly AS (
        SELECT
          hour,
          countMerge(event_count_state) AS deleted_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND hour <= toDateTime({to:UInt32}, {timezone:String})
          AND event_type = 'contact_deleted'
        GROUP BY hour
      ),
      monthly AS (
        SELECT
          ${monthGroup} as month,
          sum(deleted_contacts) AS deleted_contacts
        FROM hourly
        GROUP BY month
      ),
      cumulative AS (
        SELECT
          month,
          sum(deleted_contacts) OVER (ORDER BY month ASC) AS total_deleted
        FROM monthly
      )
      SELECT
        month,
        total_deleted
      FROM cumulative
      WHERE month >= toStartOfMonth(toDateTime({from:UInt32}, {timezone:String}))
      ORDER BY month ASC
    `

    const [baselineResult, createdResult, deletedResult] = await Promise.all([
      this.query<{
        baseline_total: string
      }>(baselineSql, {
        chatbotId: props.chatbotId,
        ...timeFilter.params,
      }),
      this.query<{
        month: string
        total_contacts: string
      }>(createdSql, {
        chatbotId: props.chatbotId,
        ...timeFilter.params,
      }),
      this.query<{
        month: string
        total_deleted: string
      }>(deletedSql, {
        chatbotId: props.chatbotId,
        ...timeFilter.params,
      }),
    ])

    const baselineTotal = baselineResult[0]?.baseline_total
      ? Number(baselineResult[0].baseline_total)
      : 0

    const deletedByMonth = new Map<string, number>()
    for (const row of deletedResult) {
      deletedByMonth.set(row.month, Number(row.total_deleted))
    }

    const raw = createdResult.map((row) => {
      const monthKey = row.month
      const created = Number(row.total_contacts)
      const deleted = deletedByMonth.get(monthKey) ?? 0
      return {
        date: new Date(row.month),
        count: created - deleted,
      }
    })

    return fillTotalContactsMonthlySeries({
      ...props,
      raw,
      initialTotal: baselineTotal,
    })
  }

  async getContactCountsPerDay(
    props: TimeRangeQuery,
  ): Promise<ContactCountsSchema[]> {
    const { chatbotId } = props
    if (shouldUseMonthlyGranularity(props)) {
      return this.getTotalContactsByMonth(props)
    }

    const timeFilter = this.buildHourlyTimestampFilter(props)
    const dayGroup = this.buildDayGroupFromHourly(props)

    const baselineSql = `
      WITH hourly_created AS (
        SELECT
          hour,
          countMerge(event_count_state) AS created_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND hour < toStartOfDay(toDateTime({from:UInt32}, {timezone:String}))
          AND event_type = 'contact_created'
        GROUP BY hour
      ),
      hourly_deleted AS (
        SELECT
          hour,
          countMerge(event_count_state) AS deleted_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND hour < toStartOfDay(toDateTime({from:UInt32}, {timezone:String}))
          AND event_type = 'contact_deleted'
        GROUP BY hour
      )
      SELECT
        sum(created_contacts) - sum(deleted_contacts) AS baseline_total
      FROM hourly_created
      FULL OUTER JOIN hourly_deleted USING (hour)
    `

    const createdSql = `
      WITH hourly AS (
        SELECT
          hour,
          countMerge(event_count_state) AS created_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND hour <= toDateTime({to:UInt32}, {timezone:String})
          AND event_type = 'contact_created'
        GROUP BY hour
      ),
      daily AS (
        SELECT
          ${dayGroup} as day,
          sum(created_contacts) AS created_contacts
        FROM hourly
        GROUP BY day
      ),
      cumulative AS (
        SELECT
          day,
          sum(created_contacts) OVER (ORDER BY day ASC) AS total_contacts
        FROM daily
      )
      SELECT
        day,
        total_contacts
      FROM cumulative
      WHERE day >= toDate(toDateTime({from:UInt32}, {timezone:String}))
      ORDER BY day ASC
    `

    const deletedSql = `
      WITH hourly AS (
        SELECT
          hour,
          countMerge(event_count_state) AS deleted_contacts
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND hour <= toDateTime({to:UInt32}, {timezone:String})
          AND event_type = 'contact_deleted'
        GROUP BY hour
      ),
      daily AS (
        SELECT
          ${dayGroup} as day,
          sum(deleted_contacts) AS deleted_contacts
        FROM hourly
        GROUP BY day
      ),
      cumulative AS (
        SELECT
          day,
          sum(deleted_contacts) OVER (ORDER BY day ASC) AS total_deleted
        FROM daily
      )
      SELECT
        day,
        total_deleted
      FROM cumulative
      WHERE day >= toDate(toDateTime({from:UInt32}, {timezone:String}))
      ORDER BY day ASC
    `

    const [baselineResult, createdResult, deletedResult] = await Promise.all([
      this.query<{
        baseline_total: string
      }>(baselineSql, {
        chatbotId,
        ...timeFilter.params,
      }),
      this.query<{
        day: string
        total_contacts: string
      }>(createdSql, {
        chatbotId,
        ...timeFilter.params,
      }),
      this.query<{
        day: string
        total_deleted: string
      }>(deletedSql, {
        chatbotId,
        ...timeFilter.params,
      }),
    ])

    const baselineTotal = baselineResult[0]?.baseline_total
      ? Number(baselineResult[0].baseline_total)
      : 0

    const deletedByDay = new Map<string, number>()
    for (const row of deletedResult) {
      deletedByDay.set(row.day, Number(row.total_deleted))
    }

    const raw = createdResult.map((row) => {
      const dayKey = row.day
      const created = Number(row.total_contacts)
      const deleted = deletedByDay.get(dayKey) ?? 0
      return {
        date: new Date(row.day),
        count: created - deleted,
      }
    })

    return fillDailyTotalContactsSeries({
      ...props,
      raw,
      initialTotal: baselineTotal,
    })
  }

  async getNewContactsCount(props: TimeRangeQuery): Promise<number> {
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        uniqMerge(unique_contacts_state) AS new_contacts
      FROM contact_stats_hourly
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
        AND event_type = 'contact_created'
    `

    const result = await this.query<{
      new_contacts: string
    }>(sql, {
      chatbotId: props.chatbotId,
      ...timeFilter.params,
    })

    return result[0]?.new_contacts ? Number(result[0].new_contacts) : 0
  }

  async getContactsCount(props: TimeRangeQuery): Promise<number> {
    const timeFilter = this.buildHourlyTimestampFilter(props)

    const sql = `
      SELECT
        countMerge(event_count_state) as count
      FROM contact_stats_hourly
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
    `

    const result = await this.query<{
      count: string
    }>(sql, {
      chatbotId: props.chatbotId,
      ...timeFilter.params,
    })

    return result[0]?.count ? Number(result[0].count) : 0
  }

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
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
      GROUP BY dimension
      ORDER BY count DESC
    `

    const result = await this.query<{
      dimension: string
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId: props.chatbotId,
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
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
      GROUP BY channel
      ORDER BY count DESC
    `

    const result = await this.query<{
      dimension: string
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId: props.chatbotId,
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
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
    `

    const result = await this.query<{ active_contacts: string }>(sql, {
      chatbotId: props.chatbotId,
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
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
      GROUP BY source
      ORDER BY count DESC
    `

    const result = await this.query<{
      dimension: string
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId: props.chatbotId,
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
    const { chatbotId } = props
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
        chatbot_id,
        time_group as timestamp,
        channel,
        sender_type,
        sum(count) as count
      FROM (
        SELECT
          chatbot_id,
          ${timeGroup} as time_group,
          channel,
          sender_type,
          countMerge(event_count_state) as count
        FROM contact_stats_hourly
        WHERE chatbot_id = {chatbotId:String}
          AND ${timeFilter.sql}
          AND event_type IN ('contact_message_out')
          AND sender_type != ''
        GROUP BY chatbot_id, time_group, channel, sender_type
      )
      GROUP BY chatbot_id, time_group, channel, sender_type
      ORDER BY timestamp ASC, channel ASC, sender_type ASC
    `

    const result = await this.query<{
      chatbot_id: string
      timestamp: string
      channel: string
      sender_type: "bot" | "human"
      count: string
    }>(sql, {
      chatbotId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      chatbotId: row.chatbot_id,
      timestamp: new Date(row.timestamp),
      channel: row.channel,
      senderType: row.sender_type,
      count: Number(row.count),
    }))
  }
}

export const contactStatsRepository = new ContactStatsRepository()
