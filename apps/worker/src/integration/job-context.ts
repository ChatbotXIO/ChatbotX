import { runWithWebhookExecutionContext } from "@chatbotx.io/events/context"
import type { IntegrationJobData } from "@chatbotx.io/worker-config"
import { UnrecoverableError } from "bullmq"
import { logger } from "../lib/logger"
import {
  cleanupOrphanedIntegrationOnce,
  handleOrphanedIntegration,
  IntegrationNotFoundError,
  isExpectedOrphan,
} from "../services/orphaned-integration-cleanup"
import { isChannelOriginatedJob } from "./channel-origin"

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runWithOrphanedIntegrationCleanup<T>(
  callback: () => Promise<T>,
): Promise<T> {
  try {
    return await callback()
  } catch (error) {
    if (!(error instanceof IntegrationNotFoundError)) {
      throw error
    }

    try {
      await handleOrphanedIntegration(error)
    } catch (cleanupError) {
      logger.warn(
        {
          channel: error.channel,
          identifier: error.identifier,
          err: stringifyError(cleanupError),
        },
        "Orphaned integration cleanup threw before marking job unrecoverable",
      )
    }
    throw new UnrecoverableError(error.message)
  }
}

/**
 * Inbound events for integrations that have been disconnected complete instead
 * of filling the failed set. Only channel-originated jobs take this path:
 * internal jobs still fail loudly through `runWithOrphanedIntegrationCleanup`.
 */
async function skipOrphanedInboundJobs<T>(
  callback: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await callback()
  } catch (error) {
    if (!(error instanceof IntegrationNotFoundError)) {
      throw error
    }

    if (!isExpectedOrphan(error)) {
      try {
        await cleanupOrphanedIntegrationOnce(error)
      } catch (cleanupError) {
        logger.warn(
          {
            channel: error.channel,
            identifier: error.identifier,
            err: stringifyError(cleanupError),
          },
          "Orphaned integration cleanup threw while skipping inbound job",
        )
      }
    }

    logger.info(
      { channel: error.channel, identifier: error.identifier },
      "Integration not found for inbound event; skipping job",
    )
    return
  }
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
    runWithOrphanedIntegrationCleanup(() =>
      isChannelOriginated ? skipOrphanedInboundJobs(callback) : callback(),
    ),
  )
}
