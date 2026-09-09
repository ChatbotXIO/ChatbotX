import {
  bulkImportChannelContacts,
  contactScanService,
  quotaEnforcementService,
  workspaceService,
} from "@chatbotx.io/business"
import {
  CONTACT_SCAN_ERRORS,
  CONTACT_SCAN_MAX_PAGES,
} from "@chatbotx.io/business/contact-scan"
import { logProviderError } from "@chatbotx.io/business/error-log"
import { sanitizePublicText } from "@chatbotx.io/business/errors"
import type { CoexistRunWriteGuard } from "@chatbotx.io/database/repositories"
import { isContactScanChannel } from "@chatbotx.io/utils/channel"
import {
  buildContactScanPageJobId,
  IntegrationJobAction,
  type IntegrationJobContactScan,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { filterConversationWindow } from "../coexist/conversation-window"
import {
  resolveUsageThrottle,
  sleepForUsageThrottle,
} from "../coexist/usage-throttle"
import { enqueueContactAvatarJobs } from "../contact/enqueue-avatar-jobs"
import type { ContactScanErrorClassification } from "./adapter"
import { contactScanAdapters } from "./adapter"

/**
 * Active wall-time budget per chunk — same value and rationale as coexist
 * (`coexist/messenger-sync.ts`'s `CHUNK_BUDGET_MS`): stay well inside the
 * BullMQ job lock, persist state, and hot-chain a continuation.
 */
const CHUNK_BUDGET_MS = 4 * 60 * 1000

/** Bounded in-process pause on a Meta usage-budget signal, same rationale as
 *  `instagram-sync.ts`'s `MAX_USAGE_PAUSE_MS`. */
const MAX_USAGE_PAUSE_MS = 45_000

/** Single sequential walk — no per-conversation fan-out — so the throttle's
 *  concurrency value is unused; only its `pauseMs` matters here. */
const SEQUENTIAL_CONCURRENCY = 1

/**
 * Terminal/retry handler per `adapter.classifyError` outcome — a table, never
 * an if/else chain, so the compiler catches a missing arm if the union grows.
 * `message` is the sanitized fallback text used only by `unknown`.
 */
const CLASSIFICATION_HANDLERS: Record<
  ContactScanErrorClassification,
  (input: {
    runId: string
    expect: CoexistRunWriteGuard
    message: string
  }) => Promise<number>
> = {
  retryable: ({ runId, expect }) =>
    contactScanService.resetForRetry({
      runId,
      currentError: CONTACT_SCAN_ERRORS.providerRetryable,
      expect,
    }),
  tokenInvalid: ({ runId, expect }) =>
    contactScanService.finish({
      runId,
      status: "failed",
      currentError: CONTACT_SCAN_ERRORS.tokenInvalid,
      expect,
    }),
  graphPermission: ({ runId, expect }) =>
    contactScanService.finish({
      runId,
      status: "failed",
      currentError: CONTACT_SCAN_ERRORS.graphPermission,
      expect,
    }),
  unknown: ({ runId, expect, message }) =>
    contactScanService.finish({
      runId,
      status: "failed",
      currentError: sanitizePublicText(message),
      expect,
    }),
}

/**
 * Runs one budgeted chunk of an Automatic Customer Scan run. Claims the run,
 * resolves its channel adapter, walks conversation pages newest → oldest
 * (frontier/ceiling-windowed, same as coexist), bulk-imports contacts, and
 * either finishes the run, yields a continuation, or hands it back to the
 * scheduler for retry — see `docs/plans/2026-09-09-automatic-contact-scan.md`
 * §4 for the full protocol this implements.
 */
export const runContactScan = async (
  data: IntegrationJobContactScan["data"],
): Promise<void> => {
  const { runId, workspaceId } = data
  const jobStart = Date.now()

  // Step 1 — claim (type-scoped: only ever claims a `type='contact_scan'`
  // row). A misrouted job pointing at a coexist row claims nothing.
  const run = await contactScanService.claim({ runId })
  if (!run) {
    logger.warn({ runId }, "[contact-scan] claim lost — abandoning")
    return
  }
  if (run.workspaceId !== workspaceId) {
    logger.warn(
      { runId, workspaceId, rowWorkspaceId: run.workspaceId },
      "[contact-scan] workspaceId mismatch between payload and run — refusing",
    )
    return
  }

  const expect: CoexistRunWriteGuard = {
    status: "running",
    claimToken: run.claimToken,
  }

  // Step 2 — resolve the channel adapter + its workspace-scoped context.
  if (!isContactScanChannel(run.channel)) {
    await contactScanService.finish({
      runId,
      status: "failed",
      currentError: CONTACT_SCAN_ERRORS.channelUnsupported,
      expect,
    })
    return
  }
  const adapter = contactScanAdapters[run.channel]

  // Setup calls that hit the DB/provider before the walk has a claim-scoped
  // `try` around it (the walk loop's own `try` starts below). A THROW here
  // (transient DB/service error) must not leave the row `status='running'`
  // with a fresh heartbeat — the sweeper would then skip it for ~1h. Reset
  // for a bounded retry instead (capped by `CONTACT_SCAN_MAX_ATTEMPTS`). A
  // `null` context is a DEFINITIVE "integration gone" outcome, not a throw —
  // it keeps finishing the run as `failed` below, same as before.
  let context: Awaited<ReturnType<typeof adapter.loadContext>>
  let workspace: Awaited<ReturnType<typeof workspaceService.find>>
  try {
    context = await adapter.loadContext({
      workspaceId,
      integrationId: run.integrationId,
    })
    workspace = await workspaceService.find({ where: { id: workspaceId } })
  } catch (error) {
    logger.error(
      { err: error, runId },
      "[contact-scan] setup (loadContext/workspaceService.find) threw — retrying",
    )
    await contactScanService.resetForRetry({
      runId,
      currentError: CONTACT_SCAN_ERRORS.providerRetryable,
      expect,
    })
    return
  }

  if (!context) {
    await contactScanService.finish({
      runId,
      status: "failed",
      currentError: CONTACT_SCAN_ERRORS.integrationUnavailable,
      expect,
    })
    return
  }

  // Step 3 — chunk state.
  const ownerId = workspace?.ownerId
  const ceiling = run.scanFromAt
  const frontier = run.lastSyncedAt
  let cursor = run.resumeCursor ?? undefined
  let pageNumber = run.currentPageNumber
  let oldestProcessed = frontier
  let continueLater = false
  let abandoned = false
  // Only the FIRST page fetch of this chunk may trigger the
  // rejected-resume-cursor recovery (clear + restart from page 1); every
  // later page failure goes straight to the outer error classification.
  let firstPageCursorRecoveryAvailable = Boolean(cursor)

  let pauseUntil = 0
  const applyUsageThrottle = (
    signal: Parameters<typeof resolveUsageThrottle>[0]["signal"],
  ): void => {
    const decision = resolveUsageThrottle({
      signal,
      defaultConcurrency: SEQUENTIAL_CONCURRENCY,
      maxPauseMs: MAX_USAGE_PAUSE_MS,
    })
    if (decision.pauseMs > 0) {
      pauseUntil = Math.max(pauseUntil, Date.now() + decision.pauseMs)
    }
  }
  const respectPause = async (): Promise<void> => {
    const waitMs = pauseUntil - Date.now()
    if (waitMs > 0) {
      await sleepForUsageThrottle(waitMs)
    }
  }

  try {
    while (true) {
      // Runaway guard (v1 ported its own hard lookback cap): bound the total
      // number of pages a single run may walk across every chunk
      // continuation, so a `scanFromAt` far in the past against a huge inbox
      // can't turn into unbounded Graph calls / DB writes. Checked BEFORE the
      // chunk-budget check so a run that is already at the ceiling stops with
      // a clear reason instead of silently yielding one more continuation.
      if (pageNumber >= CONTACT_SCAN_MAX_PAGES) {
        logger.warn(
          { runId, pageNumber },
          "[contact-scan] hit CONTACT_SCAN_MAX_PAGES — stopping as partial",
        )
        await contactScanService.finish({
          runId,
          status: "partial",
          currentError: CONTACT_SCAN_ERRORS.scanLimitReached,
          expect,
        })
        return
      }

      if (Date.now() - jobStart >= CHUNK_BUDGET_MS) {
        continueLater = true
        break
      }

      await respectPause()
      pageNumber += 1

      let page: Awaited<ReturnType<typeof adapter.listPage>>
      try {
        page = await adapter.listPage({ context, cursor })
      } catch (error) {
        if (
          firstPageCursorRecoveryAvailable &&
          adapter.classifyError(error) !== "retryable"
        ) {
          firstPageCursorRecoveryAvailable = false
          const clearedRows = await contactScanService.updateProgress({
            runId,
            fields: { resumeCursor: null },
            expect,
          })
          if (clearedRows === 0) {
            abandoned = true
            break
          }
          logger.warn(
            { runId, error },
            "[contact-scan] persisted resumeCursor rejected — restarting from page 1",
          )
          cursor = undefined
          pageNumber = 0
          continue
        }
        throw error
      }
      firstPageCursorRecoveryAvailable = false
      applyUsageThrottle(page.usageSignal)

      const filtered = filterConversationWindow({
        items: page.entries,
        getUpdatedAt: (entry) => entry.updatedAt,
        frontier,
        ceiling,
        currentOldest: oldestProcessed,
      })

      // Core import call, fenced on its own: a throw here means nothing for
      // this page was durably persisted as "processed" yet, so the ONLY safe
      // move is to retry the SAME page from the last-good `resumeCursor` —
      // never advance `cursor`/`page.after` past contacts we never actually
      // imported. `resetForRetry` hands the run back to the scheduler
      // (bounded by `CONTACT_SCAN_MAX_ATTEMPTS` → `markMaxAttemptsFailed`),
      // which re-fetches this exact page on the next attempt.
      let pageResult: Awaited<
        ReturnType<typeof bulkImportChannelContacts>
      > | null = null
      if (filtered.itemsToProcess.length > 0) {
        try {
          pageResult = await bulkImportChannelContacts({
            inbox: context.inbox,
            workspaceId,
            contacts: filtered.itemsToProcess.map((entry) => entry.contact),
          })
        } catch (error) {
          logger.error(
            { err: error, runId, pageNumber },
            "[contact-scan] bulk import threw — retrying this page",
          )
          const retryRows = await contactScanService.resetForRetry({
            runId,
            currentError: CONTACT_SCAN_ERRORS.pageImportFailed,
            expect,
          })
          if (retryRows === 0) {
            logger.warn(
              { runId },
              "[contact-scan] retry reset lost the claim — abandoning",
            )
          }
          return
        }
      }

      // Contacts for this page are already durably committed at this point —
      // quota accounting and avatar backfill are both best-effort from here
      // on and must never fail or skip the page.
      if (pageResult && pageResult.importedContacts > 0 && ownerId) {
        await quotaEnforcementService
          .incrementBy({
            userId: ownerId,
            metric: "contacts",
            count: pageResult.importedContacts,
          })
          .catch((error) => {
            logger.error(
              { err: error, runId, pageNumber },
              "[contact-scan] quota increment failed — continuing (info-only)",
            )
          })
      }

      if (pageResult) {
        // Only genuinely NEW contacts need an avatar backfill (existing
        // links were already backfilled, or intentionally have none, on a
        // prior page/run). Per-contact jobs mirror coexist's parity
        // behavior; a batched profile fetch (v1 fetched ~50 profiles per
        // Graph batch request) is a recommended future optimization for very
        // large scans — not implemented here.
        await enqueueContactAvatarJobs({
          workspaceId,
          contactInboxIds: pageResult.newContactInboxIds,
          logContext: { runId, pageNumber },
        }).catch((error) => {
          logger.error(
            { err: error, runId, pageNumber },
            "[contact-scan] avatar enqueue failed — continuing",
          )
        })
      }

      oldestProcessed = filtered.oldestProcessed

      const writeRows = await contactScanService.incrementProgress({
        runId,
        increments: {
          currentScan: filtered.itemsToProcess.length,
          importedContactCount: pageResult?.importedContacts ?? 0,
          skippedCount: pageResult?.skippedContacts ?? 0,
        },
        fields: {
          lastSyncedAt: oldestProcessed,
          resumeCursor: page.after ?? null,
          currentPageNumber: pageNumber,
          currentStep: `page ${pageNumber} processed (${filtered.itemsToProcess.length} in window)`,
          currentError: null,
        },
        expect,
      })
      if (writeRows === 0) {
        abandoned = true
        break
      }

      cursor = page.after
      if (!(cursor && !filtered.stopAll)) {
        break
      }
    }

    if (abandoned) {
      logger.warn(
        { runId },
        "[contact-scan] claim taken over mid-chunk — abandoning",
      )
      return
    }

    if (continueLater) {
      const yieldRows = await contactScanService.yieldForContinuation({
        runId,
        expect,
      })
      if (yieldRows === 0) {
        logger.warn(
          { runId },
          "[contact-scan] yield lost the claim — abandoning",
        )
        return
      }
      try {
        await integrationQueue.add(
          IntegrationJobAction.contactScan,
          {
            type: IntegrationJobAction.contactScan,
            data: { runId, workspaceId },
          },
          {
            jobId: buildContactScanPageJobId({
              runId,
              attempts: run.attempts,
              pageNumber: pageNumber + 1,
            }),
            attempts: 1,
            removeOnComplete: true,
          },
        )
        logger.info(
          { runId, pageNumber },
          "[contact-scan] chunk done — continuation enqueued",
        )
      } catch (error) {
        logger.error(
          { err: error, runId },
          "[contact-scan] continuation enqueue failed — reopening for the sweeper",
        )
        await contactScanService.reopenReleased({ runId })
      }
      return
    }

    // Walk finished (no cursor left, or the ceiling was reached). A page
    // whose import throws now retries the SAME page via `resetForRetry`
    // (FIX 1) instead of counting a failure and moving on, so reaching this
    // point always means every page in the walk imported — always
    // `succeeded`. The only remaining `partial` outcome is the
    // `CONTACT_SCAN_MAX_PAGES` page-budget cap above, which finishes
    // directly with a hardcoded `partial` status and never reaches here.
    await contactScanService.finish({ runId, status: "succeeded", expect })
    logger.info({ runId, status: "succeeded" }, "[contact-scan] run complete")
  } catch (error) {
    logger.error({ err: error, runId }, "[contact-scan] fatal error")
    await logProviderError({ provider: adapter.provider, workspaceId, error })

    const classification = adapter.classifyError(error)
    const message =
      error instanceof Error ? error.message : "Unknown contact scan error"
    await CLASSIFICATION_HANDLERS[classification]({ runId, expect, message })
  }
}
