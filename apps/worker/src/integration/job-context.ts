import { runWithWebhookExecutionContext } from "@chatbotx.io/events/context"
import type { IntegrationJobData } from "@chatbotx.io/worker-config"
import { UnrecoverableError } from "bullmq"
import { logger } from "../lib/logger"
import {
  handleOrphanedIntegration,
  IntegrationNotFoundError,
} from "../services/orphaned-integration-cleanup"
import { isChannelOriginatedJob } from "./channel-origin"

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runIntegrationJobWithWebhookContext<T>(
  jobData: IntegrationJobData,
  callback: () => Promise<T>,
): Promise<T> {
  const isChannelOriginated = isChannelOriginatedJob(jobData)
  const webhookExecutionContext = isChannelOriginated
    ? { source: "webhook" as const }
    : {}

  try {
    return await runWithWebhookExecutionContext(
      webhookExecutionContext,
      callback,
    )
  } catch (error) {
    if (error instanceof IntegrationNotFoundError) {
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

    throw error
  }
}
