import {
  fillContactStatsDaySeries,
  fillContactStatsMonthSeries,
  fillDailyTotalContactsSeries,
  fillMonthlyTotalContactsSeries,
  shouldUseMonthlyGranularity,
} from "../lib/time-series"
import type {
  ContactEventType,
  ContactStats,
  ContactsByDimension,
  DailyTotalContacts,
  TimeRange,
} from "../models"
import { BaseRepository } from "./base.repository"

export class ContactStatsRepository extends BaseRepository {
  async getStatsByMinute(
    chatbotId: string,
    timeRange: TimeRange,
    eventTypes?: ContactEventType[],
  ): Promise<ContactStats[]> {
    const timeFilter = this.buildTimestampFilter(
      "minute",
      timeRange.from,
      timeRange.to,
    )
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
    chatbotId: string,
    timeRange: TimeRange,
    eventTypes?: ContactEventType[],
  ): Promise<ContactStats[]> {
    const timeFilter = this.buildTimestampFilter(
      "hour",
      timeRange.from,
      timeRange.to,
    )
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
    chatbotId: string,
    timeRange: TimeRange,
    eventTypes?: ContactEventType[],
  ): Promise<ContactStats[]> {
    const timeFilter = this.buildTimestampFilter(
      "day",
      timeRange.from,
      timeRange.to,
    )
    const eventTypeFilter = this.buildEventTypeFilter(eventTypes)

    const sql = `
      SELECT
        chatbot_id,
        toStartOfMonth(day) as month,
        event_type,
        sum(countMerge(event_count_state)) as count,
        sum(uniqMerge(unique_contacts_state)) as unique_contacts
      FROM contact_stats_daily
      WHERE chatbot_id = {chatbotId:String}
        AND day >= toDate(toDateTime({from:UInt32}, 'UTC'))
        AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
        ${eventTypeFilter}
      GROUP BY chatbot_id, month, event_type
      ORDER BY month ASC, event_type ASC
    `

    const result = await this.query<{
      chatbot_id: string
      month: string
      event_type: ContactEventType
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId,
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

    return fillContactStatsMonthSeries(chatbotId, timeRange, rows, eventTypes)
  }

  async getStatsByDay(
    chatbotId: string,
    timeRange: TimeRange,
    eventTypes?: ContactEventType[],
  ): Promise<ContactStats[]> {
    if (shouldUseMonthlyGranularity(timeRange.from, timeRange.to)) {
      return this.getStatsByMonth(chatbotId, timeRange, eventTypes)
    }

    const timeFilter = this.buildTimestampFilter(
      "day",
      timeRange.from,
      timeRange.to,
    )
    const eventTypeFilter = this.buildEventTypeFilter(eventTypes)

    const sql = `
      SELECT
        chatbot_id,
        day,
        event_type,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contact_stats_daily
      WHERE chatbot_id = {chatbotId:String}
        AND day >= toDate(toDateTime({from:UInt32}, 'UTC'))
        AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
        ${eventTypeFilter}
      GROUP BY chatbot_id, day, event_type
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

    return fillContactStatsDaySeries(chatbotId, timeRange, rows, eventTypes)
  }

  async getTotalContactsByMonth(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<DailyTotalContacts[]> {
    const timeFilter = this.buildTimestampFilter(
      "day",
      timeRange.from,
      timeRange.to,
    )

    const baselineSql = `
      WITH daily_created AS (
        SELECT
          day,
          uniqMerge(unique_contacts_state) AS created_contacts
        FROM contact_stats_daily
        WHERE chatbot_id = {chatbotId:String}
          AND day < toStartOfMonth(toDate(toDateTime({from:UInt32}, 'UTC')))
          AND event_type = 'contact_created'
        GROUP BY day
      ),
      daily_deleted AS (
        SELECT
          day,
          uniqMerge(unique_contacts_state) AS deleted_contacts
        FROM contact_stats_daily
        WHERE chatbot_id = {chatbotId:String}
          AND day < toStartOfMonth(toDate(toDateTime({from:UInt32}, 'UTC')))
          AND event_type = 'contact_deleted'
        GROUP BY day
      )
      SELECT
        sum(created_contacts) - sum(deleted_contacts) AS baseline_total
      FROM daily_created
      FULL OUTER JOIN daily_deleted USING (day)
    `

    const createdSql = `
      WITH daily AS (
        SELECT
          day,
          uniqMerge(unique_contacts_state) AS created_contacts
        FROM contact_stats_daily
        WHERE chatbot_id = {chatbotId:String}
          AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
          AND event_type = 'contact_created'
        GROUP BY day
      ),
      monthly AS (
        SELECT
          toStartOfMonth(day) as month,
          sum(created_contacts) AS created_contacts
        FROM daily
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
      WHERE month >= toStartOfMonth(toDate(toDateTime({from:UInt32}, 'UTC')))
      ORDER BY month ASC
    `

    const deletedSql = `
      WITH daily AS (
        SELECT
          day,
          uniqMerge(unique_contacts_state) AS deleted_contacts
        FROM contact_stats_daily
        WHERE chatbot_id = {chatbotId:String}
          AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
          AND event_type = 'contact_deleted'
        GROUP BY day
      ),
      monthly AS (
        SELECT
          toStartOfMonth(day) as month,
          sum(deleted_contacts) AS deleted_contacts
        FROM daily
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
      WHERE month >= toStartOfMonth(toDate(toDateTime({from:UInt32}, 'UTC')))
      ORDER BY month ASC
    `

    const [baselineResult, createdResult, deletedResult] = await Promise.all([
      this.query<{
        baseline_total: string
      }>(baselineSql, {
        chatbotId,
        ...timeFilter.params,
      }),
      this.query<{
        month: string
        total_contacts: string
      }>(createdSql, {
        chatbotId,
        ...timeFilter.params,
      }),
      this.query<{
        month: string
        total_deleted: string
      }>(deletedSql, {
        chatbotId,
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
        day: new Date(row.month),
        totalContacts: created - deleted,
      }
    })

    return fillMonthlyTotalContactsSeries(timeRange, raw, baselineTotal)
  }

  async getTotalContactsByDay(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<DailyTotalContacts[]> {
    if (shouldUseMonthlyGranularity(timeRange.from, timeRange.to)) {
      return this.getTotalContactsByMonth(chatbotId, timeRange)
    }
    const timeFilter = this.buildTimestampFilter(
      "day",
      timeRange.from,
      timeRange.to,
    )

    const baselineSql = `
      WITH daily_created AS (
        SELECT
          day,
          uniqMerge(unique_contacts_state) AS created_contacts
        FROM contact_stats_daily
        WHERE chatbot_id = {chatbotId:String}
          AND day < toDate(toDateTime({from:UInt32}, 'UTC'))
          AND event_type = 'contact_created'
        GROUP BY day
      ),
      daily_deleted AS (
        SELECT
          day,
          uniqMerge(unique_contacts_state) AS deleted_contacts
        FROM contact_stats_daily
        WHERE chatbot_id = {chatbotId:String}
          AND day < toDate(toDateTime({from:UInt32}, 'UTC'))
          AND event_type = 'contact_deleted'
        GROUP BY day
      )
      SELECT
        sum(created_contacts) - sum(deleted_contacts) AS baseline_total
      FROM daily_created
      FULL OUTER JOIN daily_deleted USING (day)
    `

    const createdSql = `
      WITH daily AS (
        SELECT
          day,
          uniqMerge(unique_contacts_state) AS created_contacts
        FROM contact_stats_daily
        WHERE chatbot_id = {chatbotId:String}
          AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
          AND event_type = 'contact_created'
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
      WHERE day >= toDate(toDateTime({from:UInt32}, 'UTC'))
      ORDER BY day ASC
    `

    const deletedSql = `
      WITH daily AS (
        SELECT
          day,
          uniqMerge(unique_contacts_state) AS deleted_contacts
        FROM contact_stats_daily
        WHERE chatbot_id = {chatbotId:String}
          AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
          AND event_type = 'contact_deleted'
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
      WHERE day >= toDate(toDateTime({from:UInt32}, 'UTC'))
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
        day: new Date(row.day),
        totalContacts: created - deleted,
      }
    })

    return fillDailyTotalContactsSeries(timeRange, raw, baselineTotal)
  }

  async getNewContactsCount(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<number> {
    const timeFilter = this.buildTimestampFilter(
      "occurred_at",
      timeRange.from,
      timeRange.to,
    )

    const sql = `
      SELECT
        uniq(contact_id) AS new_contacts
      FROM contact_events
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
        AND event_type = 'contact_created'
    `

    const result = await this.query<{
      new_contacts: string
    }>(sql, {
      chatbotId,
      ...timeFilter.params,
    })

    return result[0]?.new_contacts ? Number(result[0].new_contacts) : 0
  }

  async getContactsByDimension(
    chatbotId: string,
    timeRange: TimeRange,
    dimension: "country" | "channel",
  ): Promise<ContactsByDimension[]> {
    const sql = `
      SELECT
        ${dimension} as dimension,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contacts_by_${dimension}_daily
      WHERE chatbot_id = {chatbotId:String}
        AND day >= toDate(toDateTime({from:UInt32}, 'UTC'))
        AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
      GROUP BY dimension
      ORDER BY count DESC
    `

    const fromTimestamp = Math.floor(timeRange.from.getTime() / 1000)
    const toTimestamp = Math.floor(timeRange.to.getTime() / 1000)

    const result = await this.query<{
      dimension: string
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId,
      from: fromTimestamp,
      to: toTimestamp,
    })

    return result.map((row) => ({
      dimension: row.dimension,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))
  }

  getContactsByCountry(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<ContactsByDimension[]> {
    return this.getContactsByDimension(chatbotId, timeRange, "country")
  }

  async getContactsByChannel(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<ContactsByDimension[]> {
    const sql = `
      SELECT
        channel as dimension,
        countMerge(event_count_state) as count,
        uniqMerge(unique_contacts_state) as unique_contacts
      FROM contacts_by_channel_daily
      WHERE chatbot_id = {chatbotId:String}
        AND day >= toDate(toDateTime({from:UInt32}, 'UTC'))
        AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
      GROUP BY channel
      ORDER BY count DESC
    `

    const fromTimestamp = Math.floor(timeRange.from.getTime() / 1000)
    const toTimestamp = Math.floor(timeRange.to.getTime() / 1000)

    const result = await this.query<{
      dimension: string
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId,
      from: fromTimestamp,
      to: toTimestamp,
    })

    return result.map((row) => ({
      dimension: row.dimension,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))
  }

  async getActiveContacts(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<number> {
    const timeFilter = this.buildTimestampFilter(
      "day",
      timeRange.from,
      timeRange.to,
    )

    const sql = `
      SELECT
        uniqMerge(active_contacts_state) as active_contacts
      FROM active_contacts_daily
      WHERE chatbot_id = {chatbotId:String}
        AND day >= toDate(toDateTime({from:UInt32}, 'UTC'))
        AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
    `

    const result = await this.query<{ active_contacts: string }>(sql, {
      chatbotId,
      ...timeFilter.params,
    })

    return Number(result[0]?.active_contacts ?? 0)
  }

  async getContactsBySource(
    chatbotId: string,
    timeRange: TimeRange,
  ): Promise<ContactsByDimension[]> {
    const timeFilter = this.buildTimestampFilter(
      "occurred_at",
      timeRange.from,
      timeRange.to,
    )

    const sql = `
      SELECT
        source as dimension,
        count() as count,
        uniq(contact_id) as unique_contacts
      FROM contact_events
      WHERE chatbot_id = {chatbotId:String}
        AND ${timeFilter.sql}
        AND source != ''
        AND event_type = 'contact_created'
      GROUP BY source
      ORDER BY count DESC
    `

    const result = await this.query<{
      dimension: string
      count: string
      unique_contacts: string
    }>(sql, {
      chatbotId,
      ...timeFilter.params,
    })

    return result.map((row) => ({
      dimension: row.dimension,
      count: Number(row.count),
      uniqueContacts: Number(row.unique_contacts),
    }))
  }

  async getMessagesBySender(
    chatbotId: string,
    timeRange: TimeRange,
    granularity: "day" | "month" = "day",
  ): Promise<MessagesBySenderStats[]> {
    const _effectiveGranularity =
      granularity === "day" &&
      shouldUseMonthlyGranularity(timeRange.from, timeRange.to)
        ? "month"
        : granularity

    const table = "contact_stats_daily"
    const timeColumn = "day"

    const fromTimestamp = Math.floor(timeRange.from.getTime() / 1000)
    const toTimestamp = Math.floor(timeRange.to.getTime() / 1000)

    const sql = `
      SELECT
        chatbot_id,
        ${timeColumn} as timestamp,
        channel,
        sender_type,
        countMerge(event_count_state) as count
      FROM ${table}
      WHERE chatbot_id = {chatbotId:String}
        AND day >= toDate(toDateTime({from:UInt32}, 'UTC'))
        AND day <= toDate(toDateTime({to:UInt32}, 'UTC'))
        AND event_type = 'contact_message_out'
        AND sender_type != ''
      GROUP BY chatbot_id, ${timeColumn}, channel, sender_type
      ORDER BY ${timeColumn} ASC, channel ASC, sender_type ASC
    `

    const result = await this.query<{
      chatbot_id: string
      timestamp: string
      channel: string
      sender_type: "bot" | "human"
      count: string
    }>(sql, {
      chatbotId,
      from: fromTimestamp,
      to: toTimestamp,
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
