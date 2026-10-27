import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"

export const EMITTED_EVENT_TYPES = [
  triggerEventTypes.enum.tagApplied,
  triggerEventTypes.enum.tagRemoved,
  triggerEventTypes.enum.customFieldValueChanged,
  triggerEventTypes.enum.contactInfoUpdated,
  triggerEventTypes.enum.conversationTransferredToHuman,
  triggerEventTypes.enum.conversationTransferredToBot,
  triggerEventTypes.enum.newContact,
  triggerEventTypes.enum.contactUnsubscribedFormBroadcast,
  triggerEventTypes.enum.archived,
  triggerEventTypes.enum.followUp,
  triggerEventTypes.enum.conversationAssigned,
  triggerEventTypes.enum.conversationUnassigned,
  triggerEventTypes.enum.subscribedToSequence,
  triggerEventTypes.enum.unsubscribedFromSequence,
  triggerEventTypes.enum.contactReferredANewContact,
  triggerEventTypes.enum.contactReferredExistingContact,
  triggerEventTypes.enum.incomingCall,
  triggerEventTypes.enum.missedAudioCall,
  triggerEventTypes.enum.callEnded,
  triggerEventTypes.enum.callRecorded,
  triggerEventTypes.enum.callTranscribed,
  triggerEventTypes.enum.shoppingCartSent,
  triggerEventTypes.enum.userAskedAboutProduct,
  triggerEventTypes.enum.newOrder,
  triggerEventTypes.enum.orderAccepted,
  triggerEventTypes.enum.orderShipped,
  triggerEventTypes.enum.orderConcluded,
  triggerEventTypes.enum.orderCancelled,
  triggerEventTypes.enum.productOrdered,
  triggerEventTypes.enum.productAddedToCart,
  triggerEventTypes.enum.productRemovedFromCart,
  triggerEventTypes.enum.categoryAddedToCart,
  triggerEventTypes.enum.cartAbandoned,
  triggerEventTypes.enum.pipelineItemCreated,
  triggerEventTypes.enum.pipelineItemMovedToStage,
  triggerEventTypes.enum.pipelineItemValueChanged,
  triggerEventTypes.enum.pipelineItemStatusChanged,
  triggerEventTypes.enum.pipelineItemPriorityChanged,
] as const

/** An order's status events, one per status it reaches. */
export const ORDER_STATUS_EVENT_TYPES = [
  triggerEventTypes.enum.newOrder,
  triggerEventTypes.enum.orderAccepted,
  triggerEventTypes.enum.orderShipped,
  triggerEventTypes.enum.orderConcluded,
  triggerEventTypes.enum.orderCancelled,
] as const
export type OrderStatusEventType = (typeof ORDER_STATUS_EVENT_TYPES)[number]

/**
 * Store events. A web shop order, a member accepting it in the app or an
 * order placed through the API are no less the customer's order than a
 * cart sent in chat, so they reach outbound webhooks without the
 * channel-originated context other events need.
 */
export const COMMERCE_EVENT_TYPES = [
  ...ORDER_STATUS_EVENT_TYPES,
  triggerEventTypes.enum.productOrdered,
  triggerEventTypes.enum.productAddedToCart,
  triggerEventTypes.enum.productRemovedFromCart,
  triggerEventTypes.enum.categoryAddedToCart,
  triggerEventTypes.enum.cartAbandoned,
] as const

export const COMMERCE_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> = new Set(
  COMMERCE_EVENT_TYPES,
)

/**
 * Pipeline item events. A member moving a card in the app or an agent calling
 * the public API changes the item without any channel message, so they reach
 * outbound webhooks without the channel-originated context other events need.
 * `sourceId` is the pipeline id; a stage filter is applied by the evaluator.
 */
export const PIPELINE_EVENT_TYPES = [
  triggerEventTypes.enum.pipelineItemCreated,
  triggerEventTypes.enum.pipelineItemMovedToStage,
  triggerEventTypes.enum.pipelineItemValueChanged,
  triggerEventTypes.enum.pipelineItemStatusChanged,
  triggerEventTypes.enum.pipelineItemPriorityChanged,
] as const
export type PipelineEventType = (typeof PIPELINE_EVENT_TYPES)[number]

const PIPELINE_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> = new Set(
  PIPELINE_EVENT_TYPES,
)

/**
 * Whether a condition pinned to `conditionSourceId` listens to an event
 * carrying `eventSourceId`. An event without a source reaches every
 * condition. A pipeline condition left unpinned means "any pipeline", so it
 * also matches; for every other event type an unpinned condition is still
 * left to the evaluator, exactly as before.
 */
export function conditionListensToSource(input: {
  eventType: TriggerEventType
  conditionSourceId: string | null
  eventSourceId?: string
}): boolean {
  if (!input.eventSourceId) {
    return true
  }
  if (input.conditionSourceId === input.eventSourceId) {
    return true
  }
  return (
    !input.conditionSourceId && PIPELINE_EVENT_TYPE_SET.has(input.eventType)
  )
}

/** Events delivered to outbound webhooks regardless of channel context. */
export const CONTEXT_FREE_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> =
  new Set([...COMMERCE_EVENT_TYPES, ...PIPELINE_EVENT_TYPES])

/**
 * Events whose conditions are narrowed by the evaluator, not by the event's
 * `sourceId`. They carry no `sourceId` (a cart names many products, and a
 * condition without a product must match all of them), so the "is anyone
 * listening" cache admits them whenever any active condition of the type
 * exists, whatever product that condition is pinned to.
 */
export const EVALUATOR_FILTERED_EVENT_TYPES = [
  triggerEventTypes.enum.shoppingCartSent,
  triggerEventTypes.enum.userAskedAboutProduct,
  triggerEventTypes.enum.productOrdered,
  triggerEventTypes.enum.productAddedToCart,
  triggerEventTypes.enum.productRemovedFromCart,
  triggerEventTypes.enum.categoryAddedToCart,
] as const

export const SCANNER_VERIFIED_EVENT_TYPES = [
  triggerEventTypes.enum.dateTimeBasedTrigger,
] as const

export type EmittedEventType = (typeof EMITTED_EVENT_TYPES)[number]
export type ScannerVerifiedEventType =
  (typeof SCANNER_VERIFIED_EVENT_TYPES)[number]
export type MatchableEventType = EmittedEventType | ScannerVerifiedEventType

export const EMITTED_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> = new Set(
  EMITTED_EVENT_TYPES,
)

export const EVALUATOR_FILTERED_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> =
  new Set(EVALUATOR_FILTERED_EVENT_TYPES)

const MATCHABLE_EVENT_TYPE_SET: ReadonlySet<TriggerEventType> = new Set([
  ...EMITTED_EVENT_TYPES,
  ...SCANNER_VERIFIED_EVENT_TYPES,
])

export function matchableConditionTypesFor(
  eventType: TriggerEventType,
): TriggerEventType[] {
  return MATCHABLE_EVENT_TYPE_SET.has(eventType) ? [eventType] : []
}

export function isMatchableEventType(
  eventType: TriggerEventType,
): eventType is MatchableEventType {
  return MATCHABLE_EVENT_TYPE_SET.has(eventType)
}
