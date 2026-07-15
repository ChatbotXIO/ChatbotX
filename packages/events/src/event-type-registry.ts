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
