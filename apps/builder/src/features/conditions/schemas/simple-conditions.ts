import { Condition } from "@aha.chat/database/enums"
import z from "zod"

// Simple conditions without additional fields
const createSimpleCondition = (type: Condition) =>
  z.object({
    id: z.string().optional(),
    type: z.literal(type),
  })

// Simple conditions
export const conversationTransferredToHuman = createSimpleCondition(
  Condition.conversationTransferredToHuman,
)
export const conversationTransferredToBot = createSimpleCondition(
  Condition.conversationTransferredToBot,
)
export const newContact = createSimpleCondition(Condition.newContact)
export const contactUnsubscribedFormBroadcast = createSimpleCondition(
  Condition.contactUnsubscribedFormBroadcast,
)
export const archived = createSimpleCondition(Condition.archived)
export const followUp = createSimpleCondition(Condition.followUp)
export const conversationAssigned = createSimpleCondition(
  Condition.conversationAssigned,
)
export const conversationUnassigned = createSimpleCondition(
  Condition.conversationUnassigned,
)
export const contactReferredANewContact = createSimpleCondition(
  Condition.contactReferredANewContact,
)
export const contactReferredExistingContact = createSimpleCondition(
  Condition.contactReferredExistingContact,
)

// Conditions with sourceId
const createConditionWithSourceId = (type: Condition) =>
  z.object({
    id: z.string().optional(),
    type: z.literal(type),
    sourceId: z.string().min(1, "Required"),
  })

export const subscribedToSequence = createConditionWithSourceId(
  Condition.subscribedToSequence,
)
export const unsubscribedFromSequence = createConditionWithSourceId(
  Condition.unsubscribedFromSequence,
)

// Default functions
export const createDefaultFn =
  <T extends Condition>(type: T) =>
  () => ({ type })

export const createDefaultFnWithSourceId =
  <T extends Condition>(type: T) =>
  () => ({ type, sourceId: "" })
