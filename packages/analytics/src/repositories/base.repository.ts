import {
  command as executeCommand,
  insert as executeInsert,
  query as executeQuery,
} from "../client"

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
  ): { sql: string; params: Record<string, number> } {
    const fromTimestamp = Math.floor(from.getTime() / 1000)
    const toTimestamp = Math.floor(to.getTime() / 1000)

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
