import { agentResponseAnalyticsService } from "@chatbotx.io/analytics"
import type { AgentRepliedEventPayload } from "@chatbotx.io/event-bus"
import { agentRepliedEventSchema } from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"

const toMs = (value: Date | string | number): number =>
  new Date(value).getTime()

/** An unparseable timestamp would make the insert throw and DLQ the whole batch. */
const hasFiniteTimestamps = (payload: AgentRepliedEventPayload): boolean =>
  [payload.occurredAt, payload.awaitingSince, payload.measuredFrom].every(
    (value) => Number.isFinite(toMs(value)),
  )

/**
 * Plain consumer: the producer already resolved the working-hours schedule and
 * the measured window. Rows that cannot be a real answered window are dropped
 * (a retry would never fix them); anything else is inserted idempotently and
 * failures propagate so the listener retries the stream ids.
 */
export async function handleAgentReplied(
  payloads: AgentRepliedEventPayload[],
): Promise<void> {
  const valid: AgentRepliedEventPayload[] = []
  for (const payload of payloads) {
    const parsed = agentRepliedEventSchema.safeParse(payload)
    const invalid =
      !(parsed.success && hasFiniteTimestamps(payload)) ||
      toMs(payload.measuredFrom) >= toMs(payload.occurredAt)
    if (invalid) {
      logger.warn(
        {
          workspaceId: payload.workspaceId,
          conversationId: payload.conversationId,
          eventId: payload.eventId,
        },
        "[analytics] dropped invalid agent:replied event",
      )
      continue
    }
    valid.push(payload)
  }
  if (valid.length === 0) {
    return
  }
  await agentResponseAnalyticsService.recordEvents(valid)
}
