import { runWithWebhookExecutionContext } from "@chatbotx.io/events/context"
import type { IntegrationJobData } from "@chatbotx.io/worker-config"
import { isChannelOriginatedJob } from "./channel-origin"

export async function runIntegrationJobWithWebhookContext<T>(
  jobData: IntegrationJobData,
  callback: () => Promise<T>,
): Promise<T> {
  const webhookExecutionContext = isChannelOriginatedJob(jobData)
    ? { source: "webhook" as const }
    : {}

  return await runWithWebhookExecutionContext(webhookExecutionContext, callback)
}
