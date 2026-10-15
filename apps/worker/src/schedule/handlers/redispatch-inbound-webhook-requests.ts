import { inboundWebhookService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { mapWithConcurrency } from "@chatbotx.io/utils"
import { enqueueProcessInboundWebhookRequest } from "@chatbotx.io/worker-config"

const log = getChildLogger("redispatch-inbound-webhook-requests")

const BATCH_SIZE = 500
const ENQUEUE_CONCURRENCY = 10

/**
 * The outbox sweep: re-enqueues requests nobody finished (the enqueue failed,
 * the job was lost, or the worker died holding the claim). The job id is
 * deterministic and the handler claims atomically, so re-enqueueing a request
 * that is in fact still running is harmless. Requests too old to retry are
 * closed as abandoned so none stays pending forever.
 */
export async function redispatchInboundWebhookRequests(): Promise<void> {
  const abandoned = await inboundWebhookService.abandonStaleRequests()
  if (abandoned > 0) {
    log.warn({ abandoned }, "Closed inbound webhook requests as abandoned")
  }

  const stale = await inboundWebhookService.listStaleRequests(BATCH_SIZE)
  const results = await mapWithConcurrency(
    stale,
    ENQUEUE_CONCURRENCY,
    ({ id, workspaceId, inboundWebhookId }) =>
      enqueueProcessInboundWebhookRequest({
        workspaceId,
        inboundWebhookId,
        requestId: id,
      }),
  )
  const failed = results.filter(({ status }) => status === "rejected").length
  if (failed > 0) {
    log.error({ failed }, "Could not re-enqueue some inbound webhook requests")
  }
  if (stale.length > 0) {
    log.info({ requeued: stale.length - failed }, "Re-dispatched requests")
  }
}
