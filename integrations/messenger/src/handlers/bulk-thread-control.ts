import {
  type BulkThreadControlItemResult,
  type BulkThreadControlLimits,
  ChannelError,
  ChannelErrorCategory,
  type ConversationHandlers,
  type OutgoingContact,
  SdkException,
  threadControlRoles,
} from "@chatbotx.io/sdk"
import {
  GRAPH_BATCH_MAX_ITEMS,
  type GraphBatchRequest,
  type GraphBatchResponse,
  type GraphBatchResult,
  sendGraphBatch,
} from "../apis/batch"
import type { BucUsage } from "../apis/usage"
import { mapToChannelError } from "../lib/error-mapper"
import {
  readBusinessAiAppId,
  resolveOwnAppId,
} from "../lib/thread-control-config"
import type { MessengerAuthValue } from "../schema"
import {
  buildMessagePayload,
  resolveMessagingPolicy,
} from "./message/outgoing-message"

type BulkInput = Parameters<
  NonNullable<
    ConversationHandlers<MessengerAuthValue>["bulkUpdateThreadControl"]
  >
>[0]["data"]

/** Rounds a batch is repeated for transient pass failures (never for a rate limit). */
const MAX_ATTEMPT_ROUNDS = 3
const RETRY_BACKOFF_MS = 1000
const HTTP_SERVER_ERROR = 500

// Quota policy (developers.facebook.com/docs/graph-api/overview/rate-limiting).
// The Messenger quota of a Page (200 calls x engaged users per 24h) is shared
// with the bot and the inbox, and every batch sub-request spends one call, so a
// bulk run backs off long before Meta would refuse anything.
/** Bulk work stops while the Page has used this share of its quota. */
const BULK_USAGE_CEILING_PERCENT = 50
/** From here Meta is about to throttle (or did): wait an hour, as Meta advises to stop calling. */
const QUOTA_EXHAUSTED_PERCENT = 90
const SOFT_PAUSE_MS = 60_000
const EXHAUSTED_PAUSE_MS = 60 * 60_000
const MS_PER_MINUTE = 60_000
/** Meta asks callers to spread their calls over time. */
const BATCH_GAP_MS = 1000

/**
 * How long the caller must wait before its next call, `null` to carry on.
 * Meta's own estimate wins; a rate-limit refusal, or a quota at or above
 * {@link QUOTA_EXHAUSTED_PERCENT}, means "stop calling" (Meta: calling on
 * extends the lockout).
 */
export const retryAfterForQuota = (
  usage: BucUsage | null,
  isRateLimited: boolean,
): number | null => {
  if (usage && usage.estimatedTimeToRegainAccess > 0) {
    return usage.estimatedTimeToRegainAccess * MS_PER_MINUTE
  }
  const peak = usage
    ? Math.max(usage.callCount, usage.totalCpuTime, usage.totalTime)
    : 0
  if (isRateLimited || peak >= QUOTA_EXHAUSTED_PERCENT) {
    return EXHAUSTED_PAUSE_MS
  }
  return peak >= BULK_USAGE_CEILING_PERCENT ? SOFT_PAUSE_MS : null
}

const QUOTA_DEFERRAL = new ChannelError(
  "Deferred: the Page's Messenger quota is low",
  ChannelErrorCategory.RATE_LIMITED,
)

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/** One contact moving through the rounds. */
type Slot = {
  contact: OutgoingContact
  request: GraphBatchRequest
}

const passRequest = (contact: OutgoingContact): GraphBatchRequest => ({
  relativeUrl: "me/pass_thread_control",
  body: {
    recipient: { id: contact.sourceId },
    target_app_id: readBusinessAiAppId(),
  },
})

/**
 * The takeover send. It always rides the HUMAN_AGENT tag (a person is stepping
 * in) and throws a `ChannelError` for a contact past Meta's 7-day window, which
 * is reported for that contact alone before any Graph call.
 */
const takeRequest = (
  contact: OutgoingContact,
  text: string,
): GraphBatchRequest => {
  const policy = resolveMessagingPolicy({
    contact,
    sendFrom: "inbox",
    forceHumanAgent: true,
  })
  return {
    relativeUrl: "me/messages",
    body: buildMessagePayload({
      contact,
      message: { text },
      messagingType: policy.messagingType,
      tag: policy.tag,
    }),
  }
}

const messageIdOf = (body: unknown): string | null => {
  if (typeof body !== "object" || body === null) {
    return null
  }
  const messageId = (body as { message_id?: unknown }).message_id
  return typeof messageId === "string" ? messageId : null
}

/** Meta answers a refused-but-200 pass with `{ success: false }`. */
const isRefusedPass = (body: unknown): boolean =>
  typeof body === "object" &&
  body !== null &&
  (body as { success?: unknown }).success === false

const REFUSED_PASS = new ChannelError(
  "Messenger rejected the thread control request",
  ChannelErrorCategory.PERMISSION_DENIED,
)

/**
 * What a contact becomes when a repeat round failed outright: a send may have
 * been delivered before the failure (unknown, never repeated), a pass did not
 * take effect that we know of (failed).
 */
const unsettledAfterFailure = (
  action: BulkInput["action"],
  contactInboxId: string,
  error: unknown,
): BulkThreadControlItemResult => ({
  contactInboxId,
  status: action === "takeFromAi" ? "unknown" : "failed",
  error: mapToChannelError(error),
})

type Settled =
  | { done: true; result: BulkThreadControlItemResult }
  | { done: false; error: ChannelError }

/**
 * Decides what one sub-response means.
 *
 * A rate limit is never repeated here: Meta refused it before doing anything,
 * so it is `deferred` and the caller waits. A pass is idempotent, so any other
 * transient failure is repeated. A send is NOT: a timed-out (`null`) or 5xx
 * sub-request may have been delivered, so it is reported `unknown` and left
 * alone rather than risking a second message.
 */
const settle = (
  action: BulkInput["action"],
  contactInboxId: string,
  result: GraphBatchResult,
  auth: MessengerAuthValue,
): Settled => {
  const isSend = action === "takeFromAi"

  if (result.kind === "ok") {
    if (!isSend && isRefusedPass(result.body)) {
      return {
        done: true,
        result: { contactInboxId, status: "failed", error: REFUSED_PASS },
      }
    }
    return {
      done: true,
      result: {
        contactInboxId,
        status: "succeeded",
        // A pass makes the Business-AI app the owner; a takeover makes us.
        event: isSend ? "serviceSent" : "passed",
        ownerRole: isSend ? null : threadControlRoles.enum.ai_agent,
        ownerAppId: isSend ? resolveOwnAppId(auth) : readBusinessAiAppId(),
        messageSourceId: isSend ? messageIdOf(result.body) : null,
      },
    }
  }

  if (result.kind === "unknown") {
    const error = new ChannelError(
      "The batch sub-request timed out",
      ChannelErrorCategory.NETWORK_ERROR,
    )
    return isSend
      ? {
          done: true,
          result: { contactInboxId, status: "unknown", error },
        }
      : { done: false, error }
  }

  const error = mapToChannelError({
    httpStatus: result.httpStatus,
    errorBody: result.errorBody,
  })
  if (error.category === ChannelErrorCategory.AUTH_FAILED) {
    // Every sub-request shares the Page token: nothing more can succeed. It is
    // reported per contact (not thrown) so the ones Meta already applied in
    // this batch are still recorded; the caller ends the run on it.
    return {
      done: true,
      result: { contactInboxId, status: "failed", error },
    }
  }
  if (error.category === ChannelErrorCategory.RATE_LIMITED) {
    return {
      done: true,
      result: { contactInboxId, status: "deferred", error },
    }
  }
  const isServerError = result.httpStatus >= HTTP_SERVER_ERROR
  if (!isSend) {
    return error.isRetryable || isServerError
      ? { done: false, error }
      : { done: true, result: { contactInboxId, status: "failed", error } }
  }
  return {
    done: true,
    result: {
      contactInboxId,
      status:
        isServerError || error.category === ChannelErrorCategory.NETWORK_ERROR
          ? "unknown"
          : "failed",
      error,
    },
  }
}

const recordForAll = (
  results: Map<string, BulkThreadControlItemResult>,
  slots: Slot[],
  toResult: (slot: Slot) => BulkThreadControlItemResult,
): void => {
  for (const slot of slots) {
    results.set(slot.contact.id, toResult(slot))
  }
}

const deferred = (
  slot: Slot,
  error: ChannelError,
): BulkThreadControlItemResult => ({
  contactInboxId: slot.contact.id,
  status: "deferred",
  error,
})

/** One request per contact; a contact that cannot be asked (e.g. past the 7-day window) fails alone, with no Graph call. */
const buildSlots = (
  input: BulkInput,
  results: Map<string, BulkThreadControlItemResult>,
): Slot[] =>
  input.contacts.flatMap((contact) => {
    try {
      const request =
        input.action === "handToAi"
          ? passRequest(contact)
          : takeRequest(contact, input.text ?? "")
      return [{ contact, request }]
    } catch (error) {
      results.set(contact.id, {
        contactInboxId: contact.id,
        status: "failed",
        error: mapToChannelError(error),
      })
      return []
    }
  })

/**
 * A repeat round's whole call failed AFTER earlier rounds delivered some
 * contacts. Throwing would discard those results and leave delivered messages
 * unrecorded, so what is left is settled here. A rate limit means Meta refused
 * before doing anything: the rest is deferred and the caller waits (returns how
 * long); anything else leaves the rest unsettled (`null`: no new wait).
 */
const settleFailedRound = (
  action: BulkInput["action"],
  pending: Slot[],
  results: Map<string, BulkThreadControlItemResult>,
  error: unknown,
): number | null => {
  const mapped = mapToChannelError(error)
  if (mapped.category === ChannelErrorCategory.RATE_LIMITED) {
    recordForAll(results, pending, (slot) => deferred(slot, mapped))
    return EXHAUSTED_PAUSE_MS
  }
  recordForAll(results, pending, (slot) =>
    unsettledAfterFailure(action, slot.contact.id, error),
  )
  return null
}

/** Reads one round's sub-responses: what is settled is recorded, what a repeat may still fix is returned. */
const settleRound = (props: {
  action: BulkInput["action"]
  pending: Slot[]
  response: GraphBatchResponse
  round: number
  auth: MessengerAuthValue
  results: Map<string, BulkThreadControlItemResult>
}): { retry: Slot[]; isRateLimited: boolean } => {
  const { action, pending, response, round, auth, results } = props
  const retry: Slot[] = []
  let isRateLimited = false
  pending.forEach((slot, index) => {
    const settled = settle(
      action,
      slot.contact.id,
      response.results[index],
      auth,
    )
    if (settled.done) {
      isRateLimited ||= settled.result.status === "deferred"
      results.set(slot.contact.id, settled.result)
    } else if (round < MAX_ATTEMPT_ROUNDS) {
      retry.push(slot)
    } else {
      results.set(slot.contact.id, {
        contactInboxId: slot.contact.id,
        status: "failed",
        error: settled.error,
      })
    }
  })
  return { retry, isRateLimited }
}

const findTokenError = (
  results: Map<string, BulkThreadControlItemResult>,
): ChannelError | null => {
  for (const result of results.values()) {
    if (
      result.status === "failed" &&
      result.error.category === ChannelErrorCategory.AUTH_FAILED
    ) {
      return result.error
    }
  }
  return null
}

/**
 * Hands up to 50 threads to the Business-AI app, or takes them back with a
 * HUMAN_AGENT-tagged text, in one Graph batch (repeated only for transient pass
 * failures). Per-contact failures are returned, never thrown, including a token
 * Meta rejected for some sub-requests (an `AUTH_FAILED` result: the caller ends
 * the run after recording what did succeed); a call rejected as a whole throws. When the Page's quota runs low or Meta rate-limits,
 * nothing more is sent: the rest is `deferred` and `retryAfterMs` says how long
 * the caller must wait.
 */
export const bulkUpdateThreadControl: ConversationHandlers<MessengerAuthValue>["bulkUpdateThreadControl"] =
  async ({ ctx, data }) => {
    const { action, contacts, text } = data
    if (contacts.length > GRAPH_BATCH_MAX_ITEMS) {
      throw new SdkException(
        `Bulk thread control carries at most ${GRAPH_BATCH_MAX_ITEMS} contacts`,
      )
    }
    if (action === "takeFromAi" && !text) {
      throw new SdkException("A takeover needs the text to send")
    }

    const results = new Map<string, BulkThreadControlItemResult>()
    let pending = buildSlots(data, results)
    let retryAfterMs: number | null = null

    for (let round = 1; pending.length > 0; round++) {
      let response: GraphBatchResponse
      try {
        response = await sendGraphBatch(
          ctx.auth,
          pending.map((slot) => slot.request),
        )
      } catch (error) {
        if (round === 1) {
          // Nothing was settled yet: the whole call failed. Mapped, so the
          // caller can tell a revoked token or a rate limit from the rest.
          throw mapToChannelError(error)
        }
        retryAfterMs =
          settleFailedRound(action, pending, results, error) ?? retryAfterMs
        break
      }

      const { retry, isRateLimited } = settleRound({
        action,
        pending,
        response,
        round,
        auth: ctx.auth,
        results,
      })
      retryAfterMs = retryAfterForQuota(response.usage, isRateLimited)

      const tokenError = findTokenError(results)
      if (tokenError && retry.length > 0) {
        // A dead token: repeating anything is pointless.
        recordForAll(results, retry, (slot) => ({
          contactInboxId: slot.contact.id,
          status: "failed",
          error: tokenError,
        }))
        break
      }
      pending = retry
      if (pending.length > 0 && retryAfterMs !== null) {
        // Quota low: repeating now would only spend more of it.
        recordForAll(results, pending, (slot) => deferred(slot, QUOTA_DEFERRAL))
        break
      }
      if (pending.length > 0) {
        await sleep(RETRY_BACKOFF_MS * 2 ** (round - 1))
      }
    }

    return {
      results: contacts.flatMap((contact) => {
        const result = results.get(contact.id)
        return result ? [result] : []
      }),
      retryAfterMs,
    }
  }

/** A Graph batch carries 50 sub-requests; Meta advises stopping calls for an hour once rate limited. */
export const bulkThreadControlLimits: ConversationHandlers<MessengerAuthValue>["bulkThreadControlLimits"] =
  (): Promise<BulkThreadControlLimits> =>
    Promise.resolve({
      maxBatchSize: GRAPH_BATCH_MAX_ITEMS,
      batchGapMs: BATCH_GAP_MS,
      rateLimitPauseMs: EXHAUSTED_PAUSE_MS,
    })
