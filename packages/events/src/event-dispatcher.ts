import type { ContactInfoType } from "@chatbotx.io/database/partials"
import type { BaseEventEmitter } from "./base-emitter"
import { logger } from "./logger"
import { TriggerEventEmitter } from "./trigger/emitter"
import { WebhookEventEmitter } from "./webhook/emitter"

const EMITTER_REGISTRY = [TriggerEventEmitter, WebhookEventEmitter] as const

type EmitterEventMethod = {
  [K in keyof BaseEventEmitter]: K extends "emit"
    ? never
    : BaseEventEmitter[K] extends (...args: infer _Args) => Promise<void>
      ? K
      : never
}[keyof BaseEventEmitter]

type EmitterEventArgs<M extends EmitterEventMethod> =
  BaseEventEmitter[M] extends (...args: infer Args) => Promise<void>
    ? Args
    : never

async function emitToAllEmitters<M extends EmitterEventMethod>(
  eventName: M,
  ...args: EmitterEventArgs<M>
): Promise<void> {
  const results = await Promise.allSettled(
    EMITTER_REGISTRY.map((emitter) => {
      const method = emitter[eventName] as unknown as (
        ...methodArgs: EmitterEventArgs<M>
      ) => Promise<void>
      return method.call(emitter, ...args)
    }),
  )

  for (const result of results) {
    if (result.status === "rejected") {
      logger.error({ err: result.reason }, `Failed to emit event: ${eventName}`)
    }
  }
}

// Contact events
export const emitContactCreated = async (
  workspaceId: string,
  contactId: string,
  name?: string,
  phone?: string,
  email?: string,
) =>
  await emitToAllEmitters(
    "contactCreated",
    workspaceId,
    contactId,
    name,
    phone,
    email,
  )

export const emitContactReferredANewContact = async (
  workspaceId: string,
  contactId: string,
  refName?: string,
  reflinkId?: string,
) =>
  await emitToAllEmitters(
    "contactReferredANewContact",
    workspaceId,
    contactId,
    refName,
    reflinkId,
  )

export const emitContactReferredExistingContact = async (
  workspaceId: string,
  contactId: string,
  refName?: string,
  reflinkId?: string,
) =>
  await emitToAllEmitters(
    "contactReferredExistingContact",
    workspaceId,
    contactId,
    refName,
    reflinkId,
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

// Contact info events
export const emitContactInfoUpdated = async (
  workspaceId: string,
  contactId: string,
  infoType: ContactInfoType,
  oldValue: string | null,
  newValue: string,
) =>
  await emitToAllEmitters(
    "contactInfoUpdated",
    workspaceId,
    contactId,
    infoType,
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
