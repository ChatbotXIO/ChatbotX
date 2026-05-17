import {
  command as executeCommand,
  insert as executeInsert,
  query as executeQuery,
} from "@chatbotx.io/clickhouse/client"
import { env } from "../../key"
import type { TimeRangeQuery } from "../../schemas"

export abstract class BaseRepository {
  protected get isClickhouseEnabled(): boolean {
    return env.ANALYTICS_ENABLED
  }

  protected query<T>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    if (!this.isClickhouseEnabled) {
      return Promise.resolve([])
    }
    return executeQuery<T>(sql, params)
  }

  /**
   * Insert data into ClickHouse table.
   * Automatically skips insertion when ANALYTICS_ENABLED is false.
   */
  protected insert(
    table: string,
    data: Record<string, unknown>[],
  ): Promise<void> {
    if (!this.isClickhouseEnabled) {
      return Promise.resolve()
    }
    return executeInsert(table, data)
  }

  protected command(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    return executeCommand(sql, params)
  }

  protected buildTimestampFilter(
    props: TimeRangeQuery & {
      field: string
      columnType?: "Date" | "DateTime"
    },
  ): { sql: string; params: Record<string, number> } {
    const { field, columnType = "DateTime" } = props
    const fromTimestamp = Math.floor(props.from.getTime() / 1000)
    const toTimestamp = Math.floor(props.to.getTime() / 1000)

    if (columnType === "Date") {
      return {
        sql: `${field} >= toDate(toDateTime({from:UInt32}, 'UTC')) AND ${field} < toDate(toDateTime({to:UInt32}, 'UTC'))`,
        params: {
          from: fromTimestamp,
          to: toTimestamp,
        },
      }
    }

    return {
      sql: `${field} >= {from:UInt32} AND ${field} < {to:UInt32}`,
      params: {
        from: fromTimestamp,
        to: toTimestamp,
      },
    }
  }

  protected buildEventTypeFilter(
    eventTypes?: string[],
    paramKey = "eventTypes",
  ): { sql: string; params: Record<string, string[]> } {
    if (!eventTypes || eventTypes.length === 0) {
      return { sql: "", params: {} }
    }
    return {
      sql: `AND event_type IN ({${paramKey}:Array(String)})`,
      params: { [paramKey]: eventTypes },
    }
  }

  protected buildHourlyTimestampFilter(props: TimeRangeQuery): {
    sql: string
    params: Record<string, unknown>
  } {
    const fromTimestamp = Math.floor(props.from.getTime() / 1000)
    const toTimestamp = Math.floor(props.to.getTime() / 1000)

    return {
      sql: "hour >= toStartOfHour(toDateTime({from:UInt32}, {timezone:String})) AND hour <= toDateTime({to:UInt32}, {timezone:String})",
      params: {
        from: fromTimestamp,
        to: toTimestamp,
        timezone: props.timezone,
      },
    }
  }

  protected buildDayGroupFromHourly(props: TimeRangeQuery): string {
    return `toDate(hour, '${props.timezone}')`
  }

  protected buildMonthGroupFromHourly(props: TimeRangeQuery): string {
    return `toStartOfMonth(toDate(hour, '${props.timezone}'))`
  }
}
