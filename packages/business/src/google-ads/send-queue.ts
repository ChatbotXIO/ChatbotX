import type { GoogleAdsConversionEventModel } from "@chatbotx.io/database/types"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"

type EventRef = Pick<GoogleAdsConversionEventModel, "id" | "workspaceId">

/** BullMQ job states in which a job will still run (a retained completed/failed job will not). */
const LIVE_JOB_STATES: ReadonlySet<string> = new Set([
  "waiting",
  "delayed",
  "active",
  "prioritized",
  "waiting-children",
])

/** One id per `{event, generation}`; contains no `:` (BullMQ rejects it). */
export const sendJobId = (eventId: string, attempt: number): string =>
  `google-ads-send-${eventId}-a${attempt}`

/**
 * Enqueues the delivery job of ONE generation. A `{event, attempt}` pair is
 * enqueued at most once: every redrive first moves the event to a new
 * generation, so BullMQ's retained-job deduplication can never swallow it.
 */
export const enqueueSend = async (
  event: EventRef,
  attempt: number,
  delayMs: number,
): Promise<void> => {
  await enqueueIntegrationJob(
    {
      type: IntegrationJobAction.sendGoogleAdsConversion,
      data: {
        googleAdsConversionEventId: event.id,
        workspaceId: event.workspaceId,
        attempt,
      },
    },
    { jobId: sendJobId(event.id, attempt), delay: delayMs },
  )
}

/** Whether the job of this generation can still run (so no redrive is needed). */
export const isSendJobLive = async (
  eventId: string,
  attempt: number,
): Promise<boolean> => {
  const job = await integrationQueue.getJob(sendJobId(eventId, attempt))
  return job ? LIVE_JOB_STATES.has(await job.getState()) : false
}
