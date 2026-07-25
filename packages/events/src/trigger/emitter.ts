import type { TriggerEventType } from "@chatbotx.io/database/partials"
import { triggerQueue } from "@chatbotx.io/worker-config"
import { BaseEventEmitter } from "../base-emitter"
import { EMITTED_EVENT_TYPE_SET } from "../event-type-registry"
import { webhookChannelOrigin } from "../webhook/context"
import { hasActiveTriggers } from "./cache"
import { isWorkerContext } from "./context"

class TriggerEventEmitterImpl extends BaseEventEmitter {
  protected supportedEventTypes = EMITTED_EVENT_TYPE_SET

  protected async shouldEmitEvent(
    eventType: TriggerEventType,
    workspaceId: string,
    sourceId?: string,
  ): Promise<boolean> {
    if (isWorkerContext()) {
      console.log("Skipping emit from worker context to prevent loop")
      return false
    }

    return await hasActiveTriggers(workspaceId, [eventType], sourceId)
  }

  protected async emitToQueue(
    eventType: TriggerEventType,
    data: {
      workspaceId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void> {
    await triggerQueue.add(
      "evaluate-triggers",
      {
        type: "evaluateTriggers" as const,
        data: {
          workspaceId: data.workspaceId,
          contactId: data.contactId,
          eventType,
          eventData: data.metadata || {},
          timestamp: new Date(),
          channelOriginated: webhookChannelOrigin() === "channel",
        },
      },
      {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    )
  }
}

const triggerEmitter = new TriggerEventEmitterImpl()

export const TriggerEventEmitter = triggerEmitter
