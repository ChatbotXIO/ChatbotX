import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { triggerQueue } from "@chatbotx.io/worker-config"
import { BaseEventEmitter } from "../base-emitter"
import { hasActiveTriggers } from "./cache"
import { isWorkerContext } from "./context"

const SUPPORTED_EVENT_TYPES: Set<TriggerEventType> = new Set([
  triggerEventTypes.enum.tagApplied,
  triggerEventTypes.enum.tagRemoved,
  triggerEventTypes.enum.customFieldValueChanged,
  triggerEventTypes.enum.conversationTransferredToHuman,
  triggerEventTypes.enum.conversationTransferredToBot,
  triggerEventTypes.enum.newContact,
  triggerEventTypes.enum.contactUnsubscribedFormBroadcast,
  triggerEventTypes.enum.archived,
  triggerEventTypes.enum.followUp,
  triggerEventTypes.enum.conversationAssigned,
  triggerEventTypes.enum.conversationUnassigned,
  triggerEventTypes.enum.subscribedToSequence,
  triggerEventTypes.enum.unsubscribedFromSequence,
])

class TriggerEventEmitterImpl extends BaseEventEmitter {
  protected supportedEventTypes = SUPPORTED_EVENT_TYPES

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
