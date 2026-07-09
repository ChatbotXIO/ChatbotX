import {
  broadcastAnalyticsService,
  contactAnalyticsService,
  flowAnalyticsService,
  macTrackingService,
  sequenceAnalyticsService,
} from "@chatbotx.io/analytics"
import { contactInboxService } from "@chatbotx.io/business"
import type {
  EventBusMessageMetadata,
  MessageEvenTypeMap,
  MessageFailedPayload,
  MessagePayload,
} from "@chatbotx.io/event-bus"
import { EVENT_BUS_MESSAGE_ID } from "@chatbotx.io/event-bus"
import { messageEventTypeSchema } from "@chatbotx.io/flow-config"

function formatSendFailureError(errorData: unknown): string {
  if (errorData instanceof Error) {
    return errorData.message
  }

  if (typeof errorData === "string") {
    return errorData
  }

  if (errorData && typeof errorData === "object" && "message" in errorData) {
    const message = (errorData as { message?: unknown }).message
    if (typeof message === "string" && message.length > 0) {
      return message
    }
  }

  try {
    const serialized = JSON.stringify(errorData)
    if (serialized) {
      return serialized
    }
  } catch {
    return "Failed to send message"
  }

  return "Failed to send message"
}

type FailedPayloadWithMetadata = MessageFailedPayload & EventBusMessageMetadata

async function recordContactInboxSendFailure(payloads: MessagePayload[]) {
  const failedMessageIds: string[] = []

  for (const payload of payloads as FailedPayloadWithMetadata[]) {
    const contactInboxId = payload.context.contactInboxId
    if (!contactInboxId) {
      continue
    }

    try {
      await contactInboxService.recordSendFailure({
        contactInboxId,
        contactId: payload.context.contactId,
        error: formatSendFailureError(payload.errorData),
      })
    } catch (err) {
      const eventBusMessageId = payload[EVENT_BUS_MESSAGE_ID]
      if (!eventBusMessageId) {
        throw err
      }
      failedMessageIds.push(eventBusMessageId)
    }
  }

  if (failedMessageIds.length > 0) {
    return { failedMessageIds }
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
    {
      name: "mac-tracking",
      handler: macTrackingService.trackMessageOut.bind(macTrackingService),
    },
    {
      name: "active-hourly",
      handler:
        macTrackingService.trackMessageOutHourly.bind(macTrackingService),
    },
  ],
  [messageEventTypeSchema.enum["message:failed"]]: [
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
    {
      name: "contact-inbox-send-failure",
      handler: recordContactInboxSendFailure,
    },
  ],
  [messageEventTypeSchema.enum["message:delivered"]]: [
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
      name: "broadcast-ops",
      handler: broadcastAnalyticsService.onSeen.bind(broadcastAnalyticsService),
    },
    {
      name: "sequence-ops",
      handler: sequenceAnalyticsService.onSeen.bind(sequenceAnalyticsService),
    },
  ],
  [messageEventTypeSchema.enum["message:received"]]: [
    {
      name: "mac-tracking",
      handler: macTrackingService.trackMessageIn.bind(macTrackingService),
    },
    {
      name: "active-hourly",
      handler: macTrackingService.trackMessageInHourly.bind(macTrackingService),
    },
  ],
}
