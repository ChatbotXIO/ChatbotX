import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  type SQL,
} from "@chatbotx.io/database/client"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

export type IdLabel = { id: string; name: string }

type LabelledTable = PgTable & {
  id: PgColumn
  name: PgColumn
  workspaceId: PgColumn
}

/**
 * `id`/`name` of the workspace rows among `ids`, as a primary-key `IN` lookup.
 * Rows that no longer exist (or fail `where`) are simply absent, so callers can
 * tell a deleted entity from a live one. `where` adds an entity's own
 * "still exists" rule, e.g. not soft-deleted. `tx` runs the lookup on a
 * caller's transaction instead of a second pooled connection.
 */
export const selectLabelsByIds = async (
  table: LabelledTable,
  input: {
    workspaceId: string
    ids: string[]
    where?: SQL
    tx?: DatabaseClient
  },
): Promise<IdLabel[]> => {
  if (input.ids.length === 0) {
    return []
  }
  const rows = await (input.tx ?? db)
    .select({ id: table.id, name: table.name })
    .from(table)
    .where(
      and(
        eq(table.workspaceId, input.workspaceId),
        inArray(table.id, input.ids),
        input.where,
      ),
    )
  return rows as IdLabel[]
}
