import { db, sql } from "@chatbotx.io/database/client"

const THROWAWAY_PREFIX = "chatbotx_it_"

/** True when the suite was started through `test:db` (a real, throwaway DB). */
export const hasThrowawayDatabase = (): boolean =>
  Boolean(process.env.E2E_THROWAWAY_DATABASE)

/** Closes the pool so dropping the throwaway database finds no open sessions. */
export const closeDatabase = async (): Promise<void> => {
  await db.$client.end()
}

/**
 * Safety belt: refuses to continue unless the connection really is the
 * throwaway database created by global setup, so a misconfigured run can never
 * write fake data into a developer's or production database.
 */
export const assertThrowawayDatabase = async (): Promise<void> => {
  const expected = process.env.E2E_THROWAWAY_DATABASE
  const { rows } = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  )
  const actual = rows[0]?.name
  if (!(expected?.startsWith(THROWAWAY_PREFIX) && actual === expected)) {
    throw new Error(
      `Refusing to run: connected to "${actual}", expected throwaway database "${expected}"`,
    )
  }
}
