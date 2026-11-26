import {
  defaultPipelineItemSortDirection,
  type PipelineItemSortDirection,
  type PipelineItemSortKey,
  type PipelineType,
  pipelineItemSortDirections,
  pipelineItemSortKeys,
  pipelineTypes,
} from "@chatbotx.io/database/partials"
import {
  parseAsArrayOf,
  parseAsInteger,
  parseAsJson,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs"
import type { z } from "zod"
import { boardFilterState } from "../schema/query"

type BoardFilter = z.infer<typeof boardFilterState>

/**
 * The board filter read back from the URL. A hand-edited or outdated link
 * must not reach the API: anything the request schema rejects is dropped
 * whole (the board then shows unfiltered), dates come back as `Date`.
 */
export const parseBoardFilter = (value: unknown): BoardFilter | null => {
  const parsed = boardFilterState.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** Board URL state: shareable search, sort and filter. */
export const boardSearchParsers = {
  q: parseAsString.withDefault(""),
  filter: parseAsJson(parseBoardFilter),
  sort: parseAsStringLiteral(pipelineItemSortKeys.options).withDefault(
    "manual",
  ),
  // No default of its own: it follows the sort (see `sortDirection`), so a
  // shared link that only names `sort=value` keeps its old newest/highest-first meaning.
  dir: parseAsStringLiteral(pipelineItemSortDirections),
}

/** The URL's direction, or the sort's own default; manual order only reads top to bottom. */
export const sortDirection = (
  key: PipelineItemSortKey,
  dir: PipelineItemSortDirection | null,
): PipelineItemSortDirection =>
  key === "manual" ? "asc" : (dir ?? defaultPipelineItemSortDirection(key))

/**
 * List URL state, keyed by the filterable column ids so it is the same state
 * the DataTable toolbar writes.
 */
export const listSearchParsers = {
  name: parseAsString.withDefault(""),
  type: parseAsArrayOf(
    parseAsStringLiteral(pipelineTypes.options),
    ",",
  ).withDefault([]),
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
}

/** Name (case-insensitive substring) and type filter over the cached list. */
export function filterPipelineList<
  T extends { pipeline: { name: string; type: PipelineType } },
>(rows: T[], filter: { name: string; type: PipelineType[] }): T[] {
  const needle = filter.name.trim().toLocaleLowerCase()
  const types = new Set(filter.type)
  return rows.filter(
    ({ pipeline }) =>
      (needle === "" || pipeline.name.toLocaleLowerCase().includes(needle)) &&
      (types.size === 0 || types.has(pipeline.type)),
  )
}

/** One page of an in-memory list; an out-of-range page falls back to the last one. */
export function paginateList<T>(
  rows: T[],
  page: number,
  perPage: number,
): { rows: T[]; pageCount: number } {
  const size = Math.max(1, perPage)
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(Math.max(1, page), pageCount)
  return {
    rows: rows.slice((current - 1) * size, current * size),
    pageCount,
  }
}
