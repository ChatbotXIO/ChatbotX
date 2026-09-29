import { MISSED_COMMENTS_MAX_PAGES } from "./types"

/** A colon-less `+0000` UTC offset at the end of a Graph timestamp. */
const GRAPH_TIME_OFFSET = /([+-]\d{2})(\d{2})$/

type Page<TItem, TCursor> = {
  items: TItem[]
  nextCursor?: TCursor
}

/**
 * Walks a paged comment list and keeps the items written at or after `since`.
 *
 * With `newestFirst`, the walk stops at the first older item — everything after
 * it is older too. Without it (an edge that cannot be ordered), every page up to
 * the cap is read and filtered.
 */
export async function collectCommentsSince<TItem, TCursor>(props: {
  fetchPage: (cursor?: TCursor) => Promise<Page<TItem, TCursor>>
  createdAtOf: (item: TItem) => number
  since: Date
  newestFirst: boolean
}): Promise<TItem[]> {
  const { fetchPage, createdAtOf, since, newestFirst } = props
  const sinceMs = since.getTime()
  const collected: TItem[] = []

  let cursor: TCursor | undefined
  for (let pageCount = 0; pageCount < MISSED_COMMENTS_MAX_PAGES; pageCount++) {
    const page = await fetchPage(cursor)

    for (const item of page.items) {
      if (createdAtOf(item) >= sinceMs) {
        collected.push(item)
      } else if (newestFirst) {
        return collected
      }
    }

    if (page.nextCursor === undefined) {
      break
    }
    cursor = page.nextCursor
  }

  return collected
}

/**
 * Graph renders times as `2025-10-17T01:37:25+0000`; the offset needs a colon
 * to be parsed reliably. Returns epoch milliseconds, `NaN` when unparseable.
 */
export function parseGraphTime(value: string): number {
  return new Date(value.replace(GRAPH_TIME_OFFSET, "$1:$2")).getTime()
}

export function toEpochSeconds(milliseconds: number): number {
  return Math.floor(milliseconds / 1000)
}
