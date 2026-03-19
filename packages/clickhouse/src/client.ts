import { createClient } from "@clickhouse/client"
import { keys } from "./keys"

const env = keys()

export const clickhouse = createClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USER,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DB,
  request_timeout: env.CLICKHOUSE_REQUEST_TIMEOUT,
  compression: {
    request: true,
    response: true,
  },
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 0,
    async_insert_max_data_size: "10485760",
    async_insert_busy_timeout_ms: 5000,
  },
})

export async function ping() {
  try {
    const result = await clickhouse.ping()
    return result.success
  } catch (error) {
    console.error("ClickHouse ping failed:", error)
    return false
  }
}

export async function query<T = unknown>(
  sql: string,
  params?: Record<string, unknown>,
) {
  const resultSet = await clickhouse.query({
    query: sql,
    query_params: params,
    format: "JSONEachRow",
  })
  return resultSet.json<T>()
}

export async function insert(table: string, values: unknown[]) {
  if (values.length === 0) {
    return
  }

  await clickhouse.insert({
    table,
    values,
    format: "JSONEachRow",
  })
}

export async function command(sql: string, params?: Record<string, unknown>) {
  await clickhouse.command({
    query: sql,
    query_params: params,
  })
}
