import { TriggerCondition } from "@aha.chat/database/enums"
import z from "zod"

// Simple conditions without additional fields
const createSimpleCondition = (type: TriggerCondition) =>
  z.object({
    id: z.string().optional(),
    type: z.literal(type),
  })

// Simple conditions
export const conversationTransferredToHuman = createSimpleCondition(
  TriggerCondition.conversationTransferredToHuman,
)
export const conversationTransferredToBot = createSimpleCondition(
  TriggerCondition.conversationTransferredToBot,
)
export const newContact = createSimpleCondition(TriggerCondition.newContact)
export const contactUnsubscribedFormBroadcast = createSimpleCondition(
  TriggerCondition.contactUnsubscribedFormBroadcast,
)
export const archived = createSimpleCondition(TriggerCondition.archived)
export const followUp = createSimpleCondition(TriggerCondition.followUp)
export const conversationAssigned = createSimpleCondition(
  TriggerCondition.conversationAssigned,
)
export const conversationUnassigned = createSimpleCondition(
  TriggerCondition.conversationUnassigned,
)
export const contactReferredANewContact = createSimpleCondition(
  TriggerCondition.contactReferredANewContact,
)
export const contactReferredExistingContact = createSimpleCondition(
  TriggerCondition.contactReferredExistingContact,
)

// Conditions with sourceId
const createConditionWithSourceId = (type: TriggerCondition) =>
  z.object({
    id: z.string().optional(),
    type: z.literal(type),
    sourceId: z.string().min(1, "Required"),
  })

export const subscribedToSequence = createConditionWithSourceId(
  TriggerCondition.subscribedToSequence,
)
export const unsubscribedFromSequence = createConditionWithSourceId(
  TriggerCondition.unsubscribedFromSequence,
)

// Default functions
export const createDefaultFn =
  <T extends TriggerCondition>(type: T) =>
  () => ({ type })

export const createDefaultFnWithSourceId =
  <T extends TriggerCondition>(type: T) =>
  () => ({ type, sourceId: "" })
