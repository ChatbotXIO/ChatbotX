import { Condition } from "@aha.chat/database/enums"
import { webhookQueue } from "@aha.chat/worker-config"
import { BaseEventEmitter } from "../base-emitter"
import { hasActiveWebhooks } from "./cache"
import { isWebhookContext } from "./context"
import type { WebhookEventType } from "./types"

const SUPPORTED_EVENT_TYPES: Set<WebhookEventType> = new Set([
  Condition.tagApplied,
  Condition.tagRemoved,
  Condition.customFieldValueChanged,
  Condition.conversationTransferredToHuman,
  Condition.conversationTransferredToBot,
  Condition.newContact,
  Condition.contactUnsubscribedFormBroadcast,
  Condition.archived,
  Condition.followUp,
  Condition.conversationAssigned,
  Condition.conversationUnassigned,
  Condition.subscribedToSequence,
  Condition.unsubscribedFromSequence,
])

class WebhookEventEmitterImpl extends BaseEventEmitter {
  protected supportedEventTypes = SUPPORTED_EVENT_TYPES

  protected async shouldEmitEvent(
    eventType: Condition,
    chatbotId: string,
    sourceId?: string,
  ): Promise<boolean> {
    console.log("shouldEmitWebhookEvent", {
      isWebhookContext: isWebhookContext(),
    })
    if (!isWebhookContext()) {
      return false
    }

    return await hasActiveWebhooks(chatbotId, [eventType], sourceId)
  }

  protected async emitToQueue(
    eventType: Condition,
    data: {
      chatbotId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void> {
    await webhookQueue.add(
      "evaluate-webhooks",
      {
        type: "evaluateWebhooks" as const,
        data: {
          chatbotId: data.chatbotId,
          contactId: data.contactId,
          eventType,
          eventData: data.metadata || {},
          timestamp: new Date(),
        },
      },
      {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    )
  }
}

const webhookEmitter = new WebhookEventEmitterImpl()

export const WebhookEventEmitter = webhookEmitter
