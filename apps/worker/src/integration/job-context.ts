import { runWithWebhookExecutionContext } from "@chatbotx.io/events/context"
import type { IntegrationJobData } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import {
  cleanupOrphanedIntegrationOnce,
  IntegrationNotFoundError,
} from "../services/orphaned-integration-cleanup"
import { isChannelOriginatedJob, isInboundWebhookJob } from "./channel-origin"

async function skipOrphanedIntegrationJobs<T>(
  jobData: { type: string },
  callback: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await callback()
  } catch (error) {
    if (!(error instanceof IntegrationNotFoundError)) {
      throw error
    }

    await cleanupOrphanedIntegrationOnce(error)

    const logContext = {
      channel: error.channel,
      identifier: error.identifier,
      jobType: jobData.type,
    }
    if (isInboundWebhookJob(jobData)) {
      logger.warn(
        logContext,
        "Integration not found for inbound event; skipping job",
      )
      return
    }

    logger.error(
      { ...logContext, err: error },
      "Integration not found; completing job without retry",
    )
    return
  }
}

export async function runWithOrphanedIntegrationCleanup<T>(
  callback: () => Promise<T>,
): Promise<T | undefined> {
  return await skipOrphanedIntegrationJobs({ type: "unknown" }, callback)
}

export async function runIntegrationJobWithWebhookContext<T>(
  jobData: IntegrationJobData,
  callback: () => Promise<T>,
): Promise<T | undefined> {
  const isChannelOriginated = isChannelOriginatedJob(jobData)
  const webhookExecutionContext = isChannelOriginated
    ? { source: "webhook" as const }
    : {}

  return await runWithWebhookExecutionContext(webhookExecutionContext, () =>
    skipOrphanedIntegrationJobs(jobData, callback),
  )
}
