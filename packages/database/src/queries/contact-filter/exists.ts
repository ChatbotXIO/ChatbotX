import { type AnyColumn, type SQL, sql } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { contactInboxModel } from "../../schema"
import type { ContactWhere, RawTable, RelationExists } from "./types"

export const existsWhere = (
  buildSelect: (contactId: AnyColumn, table: RawTable) => SQL,
  negate = false,
): ContactWhere => ({
  RAW: (table: RawTable): SQL => {
    const inner = buildSelect(table.id, table)
    return negate ? sql`NOT EXISTS (${inner})` : sql`EXISTS (${inner})`
  },
})

export const joinTableExists =
  (table: PgTable, contactIdColumn: AnyColumn): RelationExists =>
  (predicate, negate = false): ContactWhere =>
    existsWhere(
      (contactId) =>
        predicate
          ? sql`SELECT 1 FROM ${table} WHERE ${contactIdColumn} = ${contactId} AND ${predicate}`
          : sql`SELECT 1 FROM ${table} WHERE ${contactIdColumn} = ${contactId}`,
      negate,
    )

export const contactInboxExists = joinTableExists(
  contactInboxModel,
  contactInboxModel.contactId,
)
