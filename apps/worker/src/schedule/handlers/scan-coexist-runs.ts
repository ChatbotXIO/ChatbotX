import {
  type CoexistJobStrategy,
  coexistJobStrategies,
  coexistService,
} from "@chatbotx.io/business"
import type {
  CoexistChannel,
  PickedCoexistRun,
} from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  IntegrationJobAction,
  type IntegrationJobData,
  integrationQueue,
} from "@chatbotx.io/worker-config"

const log = getChildLogger("scan-coexist-runs")

const BATCH = 500
const MAX_ATTEMPTS = 5

type CoexistRunEnqueuer = (run: PickedCoexistRun) => Promise<void>

const pullSyncActions = {
  messenger: IntegrationJobAction.coexistMessengerSync,
  instagram: IntegrationJobAction.coexistInstagramSync,
} satisfies Partial<
  Record<
    CoexistChannel,
    Extract<CoexistJobStrategy, { mode: "pull" }>["action"]
  >
>

const createPullSyncPayload = (
  run: PickedCoexistRun,
  action: (typeof pullSyncActions)[keyof typeof pullSyncActions],
): IntegrationJobData => ({
  type: action,
  data: {
    runId: run.id,
    integrationId: run.integrationId,
    workspaceId: run.workspaceId,
  },
})

const coexistRunEnqueuers = {
  messenger: async (run) => {
    await enqueueRun(run, createPullSyncPayload(run, pullSyncActions.messenger))
  },
  instagram: async (run) => {
    await enqueueRun(run, createPullSyncPayload(run, pullSyncActions.instagram))
  },
  whatsapp: async (run) => {
    const integration = await coexistService.findIntegrationForCoexist({
      workspaceId: run.workspaceId,
      integrationId: run.integrationId,
      channel: run.channel,
    })

    if (integration?.channel !== "whatsapp" || !integration.phoneNumberId) {
      await coexistService.markFailed({
        runId: run.id,
        currentError: "integration missing phoneNumberId",
      })
      log.warn(
        { runId: run.id },
        "scanCoexistRuns: missing phoneNumberId, marked failed",
      )
      return
    }

    await enqueueRun(run, {
      type: IntegrationJobAction.coexistWhatsappFlush,
      data: { runId: run.id, phoneNumberId: integration.phoneNumberId },
    })
  },
} satisfies Record<CoexistChannel, CoexistRunEnqueuer>

async function enqueueRun(
  run: PickedCoexistRun,
  payload: IntegrationJobData,
): Promise<void> {
  await integrationQueue.add(payload.type, payload, {
    jobId: `coexist-run-${run.id}-${run.attempts}`,
    attempts: 1,
    removeOnComplete: true,
    removeOnFail: { count: 100 },
  })
}

export async function scanCoexistRuns(): Promise<void> {
  await coexistService.markMaxAttemptsFailed({ maxAttempts: MAX_ATTEMPTS })

  const picked = await coexistService.pickDueRuns({
    batchSize: BATCH,
    maxAttempts: MAX_ATTEMPTS,
  })

  if (picked.length === 0) {
    return
  }

  log.info({ count: picked.length }, "scanCoexistRuns: picked runs")

  for (const run of picked) {
    try {
      const strategy = coexistJobStrategies[run.channel]
      await coexistRunEnqueuers[run.channel](run)
      log.debug(
        { runId: run.id, channel: run.channel, strategy: strategy.mode },
        "scanCoexistRuns: enqueued run",
      )
    } catch (err) {
      log.error({ err, runId: run.id }, "scanCoexistRuns: enqueue failed")
    }
  }
}
