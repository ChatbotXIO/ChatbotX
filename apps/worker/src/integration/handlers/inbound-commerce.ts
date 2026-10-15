import { productMessageService } from "@chatbotx.io/business"
import type { ContactInboxModel, InboxModel } from "@chatbotx.io/database/types"
import {
  emitShoppingCartSent,
  emitUserAskedAboutProduct,
} from "@chatbotx.io/events"
import {
  getInboundOrder,
  getReferredProduct,
  type IncomingCommerceEvent,
  type IncomingMessage,
  type MessageInboundOrderEntity,
  messageTypes,
  type ResolvedInboundProductReference,
} from "@chatbotx.io/sdk"

type CommerceEventKind = IncomingCommerceEvent["kind"]
type IncomingCommerceEventOf<Kind extends CommerceEventKind> = Extract<
  IncomingCommerceEvent,
  { kind: Kind }
>

/** What a contact's catalog interaction means for this workspace, once resolved. */
export type ResolvedCommerceEvent =
  | {
      kind: "cartSent"
      catalogId: string
      note: string | null
      items: MessageInboundOrderEntity["items"]
    }
  | {
      kind: "productInquiry"
      catalogId: string
      product: ResolvedInboundProductReference
    }

type ResolvedCommerceEventOf<Kind extends CommerceEventKind> = Extract<
  ResolvedCommerceEvent,
  { kind: Kind }
>

type EmitContext = {
  inbox: InboxModel
  contactInbox: ContactInboxModel
  conversationId: string
  messageId: string
}

/**
 * How each kind of catalog interaction is named, resolved, stored on the
 * message and announced. Channel neutral: a channel only fills
 * `IncomingCommerceEvent`; supporting another kind is one entry here.
 */
type CommerceEventHandler<Kind extends CommerceEventKind> = {
  catalogId: (event: IncomingCommerceEventOf<Kind>) => string
  retailerIds: (event: IncomingCommerceEventOf<Kind>) => string[]
  /** `null` when a reference is missing, so nothing half-resolved is stored. */
  resolve: (
    event: IncomingCommerceEventOf<Kind>,
    referenceByRetailerId: ReadonlyMap<string, ResolvedInboundProductReference>,
  ) => ResolvedCommerceEventOf<Kind> | null
  /** Stored under its own key beside whatever the channel already keeps. */
  toContentAttributes: (
    resolved: ResolvedCommerceEventOf<Kind>,
  ) => Record<string, unknown>
  /**
   * The inverse of `toContentAttributes`: what the saved message says. An event
   * is announced from this, never from a fresh lookup, so it always matches the
   * message the inbox shows (a standby copy keeps the snapshot it was saved with).
   */
  fromContentAttributes: (
    contentAttributes: unknown,
  ) => ResolvedCommerceEventOf<Kind> | null
  emit: (
    resolved: ResolvedCommerceEventOf<Kind>,
    context: EmitContext,
  ) => Promise<void>
}

const commerceEventHandlers: {
  [Kind in CommerceEventKind]: CommerceEventHandler<Kind>
} = {
  cartSent: {
    catalogId: (event) => event.catalogId,
    retailerIds: (event) => event.items.map((item) => item.retailerId),
    resolve: (event, referenceByRetailerId) => {
      const items: MessageInboundOrderEntity["items"] = []
      for (const item of event.items) {
        const reference = referenceByRetailerId.get(item.retailerId)
        if (!reference) {
          return null
        }
        items.push({
          ...reference,
          quantity: item.quantity,
          itemPrice: item.itemPrice,
          currency: item.currency,
        })
      }
      return {
        kind: "cartSent",
        catalogId: event.catalogId,
        note: event.note,
        items,
      }
    },
    toContentAttributes: ({ note, items }) => ({
      inboundOrder: { note, items },
    }),
    fromContentAttributes: (contentAttributes) => {
      const order = getInboundOrder(contentAttributes)
      const firstItem = order?.items[0]
      return order && firstItem
        ? {
            kind: "cartSent",
            catalogId: firstItem.catalogReference.catalogId,
            note: order.note,
            items: order.items,
          }
        : null
    },
    emit: async (
      resolved,
      { inbox, contactInbox, conversationId, messageId },
    ) =>
      await emitShoppingCartSent(
        inbox.workspaceId,
        contactInbox.contactId,
        {
          channel: inbox.channel,
          conversationId,
          messageId,
          catalogId: resolved.catalogId,
          note: resolved.note,
          products: resolved.items,
        },
        contactInbox.id,
      ),
  },
  productInquiry: {
    catalogId: (event) => event.product.catalogId,
    retailerIds: (event) => [event.product.retailerId],
    resolve: (event, referenceByRetailerId) => {
      const product = referenceByRetailerId.get(event.product.retailerId)
      return product
        ? {
            kind: "productInquiry",
            catalogId: event.product.catalogId,
            product,
          }
        : null
    },
    toContentAttributes: ({ product }) => ({ referredProduct: product }),
    fromContentAttributes: (contentAttributes) => {
      const product = getReferredProduct(contentAttributes)
      return product
        ? {
            kind: "productInquiry",
            catalogId: product.catalogReference.catalogId,
            product,
          }
        : null
    },
    emit: async (
      resolved,
      { inbox, contactInbox, conversationId, messageId },
    ) =>
      await emitUserAskedAboutProduct(
        inbox.workspaceId,
        contactInbox.contactId,
        {
          channel: inbox.channel,
          conversationId,
          messageId,
          catalogId: resolved.catalogId,
          product: resolved.product,
        },
        contactInbox.id,
      ),
  },
}

const resolveCommerceEvent = async <Kind extends CommerceEventKind>(
  event: IncomingCommerceEventOf<Kind>,
  context: { workspaceId: string; channel: string },
): Promise<ResolvedCommerceEventOf<Kind> | null> => {
  const handler: CommerceEventHandler<Kind> = commerceEventHandlers[event.kind]
  const references = await productMessageService.resolveInboundProducts({
    ...context,
    catalogId: handler.catalogId(event),
    retailerIds: handler.retailerIds(event),
  })
  return handler.resolve(
    event,
    new Map(
      references.map((reference) => [
        reference.catalogReference.retailerId,
        reference,
      ]),
    ),
  )
}

/**
 * Names what a contact's catalog interaction refers to and stores it on the
 * message, before the message is saved so the inbox can show it. The lookup is
 * best effort (see `resolveInboundProducts`): without a result the message is
 * saved unchanged. Only a contact's own message is resolved, never an outgoing
 * echo.
 */
export async function enrichInboundCommerce(props: {
  commerce: IncomingCommerceEvent | null | undefined
  message: IncomingMessage | null
  workspaceId: string
  channel: string
}): Promise<IncomingMessage | null> {
  const { commerce, message, workspaceId, channel } = props
  if (!commerce || message?.messageType !== messageTypes.enum.incoming) {
    return message
  }
  const resolved = await resolveCommerceEvent(commerce, {
    workspaceId,
    channel,
  })
  if (!resolved) {
    return message
  }
  return {
    ...message,
    contentAttributes: {
      ...message.contentAttributes,
      ...toContentAttributes(resolved),
    },
  }
}

const toContentAttributes = <Kind extends CommerceEventKind>(
  resolved: ResolvedCommerceEventOf<Kind>,
): Record<string, unknown> => {
  const handler: CommerceEventHandler<Kind> =
    commerceEventHandlers[resolved.kind]
  return handler.toContentAttributes(resolved)
}

/**
 * Announces the catalog interaction a SAVED message carries to triggers and
 * webhooks. It reads the message, not the lookup that ran for this delivery:
 * when an owner delivery promotes a standby copy, the stored snapshot is the
 * one the inbox shows and the one a product-pinned condition must see. A
 * message that stored nothing for `kind` announces nothing.
 */
export async function emitStoredCommerceEvent<Kind extends CommerceEventKind>(
  kind: Kind,
  contentAttributes: unknown,
  context: EmitContext,
): Promise<void> {
  const handler: CommerceEventHandler<Kind> = commerceEventHandlers[kind]
  const resolved = handler.fromContentAttributes(contentAttributes)
  if (resolved) {
    await handler.emit(resolved, context)
  }
}
