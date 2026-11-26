import {
  CHANNEL_POST_EXPORT_MAX_DISTINCT_VALUES,
  CHANNEL_POST_EXPORT_MAX_ROWS,
  type ExportRow,
  keepEarliestRow,
} from "@chatbotx.io/business"
import type { UploadWriter } from "@chatbotx.io/filesystem/upload-writer"
import { toCsvRow } from "@chatbotx.io/utils/csv"
import type { ExportChannelPostCommentsKind } from "@chatbotx.io/worker-config"

/** Where the rows of one export go, and when a ceiling stops it. */
export type RowSink = {
  /**
   * Takes the rows of one page; `false` once a ceiling was hit (nothing more is
   * wanted). `hasMore` says the read has more to give (a next page or another
   * post): a ceiling that stops it then flags the file truncated.
   */
  accept: (entries: ExportRow[], hasMore: boolean) => Promise<boolean>
  /** Writes what was held back; call once, after the last page. */
  finish: () => Promise<void>
  /** Rows the file holds (or will hold once finished). */
  rowCount: () => number
  /** A ceiling cut the read short. */
  truncated: () => boolean
}

const FLUSH_ROWS = 1000

type UploadSink = Pick<UploadWriter, "write">

/** Every comment is a row, written as each page arrives: memory stays at one page. */
const createStreamingSink = (upload: UploadSink): RowSink => {
  let written = 0
  let isTruncated = false
  return {
    accept: async (entries, hasMore) => {
      const room = CHANNEL_POST_EXPORT_MAX_ROWS - written
      const kept = entries.slice(0, Math.max(room, 0))
      if (kept.length > 0) {
        await upload.write(kept.map((entry) => toCsvRow(entry.row)).join(""))
      }
      written += kept.length
      const isFull = written >= CHANNEL_POST_EXPORT_MAX_ROWS
      // Rows were dropped from this page, or the file is exactly full and the
      // read had more: either way the file is incomplete.
      isTruncated =
        isTruncated || kept.length < entries.length || (isFull && hasMore)
      return !isFull
    },
    finish: async () => undefined,
    rowCount: () => written,
    truncated: () => isTruncated,
  }
}

const earliestFirst = (a: ExportRow, b: ExportRow): number => {
  const first = a.at?.getTime() ?? Number.POSITIVE_INFINITY
  const second = b.at?.getTime() ?? Number.POSITIVE_INFINITY
  return first - second
}

/**
 * One row per distinct key (a phone number or an email), the row of the key's
 * first comment. The set is held in memory, so it is bounded; the file is
 * written at the end, earliest first.
 */
const createDistinctSink = (upload: UploadSink): RowSink => {
  const rows = new Map<string, ExportRow>()
  let isTruncated = false
  return {
    accept: (entries) => {
      for (const entry of entries) {
        if (entry.key === null) {
          continue
        }
        const isNew = !rows.has(entry.key)
        if (isNew && rows.size >= CHANNEL_POST_EXPORT_MAX_DISTINCT_VALUES) {
          isTruncated = true
          return Promise.resolve(false)
        }
        keepEarliestRow(rows, { ...entry, key: entry.key })
      }
      return Promise.resolve(true)
    },
    finish: async () => {
      const sorted = Array.from(rows.values()).sort(earliestFirst)
      for (let start = 0; start < sorted.length; start += FLUSH_ROWS) {
        await upload.write(
          sorted
            .slice(start, start + FLUSH_ROWS)
            .map((entry) => toCsvRow(entry.row))
            .join(""),
        )
      }
    },
    rowCount: () => rows.size,
    truncated: () => isTruncated,
  }
}

export const SINK_FACTORIES: Record<
  ExportChannelPostCommentsKind,
  (upload: UploadSink) => RowSink
> = {
  comments: createStreamingSink,
  emails: createDistinctSink,
  phones: createDistinctSink,
}
