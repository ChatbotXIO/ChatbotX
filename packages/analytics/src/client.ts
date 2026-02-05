import { createClient } from "@clickhouse/client"

const clickhouseUrl = process.env.CLICKHOUSE_URL
const clickhouseUser = process.env.CLICKHOUSE_USER
const clickhousePassword = process.env.CLICKHOUSE_PASSWORD
const clickhouseDatabase = process.env.CLICKHOUSE_DB

// console.log("ClickHouse environment variables:", {
//   clickhouseUrl,
//   clickhouseUser,
//   clickhousePassword,
//   clickhouseDatabase,
// })

if (
  !(clickhouseUrl && clickhouseUser && clickhousePassword && clickhouseDatabase)
) {
  throw new Error("Missing ClickHouse environment variables")
}

export const clickhouse = createClient({
  url: clickhouseUrl,
  username: clickhouseUser,
  password: clickhousePassword,
  database: clickhouseDatabase,
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

export const clickhouseClient = clickhouse
