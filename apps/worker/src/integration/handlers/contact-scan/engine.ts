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
import { supportsProfileSnapshot } from "@chatbotx.io/database/partials"
import type { CoexistRunWriteGuard } from "@chatbotx.io/database/repositories"
import type { CoexistSyncRunModel } from "@chatbotx.io/database/types"
import { isContactScanChannel } from "@chatbotx.io/utils/channel"
import {
  buildContactScanPageJobId,
  IntegrationJobAction,
  type IntegrationJobContactScan,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import { filterConversationWindow } from "../coexist/conversation-window"
import { enqueueProfileSnapshotJobs } from "../profile-snapshot/queue"
import type { ContactScanErrorClassification } from "./adapter"
import { contactScanAdapters } from "./adapter"
import { CONTACT_SCAN_PACING, resolveScanPacing } from "./pacing"

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

type ContinuationInput = {
  runId: string
  workspaceId: string
  /** `run.attempts` at claim: part of the job id, so a retry is a distinct job. */
  attempts: number
  pageNumber: number
  expect: CoexistRunWriteGuard
  delayMs: number
  /** Set when the next chunk's page number may already have been used (a same-page retry, a restarted walk): its job id must be unique. */
  retriesSamePage: boolean
  /** Writes `attempts = 1` with the release (a wait that is not a failure). */
  resetAttempts?: boolean
}

/**
 * Releases the claim (the run stays `running`) and queues the next chunk after
 * `delayMs`. A wait is always a delayed job, never a sleep inside the worker, so
 * a rate-limited scan holds no worker slot. If the job cannot be queued the run
 * is reopened for the sweeper.
 */
const scheduleContinuation = async (
  input: ContinuationInput,
): Promise<void> => {
  const { runId, workspaceId } = input
  const yieldRows = await contactScanService.yieldForContinuation({
    runId,
    expect: input.expect,
    attempts: input.resetAttempts ? 1 : undefined,
  })
  if (yieldRows === 0) {
    logger.warn({ runId }, "[contact-scan] yield lost the claim — abandoning")
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
          attempts: input.attempts,
          pageNumber: input.pageNumber + 1,
          generation: input.retriesSamePage ? Date.now() : undefined,
        }),
        delay: input.delayMs,
        attempts: 1,
        removeOnComplete: true,
        // A failed job keeps its id reserved; do not keep it forever.
        removeOnFail: { count: 100 },
      },
    )
    logger.info(
      { runId, pageNumber: input.pageNumber, delayMs: input.delayMs },
      "[contact-scan] chunk done — continuation enqueued",
    )
  } catch (error) {
    logger.error(
      { err: error, runId },
      "[contact-scan] continuation enqueue failed — reopening for the sweeper",
    )
    await contactScanService.reopenReleased({ runId })
  }
}

type ClassificationInput = {
  run: CoexistSyncRunModel
  workspaceId: string
  pageNumber: number
  expect: CoexistRunWriteGuard
  /** Sanitized fallback text, used only by `unknown`. */
  message: string
  /** How long a rate-limited scan must wait, from the provider's headers. */
  waitMs: number
}

/**
 * Terminal/retry handler per `adapter.classifyError` outcome — a table, never
 * an if/else chain, so the compiler catches a missing arm if the union grows.
 */
const CLASSIFICATION_HANDLERS: Record<
  ContactScanErrorClassification,
  (input: ClassificationInput) => Promise<unknown>
> = {
  // Wait through the queue and retry the SAME page (the failed page was never
  // persisted, so the saved cursor still points at it). A rate limit is not a
  // failure and the provider answered, so the count goes back to a single
  // attempt: left high, the sweeper would terminalize the released run during
  // a long wait (it is idle for more than 10 minutes).
  rateLimited: ({ run, workspaceId, pageNumber, expect, waitMs }) =>
    scheduleContinuation({
      runId: run.id,
      workspaceId,
      attempts: run.attempts,
      resetAttempts: true,
      pageNumber,
      expect,
      delayMs: waitMs,
      retriesSamePage: true,
    }),
  // Transient (network, 5xx): back to the sweeper, or failed on the last try.
  retryable: ({ run, expect }) =>
    contactScanService.retryOrFail({ runId: run.id, expect }),
  tokenInvalid: ({ run, expect }) =>
    contactScanService.finish({
      runId: run.id,
      status: "failed",
      currentError: CONTACT_SCAN_ERRORS.tokenInvalid,
      expect,
    }),
  graphPermission: ({ run, expect }) =>
    contactScanService.finish({
      runId: run.id,
      status: "failed",
      currentError: CONTACT_SCAN_ERRORS.graphPermission,
      expect,
    }),
  unknown: ({ run, expect, message }) =>
    contactScanService.finish({
      runId: run.id,
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
    await contactScanService.retryOrFail({ runId, expect })
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
  // After a cursor restart the page numbers count again from 1, so a later
  // continuation id could equal one used earlier in this run.
  let walkRestarted = false

  // Pages walked in THIS chunk, and a wait the pacing asked for after a page.
  let pagesInChunk = 0
  let nextChunkDelayMs: number = CONTACT_SCAN_PACING.chunkGapMs

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

      // A chunk is a few pages (not the whole budget), so a big inbox is walked
      // as a steady trickle of short jobs rather than one long burst.
      if (
        pagesInChunk >= CONTACT_SCAN_PACING.chunkMaxPages ||
        Date.now() - jobStart >= CONTACT_SCAN_PACING.chunkBudgetMs
      ) {
        continueLater = true
        break
      }

      if (pagesInChunk > 0) {
        await sleep(CONTACT_SCAN_PACING.pageGapMs)
      }
      pageNumber += 1

      let page: Awaited<ReturnType<typeof adapter.listPage>>
      try {
        page = await adapter.listPage({ context, cursor })
      } catch (error) {
        // Only a cursor the provider REJECTS is cleared: a rate limit or a
        // transient failure says nothing about the cursor.
        const failure = adapter.classifyError({ error, context })
        if (
          firstPageCursorRecoveryAvailable &&
          failure !== "retryable" &&
          failure !== "rateLimited"
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
          walkRestarted = true
          continue
        }
        throw error
      }
      firstPageCursorRecoveryAvailable = false
      pagesInChunk += 1

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
      // imported. `retryOrFail` hands the run back to the scheduler (or fails
      // it on the last attempt), which re-fetches this exact page next time.
      let pageResult: Awaited<
        ReturnType<typeof bulkImportChannelContacts>
      > | null = null
      if (filtered.itemsToProcess.length > 0) {
        try {
          pageResult = await bulkImportChannelContacts({
            captureProfileSnapshot: supportsProfileSnapshot(
              context.inbox.channel,
            ),
            inbox: context.inbox,
            workspaceId,
            contacts: filtered.itemsToProcess.map((entry) => entry.contact),
          })
        } catch (error) {
          logger.error(
            { err: error, runId, pageNumber },
            "[contact-scan] bulk import threw — retrying this page",
          )
          const outcome = await contactScanService.retryOrFail({
            runId,
            expect,
            retryError: CONTACT_SCAN_ERRORS.pageImportFailed,
          })
          if (outcome === null) {
            logger.warn(
              { runId },
              "[contact-scan] retry reset lost the claim — abandoning",
            )
          }
          return
        }
      }

      // Contacts for this page are already durably committed at this point.
      // Quota accounting is best-effort and must never fail or skip the page;
      // avatars hydrate lazily through the media proxy when viewed.
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

      if (
        supportsProfileSnapshot(context.inbox.channel) &&
        pageResult?.newContactInboxIds.size
      ) {
        await enqueueProfileSnapshotJobs({
          contactInboxIds: [...pageResult.newContactInboxIds.values()].map(
            (link) => link.contactInboxId,
          ),
          inboxId: context.inbox.id,
          workspaceId,
        }).catch((err) => {
          logger.warn(
            { err, inboxId: context.inbox.id, workspaceId },
            "[contact-scan] Profile snapshot enqueue failed; recovery will retry",
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
          // A finished page ends any run of failures. `attempts` counts the
          // sweeper's picks, so a claim that is running counts as 1; reset to
          // that (not 0) so the 5th consecutive failure fails the run, exactly
          // like a fresh one.
          attempts: 1,
          lastHeartbeatAt: new Date(),
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

      // High usage or a provider wait: stop here and continue after the wait,
      // as a delayed job (never a sleep in the worker).
      const pacingWaitMs = resolveScanPacing({ signal: page.usageSignal })
      if (pacingWaitMs > 0) {
        nextChunkDelayMs = pacingWaitMs
        continueLater = true
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
      await scheduleContinuation({
        runId,
        workspaceId,
        attempts: run.attempts,
        pageNumber,
        expect,
        delayMs: nextChunkDelayMs,
        retriesSamePage: walkRestarted,
      })
      return
    }

    // Walk finished (no cursor left, or the ceiling was reached). A page
    // whose import throws now retries the SAME page via `retryOrFail`
    // instead of counting a failure and moving on, so reaching this
    // point always means every page in the walk imported — always
    // `succeeded`. The only remaining `partial` outcome is the
    // `CONTACT_SCAN_MAX_PAGES` page-budget cap above, which finishes
    // directly with a hardcoded `partial` status and never reaches here.
    await contactScanService.finish({ runId, status: "succeeded", expect })
    logger.info({ runId, status: "succeeded" }, "[contact-scan] run complete")
  } catch (error) {
    logger.error({ err: error, runId }, "[contact-scan] fatal error")
    await logProviderError({ provider: adapter.provider, workspaceId, error })

    const classification = adapter.classifyError({ error, context })
    const message =
      error instanceof Error ? error.message : "Unknown contact scan error"
    await CLASSIFICATION_HANDLERS[classification]({
      run,
      workspaceId,
      pageNumber,
      expect,
      message,
      waitMs: resolveScanPacing({
        signal: adapter.readBackoff({ error, context }),
        rateLimited: classification === "rateLimited",
      }),
    })
  }
}
