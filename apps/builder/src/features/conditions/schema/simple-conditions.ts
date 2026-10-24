import {
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString, zodBigintIdAsString } from "@chatbotx.io/utils"
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

// The five WhatsApp call conditions: the call happening is the whole condition.
export const incomingCall = createSimpleCondition(
  triggerEventTypes.enum.incomingCall,
)
export const missedAudioCall = createSimpleCondition(
  triggerEventTypes.enum.missedAudioCall,
)
export const callEnded = createSimpleCondition(triggerEventTypes.enum.callEnded)
export const callRecorded = createSimpleCondition(
  triggerEventTypes.enum.callRecorded,
)
export const callTranscribed = createSimpleCondition(
  triggerEventTypes.enum.callTranscribed,
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

// Catalog conditions: a product narrows the event, but is optional. "Any
// product" is one representation — `null` — however the caller spells it (an
// omitted field, `null`, or the empty value a cleared picker produces).
const createConditionWithOptionalProduct = (type: TriggerEventType) =>
  z.object({
    id: zodBigintAsString()
      .optional()
      .describe(
        "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
      ),
    type: z
      .literal(type)
      .describe(
        `Condition type "${type}". Fires for any product unless \`sourceId\` is set.`,
      ),
    sourceId: z
      .union([zodBigintIdAsString(), z.literal("")])
      .nullish()
      .transform((productId) => productId || null)
      .describe(
        "Product id (numeric string, from `products.list`) the event must refer to. Omit or null to match any product.",
      ),
  })

export const shoppingCartSent = createConditionWithOptionalProduct(
  triggerEventTypes.enum.shoppingCartSent,
)
export const userAskedAboutProduct = createConditionWithOptionalProduct(
  triggerEventTypes.enum.userAskedAboutProduct,
)
// Store events. A placed order names all its products, a cart change one.
export const productOrdered = createConditionWithOptionalProduct(
  triggerEventTypes.enum.productOrdered,
)
export const productAddedToCart = createConditionWithOptionalProduct(
  triggerEventTypes.enum.productAddedToCart,
)
export const productRemovedFromCart = createConditionWithOptionalProduct(
  triggerEventTypes.enum.productRemovedFromCart,
)

/** A web shop cart got a product of a category (or of its sub-categories). */
export const categoryAddedToCart = z.object({
  id: zodBigintAsString()
    .optional()
    .describe(
      "Existing condition id (numeric string) when keeping a condition returned by `triggers.get`; omit for a new condition.",
    ),
  type: z
    .literal(triggerEventTypes.enum.categoryAddedToCart)
    .describe(
      `Condition type "${triggerEventTypes.enum.categoryAddedToCart}". Fires for any category unless \`sourceId\` is set.`,
    ),
  sourceId: z
    .union([zodBigintIdAsString(), z.literal("")])
    .nullish()
    .transform((categoryId) => categoryId || null)
    .describe(
      "Category id (numeric string, from `productCategories.list`); a product of the category or of one of its sub-categories matches. Omit or null to match any category.",
    ),
})

// Order status events and the abandoned cart: the event is the condition.
export const newOrder = createSimpleCondition(triggerEventTypes.enum.newOrder)
export const orderAccepted = createSimpleCondition(
  triggerEventTypes.enum.orderAccepted,
)
export const orderShipped = createSimpleCondition(
  triggerEventTypes.enum.orderShipped,
)
export const orderConcluded = createSimpleCondition(
  triggerEventTypes.enum.orderConcluded,
)
export const orderCancelled = createSimpleCondition(
  triggerEventTypes.enum.orderCancelled,
)
export const cartAbandoned = createSimpleCondition(
  triggerEventTypes.enum.cartAbandoned,
)

// Default functions
export const createDefaultFn =
  <T extends TriggerEventType>(type: T) =>
  () => ({ type })

export const createDefaultFnWithSourceId =
  <T extends TriggerEventType>(type: T) =>
  () => ({ type, sourceId: "" })

export const createDefaultFnWithOptionalSourceId =
  <T extends TriggerEventType>(type: T) =>
  () => ({ type, sourceId: null })
