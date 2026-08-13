import { parseEnvBool } from "@chatbotx.io/utils"
import {
  DrizzleQueryError,
  type InferSelectModel,
  relationsFilterToSQL,
  sql,
} from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import type { PgTable } from "drizzle-orm/pg-core"
import { Pool } from "pg"
import { ModelNotfoundException } from "./errors"
import { keys } from "./keys"
import { logger } from "./logger"
import { relations } from "./relations"

// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "./schema"

const env = keys()

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on("error", (error) => {
  logger.error({ err: error }, "Unexpected idle database pool error")
})

export const db = drizzle({
  client: pool,
  schema,
  relations,
  // parseEnvBool: with SKIP_ENV_CHECK=true (build scripts) this is the raw
  // string "true", which drizzle would treat as a Logger object and crash on.
  logger: parseEnvBool(env.DATABASE_DEBUG),
})

export * from "drizzle-orm"

type RelationsFilterArg = Parameters<typeof relationsFilterToSQL>[1]
type RelationsFilterInternals = Parameters<typeof relationsFilterToSQL>[3]
type RelationsFilterCasing = Parameters<typeof relationsFilterToSQL>[4]
type DrizzleRelationInternalsClient = {
  _?: { relations: RelationsFilterInternals }
  dialect?: { casing: RelationsFilterCasing }
}
export type Transaction = Parameters<
  Parameters<(typeof db)["transaction"]>[0]
>[0]
export type { PgTable } from "drizzle-orm/pg-core"
export type DatabaseClient = typeof db | Transaction

// Side-effect-free hypertable helpers (kept out of this module so they can be
// imported without booting the connection pool). Re-exported here so callers
// keep using the single `@chatbotx.io/database/client` entrypoint.
export { liftDecompressionLimit } from "./timescale"

export const countWithRelationsFilter = <TTable extends PgTable>(props: {
  client?: DatabaseClient
  table: TTable
  tsName: string
  where: Record<string, unknown> | undefined
}): Promise<number> => {
  const { client = db, table, tsName, where } = props

  const filter = resolveRelationsFilter({
    client,
    table,
    tsName,
    where,
  })

  return filter ? client.$count(table, filter) : client.$count(table)
}

export const countWithRelationsFilterCapped = async <
  TTable extends PgTable,
>(props: {
  cap: number
  client?: DatabaseClient
  table: TTable
  tsName: string
  where: Record<string, unknown> | undefined
}): Promise<{ total: number; capped: boolean; cap: number }> => {
  const { cap, client = db, table, tsName, where } = props
  const filter = resolveRelationsFilter({
    client,
    table,
    tsName,
    where,
  })
  const whereClause = filter ? sql`WHERE ${filter}` : sql``
  const result = await client.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count
    FROM (
      SELECT 1
      FROM ${table}
      ${whereClause}
      LIMIT ${cap + 1}
    ) AS "cappedCount"
  `)
  const count = result.rows[0]?.count ?? 0

  return {
    total: Math.min(count, cap),
    capped: count > cap,
    cap,
  }
}

const resolveRelationsFilter = <TTable extends PgTable>(props: {
  client: DatabaseClient
  table: TTable
  tsName: string
  where: Record<string, unknown> | undefined
}) => {
  const { client, table, tsName, where } = props

  if (!where || Object.keys(where).length === 0) {
    return
  }

  const internalClient = client as unknown as DrizzleRelationInternalsClient
  const rootClient = db as unknown as Required<DrizzleRelationInternalsClient>
  const relationInternals =
    internalClient._?.relations ?? rootClient._.relations
  const tableRelations = relationInternals[tsName]?.relations

  if (!tableRelations) {
    throw new Error(`Relation config not found for table: ${tsName}`)
  }

  return relationsFilterToSQL(
    table,
    where as RelationsFilterArg,
    tableRelations,
    relationInternals,
    internalClient.dialect?.casing ?? rootClient.dialect.casing,
  )
}

export const findOrFail = async <TTable extends PgTable>(props: {
  client?: DatabaseClient
  table: TTable
  where: Record<string, unknown> | undefined
  message?: string
}): Promise<InferSelectModel<TTable>> => {
  const { client = db, table, where, message = "Record not found" } = props
  const result = await client
    .select()
    .from(table as PgTable)
    .where(relationsFilterToSQL(table, where as RelationsFilterArg))
    .limit(1)
    .then((result) => result[0] as InferSelectModel<TTable> | undefined)

  if (!result) {
    throw new ModelNotfoundException(message)
  }

  return result
}

export const throwIfExists = async <TTable extends PgTable>(props: {
  client?: DatabaseClient
  table: TTable
  where: Record<string, unknown> | undefined
  message?: string
}): Promise<void> => {
  const {
    client = db,
    table,
    where,
    message = "Resource already exists",
  } = props

  const result = await client
    .select()
    .from(table as PgTable)
    .where(relationsFilterToSQL(table, where as RelationsFilterArg))
    .limit(1)
    .then((rows) => rows[0])

  if (result) {
    throw new Error(message)
  }
}

export const isDatabaseError = (
  error: unknown,
): error is DrizzleQueryError & { cause: { code: string } } =>
  error instanceof DrizzleQueryError &&
  typeof error.cause === "object" &&
  error.cause !== null &&
  "code" in error.cause

/**
 * Detects a unique-constraint violation (SQLSTATE 23505).
 *
 * Pass `constraint` to match one specific index — a table with several unique
 * indexes otherwise reports every collision the same way, and each usually
 * needs its own message.
 */
export const isUniqueViolationError = (
  error: unknown,
  constraint?: string,
): boolean => {
  if (!(isDatabaseError(error) && error.cause.code === "23505")) {
    return false
  }

  if (constraint === undefined) {
    return true
  }

  const cause = error.cause as { constraint?: unknown }

  return cause.constraint === constraint
}

export type DatabaseErrorDescription = {
  code?: string
  constraint?: string
  detail?: string
  message?: string
  table?: string
}

export function describeDatabaseError(
  error: unknown,
): DatabaseErrorDescription {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current !== "object") {
      break
    }

    const candidate = current as {
      cause?: unknown
      code?: unknown
      constraint?: unknown
      constraint_name?: unknown
      detail?: unknown
      message?: unknown
      table?: unknown
    }

    if (typeof candidate.code === "string") {
      return {
        code: candidate.code,
        constraint: firstStringField(
          candidate.constraint,
          candidate.constraint_name,
        ),
        detail: stringField(candidate.detail),
        message: stringField(candidate.message),
        table: stringField(candidate.table),
      }
    }

    current = candidate.cause
  }

  return {
    message: error instanceof Error ? error.message : String(error),
  }
}

function firstStringField(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string")
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
