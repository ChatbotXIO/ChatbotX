import {
  command as executeCommand,
  insert as executeInsert,
  query as executeQuery,
} from "@aha.chat/database/clickhouse/client"

export abstract class BaseRepository {
  protected query<T>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<T[]> {
    return executeQuery<T>(sql, params)
  }

  protected insert(
    table: string,
    data: Record<string, unknown>[],
  ): Promise<void> {
    return executeInsert(table, data)
  }

  protected command(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    return executeCommand(sql, params)
  }

  protected buildTimestampFilter(
    field: string,
    from: Date,
    to: Date,
    columnType: "Date" | "DateTime" = "DateTime",
  ): { sql: string; params: Record<string, number> } {
    const fromTimestamp = Math.floor(from.getTime() / 1000)
    const toTimestamp = Math.floor(to.getTime() / 1000)

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

  protected buildEventTypeFilter(eventTypes?: string[]): string {
    if (!eventTypes || eventTypes.length === 0) {
      return ""
    }
    const types = eventTypes.map((t) => `'${t}'`).join(",")
    return `AND event_type IN (${types})`
  }
}
