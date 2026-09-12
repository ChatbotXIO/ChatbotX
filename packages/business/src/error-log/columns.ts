import type { ErrorLogModel } from "@chatbotx.io/database/types"

/**
 * Columns that are developer-only and must never cross the network: a stack
 * leaks absolute server paths and our internal call chain, and the channel-side
 * contact identity has no reader here. Both are read from the database
 * directly.
 *
 * Declared once and derived everywhere — the DB projection, the internal
 * response schema, the UI-facing resource type and the sortable allow-list all
 * key off this, so a new developer-only column is withheld from all four by
 * adding its name here. See the column docs in
 * `packages/database/src/schema/error-log.ts` for why each one is hidden.
 *
 * The public route's `.pick()` allow-list is deliberately NOT derived from
 * this: it is a narrower exposure surface, not merely "everything minus these".
 *
 * Lives in the business layer because that is where the list query now runs
 * (`./service`), and in its own module rather than inside `./service` so the
 * builder's schema layer can read the policy — it is the same list on both
 * sides of the network — without pulling `db` into an app-side import graph.
 */
export const WITHHELD_ERROR_LOG_COLUMNS = ["stackTrace", "sourceId"] as const

export type WithheldErrorLogColumn = (typeof WITHHELD_ERROR_LOG_COLUMNS)[number]

/**
 * The withheld columns as a `{ column: value }` mask, for the two APIs that
 * want one: zod's `.omit()` (`true`) and drizzle's `columns` selector
 * (`false`, exclude-mode).
 */
export const withheldErrorLogColumns = <V extends boolean>(
  value: V,
): { [K in WithheldErrorLogColumn]: V } =>
  Object.fromEntries(
    WITHHELD_ERROR_LOG_COLUMNS.map((column) => [column, value]),
  ) as { [K in WithheldErrorLogColumn]: V }

/**
 * Columns the list may be ordered by, handed to `parseOrderByAsObject` as its
 * allow-list. An allow-list, not a denylist: without one that helper accepts
 * any id present on the model, so ordering by a withheld column would be a
 * lexicographic oracle over a value the caller cannot read — the same attack
 * the public route pins its order to avoid. This keeps the next hidden column
 * safe on the day it lands, with nothing to remember. Every sort the table can
 * produce is here.
 *
 * Narrower than "the model minus the withheld columns" on purpose — the table
 * sorts by neither id column — so it is listed rather than derived. The
 * `satisfies` makes adding a withheld column here a compile error anyway.
 */
export const SORTABLE_COLUMNS: ReadonlySet<string> = new Set([
  "id",
  "action",
  "detail",
  "createdAt",
  "updatedAt",
] satisfies readonly Exclude<keyof ErrorLogModel, WithheldErrorLogColumn>[])
