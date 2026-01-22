import { TriggerEventEmitter } from "./trigger/emitter"
import { WebhookEventEmitter } from "./webhook/emitter"

const EMITTER_REGISTRY = [TriggerEventEmitter, WebhookEventEmitter] as const

/**
 * Emit event to all registered emitters in parallel
 */
async function emitToAllEmitters(
  eventName: string,
  ...args: unknown[]
): Promise<void> {
  const promises = EMITTER_REGISTRY.map((emitter) => {
    const method = (
      emitter as unknown as Record<
        string,
        (...args: unknown[]) => Promise<void>
      >
    )[eventName]

    return method.call(emitter, ...args)
  })

  await Promise.all(promises)
}

// Contact events
export const emitContactCreated = (chatbotId: string, contactId: string) =>
  emitToAllEmitters("contactCreated", chatbotId, contactId)

// Tag events
export const emitTagApplied = (
  chatbotId: string,
  contactId: string,
  tagId: string,
) => emitToAllEmitters("tagApplied", chatbotId, contactId, tagId)

export const emitTagRemoved = (
  chatbotId: string,
  contactId: string,
  tagId: string,
) => emitToAllEmitters("tagRemoved", chatbotId, contactId, tagId)

// Custom field events
export const emitCustomFieldChanged = (
  chatbotId: string,
  contactId: string,
  customFieldId: string,
  oldValue: unknown,
  newValue: unknown,
) =>
  emitToAllEmitters(
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
) => emitToAllEmitters("conversationTransferredToHuman", chatbotId, contactId)

export const emitConversationTransferredToBot = (
  chatbotId: string,
  contactId: string,
) => emitToAllEmitters("conversationTransferredToBot", chatbotId, contactId)

export const emitContactUnsubscribed = (chatbotId: string, contactId: string) =>
  emitToAllEmitters("contactUnsubscribed", chatbotId, contactId)

export const emitConversationArchived = (
  chatbotId: string,
  contactId: string,
) => emitToAllEmitters("conversationArchived", chatbotId, contactId)

export const emitConversationFollowUp = (
  chatbotId: string,
  contactId: string,
) => emitToAllEmitters("conversationFollowUp", chatbotId, contactId)

export const emitConversationAssigned = (
  chatbotId: string,
  contactId: string,
) => emitToAllEmitters("conversationAssigned", chatbotId, contactId)

export const emitConversationUnassigned = (
  chatbotId: string,
  contactId: string,
) => emitToAllEmitters("conversationUnassigned", chatbotId, contactId)

// Sequence events
export const emitSequenceSubscribed = (
  chatbotId: string,
  contactId: string,
  sequenceId: string,
) => emitToAllEmitters("sequenceSubscribed", chatbotId, contactId, sequenceId)

export const emitSequenceUnsubscribed = (
  chatbotId: string,
  contactId: string,
  sequenceId: string,
) => emitToAllEmitters("sequenceUnsubscribed", chatbotId, contactId, sequenceId)
