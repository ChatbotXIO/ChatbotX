import { type SQL, sql } from "@chatbotx.io/database/client"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

/**
 * `WHERE` fragment: the row's stored access token is still `expected`.
 *
 * A refresh cron reads the auth, calls the provider, then writes. A reconnect
 * can land in between (it does not take the cron's lock); an unconditional
 * write would put the old token back over the new one. Adding this condition
 * turns that write into a no-op. Zalo is the sharpest case: its refresh token
 * is single-use, so the loser would also burn the rotated one.
 */
export const accessTokenMatches = (
  authColumn: AnyPgColumn,
  expected: string,
): SQL => sql`${authColumn} -> 'tokens' ->> 'accessToken' = ${expected}`
