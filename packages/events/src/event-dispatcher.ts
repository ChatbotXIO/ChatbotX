import type { ContactInfoType } from "@chatbotx.io/database/partials"
import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type {
  BaseEventEmitter,
  CallEndedMetadata,
  CallRecordedMetadata,
  CallTranscribedMetadata,
  CartAbandonedMetadata,
  CartItemEventMetadata,
  IncomingCallMetadata,
  OrderEventMetadata,
  ShoppingCartSentMetadata,
  UserAskedAboutProductMetadata,
} from "./base-emitter"
import type { DecisionFlowOrigin } from "./decision-flow-lineage"
import type { OrderStatusEventType } from "./event-type-registry"
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
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "contactCreated",
    workspaceId,
    contactId,
    name,
    phone,
    email,
    contactInboxId,
  )

export const emitContactReferredANewContact = async (
  workspaceId: string,
  contactId: string,
  refName?: string,
  reflinkId?: string,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "contactReferredANewContact",
    workspaceId,
    contactId,
    refName,
    reflinkId,
    contactInboxId,
  )

export const emitContactReferredExistingContact = async (
  workspaceId: string,
  contactId: string,
  refName?: string,
  reflinkId?: string,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "contactReferredExistingContact",
    workspaceId,
    contactId,
    refName,
    reflinkId,
    contactInboxId,
  )

// Tag events
export const emitTagApplied = async (
  workspaceId: string,
  contactId: string,
  tagId: string,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "tagApplied",
    workspaceId,
    contactId,
    tagId,
    contactInboxId,
  )

export const emitTagRemoved = async (
  workspaceId: string,
  contactId: string,
  tagId: string,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "tagRemoved",
    workspaceId,
    contactId,
    tagId,
    contactInboxId,
  )

// Custom field events
export const emitCustomFieldChanged = async (
  workspaceId: string,
  contactId: string,
  customFieldId: string,
  customFieldName: string,
  oldValue: unknown,
  newValue: unknown,
  contactInboxId?: string,
  decisionFlowOrigin?: DecisionFlowOrigin,
) =>
  await emitToAllEmitters(
    "customFieldChanged",
    workspaceId,
    contactId,
    customFieldId,
    customFieldName,
    oldValue,
    newValue,
    contactInboxId,
    decisionFlowOrigin,
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
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "contactUnsubscribed",
    workspaceId,
    contactId,
    contactInboxId,
  )

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

// Voice-call events (channel-neutral — `metadata.callId` is the provider id)
export const emitIncomingCall = async (
  workspaceId: string,
  contactId: string,
  metadata: IncomingCallMetadata,
) => await emitToAllEmitters("incomingCall", workspaceId, contactId, metadata)

export const emitMissedAudioCall = async (
  workspaceId: string,
  contactId: string,
  metadata: IncomingCallMetadata,
) =>
  await emitToAllEmitters("missedAudioCall", workspaceId, contactId, metadata)

export const emitCallEnded = async (
  workspaceId: string,
  contactId: string,
  metadata: CallEndedMetadata,
) => await emitToAllEmitters("callEnded", workspaceId, contactId, metadata)

export const emitCallRecorded = async (
  workspaceId: string,
  contactId: string,
  metadata: CallRecordedMetadata,
) => await emitToAllEmitters("callRecorded", workspaceId, contactId, metadata)

export const emitCallTranscribed = async (
  workspaceId: string,
  contactId: string,
  metadata: CallTranscribedMetadata,
) =>
  await emitToAllEmitters("callTranscribed", workspaceId, contactId, metadata)

// Catalog events (channel-neutral — `metadata.channel` names the source)
export const emitShoppingCartSent = async (
  workspaceId: string,
  contactId: string,
  metadata: ShoppingCartSentMetadata,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "shoppingCartSent",
    workspaceId,
    contactId,
    metadata,
    contactInboxId,
  )

export const emitUserAskedAboutProduct = async (
  workspaceId: string,
  contactId: string,
  metadata: UserAskedAboutProductMetadata,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "userAskedAboutProduct",
    workspaceId,
    contactId,
    metadata,
    contactInboxId,
  )

// Store events
/** One of an order's status events (`newOrder` when it is placed). */
export const emitOrderStatus = async (
  eventType: OrderStatusEventType,
  workspaceId: string,
  contactId: string,
  metadata: OrderEventMetadata,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "orderStatus",
    eventType,
    workspaceId,
    contactId,
    metadata,
    contactInboxId,
  )

/** Once per placed order; a product condition matches any of its products. */
export const emitProductOrdered = async (
  workspaceId: string,
  contactId: string,
  metadata: OrderEventMetadata,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "productOrdered",
    workspaceId,
    contactId,
    metadata,
    contactInboxId,
  )

/**
 * A cart change: `productAddedToCart` (with `categoryAddedToCart` when the
 * product has a category) or `productRemovedFromCart`.
 */
export const emitCartItemChanged = async (
  workspaceId: string,
  contactId: string,
  metadata: CartItemEventMetadata,
  contactInboxId?: string,
) => {
  if (metadata.change < 0) {
    await emitToAllEmitters(
      "cartItemChanged",
      triggerEventTypes.enum.productRemovedFromCart,
      workspaceId,
      contactId,
      metadata,
      contactInboxId,
    )
    return
  }
  await emitToAllEmitters(
    "cartItemChanged",
    triggerEventTypes.enum.productAddedToCart,
    workspaceId,
    contactId,
    metadata,
    contactInboxId,
  )
  if (metadata.product.categoryIds.length > 0) {
    await emitToAllEmitters(
      "cartItemChanged",
      triggerEventTypes.enum.categoryAddedToCart,
      workspaceId,
      contactId,
      metadata,
      contactInboxId,
    )
  }
}

export const emitCartAbandoned = async (
  workspaceId: string,
  contactId: string,
  metadata: CartAbandonedMetadata,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "cartAbandoned",
    workspaceId,
    contactId,
    metadata,
    contactInboxId,
  )

// Sequence events
export const emitSequenceSubscribed = async (
  workspaceId: string,
  contactId: string,
  sequenceId: string,
  sequenceName: string,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "sequenceSubscribed",
    workspaceId,
    contactId,
    sequenceId,
    sequenceName,
    contactInboxId,
  )

export const emitSequenceUnsubscribed = async (
  workspaceId: string,
  contactId: string,
  sequenceId: string,
  sequenceName: string,
  contactInboxId?: string,
) =>
  await emitToAllEmitters(
    "sequenceUnsubscribed",
    workspaceId,
    contactId,
    sequenceId,
    sequenceName,
    contactInboxId,
  )
