import {
  contactCustomFieldService,
  contactService,
  tagService,
} from "@chatbotx.io/business"
import { triggerEventTypes } from "@chatbotx.io/database/partials"
import type {
  CartAbandonedMetadata,
  CartItemEventMetadata,
  CommerceEventProduct,
  MatchableEventType,
  OrderEventMetadata,
  PipelineItemEventMetadata,
  ShoppingCartSentMetadata,
  UserAskedAboutProductMetadata,
} from "@chatbotx.io/events"
import type { ResolvedInboundProductReference } from "@chatbotx.io/sdk"
import type { MatchableWebhookEventData, WebhookPayload } from "../types"

type WebhookPayloadBase = {
  event: string
  contact_id: string
  timestamp: Date
}

type PayloadBuilder = (
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
  workspaceId: string,
) => Promise<WebhookPayload> | WebhookPayload

const EVENT_NAMES = {
  [triggerEventTypes.enum.tagApplied]: "tag_applied",
  [triggerEventTypes.enum.tagRemoved]: "tag_removed",
  [triggerEventTypes.enum.customFieldValueChanged]: "custom_field_changed",
  [triggerEventTypes.enum.contactInfoUpdated]: "contact_info_updated",
  [triggerEventTypes.enum.conversationTransferredToHuman]:
    "conversation_transferred_to_human",
  [triggerEventTypes.enum.conversationTransferredToBot]:
    "conversation_transferred_to_bot",
  [triggerEventTypes.enum.newContact]: "new_contact",
  [triggerEventTypes.enum.contactUnsubscribedFormBroadcast]:
    "contact_unsubscribed",
  [triggerEventTypes.enum.archived]: "conversation_archived",
  [triggerEventTypes.enum.followUp]: "marked_as_follow_up",
  [triggerEventTypes.enum.conversationAssigned]: "conversation_assigned",
  [triggerEventTypes.enum.conversationUnassigned]: "conversation_unassigned",
  [triggerEventTypes.enum.subscribedToSequence]: "subscribed_to_sequence",
  [triggerEventTypes.enum.unsubscribedFromSequence]:
    "unsubscribed_from_sequence",
  [triggerEventTypes.enum.contactReferredANewContact]:
    "contact_referred_a_new_contact",
  [triggerEventTypes.enum.contactReferredExistingContact]:
    "contact_referred_existing_contact",
  [triggerEventTypes.enum.dateTimeBasedTrigger]: "datetime_based_trigger",
  [triggerEventTypes.enum.incomingCall]: "incoming_call",
  [triggerEventTypes.enum.missedAudioCall]: "missed_audio_call",
  [triggerEventTypes.enum.callEnded]: "call_ended",
  [triggerEventTypes.enum.callRecorded]: "call_recorded",
  [triggerEventTypes.enum.callTranscribed]: "call_transcribed",
  [triggerEventTypes.enum.shoppingCartSent]: "shopping_cart_sent",
  [triggerEventTypes.enum.userAskedAboutProduct]: "user_asked_about_product",
  [triggerEventTypes.enum.newOrder]: "new_order",
  [triggerEventTypes.enum.orderAccepted]: "order_accepted",
  [triggerEventTypes.enum.orderShipped]: "order_shipped",
  [triggerEventTypes.enum.orderConcluded]: "order_concluded",
  [triggerEventTypes.enum.orderCancelled]: "order_cancelled",
  [triggerEventTypes.enum.productOrdered]: "product_ordered",
  [triggerEventTypes.enum.productAddedToCart]: "product_added_to_cart",
  [triggerEventTypes.enum.productRemovedFromCart]: "product_removed_from_cart",
  [triggerEventTypes.enum.categoryAddedToCart]: "category_added_to_cart",
  [triggerEventTypes.enum.cartAbandoned]: "cart_abandoned",
  [triggerEventTypes.enum.pipelineItemCreated]: "pipeline_item_created",
  [triggerEventTypes.enum.pipelineItemMovedToStage]:
    "pipeline_item_moved_to_stage",
  [triggerEventTypes.enum.pipelineItemValueChanged]:
    "pipeline_item_value_changed",
  [triggerEventTypes.enum.pipelineItemStatusChanged]:
    "pipeline_item_status_changed",
  [triggerEventTypes.enum.pipelineItemPriorityChanged]:
    "pipeline_item_priority_changed",
} satisfies Record<MatchableEventType, string>

async function buildTagPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
  workspaceId: string,
): Promise<WebhookPayload> {
  // Scoped by workspace because the tag id comes from event metadata and tag ids
  // are globally unique: an id-only lookup would resolve another tenant's tag
  // and put its name in this workspace's outbound payload.
  const tagName = await tagService.findNameByIdForWorkspace({
    workspaceId,
    id: data.tagId as string,
  })

  return {
    ...basePayload,
    tag: tagName || "",
  }
}

function buildCustomFieldPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    ...basePayload,
    custom_field: {
      name: data.customFieldName as string,
      old_value: data.oldValue,
      new_value: data.newValue,
    },
  }
}

function buildSequencePayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    ...basePayload,
    sequence_id: data.sequenceId as string,
    sequence_name: data.sequenceName as string,
  }
}

function buildReferralPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  return {
    ...basePayload,
    ref_name: data.refName as string,
    reflink_id: data.reflinkId as string,
  }
}

async function buildNewContactPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
  workspaceId: string,
): Promise<WebhookPayload> {
  const contact = await contactService.findById({
    workspaceId,
    id: basePayload.contact_id,
  })
  const customFields = contact
    ? await contactCustomFieldService.listWithDefinitions({
        contactId: contact.id,
      })
    : []

  return {
    ...basePayload,
    name: contact?.fullName || (data.name as string) || null,
    first_name: contact?.firstName || null,
    last_name: contact?.lastName || null,
    phone: contact?.phoneNumber || (data.phone as string) || null,
    email: contact?.email || (data.email as string) || null,
    custom_fields: Object.fromEntries(
      customFields.map((field) => [field.name, field.value]),
    ),
  }
}

/** A product reference as an outside consumer sees it; unresolved ones keep their retailer id. */
function toProductPayload(reference: ResolvedInboundProductReference) {
  return {
    product_id: reference.product?.productId ?? null,
    retailer_id: reference.catalogReference.retailerId,
    name: reference.product?.name ?? null,
  }
}

// Explicit fields rather than spreading `data`: the event metadata also carries
// internal ids (`contactInboxId`) that no payload exposes.
function buildCatalogEventPayload(
  basePayload: WebhookPayloadBase,
  data: ShoppingCartSentMetadata | UserAskedAboutProductMetadata,
): WebhookPayload {
  return {
    ...basePayload,
    channel: data.channel,
    conversation_id: data.conversationId,
    message_id: data.messageId,
    catalog_id: data.catalogId,
  }
}

function buildShoppingCartPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  const metadata = data as ShoppingCartSentMetadata
  return {
    ...buildCatalogEventPayload(basePayload, metadata),
    note: metadata.note,
    products: metadata.products.map((item) => ({
      ...toProductPayload(item),
      quantity: item.quantity,
      item_price: item.itemPrice,
      currency: item.currency,
    })),
  }
}

function buildProductInquiryPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  const metadata = data as UserAskedAboutProductMetadata
  return {
    ...buildCatalogEventPayload(basePayload, metadata),
    product: toProductPayload(metadata.product),
  }
}

function toCommerceProductPayload(product: CommerceEventProduct) {
  return {
    product_id: product.productId,
    variant_id: product.variantId,
    name: product.name,
    category_ids: product.categoryIds,
  }
}

// Explicit fields, like the catalog events: never `contactInboxId`.
function buildOrderPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  const order = data as OrderEventMetadata
  return {
    ...basePayload,
    order_id: order.orderId,
    order_number: order.orderNumber,
    status: order.status,
    source: order.source,
    total: order.total,
    currency: order.currency,
    discount_code: order.discountCode,
    channel: order.channel,
    conversation_id: order.conversationId,
    products: order.products.map((product) => ({
      ...toCommerceProductPayload(product),
      quantity: product.quantity,
      line_total: product.lineTotal,
    })),
  }
}

const omitUndefined = (
  record: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  )

// Explicit fields, like the order events: never `contactInboxId`, and the
// previous* keys appear only on the event that changed that attribute.
function buildPipelineItemPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  const item = data as PipelineItemEventMetadata
  return {
    ...basePayload,
    pipeline_id: item.pipelineId,
    pipeline_name: item.pipelineName,
    pipeline_reference_name: item.pipelineReferenceName,
    item_id: item.itemId,
    item_number: item.itemNumber,
    title: item.title,
    stage_id: item.stageId,
    stage_name: item.stageName,
    status: item.status,
    status_label: item.statusLabel,
    priority: item.priority,
    value: item.value,
    currency: item.currency,
    due_date: item.dueDate,
    actor_kind: item.actorKind,
    actor_user_id: item.actorUserId,
    ...omitUndefined({
      from_stage_id: item.fromStageId,
      from_stage_name:
        item.fromStageId === undefined
          ? undefined
          : (item.fromStageName ?? null),
      from_pipeline_id: item.fromPipelineId,
      previous_status: item.previousStatus,
      previous_value: item.previousValue,
      previous_priority: item.previousPriority,
    }),
  }
}

function buildCartItemPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  const event = data as CartItemEventMetadata
  return {
    ...basePayload,
    channel: event.channel,
    product: toCommerceProductPayload(event.product),
    quantity: event.quantity,
    change: event.change,
  }
}

function buildCartAbandonedPayload(
  basePayload: WebhookPayloadBase,
  data: Record<string, unknown>,
): WebhookPayload {
  const cart = data as CartAbandonedMetadata
  return {
    ...basePayload,
    channel: cart.channel,
    conversation_id: cart.conversationId,
    item_count: cart.itemCount,
    total: cart.total,
    currency: cart.currency,
    items: cart.items.map((item) => ({
      ...toCommerceProductPayload(item),
      quantity: item.quantity,
    })),
  }
}

const PAYLOAD_BUILDERS = {
  [triggerEventTypes.enum.tagApplied]: buildTagPayload,
  [triggerEventTypes.enum.tagRemoved]: buildTagPayload,
  [triggerEventTypes.enum.customFieldValueChanged]: buildCustomFieldPayload,
  [triggerEventTypes.enum.contactInfoUpdated]: (basePayload, data) => ({
    ...basePayload,
    info_type: data.infoType as string,
    old_value: (data.oldValue as string) || null,
    new_value: data.newValue as string,
  }),
  [triggerEventTypes.enum.conversationTransferredToHuman]: (
    basePayload,
    data,
  ) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    transferred_by: (data.transferredBy as string) || "bot",
  }),
  [triggerEventTypes.enum.conversationTransferredToBot]: (
    basePayload,
    data,
  ) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    transferred_by: (data.transferredBy as string) || "system",
  }),
  [triggerEventTypes.enum.newContact]: buildNewContactPayload,
  [triggerEventTypes.enum.contactUnsubscribedFormBroadcast]: (basePayload) =>
    basePayload,
  [triggerEventTypes.enum.archived]: (basePayload, data) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    archived_by: (data.archivedBy as string) || "system",
  }),
  [triggerEventTypes.enum.followUp]: (basePayload, data) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    marked_by: (data.markedBy as string) || "system",
  }),
  [triggerEventTypes.enum.conversationAssigned]: (basePayload, data) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    assigned_to: data.assignedTo as string,
    assigned_by: (data.assignedBy as string) || "system",
  }),
  [triggerEventTypes.enum.conversationUnassigned]: (basePayload, data) => ({
    ...basePayload,
    conversation_id: data.conversationId as string,
    unassigned_by: (data.unassignedBy as string) || "system",
  }),
  [triggerEventTypes.enum.subscribedToSequence]: buildSequencePayload,
  [triggerEventTypes.enum.unsubscribedFromSequence]: buildSequencePayload,
  [triggerEventTypes.enum.contactReferredANewContact]: buildReferralPayload,
  [triggerEventTypes.enum.contactReferredExistingContact]: buildReferralPayload,
  [triggerEventTypes.enum.dateTimeBasedTrigger]: (basePayload, data) => ({
    ...basePayload,
    ...data,
  }),
  // Call events pass their metadata (callId, durationSeconds, recordingUrl,
  // transcript, …) straight through — every field is server-generated.
  [triggerEventTypes.enum.incomingCall]: (basePayload, data) => ({
    ...basePayload,
    ...data,
  }),
  [triggerEventTypes.enum.missedAudioCall]: (basePayload, data) => ({
    ...basePayload,
    ...data,
  }),
  [triggerEventTypes.enum.callEnded]: (basePayload, data) => ({
    ...basePayload,
    ...data,
  }),
  [triggerEventTypes.enum.callRecorded]: (basePayload, data) => ({
    ...basePayload,
    ...data,
  }),
  [triggerEventTypes.enum.callTranscribed]: (basePayload, data) => ({
    ...basePayload,
    ...data,
  }),
  [triggerEventTypes.enum.shoppingCartSent]: buildShoppingCartPayload,
  [triggerEventTypes.enum.userAskedAboutProduct]: buildProductInquiryPayload,
  [triggerEventTypes.enum.newOrder]: buildOrderPayload,
  [triggerEventTypes.enum.orderAccepted]: buildOrderPayload,
  [triggerEventTypes.enum.orderShipped]: buildOrderPayload,
  [triggerEventTypes.enum.orderConcluded]: buildOrderPayload,
  [triggerEventTypes.enum.orderCancelled]: buildOrderPayload,
  [triggerEventTypes.enum.productOrdered]: buildOrderPayload,
  [triggerEventTypes.enum.productAddedToCart]: buildCartItemPayload,
  [triggerEventTypes.enum.productRemovedFromCart]: buildCartItemPayload,
  [triggerEventTypes.enum.categoryAddedToCart]: buildCartItemPayload,
  [triggerEventTypes.enum.cartAbandoned]: buildCartAbandonedPayload,
  [triggerEventTypes.enum.pipelineItemCreated]: buildPipelineItemPayload,
  [triggerEventTypes.enum.pipelineItemMovedToStage]: buildPipelineItemPayload,
  [triggerEventTypes.enum.pipelineItemValueChanged]: buildPipelineItemPayload,
  [triggerEventTypes.enum.pipelineItemStatusChanged]: buildPipelineItemPayload,
  [triggerEventTypes.enum.pipelineItemPriorityChanged]:
    buildPipelineItemPayload,
} satisfies Record<MatchableEventType, PayloadBuilder>

/**
 * Builds the request body for one event, independently of how many webhooks it
 * will be sent to. Payload construction lives apart from delivery on purpose:
 * it reads the database (a `new_contact` event resolves the stored contact and
 * its custom fields), so callers build once per event and reuse the result for
 * the whole fan-out instead of repeating those reads per webhook.
 */
export async function buildWebhookPayload(
  eventData: MatchableWebhookEventData,
): Promise<WebhookPayload> {
  const basePayload = {
    event: EVENT_NAMES[eventData.eventType],
    contact_id: eventData.contactId,
    timestamp: eventData.timestamp,
  }

  return await PAYLOAD_BUILDERS[eventData.eventType](
    basePayload,
    eventData.eventData,
    eventData.workspaceId,
  )
}
