import type { TriggerEventType } from "@chatbotx.io/database/partials"
import { webhookQueue } from "@chatbotx.io/worker-config"
import { BaseEventEmitter } from "../base-emitter"
import { EMITTED_EVENT_TYPE_SET } from "../event-type-registry"
import { logger } from "../logger"
import { hasActiveWebhooks } from "./cache"
import { isWebhookContext } from "./context"

class WebhookEventEmitterImpl extends BaseEventEmitter {
  protected supportedEventTypes = EMITTED_EVENT_TYPE_SET

  protected async shouldEmitEvent(
    eventType: TriggerEventType,
    workspaceId: string,
    sourceId?: string,
  ): Promise<boolean> {
    const inWebhookContext = isWebhookContext()

    if (!inWebhookContext) {
      logger.debug(
        { eventType, workspaceId, sourceId },
        "Skipping webhook event outside channel-originated context",
      )
      return false
    }

    const hasWebhooks = await hasActiveWebhooks(
      workspaceId,
      [eventType],
      sourceId,
    )
    if (!hasWebhooks) {
      logger.debug(
        { eventType, workspaceId, sourceId },
        "Skipping webhook event because no active webhooks match",
      )
    }

    return hasWebhooks
  }

  protected async emitToQueue(
    eventType: TriggerEventType,
    data: {
      workspaceId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void> {
    await webhookQueue.add(
      "evaluate-webhooks",
      {
        type: "evaluateWebhooks" as const,
        data: {
          workspaceId: data.workspaceId,
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
