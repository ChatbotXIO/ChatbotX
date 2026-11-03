import { runWithWebhookExecutionContext } from "@chatbotx.io/events/context"
import type { IntegrationJobData } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import {
  cleanupOrphanedIntegrationOnce,
  IntegrationNotFoundError,
} from "../services/orphaned-integration-cleanup"
import { isChannelOriginatedJob, isInboundWebhookJob } from "./channel-origin"

type OrphanedJobContext = Readonly<{
  jobType: string
  isInbound: boolean
}>

/**
 * A job whose integration row is gone completes after throttled
 * orphaned-integration cleanup instead of retrying or filling the failed set.
 * Inbound events log at `warn`; internal jobs log at `error` because losing
 * one is unexpected.
 */
export async function runWithOrphanedIntegrationCleanup<T>(
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
    } else {
      logger.error(
        { ...logContext, err: error },
        "Integration not found; completing job without retry",
      )
    }
    return
  }
}

export async function runIntegrationJobWithWebhookContext<T>(
  jobData: IntegrationJobData,
  callback: () => Promise<T>,
): Promise<T | undefined> {
  const webhookExecutionContext = isChannelOriginatedJob(jobData)
    ? { source: "webhook" as const }
    : {}

  return await runWithWebhookExecutionContext(webhookExecutionContext, () =>
    runWithOrphanedIntegrationCleanup(
      {
        isInbound: isInboundWebhookJob(jobData),
        jobType: jobData.type,
      },
      callback,
    ),
  )
}
