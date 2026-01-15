import { TriggerCondition } from "@aha.chat/database/enums"
import { triggerQueue } from "@aha.chat/worker-config"
import { hasActiveTriggers } from "./cache"
import { isWorkerContext } from "./context"
import type { TriggerEventType } from "./types"

const SUPPORTED_EVENT_TYPES: Set<TriggerEventType> = new Set([
  TriggerCondition.tagApplied,
  TriggerCondition.tagRemoved,
  TriggerCondition.customFieldValueChanged,
  TriggerCondition.conversationTransferredToHuman,
  TriggerCondition.conversationTransferredToBot,
  TriggerCondition.newContact,
  TriggerCondition.contactUnsubscribedFormBroadcast,
  TriggerCondition.archived,
  TriggerCondition.followUp,
  TriggerCondition.conversationAssigned,
  TriggerCondition.conversationUnassigned,
  TriggerCondition.subscribedToSequence,
  TriggerCondition.unsubscribedFromSequence,
])

export async function emit(
  eventType: TriggerEventType,
  data: {
    chatbotId: string
    contactId: string
    metadata?: Record<string, unknown>
  },
) {
  const { chatbotId, contactId, metadata = {} } = data
  console.log({ chatbotId, contactId, metadata, eventType })

  if (!(chatbotId && contactId)) {
    return
  }

  if (isWorkerContext()) {
    console.log("Skipping emit from worker context to prevent loop")
    return
  }

  if (!SUPPORTED_EVENT_TYPES.has(eventType)) {
    return
  }

  const sourceId = metadata.sourceId as string | undefined
  const shouldEmit = await hasActiveTriggers(chatbotId, [eventType], sourceId)

  console.log({ shouldEmit })

  if (!shouldEmit) {
    return
  }

  await triggerQueue.add(
    "evaluate-triggers",
    {
      type: "evaluateTriggers" as const,
      data: {
        chatbotId,
        contactId,
        eventType,
        eventData: metadata,
        timestamp: new Date(),
      },
    },
    {
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}

export async function tagApplied(
  chatbotId: string,
  contactId: string,
  tagId: string,
) {
  await emit(TriggerCondition.tagApplied, {
    chatbotId,
    contactId,
    metadata: { sourceId: tagId, tagId },
  })
}

export async function tagRemoved(
  chatbotId: string,
  contactId: string,
  tagId: string,
): Promise<void> {
  await emit(TriggerCondition.tagRemoved, {
    chatbotId,
    contactId,
    metadata: { sourceId: tagId, tagId },
  })
}

export async function customFieldChanged(
  chatbotId: string,
  contactId: string,
  customFieldId: string,
  oldValue: unknown,
  newValue: unknown,
): Promise<void> {
  await emit(TriggerCondition.customFieldValueChanged, {
    chatbotId,
    contactId,
    metadata: {
      sourceId: customFieldId,
      customFieldId,
      oldValue,
      newValue,
    },
  })
}

export async function conversationTransferredToHuman(
  chatbotId: string,
  contactId: string,
): Promise<void> {
  await emit(TriggerCondition.conversationTransferredToHuman, {
    chatbotId,
    contactId,
  })
}

export async function conversationTransferredToBot(
  chatbotId: string,
  contactId: string,
): Promise<void> {
  await emit(TriggerCondition.conversationTransferredToBot, {
    chatbotId,
    contactId,
  })
}

export async function contactCreated(
  chatbotId: string,
  contactId: string,
): Promise<void> {
  await emit(TriggerCondition.newContact, {
    chatbotId,
    contactId,
  })
}

export async function contactUnsubscribed(
  chatbotId: string,
  contactId: string,
): Promise<void> {
  await emit(TriggerCondition.contactUnsubscribedFormBroadcast, {
    chatbotId,
    contactId,
  })
}

export async function conversationArchived(
  chatbotId: string,
  contactId: string,
): Promise<void> {
  await emit(TriggerCondition.archived, {
    chatbotId,
    contactId,
  })
}

export async function conversationFollowUp(
  chatbotId: string,
  contactId: string,
): Promise<void> {
  await emit(TriggerCondition.followUp, {
    chatbotId,
    contactId,
  })
}

export async function conversationAssigned(
  chatbotId: string,
  contactId: string,
): Promise<void> {
  await emit(TriggerCondition.conversationAssigned, {
    chatbotId,
    contactId,
  })
}

export async function conversationUnassigned(
  chatbotId: string,
  contactId: string,
): Promise<void> {
  await emit(TriggerCondition.conversationUnassigned, {
    chatbotId,
    contactId,
  })
}

export async function sequenceSubscribed(
  chatbotId: string,
  contactId: string,
  sequenceId: string,
): Promise<void> {
  await emit(TriggerCondition.subscribedToSequence, {
    chatbotId,
    contactId,
    metadata: { sourceId: sequenceId, sequenceId },
  })
}

export async function sequenceUnsubscribed(
  chatbotId: string,
  contactId: string,
  sequenceId: string,
): Promise<void> {
  await emit(TriggerCondition.unsubscribedFromSequence, {
    chatbotId,
    contactId,
    metadata: { sourceId: sequenceId, sequenceId },
  })
}

export const TriggerEventEmitter = {
  emit,
  tagApplied,
  tagRemoved,
  customFieldChanged,
  conversationTransferredToHuman,
  conversationTransferredToBot,
  contactCreated,
  contactUnsubscribed,
  conversationArchived,
  conversationFollowUp,
  conversationAssigned,
  conversationUnassigned,
  sequenceSubscribed,
  sequenceUnsubscribed,
}
