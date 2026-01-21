import { TriggerEventEmitter } from "./trigger/emitter"
import { WebhookEventEmitter } from "./webhook/emitter"

const EMITTER_REGISTRY = [TriggerEventEmitter, WebhookEventEmitter] as const

/**
 * Emit event to all registered emitters in parallel
 */
async function emit<T extends unknown[]>(
  eventName: string,
  ...args: T
): Promise<void> {
  const promises = EMITTER_REGISTRY.map((emitter) => {
    const fn = emitter[eventName as keyof typeof emitter] as unknown as (
      ...args: T
    ) => Promise<void>
    return fn(...args)
  })

  await Promise.all(promises)
}

// Contact events
export const emitContactCreated = (chatbotId: string, contactId: string) =>
  emit("contactCreated", chatbotId, contactId)

// Tag events
export const emitTagApplied = (
  chatbotId: string,
  contactId: string,
  tagId: string,
) => emit("tagApplied", chatbotId, contactId, tagId)

export const emitTagRemoved = (
  chatbotId: string,
  contactId: string,
  tagId: string,
) => emit("tagRemoved", chatbotId, contactId, tagId)

// Custom field events
export const emitCustomFieldChanged = (
  chatbotId: string,
  contactId: string,
  customFieldId: string,
  oldValue: unknown,
  newValue: unknown,
) =>
  emit(
    "customFieldChanged",
    chatbotId,
    contactId,
    customFieldId,
    oldValue,
    newValue,
  )

// Conversation events
export const emitConversationTransferredToHuman = (
  chatbotId: string,
  contactId: string,
) => emit("conversationTransferredToHuman", chatbotId, contactId)

export const emitConversationTransferredToBot = (
  chatbotId: string,
  contactId: string,
) => emit("conversationTransferredToBot", chatbotId, contactId)

export const emitContactUnsubscribed = (chatbotId: string, contactId: string) =>
  emit("contactUnsubscribed", chatbotId, contactId)

export const emitConversationArchived = (
  chatbotId: string,
  contactId: string,
) => emit("conversationArchived", chatbotId, contactId)

export const emitConversationFollowUp = (
  chatbotId: string,
  contactId: string,
) => emit("conversationFollowUp", chatbotId, contactId)

export const emitConversationAssigned = (
  chatbotId: string,
  contactId: string,
) => emit("conversationAssigned", chatbotId, contactId)

export const emitConversationUnassigned = (
  chatbotId: string,
  contactId: string,
) => emit("conversationUnassigned", chatbotId, contactId)

// Sequence events
export const emitSequenceSubscribed = (
  chatbotId: string,
  contactId: string,
  sequenceId: string,
) => emit("sequenceSubscribed", chatbotId, contactId, sequenceId)

export const emitSequenceUnsubscribed = (
  chatbotId: string,
  contactId: string,
  sequenceId: string,
) => emit("sequenceUnsubscribed", chatbotId, contactId, sequenceId)
