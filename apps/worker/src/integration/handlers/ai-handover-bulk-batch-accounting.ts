import type { BulkAiContactInboxRow } from "@chatbotx.io/database/repositories"
import {
  type BulkThreadControlItemResult,
  ChannelError,
  ChannelErrorCategory,
} from "@chatbotx.io/sdk"

// The pure rules of how a batch's channel results are read and counted: no I/O,
// so the accounting that decides what is never sent twice is testable alone.

const DELIVERED_UNRECORDED = new ChannelError(
  "Delivered, but the thread change could not be recorded",
  ChannelErrorCategory.NETWORK_ERROR,
)

/**
 * A quota deferral rewinds the cursor, so the rows after it are walked again.
 * A takeover whose message was delivered but not recorded still reads as
 * eligible and would be messaged twice: for the page's accounting it is an
 * outcome that must not be repeated, like a send whose result is unknown.
 */
export const withUnrecordedAsUnknown = (
  results: BulkThreadControlItemResult[],
  unrecordedIds: ReadonlySet<string>,
): BulkThreadControlItemResult[] =>
  results.some((result) => result.status === "deferred")
    ? results.map((result) =>
        unrecordedIds.has(result.contactInboxId)
          ? {
              contactInboxId: result.contactInboxId,
              status: "unknown",
              error: DELIVERED_UNRECORDED,
            }
          : result,
      )
    : results

export const isTokenFailure = (result: BulkThreadControlItemResult): boolean =>
  result.status === "failed" &&
  result.error.category === ChannelErrorCategory.AUTH_FAILED

/** The channel refused every contact of a Page's first batch for lack of permission. */
export const isPageRefused = (
  results: BulkThreadControlItemResult[],
): boolean =>
  results.length > 0 &&
  results.every(
    (result) =>
      result.status === "failed" &&
      result.error.category === ChannelErrorCategory.PERMISSION_DENIED,
  )

type BatchAccount = {
  skipped: number
  failed: number
  /** The cursor after this batch: before the first deferred row, if any. */
  cursorContactInboxId: string | null
  /** Deferred rows that could not be resumed safely were counted failed. */
  isUnderSent: boolean
}

/**
 * Accounts one batch's rows. Without a deferral the cursor moves past the
 * whole page. A deferral (the channel's quota ran low) moves it only up to the
 * row before the first deferred one, so those rows are walked again after the
 * pause; rows after that point that failed are not counted now (they will be
 * walked again too). The one exception: a send whose outcome is unknown sits
 * after the deferral, and walking it again could deliver it twice, so the page
 * is closed instead and the deferred rows are counted failed.
 */
export const accountBatch = (props: {
  rows: BulkAiContactInboxRow[]
  eligibleIds: Set<string>
  results: BulkThreadControlItemResult[]
  afterId: string | null
}): BatchAccount => {
  const { rows, eligibleIds, results, afterId } = props
  const statusOf = new Map(
    results.map((result) => [result.contactInboxId, result.status]),
  )
  // A contact the channel returned nothing for is a failure, not a loss.
  const status = (id: string) =>
    eligibleIds.has(id) ? (statusOf.get(id) ?? "failed") : "skipped"

  const firstDeferred = rows.findIndex((row) => status(row.id) === "deferred")
  const isUnknownAfterDeferral =
    firstDeferred >= 0 &&
    rows.slice(firstDeferred).some((row) => status(row.id) === "unknown")
  const closesPage = firstDeferred < 0 || isUnknownAfterDeferral
  const counted = closesPage ? rows : rows.slice(0, firstDeferred)

  const count = (wanted: string[]) =>
    counted.filter((row) => wanted.includes(status(row.id))).length
  return {
    skipped: count(["skipped"]),
    failed: count(
      closesPage ? ["failed", "unknown", "deferred"] : ["failed", "unknown"],
    ),
    cursorContactInboxId: closesPage
      ? (rows.at(-1)?.id ?? afterId)
      : (rows[firstDeferred - 1]?.id ?? afterId),
    isUnderSent: isUnknownAfterDeferral,
  }
}
