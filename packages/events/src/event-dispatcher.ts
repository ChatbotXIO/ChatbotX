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
export const emitContactCreated = async (
  chatbotId: string,
  contactId: string,
  name?: string,
  phone?: string,
  email?: string,
  customFields?: Record<string, unknown>,
) =>
  await emitToAllEmitters(
    "contactCreated",
    chatbotId,
    contactId,
    name,
    phone,
    email,
    customFields,
  )

// Tag events
export const emitTagApplied = async (
  chatbotId: string,
  contactId: string,
  tagId: string,
) => await emitToAllEmitters("tagApplied", chatbotId, contactId, tagId)

export const emitTagRemoved = async (
  chatbotId: string,
  contactId: string,
  tagId: string,
) => await emitToAllEmitters("tagRemoved", chatbotId, contactId, tagId)

// Custom field events
export const emitCustomFieldChanged = async (
  chatbotId: string,
  contactId: string,
  customFieldId: string,
  customFieldName: string,
  oldValue: unknown,
  newValue: unknown,
) =>
  await emitToAllEmitters(
    "customFieldChanged",
    chatbotId,
    contactId,
    customFieldId,
    customFieldName,
    oldValue,
    newValue,
  )

// Conversation events
export const emitConversationTransferredToHuman = async (
  chatbotId: string,
  contactId: string,
  conversationId: string,
  transferredBy?: string,
) =>
  await emitToAllEmitters(
    "conversationTransferredToHuman",
    chatbotId,
    contactId,
    conversationId,
    transferredBy,
  )

export const emitConversationTransferredToBot = async (
  chatbotId: string,
  contactId: string,
  conversationId: string,
  transferredBy?: string,
) =>
  await emitToAllEmitters(
    "conversationTransferredToBot",
    chatbotId,
    contactId,
    conversationId,
    transferredBy,
  )

export const emitContactUnsubscribed = async (
  chatbotId: string,
  contactId: string,
) => await emitToAllEmitters("contactUnsubscribed", chatbotId, contactId)

export const emitConversationArchived = async (
  chatbotId: string,
  contactId: string,
  conversationId: string,
  archivedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationArchived",
    chatbotId,
    contactId,
    conversationId,
    archivedBy,
  )

export const emitConversationFollowUp = async (
  chatbotId: string,
  contactId: string,
  conversationId: string,
  markedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationFollowUp",
    chatbotId,
    contactId,
    conversationId,
    markedBy,
  )

export const emitConversationAssigned = async (
  chatbotId: string,
  contactId: string,
  conversationId: string,
  assignedTo: string,
  assignedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationAssigned",
    chatbotId,
    contactId,
    conversationId,
    assignedTo,
    assignedBy,
  )

export const emitConversationUnassigned = async (
  chatbotId: string,
  contactId: string,
  conversationId: string,
  unassignedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationUnassigned",
    chatbotId,
    contactId,
    conversationId,
    unassignedBy,
  )

// Sequence events
export const emitSequenceSubscribed = async (
  chatbotId: string,
  contactId: string,
  sequenceId: string,
  sequenceName: string,
) =>
  await emitToAllEmitters(
    "sequenceSubscribed",
    chatbotId,
    contactId,
    sequenceId,
    sequenceName,
  )

export const emitSequenceUnsubscribed = async (
  chatbotId: string,
  contactId: string,
  sequenceId: string,
  sequenceName: string,
) =>
  await emitToAllEmitters(
    "sequenceUnsubscribed",
    chatbotId,
    contactId,
    sequenceId,
    sequenceName,
  )
