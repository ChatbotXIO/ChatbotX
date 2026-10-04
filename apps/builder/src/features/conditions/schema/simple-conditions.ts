import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

// Simple conditions without additional fields
const createSimpleCondition = (type: TriggerEventType) =>
  z.object({
    id: zodBigintAsString()
      .optional()
      .describe(
        "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
      ),
    type: z
      .literal(type)
      .describe(
        `Condition type "${type}". Fires whenever the event happens; takes no other fields.`,
      ),
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
    id: zodBigintAsString()
      .optional()
      .describe(
        "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
      ),
    type: z.literal(type).describe(`Condition type "${type}".`),
    sourceId: z
      .string()
      .min(1, "Required")
      .describe(
        "Id of the sequence (from `sequences.list`) the contact subscribes to or leaves.",
      ),
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
