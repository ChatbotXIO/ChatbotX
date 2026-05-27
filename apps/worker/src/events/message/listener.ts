import {
  broadcastAnalyticsService,
  contactAnalyticsService,
  flowAnalyticsService,
  sequenceAnalyticsService,
} from "@chatbotx.io/analytics"
import { db, eq } from "@chatbotx.io/database/client"
import { messageModel } from "@chatbotx.io/database/schema"
import type { MessageEvenTypeMap } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"

// Persiste timestamps de delivery status na Message do DB
// (✓✓ deliveredAt / ✓✓ azul readAt / ⚠️ failedAt).
// Event-bus passa ARRAY de payloads pro handler (XREADGROUP COUNT 10).
// Memory: reference_event_bus_batch_payloads.
async function persistMessageStatusBatch(
  payloads: unknown,
  status: "delivered" | "read" | "failed",
) {
  const events = Array.isArray(payloads) ? payloads : [payloads]
  for (const event of events) {
    const e = event as {
      action?: { messageId?: string }
      errorData?: unknown
      occurredAt?: Date
    }
    const messageId = e.action?.messageId
    if (!messageId) {
      continue
    }
    const occurredAt = e.occurredAt ?? new Date()
    let patch: Partial<typeof messageModel.$inferInsert>
    if (status === "delivered") {
      patch = { deliveredAt: occurredAt }
    } else if (status === "read") {
      patch = { readAt: occurredAt }
    } else {
      const failureReason =
        typeof e.errorData === "object" && e.errorData !== null
          ? JSON.stringify(e.errorData)
          : String(e.errorData ?? "")
      patch = { failedAt: occurredAt, failureReason }
    }
    try {
      await db
        .update(messageModel)
        .set(patch)
        .where(eq(messageModel.id, messageId))
    } catch (err) {
      logger.error(
        { err, messageId, status },
        "Failed to persist message status",
      )
    }
  }
}

export const messageListeners: Partial<MessageEvenTypeMap> = {
  [messageEventTypeSchema.enum["message:sent"]]: [
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onMessageSent.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onMessageSent.bind(
        sequenceAnalyticsService,
      ),
    },
    {
      name: "flow-ops",
      handler: flowAnalyticsService.onMessageSent.bind(flowAnalyticsService),
    },
  ],
  [messageEventTypeSchema.enum["message:failed"]]: [
    {
      name: "message-status-persist",
      handler: (event) => persistMessageStatusBatch(event, "failed"),
    },
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onFailed.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onFailed.bind(sequenceAnalyticsService),
    },
    {
      name: "flow-ops",
      handler: flowAnalyticsService.onMessageFailed.bind(flowAnalyticsService),
    },
    {
      name: "contact-blocked-detection",
      handler: contactAnalyticsService.handleBlocked.bind(
        contactAnalyticsService,
      ),
    },
  ],
  [messageEventTypeSchema.enum["message:delivered"]]: [
    {
      name: "message-status-persist",
      handler: (event) => persistMessageStatusBatch(event, "delivered"),
    },
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onDelivered.bind(
        broadcastAnalyticsService,
      ),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onDelivered.bind(
        sequenceAnalyticsService,
      ),
    },
    {
      name: "flow-ops",
      handler:
        flowAnalyticsService.onMessageDelivered.bind(flowAnalyticsService),
    },
  ],
  [messageEventTypeSchema.enum["message:seen"]]: [
    {
      name: "message-status-persist",
      handler: (event) => persistMessageStatusBatch(event, "read"),
    },
    {
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onSeen.bind(broadcastAnalyticsService),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onSeen.bind(sequenceAnalyticsService),
    },
  ],
}
