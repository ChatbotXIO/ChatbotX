import {
  type ContactInfoType,
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import type {
  MessageInboundOrderEntity,
  ResolvedInboundProductReference,
} from "@chatbotx.io/sdk"
import { withContactInboxMetadata } from "./contact-inbox-context"
import type { DecisionFlowOrigin } from "./decision-flow-lineage"
import type { OrderStatusEventType } from "./event-type-registry"

/** Channel-neutral voice-call event metadata carried to triggers/webhooks. */
export type CallEventMetadata = { callId: string }
export type IncomingCallMetadata = CallEventMetadata & {
  conversationId?: string
}
export type CallEndedMetadata = CallEventMetadata & {
  durationSeconds?: number
}
export type CallRecordedMetadata = CallEventMetadata & {
  recordingUrl?: string
}
export type CallTranscribedMetadata = CallEventMetadata & {
  transcript?: string
}

/**
 * Channel-neutral metadata of a contact's catalog interaction. There is
 * deliberately no `sourceId`: a condition may pin a product, but a cart names
 * many, so the product filter is applied by the condition evaluator.
 */
type InboundCommerceEventMetadata = {
  channel: string
  conversationId: string
  messageId: string
  catalogId: string
}
export type ShoppingCartSentMetadata = InboundCommerceEventMetadata & {
  note: string | null
  products: MessageInboundOrderEntity["items"]
}
export type UserAskedAboutProductMetadata = InboundCommerceEventMetadata & {
  product: ResolvedInboundProductReference
}

/** A product as an order or cart event names it. */
export type CommerceEventProduct = {
  productId: string | null
  variantId: string | null
  name: string
  /** The product's category and sub-category, for category conditions. */
  categoryIds: string[]
}

/**
 * An order event. There is no `sourceId`: `productOrdered` names every
 * product of the order and its product filter is applied by the evaluator.
 */
export type OrderEventMetadata = {
  orderId: string
  orderNumber: number
  status: string
  source: string
  total: number
  currency: string
  discountCode: string | null
  channel: string | null
  conversationId: string | null
  products: Array<
    CommerceEventProduct & { quantity: number; lineTotal: number }
  >
}

/** A product added to or taken out of the web shop cart. */
export type CartItemEventMetadata = {
  channel: string | null
  product: CommerceEventProduct
  /** The product's quantity in the cart after the change. */
  quantity: number
  /** How many were added (positive) or taken out (negative). */
  change: number
}

/** A cart left without checking out for the store's reminder delay. */
export type CartAbandonedMetadata = {
  channel: string | null
  conversationId: string | null
  itemCount: number
  total: number
  currency: string
  items: Array<CommerceEventProduct & { quantity: number }>
}

/**
 * Base event emitter class with common functionality
 */
export abstract class BaseEventEmitter {
  protected abstract supportedEventTypes: ReadonlySet<TriggerEventType>
  protected abstract shouldEmitEvent(
    eventType: TriggerEventType,
    workspaceId: string,
    sourceId?: string,
  ): Promise<boolean>

  protected abstract emitToQueue(
    eventType: TriggerEventType,
    data: {
      workspaceId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void>

  async emit(
    eventType: TriggerEventType,
    data: {
      workspaceId: string
      contactId: string
      metadata?: Record<string, unknown>
    },
  ): Promise<void> {
    const { workspaceId, contactId, metadata = {} } = data

    if (!(workspaceId && contactId)) {
      return
    }

    if (!this.supportedEventTypes.has(eventType)) {
      return
    }

    const sourceId = metadata.sourceId as string | undefined
    const shouldEmit = await this.shouldEmitEvent(
      eventType,
      workspaceId,
      sourceId,
    )

    if (!shouldEmit) {
      return
    }

    await this.emitToQueue(eventType, data)
  }

  async tagApplied(
    workspaceId: string,
    contactId: string,
    tagId: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.tagApplied, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { sourceId: tagId, tagId },
        contactInboxId,
      ),
    })
  }

  async tagRemoved(
    workspaceId: string,
    contactId: string,
    tagId: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.tagRemoved, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { sourceId: tagId, tagId },
        contactInboxId,
      ),
    })
  }

  async customFieldChanged(
    workspaceId: string,
    contactId: string,
    customFieldId: string,
    customFieldName: string,
    oldValue: unknown,
    newValue: unknown,
    contactInboxId?: string,
    decisionFlowOrigin?: DecisionFlowOrigin,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.customFieldValueChanged, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        {
          sourceId: customFieldId,
          customFieldId,
          customFieldName,
          oldValue,
          newValue,
          ...(decisionFlowOrigin ? { decisionFlowOrigin } : {}),
        },
        contactInboxId,
      ),
    })
  }

  async contactInfoUpdated(
    workspaceId: string,
    contactId: string,
    infoType: ContactInfoType,
    oldValue: string | null,
    newValue: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactInfoUpdated, {
      workspaceId,
      contactId,
      metadata: { sourceId: infoType, infoType, oldValue, newValue },
    })
  }

  async conversationTransferredToHuman(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    transferredBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationTransferredToHuman, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        transferredBy,
      },
    })
  }

  async conversationTransferredToBot(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    transferredBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationTransferredToBot, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        transferredBy,
      },
    })
  }

  async contactCreated(
    workspaceId: string,
    contactId: string,
    name?: string,
    phone?: string,
    email?: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.newContact, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { name, phone, email },
        contactInboxId,
      ),
    })
  }

  async contactReferredANewContact(
    workspaceId: string,
    contactId: string,
    refName?: string,
    reflinkId?: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactReferredANewContact, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { refName, reflinkId },
        contactInboxId,
      ),
    })
  }

  async contactReferredExistingContact(
    workspaceId: string,
    contactId: string,
    refName?: string,
    reflinkId?: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactReferredExistingContact, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { refName, reflinkId },
        contactInboxId,
      ),
    })
  }

  async contactUnsubscribed(
    workspaceId: string,
    contactId: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.contactUnsubscribedFormBroadcast, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(undefined, contactInboxId),
    })
  }

  async conversationArchived(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    archivedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.archived, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        archivedBy,
      },
    })
  }

  async conversationFollowUp(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    markedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.followUp, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        markedBy,
      },
    })
  }

  async conversationAssigned(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    assignedTo: string,
    assignedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationAssigned, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        assignedTo,
        assignedBy,
      },
    })
  }

  async conversationUnassigned(
    workspaceId: string,
    contactId: string,
    conversationId: string,
    unassignedBy?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.conversationUnassigned, {
      workspaceId,
      contactId,
      metadata: {
        conversationId,
        unassignedBy,
      },
    })
  }

  // Voice-call events (channel-neutral: `metadata.callId` is the provider's
  // call id — a WhatsApp WACID today). Recording/transcript events also carry
  // the public recording URL / transcript text for webhook consumers.
  async incomingCall(
    workspaceId: string,
    contactId: string,
    metadata: IncomingCallMetadata,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.incomingCall, {
      workspaceId,
      contactId,
      metadata,
    })
  }

  async missedAudioCall(
    workspaceId: string,
    contactId: string,
    metadata: IncomingCallMetadata,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.missedAudioCall, {
      workspaceId,
      contactId,
      metadata,
    })
  }

  async callEnded(
    workspaceId: string,
    contactId: string,
    metadata: CallEndedMetadata,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.callEnded, {
      workspaceId,
      contactId,
      metadata,
    })
  }

  async callRecorded(
    workspaceId: string,
    contactId: string,
    metadata: CallRecordedMetadata,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.callRecorded, {
      workspaceId,
      contactId,
      metadata,
    })
  }

  async callTranscribed(
    workspaceId: string,
    contactId: string,
    metadata: CallTranscribedMetadata,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.callTranscribed, {
      workspaceId,
      contactId,
      metadata,
    })
  }

  async shoppingCartSent(
    workspaceId: string,
    contactId: string,
    metadata: ShoppingCartSentMetadata,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.shoppingCartSent, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(metadata, contactInboxId),
    })
  }

  async orderStatus(
    eventType: OrderStatusEventType,
    workspaceId: string,
    contactId: string,
    metadata: OrderEventMetadata,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(eventType, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(metadata, contactInboxId),
    })
  }

  async productOrdered(
    workspaceId: string,
    contactId: string,
    metadata: OrderEventMetadata,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.productOrdered, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(metadata, contactInboxId),
    })
  }

  async cartItemChanged(
    eventType:
      | typeof triggerEventTypes.enum.productAddedToCart
      | typeof triggerEventTypes.enum.productRemovedFromCart
      | typeof triggerEventTypes.enum.categoryAddedToCart,
    workspaceId: string,
    contactId: string,
    metadata: CartItemEventMetadata,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(eventType, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(metadata, contactInboxId),
    })
  }

  async cartAbandoned(
    workspaceId: string,
    contactId: string,
    metadata: CartAbandonedMetadata,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.cartAbandoned, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(metadata, contactInboxId),
    })
  }

  async userAskedAboutProduct(
    workspaceId: string,
    contactId: string,
    metadata: UserAskedAboutProductMetadata,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.userAskedAboutProduct, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(metadata, contactInboxId),
    })
  }

  async sequenceSubscribed(
    workspaceId: string,
    contactId: string,
    sequenceId: string,
    sequenceName: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.subscribedToSequence, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { sourceId: sequenceId, sequenceId, sequenceName },
        contactInboxId,
      ),
    })
  }

  async sequenceUnsubscribed(
    workspaceId: string,
    contactId: string,
    sequenceId: string,
    sequenceName: string,
    contactInboxId?: string,
  ): Promise<void> {
    await this.emit(triggerEventTypes.enum.unsubscribedFromSequence, {
      workspaceId,
      contactId,
      metadata: withContactInboxMetadata(
        { sourceId: sequenceId, sequenceId, sequenceName },
        contactInboxId,
      ),
    })
  }
}
