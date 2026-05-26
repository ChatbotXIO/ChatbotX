import z from "zod"

export const triggerActions = z.enum([
  "startAnotherFlow",
  "startExternalStep",
  "addTag",
  "removeTag",
  "setCustomField",
  "clearCustomField",
  "transferConversationToHuman",
  "runGoogleSheet",
  "archiveConversation",
  "unarchiveConversation",
  "assignConversation",
  "unassignConversation",
  "disableBot",
  "enableBot",
])
export type TriggerAction = z.infer<typeof triggerActions>

export const triggerEventTypes = z.enum([
  "tagApplied",
  "tagRemoved",
  "customFieldValueChanged",
  "dateTimeBasedTrigger",
  "conversationTransferredToHuman",
  "conversationTransferredToBot",
  "newContact",
  "contactUnsubscribedFormBroadcast",
  "archived",
  "followUp",
  "conversationAssigned",
  "conversationUnassigned",
  "incomingCall",
  "missedAudioCall",
  "callEnded",
  "ticketCreated",
  "ticketMovedToStage",
  "ticketValueChanged",
  "ticketStatusChanged",
  "ticketPriorityChanged",
  "subscribedToSequence",
  "unsubscribedFromSequence",
  "WhatsappShoppingCartSent",
  "userAskedAboutProduct",
  "cartAbandoned",
  "newOrder",
  "orderAccepted",
  "orderShipped",
  "orderConcluded",
  "orderCancelled",
  "categoryAddedToCart",
  "productAddedToCart",
  "productRemovedFromCart",
  "productOrdered",
  "contactReferredANewContact",
  "contactReferredExistingContact",
  "lifecycleStageChanged",
  "conversationOpened",
  "conversationClosed",
  "shortcut",
])
export type TriggerEventType = z.infer<typeof triggerEventTypes>

/**
 * Subset dos triggerEventTypes que podem ser usados como **TriggerNode** no
 * flow builder — replica o comportamento "Trigger como primeiro node" do
 * Respond.io. Pedro pediu apenas 6 tipos pra começar.
 */
export const flowTriggerNodeTypes = z.enum([
  "conversationOpened",
  "conversationClosed",
  "contactFieldUpdated",
  "contactTagUpdated",
  "shortcut",
  "lifecycleStageChanged",
])
export type FlowTriggerNodeType = z.infer<typeof flowTriggerNodeTypes>
