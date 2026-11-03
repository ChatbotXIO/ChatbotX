import { runWithWebhookExecutionContext } from "@chatbotx.io/events/context"
import type { IntegrationJobData } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import {
  cleanupOrphanedIntegrationOnce,
  IntegrationNotFoundError,
} from "../services/orphaned-integration-cleanup"
import { isChannelOriginatedJob, isInboundWebhookJob } from "./channel-origin"

type OrphanedJobContext = {
  jobType: string
  isInbound: boolean
}

async function skipOrphanedIntegrationJobs<T>(
  context: OrphanedJobContext,
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
      jobType: context.jobType,
    }
    if (context.isInbound) {
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
  context: OrphanedJobContext,
  callback: () => Promise<T>,
): Promise<T | undefined> {
  return await skipOrphanedIntegrationJobs(context, callback)
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
    skipOrphanedIntegrationJobs(
      {
        isInbound: isInboundWebhookJob(jobData),
        jobType: jobData.type,
      },
      callback,
    ),
  )
}
