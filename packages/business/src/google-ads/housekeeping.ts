import type { GoogleAdsProcessingDetail } from "@chatbotx.io/database/partials"
import {
  googleAdsConversionEventRepository,
  integrationGoogleAdsRepository,
} from "@chatbotx.io/database/repositories"
import type { GoogleAdsConversionEventModel } from "@chatbotx.io/database/types"
import {
  type GoogleAdsRequestStatus,
  integration as integrationGoogleAds,
  LEGACY_REQUEST_ID_PREFIX,
  sanitizeGoogleAdsError,
} from "@chatbotx.io/integration-google-ads"
import { isActiveConnectionStatus } from "../connection/state"
import { logProviderError } from "../error-log/service"
import {
  type GoogleAdsSetup,
  integrationGoogleAdsService,
} from "../integration-google-ads/service"
import { logger } from "../logger"
import { withBlockedOwnerGuard } from "../workspace-lifecycle/with-blocked-owner-guard"
import { failDelivery } from "./delivery"
import {
  classifyRequestStatus,
  type ProcessingOutcome,
} from "./processing-status"
import { redriveAndEnqueue } from "./redrive"
import { enqueueSend, isSendJobLive } from "./send-queue"
import {
  MAX_REDRIVE_GENERATIONS,
  MIN_CLICK_AGE_MS,
  nextProcessingBackoffMs,
  PROCESSING_REDRIVE_DELAY_MS,
  PROCESSING_TIMEOUT_MS,
  STALE_CLAIM_AFTER_MS,
  STRANDED_PENDING_AFTER_MS,
} from "./timing"

type Event = GoogleAdsConversionEventModel

const isLegacyRequestId = (requestId: string | null): boolean =>
  requestId?.startsWith(LEGACY_REQUEST_ID_PREFIX) === true

const REASON_PATTERN = /^[A-Z0-9_]{1,80}$/
const MAX_ERROR_LENGTH = 1000

const boundReason = (reason: string): string =>
  REASON_PATTERN.test(reason) ? reason : "UNKNOWN"

const boundCount = (count: { reason: string; recordCount: number }) => ({
  reason: boundReason(count.reason),
  recordCount: count.recordCount,
})

const toProcessingDetail = (
  status: GoogleAdsRequestStatus,
): GoogleAdsProcessingDetail => ({
  requestStatus: status.requestStatus.slice(0, MAX_ERROR_LENGTH),
  recordCount: status.recordCount,
  errorCounts: status.errorCounts.map(boundCount),
  warningCounts: status.warningCounts.map(boundCount),
})

/** A poll only applies to the generation and request it read. */
const pollFence = (event: Event) => ({
  expectedRequestId: event.requestId,
  expectedAttempt: event.attempt,
})

const logStalePoll = (event: Event): void => {
  logger.warn(
    { eventId: event.id, attempt: event.attempt },
    "google ads: stale processing poll ignored, event moved on",
  )
}

/** Keeps a still-unresolved request in `sent` and schedules the next poll. */
const reschedulePoll = async (
  event: Event,
  now: Date,
  processingStatus: "processing" | "unknown",
): Promise<void> => {
  await googleAdsConversionEventRepository.applyProcessingResult({
    id: event.id,
    workspaceId: event.workspaceId,
    to: "sent",
    processingStatus,
    nextProcessingCheckAt: new Date(
      now.getTime() + nextProcessingBackoffMs(event.processingAttempts),
    ),
    processingAttempts: event.processingAttempts + 1,
    ...pollFence(event),
  })
}

/** Google's reason strings are open-ended; only enum-shaped ones are kept. */
const safeReasons = (errorCounts: readonly { reason: string }[]): string =>
  errorCounts
    .map(({ reason }) => boundReason(reason))
    .join(", ")
    .slice(0, MAX_ERROR_LENGTH)

const failProcessing = async (
  event: Event,
  outcome: Extract<ProcessingOutcome, { kind: "failed" }>,
): Promise<void> => {
  const message =
    safeReasons(outcome.status.errorCounts) ||
    outcome.status.requestStatus.slice(0, MAX_ERROR_LENGTH)
  const applied =
    await googleAdsConversionEventRepository.applyProcessingResult({
      id: event.id,
      workspaceId: event.workspaceId,
      to: "failed",
      processingStatus:
        outcome.status.requestStatus === "PARTIAL_SUCCESS"
          ? "partial_success"
          : "failed",
      processingDetail: toProcessingDetail(outcome.status),
      failureStage: "processing",
      error: message,
      nextProcessingCheckAt: null,
      processingAttempts: event.processingAttempts + 1,
      ...pollFence(event),
    })
  if (applied) {
    await logProviderError({
      provider: "google-ads",
      workspaceId: event.workspaceId,
      error: new Error(`Google Ads conversion not processed: ${message}`),
      httpCode: "400",
    })
  } else {
    logStalePoll(event)
  }
}

/** Google's own transient failure: run the conversion again as a new generation. */
const redriveAfterTransientFailure = async (
  event: Event,
  outcome: Extract<ProcessingOutcome, { kind: "failed" }>,
): Promise<void> => {
  if (event.attempt >= MAX_REDRIVE_GENERATIONS) {
    await failProcessing(event, { ...outcome, retryable: false })
    return
  }
  const redriven = await googleAdsConversionEventRepository.redrive({
    id: event.id,
    workspaceId: event.workspaceId,
    fromStatuses: ["sent"],
    expectedAttempt: event.attempt,
    expectedRequestId: event.requestId ?? undefined,
  })
  if (redriven) {
    await enqueueSend(redriven, redriven.attempt, PROCESSING_REDRIVE_DELAY_MS)
  } else {
    logStalePoll(event)
  }
}

type CompletedStatus = Extract<
  ProcessingOutcome,
  { kind: "success" | "duplicate" }
>["status"]

/**
 * Ends an event as processed, fenced by the poll's generation and request id.
 * Allowlisted fields only; error counts are not kept (success and a duplicate
 * Google already holds are not errors). `duplicateRecovery` carries the same
 * flag the legacy path writes.
 */
const finishProcessed = async (
  event: Event,
  status: CompletedStatus,
  duplicateRecovery: boolean,
): Promise<void> => {
  const applied =
    await googleAdsConversionEventRepository.applyProcessingResult({
      id: event.id,
      workspaceId: event.workspaceId,
      to: "processed",
      processingStatus: "success",
      processingDetail: {
        requestStatus: status.requestStatus.slice(0, MAX_ERROR_LENGTH),
        recordCount: status.recordCount,
        errorCounts: [],
        warningCounts: status.warningCounts.map(boundCount),
        ...(duplicateRecovery ? { duplicateRecovery: true } : {}),
      },
      nextProcessingCheckAt: null,
      processingAttempts: event.processingAttempts + 1,
      ...pollFence(event),
    })
  if (!applied) {
    logStalePoll(event)
  }
}

const applyOutcome = async (
  event: Event,
  outcome: ProcessingOutcome,
  now: Date,
): Promise<void> => {
  switch (outcome.kind) {
    case "success":
      await finishProcessed(event, outcome.status, false)
      return
    case "duplicate":
      await finishProcessed(event, outcome.status, true)
      return
    case "processing":
      await reschedulePoll(event, now, "processing")
      return
    case "unknown":
      await reschedulePoll(event, now, "unknown")
      return
    case "failed":
      await (outcome.retryable
        ? redriveAfterTransientFailure(event, outcome)
        : failProcessing(event, outcome))
      return
    default: {
      const exhaustive: never = outcome
      throw new Error(`Unhandled processing outcome: ${String(exhaustive)}`)
    }
  }
}

const POLL_PAGE_SIZE = 100
/** Safety ceiling on pages per run; the time budget normally ends the run first. */
const MAX_POLL_PAGES = 50
/** Stay well inside the 10-minute cron cadence. */
const POLL_TIME_BUDGET_MS = 5 * 60 * 1000
const POLL_CONCURRENCY = 4
const SYNC_PAGE_SIZE = 100
const SWEEP_LIMIT = 200

type PollContext = {
  setup: GoogleAdsSetup
  ctx: Awaited<
    ReturnType<typeof integrationGoogleAdsService.buildActionContext>
  >
}

/** Per-run cache: one setup lookup and one action context per workspace, not per event. */
type PollContextCache = Map<string, Promise<PollContext | null>>

const loadPollContext = async (
  workspaceId: string,
): Promise<PollContext | null> => {
  const loaded = await withBlockedOwnerGuard(workspaceId, async () => {
    const setup = await integrationGoogleAdsService.getSetup(workspaceId)
    if (!setup || setup.connection?.status === "needs_reauth") {
      return null
    }
    const ctx = await integrationGoogleAdsService.buildActionContext(
      workspaceId,
      setup.integration,
    )
    return { setup, ctx }
  })
  return loaded ?? null
}

const pollOne = async (
  event: Event,
  now: Date,
  cache: PollContextCache,
): Promise<void> => {
  if (
    event.sentAt &&
    now.getTime() - event.sentAt.getTime() > PROCESSING_TIMEOUT_MS
  ) {
    await googleAdsConversionEventRepository.applyProcessingResult({
      id: event.id,
      workspaceId: event.workspaceId,
      to: "failed",
      processingStatus: "timed_out",
      failureStage: "timeout",
      error: "Google did not finish processing the request in time",
      nextProcessingCheckAt: null,
      processingAttempts: event.processingAttempts + 1,
      ...pollFence(event),
    })
    return
  }
  // A legacy upload completes synchronously and has no Data Manager request to
  // read: never poll it, whatever state the row is in.
  if (event.uploadMethod === "legacy" || isLegacyRequestId(event.requestId)) {
    logger.warn(
      { eventId: event.id },
      "google ads: legacy event reached the poller, skipped",
    )
    return
  }
  let pending = cache.get(event.workspaceId)
  if (!pending) {
    pending = loadPollContext(event.workspaceId)
    cache.set(event.workspaceId, pending)
  }
  const pollContext = await pending
  if (
    !(pollContext && event.requestId) ||
    pollContext.setup.integration.customerId !== event.customerId
  ) {
    await reschedulePoll(event, now, "unknown")
    return
  }
  const statuses = await integrationGoogleAds.runAction(
    "retrieveRequestStatus",
    { ctx: pollContext.ctx, props: { requestId: event.requestId } },
  )
  await applyOutcome(event, classifyRequestStatus(statuses), now)
}

/** One failed poll never aborts the run; a failed reschedule is only logged. */
const pollOneSafely = async (
  event: Event,
  now: Date,
  cache: PollContextCache,
): Promise<void> => {
  try {
    await pollOne(event, now, cache)
  } catch (error) {
    logger.warn(
      {
        err: sanitizeGoogleAdsError(error, { secrets: [event.clickId] }),
        eventId: event.id,
      },
      "google ads: processing status poll failed",
    )
    try {
      await reschedulePoll(event, now, "unknown")
    } catch (rescheduleError) {
      logger.warn(
        {
          err: sanitizeGoogleAdsError(rescheduleError, {
            secrets: [event.clickId],
          }),
          eventId: event.id,
        },
        "google ads: processing status poll could not be rescheduled",
      )
    }
  }
}

/**
 * Reads the Data Manager outcome of every `sent` event that is due, four at a
 * time, draining page after page until a page comes back short or the time
 * budget is spent. One event failing never stops the run; it is retried on the
 * next backoff step. Every handled event moves its `nextProcessingCheckAt`
 * forward, so re-querying from the start never revisits a row.
 */
export const pollGoogleAdsProcessingStatus = async (
  now: Date = new Date(),
): Promise<void> => {
  const cache: PollContextCache = new Map()
  const deadline = Date.now() + POLL_TIME_BUDGET_MS
  for (let page = 0; page < MAX_POLL_PAGES; page++) {
    const events =
      await googleAdsConversionEventRepository.listDueForProcessingCheck({
        now,
        limit: POLL_PAGE_SIZE,
      })
    for (let start = 0; start < events.length; start += POLL_CONCURRENCY) {
      await Promise.allSettled(
        events
          .slice(start, start + POLL_CONCURRENCY)
          .map((event) => pollOneSafely(event, now, cache)),
      )
    }
    if (events.length < POLL_PAGE_SIZE || Date.now() >= deadline) {
      return
    }
  }
}

/** A stranded event that has used up its generations is failed, not sent again. */
const failExhaustedStranded = async (
  redriven: Pick<Event, "id" | "workspaceId" | "attempt">,
): Promise<void> => {
  const lease = {
    id: redriven.id,
    workspaceId: redriven.workspaceId,
    claimToken: crypto.randomUUID(),
  }
  const claimed = await googleAdsConversionEventRepository.claimForSending({
    ...lease,
    attempt: redriven.attempt,
  })
  if (claimed) {
    await failDelivery(
      claimed,
      lease,
      new Error("Delivery stranded too many times"),
      { logProviderFailure: false },
    )
  }
}

const redriveStranded = async (event: Event, now: Date): Promise<void> => {
  const redrive = {
    id: event.id,
    workspaceId: event.workspaceId,
    fromStatuses: [event.status],
    expectedAttempt: event.attempt,
    expectedClaimToken: event.claimToken,
  }
  if (event.attempt < MAX_REDRIVE_GENERATIONS) {
    await redriveAndEnqueue(redrive, now)
    return
  }
  const redriven = await googleAdsConversionEventRepository.redrive(redrive)
  if (redriven) {
    await failExhaustedStranded(redriven)
  }
}

/**
 * A blocked owner's stranded row is never sent. A stale `sending` row is
 * released back to `pending` on the SAME generation (fenced by its claim token,
 * no job, no Google call, no generation burned) so it leaves the claim-ordered
 * lease window instead of starving other workspaces; the normal pending path
 * rescues it once the owner is unblocked. Everything else is only touched.
 */
const parkBlockedStranded = async (event: Event): Promise<void> => {
  if (event.status === "sending" && event.claimToken) {
    const released = await googleAdsConversionEventRepository.releaseClaim({
      id: event.id,
      workspaceId: event.workspaceId,
      claimToken: event.claimToken,
      nextAttempt: event.attempt,
    })
    if (released) {
      return
    }
    logger.warn(
      { eventId: event.id, attempt: event.attempt },
      "google ads: stale lease already moved on, release skipped",
    )
  }
  await googleAdsConversionEventRepository.touchStranded(event)
}

/**
 * Finds events whose delivery job is gone (lost enqueue, crashed worker) and
 * moves them to a fresh generation. A pending event is only redriven when its
 * current generation's job can no longer run.
 */
export const sweepStrandedGoogleAdsEvents = async (
  now: Date = new Date(),
  limit: number = SWEEP_LIMIT,
): Promise<void> => {
  const stranded = await googleAdsConversionEventRepository.listStranded({
    pendingOlderThan: new Date(now.getTime() - STRANDED_PENDING_AFTER_MS),
    sixHourGateBefore: new Date(now.getTime() - MIN_CLICK_AGE_MS),
    sendingOlderThan: new Date(now.getTime() - STALE_CLAIM_AFTER_MS),
    limit,
  })
  for (const event of stranded) {
    try {
      if (
        event.status === "pending" &&
        (await isSendJobLive(event.id, event.attempt))
      ) {
        // Rotate it behind the rows that still need work so a wall of live
        // jobs cannot occupy the pending window run after run.
        await googleAdsConversionEventRepository.touchStranded(event)
        continue
      }
      const handled = await withBlockedOwnerGuard(
        event.workspaceId,
        async () => {
          await redriveStranded(event, now)
          return true
        },
      )
      if (!handled) {
        await parkBlockedStranded(event)
      }
    } catch (error) {
      logger.warn(
        { err: error, eventId: event.id },
        "google ads: stranded event could not be redriven",
      )
    }
  }
}

/**
 * Daily: re-reads each account's conversion customer and conversion actions.
 * The refresh goes through the SDK, so a grant Google has revoked flips the
 * Connection to `needs_reauth` here rather than on the next conversion.
 */
export const syncGoogleAdsSetups = async (): Promise<void> => {
  let afterId: string | undefined
  for (;;) {
    const targets = await integrationGoogleAdsRepository.listSyncTargets({
      afterId,
      limit: SYNC_PAGE_SIZE,
    })
    for (const target of targets) {
      try {
        await withBlockedOwnerGuard(target.workspaceId, async () => {
          const setup = await integrationGoogleAdsService.getSetup(
            target.workspaceId,
          )
          if (
            setup?.connection &&
            isActiveConnectionStatus(setup.connection.status)
          ) {
            await integrationGoogleAdsService.refreshSetup(target.workspaceId)
          }
        })
      } catch (error) {
        logger.warn(
          { err: error, workspaceId: target.workspaceId },
          "google ads: daily setup sync failed",
        )
      }
    }
    if (targets.length < SYNC_PAGE_SIZE) {
      return
    }
    afterId = targets.at(-1)?.id
  }
}
