import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

// Simple conditions without additional fields
const createSimpleCondition = (type: TriggerEventType) =>
  z.object({
    id: zodBigintAsString().optional(),
    type: z.literal(type),
  })

// Simple conditions
export const conversationTransferredToHuman = createSimpleCondition(
  triggerEventTypes.enum.conversationTransferredToHuman,
)
export const conversationTransferredToBot = createSimpleCondition(
  triggerEventTypes.enum.conversationTransferredToBot,
)
export const newContact = createSimpleCondition(
  triggerEventTypes.enum.newContact,
)
export const contactUnsubscribedFormBroadcast = createSimpleCondition(
  triggerEventTypes.enum.contactUnsubscribedFormBroadcast,
)
export const archived = createSimpleCondition(triggerEventTypes.enum.archived)
export const followUp = createSimpleCondition(triggerEventTypes.enum.followUp)
export const conversationAssigned = createSimpleCondition(
  triggerEventTypes.enum.conversationAssigned,
)
export const conversationUnassigned = createSimpleCondition(
  triggerEventTypes.enum.conversationUnassigned,
)
export const contactReferredANewContact = createSimpleCondition(
  triggerEventTypes.enum.contactReferredANewContact,
)
export const contactReferredExistingContact = createSimpleCondition(
  triggerEventTypes.enum.contactReferredExistingContact,
)

// Conditions with sourceId
const createConditionWithSourceId = (type: TriggerEventType) =>
  z.object({
    id: zodBigintAsString().optional(),
    type: z.literal(type),
    sourceId: z.string().min(1, "Required"),
  })

export const subscribedToSequence = createConditionWithSourceId(
  triggerEventTypes.enum.subscribedToSequence,
)
export const unsubscribedFromSequence = createConditionWithSourceId(
  triggerEventTypes.enum.unsubscribedFromSequence,
)

// Default functions
export const createDefaultFn =
  <T extends TriggerEventType>(type: T) =>
  () => ({ type })

export const createDefaultFnWithSourceId =
  <T extends TriggerEventType>(type: T) =>
  () => ({ type, sourceId: "" })
