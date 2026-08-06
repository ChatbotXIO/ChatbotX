import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type CoexistChannel,
  type CoexistIntegrationRow,
  type CoexistRunCreateInput,
  type CoexistRunProgressInput,
  type CoexistTriggerSource,
  coexistSyncRunRepository,
  type PickedCoexistRun,
  type PullCoexistChannel,
} from "@chatbotx.io/database/repositories"
import type { CoexistSyncRunModel } from "@chatbotx.io/database/types"
import { IntegrationJobAction } from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"

export type CoexistEnableInput = {
  workspaceId: string
  integrationId: string
  channel: CoexistChannel
  triggerSource?: CoexistTriggerSource
}

export type CoexistEnableResult =
  | { success: true; runId?: string }
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
  }): Promise<CoexistEnableResult> {
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

  claimRun(input: { runId: string }): Promise<CoexistSyncRunModel | null> {
    return coexistSyncRunRepository.claimRun(input)
  }

  findRunById(input: { runId: string }): Promise<CoexistSyncRunModel | null> {
    return coexistSyncRunRepository.findRunById(input)
  }

  findIntegrationForCoexist(input: {
    workspaceId: string
    integrationId: string
    channel: CoexistChannel
    tx?: DatabaseClient
  }): Promise<CoexistIntegrationRow | null> {
    return coexistSyncRunRepository.findIntegrationForCoexist(input)
  }

  updateProgress(input: CoexistRunProgressInput): Promise<void> {
    return coexistSyncRunRepository.updateProgress(input)
  }

  markFailed(input: { runId: string; currentError: string }): Promise<void> {
    return coexistSyncRunRepository.markFailed(input)
  }

  markPartial(input: { runId: string; currentError?: string }): Promise<void> {
    return coexistSyncRunRepository.markPartial(input)
  }

  markSucceeded(input: { runId: string }): Promise<void> {
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
}

export const coexistService = new CoexistService()
