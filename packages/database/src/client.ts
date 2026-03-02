import { DrizzleQueryError, relationsFilterToSQL } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import type { PgTable } from "drizzle-orm/pg-core"
import { Pool } from "pg"
import { relations } from "./drizzle/relations"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "./drizzle/schema"
import { ModelNotfoundException } from "./errors"
import { keys } from "./keys"

const env = keys()

const pool = new Pool({
  connectionString: env.DATABASE_URL,
})
export const db = drizzle({ client: pool, schema, relations, logger: true })

export * from "drizzle-orm"

type RelationsFilterArg = Parameters<typeof relationsFilterToSQL>[1]
export type Transaction = Parameters<
  Parameters<(typeof db)["transaction"]>[0]
>[0]
export type { PgTable } from "drizzle-orm/pg-core"

export const findOrFail = async <T>(
  // biome-ignore lint/suspicious/noExplicitAny: safe to use any
  table: PgTable<any>,
  where: Record<string, unknown> | undefined,
  message = "Record not found",
): Promise<T> => {
  const result = await db
    .select()
    .from(table)
    .where(relationsFilterToSQL(table, where as RelationsFilterArg))
    .limit(1)
    .then((result) => result[0])

  if (!result) {
    throw new ModelNotfoundException(message)
  }

  return result
}

export const throwIfExists = async (
  // biome-ignore lint/suspicious/noExplicitAny: safe to use any
  table: PgTable<any>,
  where: Record<string, unknown> | undefined,
  message = "Resource already exists",
): Promise<void> => {
  const result = await db
    .select()
    .from(table)
    .where(relationsFilterToSQL(table, where as RelationsFilterArg))
    .limit(1)
    .then((rows) => rows[0])

  if (result) {
    throw new Error(message)
  }
}

export const isDatabaseError = (
  error: unknown,
): error is DrizzleQueryError & { cause: { code: string } } => {
  return (
    error instanceof DrizzleQueryError &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause
  )
}
