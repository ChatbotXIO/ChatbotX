import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type CoexistChannel,
  type CoexistIntegrationRow,
  type CoexistRunCreateInput,
  type CoexistRunProgressInput,
  type CoexistRunStatus,
  type CoexistRunWriteGuard,
  type CoexistTriggerSource,
  coexistSyncRunRepository,
  type PickedCoexistRun,
  type PullCoexistChannel,
} from "@chatbotx.io/database/repositories"
import type { CoexistSyncRunModel } from "@chatbotx.io/database/types"
import { IntegrationJobAction } from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import {
  COEXIST_HISTORY_TIMEOUT_ERROR,
  WHATSAPP_COEXIST_HISTORY_WINDOW_MS,
} from "./history-window"

export type CoexistEnableInput = {
  workspaceId: string
  integrationId: string
  channel: CoexistChannel
  triggerSource?: CoexistTriggerSource
  /** When false (the default), coexist-synced history advances
   *  `Conversation.aiContextLastMessageId` so the AI ignores it; when true,
   *  the AI reads the synced history. Written only on enable — `disable`
   *  never touches the column. */
  aiReadsSyncedHistory?: boolean
}

export type CoexistEnableResult =
  | { success: true; runId: string }
  | { success: false; reason: "not_found" }

export type CoexistDisableResult =
  | { success: true }
  | { success: false; reason: "not_found" }

export type CoexistJobStrategy =
  | {
      mode: "pull"
      action:
        | typeof IntegrationJobAction.coexistMessengerSync
        | typeof IntegrationJobAction.coexistInstagramSync
    }
  | {
      mode: "buffered"
      action: typeof IntegrationJobAction.coexistWhatsappFlush
    }

export const coexistJobStrategies = {
  messenger: {
    mode: "pull",
    action: IntegrationJobAction.coexistMessengerSync,
  },
  instagram: {
    mode: "pull",
    action: IntegrationJobAction.coexistInstagramSync,
  },
  whatsapp: {
    mode: "buffered",
    action: IntegrationJobAction.coexistWhatsappFlush,
  },
} satisfies Record<CoexistChannel, CoexistJobStrategy>

class CoexistService extends BaseService {
  async enable(input: CoexistEnableInput): Promise<CoexistEnableResult> {
    const result = await db.transaction(async (tx) => {
      const integration =
        await coexistSyncRunRepository.findIntegrationForCoexist({
          ...input,
          tx,
        })

      if (!integration) {
        return { success: false, reason: "not_found" } as const
      }

      await coexistSyncRunRepository.setIntegrationCoexistEnabled({
        ...input,
        enabled: true,
        tx,
      })

      // Reuse a run that is still alive rather than opening a second one.
      // `CoexistSyncRun_integration_init_uq` only dedups `init`, so without
      // this a user re-confirming the popup while a WhatsApp run is parked in
      // `waiting` got two live runs: the buffer flush picks the newest and the
      // older one lingers until the 24h timeout closes it `partial`.
      const liveRun = await coexistSyncRunRepository.findLiveRun({
        integrationId: input.integrationId,
        channel: input.channel,
        tx,
      })
      if (liveRun) {
        return { success: true, runId: liveRun.id } as const
      }

      const run = await coexistSyncRunRepository.createRun({
        workspaceId: input.workspaceId,
        integrationId: input.integrationId,
        channel: input.channel,
        triggerSource: input.triggerSource ?? "popup-enable",
        tx,
      })

      return { success: true, runId: run.id } as const
    })

    return result
  }

  async disable(input: {
    workspaceId: string
    integrationId: string
    channel: CoexistChannel
  }): Promise<CoexistDisableResult> {
    const result = await db.transaction(async (tx) => {
      const integration =
        await coexistSyncRunRepository.setIntegrationCoexistEnabled({
          ...input,
          enabled: false,
          tx,
        })

      if (!integration) {
        return { success: false, reason: "not_found" } as const
      }

      await coexistSyncRunRepository.tearDownActiveRunsForIntegration({
        channel: input.channel,
        integrationId: input.integrationId,
        currentError: "Coexist disabled",
        tx,
      })

      return { success: true } as const
    })

    return result
  }

  async tearDownForIntegration(input: {
    workspaceId: string
    integrationId: string
    channel: CoexistChannel
    currentError: string
    tx?: DatabaseClient
  }): Promise<void> {
    await coexistSyncRunRepository.tearDownActiveRunsForIntegration(input)
  }

  markMaxAttemptsFailed(input: { maxAttempts: number }): Promise<void> {
    return coexistSyncRunRepository.markMaxAttemptsFailed(input)
  }

  pickDueRuns(input: {
    batchSize: number
    maxAttempts: number
  }): Promise<PickedCoexistRun[]> {
    return coexistSyncRunRepository.pickDueRuns(input)
  }

  /**
   * Claims a run for this worker and mints a fresh ownership token, returned on
   * the row as `claimToken`. Pass it back in the `expect` guard of every later
   * write so a worker whose claim was taken over cannot keep writing.
   *
   * `fromStatuses` defaults to the pull channels' `init | running`; the
   * WhatsApp flush passes `LIVE_RUN_STATUSES` so a run parked in `waiting` is
   * claimable too.
   */
  claimRun(input: {
    runId: string
    fromStatuses?: CoexistRunStatus[]
  }): Promise<CoexistSyncRunModel | null> {
    return coexistSyncRunRepository.claimRun(input)
  }

  findRunById(input: { runId: string }): Promise<CoexistSyncRunModel | null> {
    return coexistSyncRunRepository.findRunById(input)
  }

  /**
   * Newest run for this integration that is still alive
   * (`init | running | waiting`). The WhatsApp flush uses it when the job
   * payload carries no `runId` (webhook-driven enqueues omit it).
   */
  findLiveRun(input: {
    integrationId: string
    channel: CoexistChannel
  }): Promise<CoexistSyncRunModel | null> {
    return coexistSyncRunRepository.findLiveRun(input)
  }

  findIntegrationForCoexist(input: {
    workspaceId: string
    integrationId: string
    channel: CoexistChannel
    tx?: DatabaseClient
  }): Promise<CoexistIntegrationRow | null> {
    return coexistSyncRunRepository.findIntegrationForCoexist(input)
  }

  /** @returns rows written — 0 means the `expect` guard did not hold. */
  updateProgress(input: CoexistRunProgressInput): Promise<number> {
    return coexistSyncRunRepository.updateProgress(input)
  }

  /**
   * Hands a run back to the scheduler after a TRANSIENT failure: `init` with a
   * fresh heartbeat, counters and pending patches preserved, `finishedAt`
   * untouched. Never terminalizes — `pickDueRuns` + `markMaxAttemptsFailed`
   * own the eventual `failed`.
   */
  resetForRetry(input: {
    runId: string
    currentError: string
    fields?: CoexistRunProgressInput["fields"]
    expect?: CoexistRunWriteGuard
  }): Promise<number> {
    return coexistSyncRunRepository.updateProgress({
      runId: input.runId,
      fields: {
        ...input.fields,
        status: "init",
        currentError: input.currentError,
        lastHeartbeatAt: new Date(),
      },
      expect: input.expect,
    })
  }

  markFailed(input: {
    runId: string
    currentError: string
    expect?: CoexistRunWriteGuard
  }): Promise<number> {
    return coexistSyncRunRepository.markFailed(input)
  }

  markPartial(input: {
    runId: string
    currentError?: string
    expect?: CoexistRunWriteGuard
  }): Promise<number> {
    return coexistSyncRunRepository.markPartial(input)
  }

  markSucceeded(input: {
    runId: string
    expect?: CoexistRunWriteGuard
  }): Promise<number> {
    return coexistSyncRunRepository.markSucceeded(input)
  }

  findResumeCeiling(input: {
    integrationId: string
    channel: PullCoexistChannel
    currentRunId: string
  }): Promise<Date | null> {
    return coexistSyncRunRepository.findResumeCeiling(input)
  }

  createRun(input: CoexistRunCreateInput): Promise<CoexistSyncRunModel> {
    return coexistSyncRunRepository.createRun(input)
  }

  /**
   * WhatsApp-only recovery: a run parked in `waiting` that has staging rows
   * again goes back to `init` (without burning an attempt) so the normal
   * pick/enqueue path drains it.
   */
  reviveWaitingRunsWithPendingStaging(input: {
    batchSize: number
  }): Promise<PickedCoexistRun[]> {
    return coexistSyncRunRepository.reviveWaitingRunsWithPendingStaging(input)
  }

  /**
   * WhatsApp-only recovery: a run that waited past Meta's history window with
   * nothing left to drain is closed as `partial` + `history_timeout`.
   */
  finalizeTimedOutWaitingRuns(input: {
    batchSize: number
    windowMs?: number
    currentError?: string
  }): Promise<{ id: string }[]> {
    return coexistSyncRunRepository.finalizeTimedOutWaitingRuns({
      batchSize: input.batchSize,
      windowMs: input.windowMs ?? WHATSAPP_COEXIST_HISTORY_WINDOW_MS,
      currentError: input.currentError ?? COEXIST_HISTORY_TIMEOUT_ERROR,
    })
  }

  /**
   * WhatsApp-only recovery: coexist-enabled integrations holding staging rows
   * with no live run left to drain them.
   */
  findStrandedCoexistWhatsappIntegrations(input: {
    limit: number
  }): Promise<{ integrationId: string; workspaceId: string }[]> {
    return coexistSyncRunRepository.findStrandedCoexistWhatsappIntegrations(
      input,
    )
  }

  findLastSyncedAt(input: {
    runId: string
  }): ReturnType<typeof coexistSyncRunRepository.findLastSyncedAt> {
    return coexistSyncRunRepository.findLastSyncedAt(input)
  }

  incrementProgress(
    input: Parameters<typeof coexistSyncRunRepository.incrementProgress>[0],
  ): Promise<void> {
    return coexistSyncRunRepository.incrementProgress(input)
  }

  findInitState(input: {
    runId: string
  }): ReturnType<typeof coexistSyncRunRepository.findInitState> {
    return coexistSyncRunRepository.findInitState(input)
  }

  claimRunForSync(input: {
    runId: string
    touchUpdatedAt: boolean
  }): Promise<CoexistSyncRunModel | null> {
    return coexistSyncRunRepository.claimRunForSync(input)
  }

  findTerminalCounters(input: {
    runId: string
  }): ReturnType<typeof coexistSyncRunRepository.findTerminalCounters> {
    return coexistSyncRunRepository.findTerminalCounters(input)
  }
}

export const coexistService = new CoexistService()
