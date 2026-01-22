import { Condition } from "@aha.chat/database/enums"
import { triggerQueue } from "@aha.chat/worker-config"
import { BaseEventEmitter } from "../base-emitter"
import { hasActiveTriggers } from "./cache"
import { isWorkerContext } from "./context"
import type { TriggerEventType } from "./types"

const SUPPORTED_EVENT_TYPES: Set<TriggerEventType> = new Set([
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

class TriggerEventEmitterImpl extends BaseEventEmitter {
  protected supportedEventTypes = SUPPORTED_EVENT_TYPES

  protected async shouldEmitEvent(
    eventType: Condition,
    chatbotId: string,
    sourceId?: string,
  ): Promise<boolean> {
    console.log("shouldEmitTriggerEvent", {
      isWorkerContext: isWorkerContext(),
    })
    if (isWorkerContext()) {
      console.log("Skipping emit from worker context to prevent loop")
      return false
    }

    return await hasActiveTriggers(chatbotId, [eventType], sourceId)
  }

  protected async emitToQueue(
    eventType: Condition,
    data: {
      chatbotId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void> {
    await triggerQueue.add(
      "evaluate-triggers",
      {
        type: "evaluateTriggers" as const,
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

const triggerEmitter = new TriggerEventEmitterImpl()

export const TriggerEventEmitter = triggerEmitter
