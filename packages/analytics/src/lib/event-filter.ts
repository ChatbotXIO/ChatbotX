import { sql } from "@chatbotx.io/database/client"
import {
  type AnalyticsFilter,
  normalizeAnalyticsFilters,
} from "../schemas/common"

type SqlFragment = ReturnType<typeof sql>

/** Columns the filter applies to; defaults to the event tables' own columns. */
type FilterColumns = { channel: SqlFragment; inboxId: SqlFragment }

const inList = (column: SqlFragment, values: string[]): SqlFragment =>
  values.length > 0
    ? sql` AND ${column} IN (${sql.join(
        values.map((value) => sql`${value}`),
        sql`, `,
      )})`
    : sql``

/**
 * Parameterized `AND <channel> IN (...) AND <inboxId> IN (...)` predicate; an
 * empty filter (= "All") yields an empty fragment so the unfiltered SQL stays
 * byte-identical. Built lazily — never at module scope.
 */
export function buildEventFilter(
  filter: AnalyticsFilter | undefined,
  columns: FilterColumns = {
    channel: sql`"channel"`,
    inboxId: sql`"inboxId"`,
  },
): SqlFragment {
  const { channels, inboxIds } = normalizeAnalyticsFilters(filter)
  return sql`${inList(columns.channel, channels)}${inList(columns.inboxId, inboxIds)}`
}
