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
  workspaceId: string,
  contactId: string,
  name?: string,
  phone?: string,
  email?: string,
  customFields?: Record<string, unknown>,
) =>
  await emitToAllEmitters(
    "contactCreated",
    workspaceId,
    contactId,
    name,
    phone,
    email,
    customFields,
  )

// Tag events
export const emitTagApplied = async (
  workspaceId: string,
  contactId: string,
  tagId: string,
) => await emitToAllEmitters("tagApplied", workspaceId, contactId, tagId)

export const emitTagRemoved = async (
  workspaceId: string,
  contactId: string,
  tagId: string,
) => await emitToAllEmitters("tagRemoved", workspaceId, contactId, tagId)

// Custom field events
export const emitCustomFieldChanged = async (
  workspaceId: string,
  contactId: string,
  customFieldId: string,
  customFieldName: string,
  oldValue: unknown,
  newValue: unknown,
) =>
  await emitToAllEmitters(
    "customFieldChanged",
    workspaceId,
    contactId,
    customFieldId,
    customFieldName,
    oldValue,
    newValue,
  )

// Conversation events
export const emitConversationTransferredToHuman = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  transferredBy?: string,
) =>
  await emitToAllEmitters(
    "conversationTransferredToHuman",
    workspaceId,
    contactId,
    conversationId,
    transferredBy,
  )

export const emitConversationTransferredToBot = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  transferredBy?: string,
) =>
  await emitToAllEmitters(
    "conversationTransferredToBot",
    workspaceId,
    contactId,
    conversationId,
    transferredBy,
  )

export const emitContactUnsubscribed = async (
  workspaceId: string,
  contactId: string,
) => await emitToAllEmitters("contactUnsubscribed", workspaceId, contactId)

export const emitConversationArchived = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  archivedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationArchived",
    workspaceId,
    contactId,
    conversationId,
    archivedBy,
  )

export const emitConversationFollowUp = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  markedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationFollowUp",
    workspaceId,
    contactId,
    conversationId,
    markedBy,
  )

export const emitConversationAssigned = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  assignedTo: string,
  assignedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationAssigned",
    workspaceId,
    contactId,
    conversationId,
    assignedTo,
    assignedBy,
  )

export const emitConversationUnassigned = async (
  workspaceId: string,
  contactId: string,
  conversationId: string,
  unassignedBy?: string,
) =>
  await emitToAllEmitters(
    "conversationUnassigned",
    workspaceId,
    contactId,
    conversationId,
    unassignedBy,
  )

// Sequence events
export const emitSequenceSubscribed = async (
  workspaceId: string,
  contactId: string,
  sequenceId: string,
  sequenceName: string,
) =>
  await emitToAllEmitters(
    "sequenceSubscribed",
    workspaceId,
    contactId,
    sequenceId,
    sequenceName,
  )

export const emitSequenceUnsubscribed = async (
  workspaceId: string,
  contactId: string,
  sequenceId: string,
  sequenceName: string,
) =>
  await emitToAllEmitters(
    "sequenceUnsubscribed",
    workspaceId,
    contactId,
    sequenceId,
    sequenceName,
  )
