import { coexistService } from "@chatbotx.io/business/coexist"
import {
  type CoexistRunWriteGuard,
  inboxRepository,
  integrationWhatsappRepository,
  LIVE_RUN_STATUSES,
} from "@chatbotx.io/database/repositories"
import type { PendingCoexistPatch } from "@chatbotx.io/database/schema"
import type {
  CoexistSyncRunModel,
  InboxModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"
import type { IntegrationJobCoexistWhatsappFlush } from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"
import type { HistoryMetadata } from "./whatsapp-history-payload"

/**
 * Ownership and resume state for one WhatsApp Coexistence flush invocation:
 * which run this job is for, the claim that proves this worker owns it, and the
 * counters it resumes from. Kept apart from the drain itself so the
 * exclusive-ownership rules are readable in one place.
 */

/** Everything the drain needs that is fixed for the whole invocation. */
export type FlushContext = {
  integration: IntegrationWhatsappModel
  inbox: InboxModel
  /** The row as this worker claimed it — resume counters and ownership token. */
  run: CoexistSyncRunModel
  runId: string
  /** Status + ownership token every write this handler makes is conditional on. */
  guard: CoexistRunWriteGuard
  jobStart: number
  phoneNumberId: string
}

/** Everything the drain mutates as it walks batches. */
export type FlushState = {
  importedContacts: number
  importedMessages: number
  skipped: number
  failed: number
  totalRows: number
  batchNumber: number
  /** Prior attempt's error, so a retry does not wipe it. */
  currentError?: string
  /** Furthest history metadata THIS run has seen, across invocations. */
  runMetadata: HistoryMetadata | null
  /** Patches Meta delivered before the message they target. */
  pendingPatches: PendingCoexistPatch[]
  /** A non-metadata terminal signal (today: the history decline). */
  terminalSeen: boolean
}

/** Rehydrates the run's persisted history metadata for the reduction. */
const seedRunMetadata = (run: {
  lastPhase: number | null
  lastChunkOrder: number | null
  syncProgress: number
}): HistoryMetadata | null => {
  if (run.lastPhase === null || run.lastPhase === undefined) {
    return null
  }
  return {
    phase: run.lastPhase,
    chunkOrder: run.lastChunkOrder ?? 0,
    progress: run.syncProgress ?? 0,
  }
}

export const abandon = (context: FlushContext, reason: string): void => {
  logger.warn(
    { runId: context.runId, phoneNumberId: context.phoneNumberId, reason },
    "[coexist] WhatsApp flush run no longer claimed by this worker — abandoning",
  )
}

/**
 * The ownership heartbeat: a guarded write that both refreshes
 * `lastHeartbeatAt` and answers "do I still own this run?".
 *
 * @returns false when the run moved out from under this worker.
 */
export const stillOwnsRun = async (context: FlushContext): Promise<boolean> => {
  const written = await coexistService.updateProgress({
    runId: context.runId,
    expect: context.guard,
    fields: { lastHeartbeatAt: new Date() },
  })
  return written > 0
}

/** The integration this job is for, or null when it is gone or gated off. */
const loadEnabledIntegration = async (
  phoneNumberId: string,
): Promise<IntegrationWhatsappModel | null> => {
  const integration = await integrationWhatsappRepository.findByPhoneNumberId({
    phoneNumberId,
  })
  if (!integration) {
    logger.warn({ phoneNumberId }, "[coexist] Flush: WhatsApp integration gone")
    return null
  }
  if (!integration.coexistEnabled) {
    logger.info(
      { phoneNumberId },
      "[coexist] Flush skipped — coexist disabled, payloads remain staged",
    )
    return null
  }
  return integration
}

/**
 * Cross-tenant guard: refuses when the integration's workspace does not match
 * the run's, which defends against phoneNumberId collisions and stale job
 * payloads referencing a re-assigned integration.
 */
const belongsToSameWorkspace = async (input: {
  integration: IntegrationWhatsappModel
  run: CoexistSyncRunModel
  guard: CoexistRunWriteGuard
  phoneNumberId: string
}): Promise<boolean> => {
  if (input.integration.workspaceId === input.run.workspaceId) {
    return true
  }
  logger.warn(
    {
      phoneNumberId: input.phoneNumberId,
      runId: input.run.id,
      integrationWorkspaceId: input.integration.workspaceId,
      runWorkspaceId: input.run.workspaceId,
    },
    "[coexist] Flush: workspaceId mismatch — refusing",
  )
  await coexistService.markFailed({
    runId: input.run.id,
    currentError: "workspaceId mismatch between integration and run",
    expect: input.guard,
  })
  return false
}

/**
 * Resolves the run this job is for and CLAIMS it, returning everything fixed
 * for the invocation. Null means "nothing to do" — every branch has already
 * logged its reason.
 */
export const loadFlushContext = async (
  data: IntegrationJobCoexistWhatsappFlush["data"],
): Promise<FlushContext | null> => {
  const { phoneNumberId } = data
  const jobStart = Date.now()

  const integration = await loadEnabledIntegration(phoneNumberId)
  if (!integration) {
    return null
  }

  const runId = await resolveRunId(data, integration.id)
  if (!runId) {
    logger.info(
      { phoneNumberId },
      "[coexist] Flush: no live run — payloads remain staged",
    )
    return null
  }

  // Claim FIRST — avoids wasting the inbox lookup if another worker owns this
  // run. The claimed row carries the resume counters AND the fresh ownership
  // token, so no second read is needed.
  const run = await coexistService.claimRunWithNewToken({
    runId,
    fromStatuses: LIVE_RUN_STATUSES,
  })
  if (!run) {
    logger.warn(
      { runId, phoneNumberId },
      "[coexist] WhatsApp flush run already claimed by another worker — abandoning",
    )
    return null
  }

  const guard: CoexistRunWriteGuard = {
    status: "running",
    claimToken: run.claimToken,
  }
  if (
    !(await belongsToSameWorkspace({ integration, run, guard, phoneNumberId }))
  ) {
    return null
  }

  const inbox = await inboxRepository.findById({ id: integration.inboxId })
  if (!inbox) {
    throw new Error("Inbox not found")
  }

  return { integration, inbox, run, runId, guard, jobStart, phoneNumberId }
}

/**
 * Webhook-driven enqueues omit `runId` (they are delayed + jobId-deduped);
 * scheduler and self-continuation pass it explicitly. `waiting` counts as live:
 * it means "drained everything staged so far, Meta still owes us history".
 */
const resolveRunId = async (
  data: IntegrationJobCoexistWhatsappFlush["data"],
  integrationId: string,
): Promise<string | null> => {
  if (data.runId) {
    return data.runId
  }
  const liveRun = await coexistService.findLiveRun({
    integrationId,
    channel: "whatsapp",
  })
  return liveRun?.id ?? null
}

export const seedState = (run: CoexistSyncRunModel): FlushState => ({
  importedContacts: run.importedContactCount,
  importedMessages: run.importedMessageCount,
  skipped: run.skippedCount,
  failed: run.failedCount,
  totalRows: run.currentScan,
  batchNumber: run.currentPageNumber,
  currentError: run.currentError ?? undefined,
  runMetadata: seedRunMetadata(run),
  pendingPatches: run.pendingPatches?.entries ?? [],
  terminalSeen: false,
})
