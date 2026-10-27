import type { SQL } from "@chatbotx.io/database/client"
import { sql } from "@chatbotx.io/database/client"
import { pipelineItemModel } from "@chatbotx.io/database/schema"
import type { PipelineItemSortKey } from "../../partials/pipeline"
import { isBigintId } from "../../utils"

const TIMESTAMP_TEXT_PATTERN =
  /^\d{4,}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:\d{2}){0,2}|Z)?( BC)?$/
const NUMERIC_TEXT_PATTERN = /^-?\d+(\.\d+)?$/
const TIMESTAMP_PARTS_PATTERN =
  /^(\d{4,})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:([+-])(\d{2})(?::(\d{2}))?(?::(\d{2}))?|Z)?(?: BC)?$/
const MAX_NUMERIC_INTEGER_DIGITS = 30
const MAX_OFFSET_HOURS = 15
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const PRIORITY_RANK_TEXT_PATTERN = /^[1-3]$/

/** Priority ordering: high > medium > low. */
const priorityRank = () =>
  sql`case ${pipelineItemModel.priority} when 'high' then 3 when 'medium' then 2 else 1 end`

type SortSpec = { expression: SQL; cast: string; nullable: boolean }

// Built on demand: `sql` must not run at import time, or any consumer that
// partially mocks the database client fails to even load this module.
const sortSpecs = (): Record<PipelineItemSortKey, SortSpec> => ({
  createdAt: {
    expression: sql`${pipelineItemModel.createdAt}`,
    cast: "timestamptz",
    nullable: false,
  },
  updatedAt: {
    expression: sql`${pipelineItemModel.updatedAt}`,
    cast: "timestamptz",
    nullable: false,
  },
  value: {
    expression: sql`${pipelineItemModel.value}`,
    cast: "numeric",
    nullable: true,
  },
  dueDate: {
    expression: sql`${pipelineItemModel.dueDate}`,
    cast: "timestamptz",
    nullable: true,
  },
  priority: { expression: priorityRank(), cast: "int", nullable: false },
})

export type PipelineItemSort = {
  key: PipelineItemSortKey
  direction: "asc" | "desc"
}

export type PipelineItemCursor = {
  v: 1
  sort: PipelineItemSortKey
  dir: "asc" | "desc"
  nullRank: 0 | 1
  sortValue: string | null
  id: string
}

export class InvalidPipelineCursorError extends Error {}

export function encodePipelineItemCursor(cursor: PipelineItemCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

/** Text shape of a cursor sort value, keyed by the sort spec's SQL cast. */
const CURSOR_VALUE_PATTERNS_BY_CAST: Record<string, RegExp> = {
  timestamptz: TIMESTAMP_TEXT_PATTERN,
  numeric: NUMERIC_TEXT_PATTERN,
  int: PRIORITY_RANK_TEXT_PATTERN,
}

const inRange = (value: number, min: number, max: number) =>
  value >= min && value <= max

/** Calendar and clock ranges Postgres accepts for a timestamp literal. */
function isTimestampInRange(text: string): boolean {
  const match = TIMESTAMP_PARTS_PATTERN.exec(text)
  if (!match) {
    return false
  }
  const [
    ,
    ,
    month,
    day,
    hour,
    minute,
    second,
    ,
    offsetHours,
    offsetMinutes,
    offsetSeconds,
  ] = match.map((part) => part ?? "0")
  const monthNumber = Number(month)
  return (
    inRange(monthNumber, 1, 12) &&
    inRange(Number(day), 1, DAYS_IN_MONTH[monthNumber - 1] ?? 0) &&
    inRange(Number(hour), 0, 24) &&
    inRange(Number(minute), 0, 59) &&
    inRange(Number(second), 0, 59) &&
    inRange(Number(offsetHours), 0, MAX_OFFSET_HOURS) &&
    inRange(Number(offsetMinutes), 0, 59) &&
    inRange(Number(offsetSeconds), 0, 59)
  )
}

function isNumericSane(text: string): boolean {
  const integerPart = text.replace("-", "").split(".")[0] ?? ""
  return integerPart.length <= MAX_NUMERIC_INTEGER_DIGITS
}

/** A null sort value is only legal for the NULL rank group, else it must fit the key's type. */
function isSortValueValid(
  key: PipelineItemSortKey,
  nullRank: 0 | 1,
  sortValue: unknown,
): boolean {
  if (nullRank === 1) {
    return sortValue === null
  }
  const { cast } = sortSpecs()[key]
  const pattern = CURSOR_VALUE_PATTERNS_BY_CAST[cast]
  if (typeof sortValue !== "string" || !pattern?.test(sortValue)) {
    return false
  }
  if (cast === "timestamptz") {
    return isTimestampInRange(sortValue)
  }
  if (cast === "numeric") {
    return isNumericSane(sortValue)
  }
  return true
}

const PAGE_SIZE_MAX = 100

/** A requested page size kept within 1..100. */
export const clampPageLimit = (limit: number) =>
  Math.min(Math.max(limit, 1), PAGE_SIZE_MAX)

/** Keyset cursor resuming right after `row` (sort value read as text). */
export function cursorFor(
  sort: PipelineItemSort,
  row: { sortValue: string | null; id: string },
): string {
  return encodePipelineItemCursor({
    v: 1,
    sort: sort.key,
    dir: sort.direction,
    nullRank: row.sortValue === null ? 1 : 0,
    sortValue: row.sortValue,
    id: row.id,
  })
}

export function decodePipelineItemCursor(
  raw: string,
  sort: PipelineItemSort,
): PipelineItemCursor {
  let parsed: PipelineItemCursor | null
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
  } catch {
    throw new InvalidPipelineCursorError("Invalid cursor")
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidPipelineCursorError("Invalid cursor")
  }
  const isValid =
    parsed.v === 1 &&
    parsed.sort === sort.key &&
    parsed.dir === sort.direction &&
    (parsed.nullRank === 0 || parsed.nullRank === 1) &&
    typeof parsed.id === "string" &&
    isBigintId(parsed.id) &&
    isSortValueValid(sort.key, parsed.nullRank, parsed.sortValue)
  if (!isValid) {
    throw new InvalidPipelineCursorError("Invalid cursor")
  }
  return parsed
}

/**
 * Cursor of a newest-first list over a NOT NULL timestamp (comments,
 * activity): a null-ranked cursor can never come from such a page, so it is
 * rejected instead of silently restarting from the first page.
 */
export function decodeTimestampCursor(
  raw: string,
  sort: PipelineItemSort,
): { sortValue: string; id: string } {
  const cursor = decodePipelineItemCursor(raw, sort)
  if (cursor.nullRank !== 0 || cursor.sortValue === null) {
    throw new InvalidPipelineCursorError("Invalid cursor")
  }
  return { sortValue: cursor.sortValue, id: cursor.id }
}

/** `(nullRank, sortValue, id)` sort tuple; NULLS LAST in both directions. */
export function pipelineItemOrderBy(
  sort: PipelineItemSort,
  /**
   * Order an outer query by the columns a subquery exposed (the sort value as
   * text, cast back to its type) instead of the item table's own columns.
   */
  outer?: { sortValueText: SQL; id: SQL },
): SQL[] {
  const spec = sortSpecs()[sort.key]
  const expression = outer
    ? sql`(${outer.sortValueText})::${sql.raw(spec.cast)}`
    : spec.expression
  const id = outer ? outer.id : sql`${pipelineItemModel.id}`
  const direction = sort.direction === "asc" ? sql`asc` : sql`desc`
  const valueAndId = [sql`${expression} ${direction}`, sql`${id} ${direction}`]
  // A bare numeric literal in ORDER BY is a select-list position, so the
  // null-rank term is only emitted for sort keys that can actually be NULL.
  return spec.nullable
    ? [sql`(${expression} is null)::int asc`, ...valueAndId]
    : valueAndId
}

/** Strictly-after predicate for the keyset page following `cursor`. */
export function pipelineItemAfterCursor(
  sort: PipelineItemSort,
  cursor: PipelineItemCursor,
): SQL {
  const spec = sortSpecs()[sort.key]
  const op = sort.direction === "asc" ? sql`>` : sql`<`
  const idAfter = sql`${pipelineItemModel.id} ${op} ${cursor.id}::bigint`
  if (cursor.nullRank === 1 || cursor.sortValue === null) {
    return sql`((${spec.expression} is null) and ${idAfter})`
  }
  const valueParam = sql`${cursor.sortValue}::${sql.raw(spec.cast)}`
  // A row comparison lets the btree start at the cursor instead of scanning
  // every earlier row; only a nullable key needs the OR form for its NULLs.
  if (!spec.nullable) {
    return sql`((${spec.expression}, ${pipelineItemModel.id}) ${op} (${valueParam}, ${cursor.id}::bigint))`
  }
  return sql`(${spec.expression} is null or ${spec.expression} ${op} ${valueParam} or (${spec.expression} = ${valueParam} and ${idAfter}))`
}

/**
 * Text form of the sort value, read straight from Postgres so timestamps keep
 * their microseconds (a JS Date would truncate them and re-serve rows).
 */
export function pipelineItemSortValueText(
  sort: PipelineItemSort,
): SQL<string | null> {
  return sql<string | null>`${sortSpecs()[sort.key].expression}::text`
}
