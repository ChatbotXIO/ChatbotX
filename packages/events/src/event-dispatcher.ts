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
  chatbotId: bigint,
  contactId: bigint,
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
  chatbotId: bigint,
  contactId: bigint,
  tagId: bigint,
) => await emitToAllEmitters("tagApplied", chatbotId, contactId, tagId)

export const emitTagRemoved = async (
  chatbotId: bigint,
  contactId: bigint,
  tagId: bigint,
) => await emitToAllEmitters("tagRemoved", chatbotId, contactId, tagId)

// Custom field events
export const emitCustomFieldChanged = async (
  chatbotId: bigint,
  contactId: bigint,
  customFieldId: bigint,
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
  chatbotId: bigint,
  contactId: bigint,
  conversationId: bigint,
  transferredBy?: bigint,
) =>
  await emitToAllEmitters(
    "conversationTransferredToHuman",
    chatbotId,
    contactId,
    conversationId,
    transferredBy,
  )

export const emitConversationTransferredToBot = async (
  chatbotId: bigint,
  contactId: bigint,
  conversationId: bigint,
  transferredBy?: bigint,
) =>
  await emitToAllEmitters(
    "conversationTransferredToBot",
    chatbotId,
    contactId,
    conversationId,
    transferredBy,
  )

export const emitContactUnsubscribed = async (
  chatbotId: bigint,
  contactId: bigint,
) => await emitToAllEmitters("contactUnsubscribed", chatbotId, contactId)

export const emitConversationArchived = async (
  chatbotId: bigint,
  contactId: bigint,
  conversationId: bigint,
  archivedBy?: bigint,
) =>
  await emitToAllEmitters(
    "conversationArchived",
    chatbotId,
    contactId,
    conversationId,
    archivedBy,
  )

export const emitConversationFollowUp = async (
  chatbotId: bigint,
  contactId: bigint,
  conversationId: bigint,
  markedBy?: bigint,
) =>
  await emitToAllEmitters(
    "conversationFollowUp",
    chatbotId,
    contactId,
    conversationId,
    markedBy,
  )

export const emitConversationAssigned = async (
  chatbotId: bigint,
  contactId: bigint,
  conversationId: bigint,
  assignedTo: bigint,
  assignedBy?: bigint,
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
  chatbotId: bigint,
  contactId: bigint,
  conversationId: bigint,
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
  chatbotId: bigint,
  contactId: bigint,
  sequenceId: bigint,
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
  chatbotId: bigint,
  contactId: bigint,
  sequenceId: bigint,
  sequenceName: string,
) =>
  await emitToAllEmitters(
    "sequenceUnsubscribed",
    chatbotId,
    contactId,
    sequenceId,
    sequenceName,
  )
