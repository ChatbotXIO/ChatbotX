import type {
  SocialPostFeedErrorCode,
  SocialPostFeedRunSummary,
  SocialPostFeedWaitingReason,
} from "@chatbotx.io/database/partials"
import type { SocialPostFeedRow } from "@chatbotx.io/database/repositories"
import { ChatbotXException } from "../errors"
import { SOCIAL_POST_CONTENT_INVALID_CODE } from "../social-post/error-codes"
import { FeedFetchError } from "./fetcher"
import { POST_FEED_RUN_BUDGET_MS } from "./limits"
import { FeedParseError, type ParsedFeedItem } from "./parse"
import type { RunFeedResult } from "./types"

/** Pure helpers of a feed check: its summary, stop reasons, error codes, item refusals and ledger rows. */

/** The compact record of a check that the Feeds page shows. */
export const summaryOf = (
  result: RunFeedResult,
  staleRetries: number,
): SocialPostFeedRunSummary => {
  const none = {
    created: 0,
    fresh: 0,
    items: 0,
    refused: 0,
    staleRetries: 0,
    waiting: 0,
  }
  switch (result.kind) {
    case "checked":
      return {
        created: result.created,
        fresh: result.fresh,
        items: result.items,
        kind: "checked",
        refused: result.invalid,
        staleRetries: 0,
        waiting: result.waiting,
        ...(result.waitingReason === undefined
          ? {}
          : { waitingReason: result.waitingReason }),
        ...(result.dailyCap === undefined ? {} : { dailyCap: result.dailyCap }),
        ...(result.nextSlotAt === undefined
          ? {}
          : { nextSlotAt: result.nextSlotAt }),
      }
    case "stale":
      return { ...none, kind: "stale", staleRetries }
    case "notModified":
      return { ...none, kind: "notModified" }
    default:
      return { ...none, kind: "failed" }
  }
}

/** Why a check stops taking items, in the order the limits apply; `null` when it can go on. */
export const stopReasonOf = (input: {
  attempts: number
  created: number
  elapsedMs: number
  maxAttempts: number
  maxItemsPerRun: number
  remainingToday: number
}): SocialPostFeedWaitingReason | null => {
  if (input.remainingToday <= 0) {
    return "dailyCap"
  }
  if (input.created >= input.maxItemsPerRun) {
    return "runLimit"
  }
  if (input.attempts >= input.maxAttempts) {
    return "attempts"
  }
  if (input.elapsedMs > POST_FEED_RUN_BUDGET_MS) {
    return "timeBudget"
  }
  return null
}

export const errorCodeOf = (error: unknown): SocialPostFeedErrorCode => {
  if (error instanceof FeedFetchError) {
    return error.code
  }
  if (error instanceof FeedParseError) {
    return "invalidFeed"
  }
  if (error instanceof FeedPostBlockedError) {
    return error.code
  }
  return "internal"
}

/** A check no longer owns its feed (the address was changed, or its lease expired and was taken over): it must write nothing more. */
export class FeedLeaseLostError extends Error {
  constructor() {
    super("The check no longer owns the feed's lease")
    this.name = "FeedLeaseLostError"
  }
}

/** The code `createInTx` answers (409) when the idempotency key already belongs to another post. */
export const IDEMPOTENCY_CONFLICT_CODE = "socialPostKeyConflict"
const MAX_REASON_ISSUES = 3

type RefusalIssue = { code: string; field: string | null }

/** The issues the publishing rules reported (`data.issues` is a JSON list). */
const issuesOf = (error: ChatbotXException): RefusalIssue[] => {
  const raw = error.data?.issues
  if (typeof raw !== "string") {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.flatMap((issue: unknown): RefusalIssue[] =>
      typeof issue === "object" &&
      issue !== null &&
      "code" in issue &&
      typeof issue.code === "string"
        ? [
            {
              code: issue.code,
              field:
                "field" in issue && typeof issue.field === "string"
                  ? issue.field
                  : null,
            },
          ]
        : [],
    )
  } catch {
    return []
  }
}

/** Issues about the DESTINATION's state (disconnected, needs reconnect, permission missing), never about the content. */
const DESTINATION_ISSUE_FIELD = "destination"
const DESTINATION_ISSUE_CODES: ReadonlySet<string> = new Set([
  "destinationNotFound",
  "destinationInactive",
  "accountNeedsReauth",
  "accountDisconnected",
  "inboxDisconnected",
  "inboxNeedsReconnect",
  "publishPermissionMissing",
])

/**
 * The ledger reason of a post the platform refused because of the ITEM'S CONTENT
 * (the publishing rules said the text or link is not valid for a network):
 * `socialPostContentInvalid,<issue codes>`. Null for every other refusal: those
 * are a problem of the feed or its destinations (no posting slot, a blocked
 * workspace, a conflict, a rate limit, a disconnected account) that the same
 * item would hit again, so the item is NOT recorded and the next check retries it.
 */
export const itemRefusalReason = (error: unknown): string | null => {
  if (
    !(
      error instanceof ChatbotXException &&
      error.code === SOCIAL_POST_CONTENT_INVALID_CODE
    )
  ) {
    return null
  }
  const issues = issuesOf(error)
  if (
    issues.some(
      (issue) =>
        issue.field === DESTINATION_ISSUE_FIELD ||
        DESTINATION_ISSUE_CODES.has(issue.code),
    )
  ) {
    return null
  }
  const codes = [...new Set(issues.map((issue) => issue.code))].slice(
    0,
    MAX_REASON_ISSUES,
  )
  return [error.code, ...codes].join(",")
}

/** A post could not be made for a reason that is not the item's content; the check stops and records the code on the feed. */
export class FeedPostBlockedError extends Error {
  readonly code: SocialPostFeedErrorCode = "postRefused"
  readonly detail: string

  constructor(cause: unknown) {
    const detail =
      cause instanceof ChatbotXException
        ? `${cause.httpStatusCode} ${cause.code}${cause.field ? ` (${cause.field})` : ""}`
        : "unknown"
    super(`A post could not be made: ${detail}`, { cause })
    this.name = "FeedPostBlockedError"
    this.detail = detail
  }
}

/** The ledger columns every outcome shares; the caller adds `outcome` and `reason`. */
export const ledgerRowOf = (feed: SocialPostFeedRow, item: ParsedFeedItem) => ({
  feedId: feed.id,
  itemKey: item.itemKey,
  link: item.link,
  publishedAt: item.publishedAt,
  title: item.title,
  workspaceId: feed.workspaceId,
})
