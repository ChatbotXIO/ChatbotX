export const rootFolderId = "0"

export const BroadcastSubaction = {
  allContacts: "BS00",

  messengerList: "BSM01",
  messengerActiveContacts: "BSM02",
  messengerAccountUpdate: "BSM04",
  messengerConfirmedEventUpdate: "BSM05",
  messengerPostPurchaseUpdate: "BSM06",
  whatsappTemplateMessage: "BSW01",
  whatsappWithin24Hours: "BSW02",
} as const
export type BroadcastSubaction =
  (typeof BroadcastSubaction)[keyof typeof BroadcastSubaction]

export const ConditionField = {
  language: "language",
  fullName: "fullName",
  country: "country",
  continent: "continent",
  gender: "gender",
  subscribedToBroadcast: "subscribedToBroadcast",
  contactCreatedDate: "contactCreatedDate",
  contactCreatedDateMinutesAgo: "contactCreatedDateMinutesAgo",
  source: "source",
  conversationTransferredToHuman: "conversationTransferredToHuman",
  interactedInLast24H: "interactedInLast24H",
  archived: "archived",
  blocked: "blocked",
  existingContact: "existingContact",
  isGuestUser: "isGuestUser",
  currentChannel: "currentChannel",
  timezone: "timezone",
  tags: "tags",
  customFields: "customFields",
  phone: "phone",
  email: "email",
  executedFlow: "executedFlow",
}

export type ConditionFieldType =
  (typeof ConditionField)[keyof typeof ConditionField]

export const Operator = {
  is: "is",
  isNot: "isNot",
  hasAnyValue: "hasAnyValue",
  hasNoValue: "hasNoValue",
  greaterThan: "gt",
  lessThan: "lt",
  greaterThanOrEqualTo: "gte",
  lessThanOrEqualTo: "lte",
  contains: "contains",
  doesNotContain: "doesNotContain",
  startsWith: "startsWith",
  endsWith: "endsWith",
  interval: "interval",
  notInterval: "notInterval",
} as const
export type Operator = (typeof Operator)[keyof typeof Operator]

export const ConditionType = {
  multiSelect: "multiSelect",
  select: "select",
  text: "text",
  boolean: "boolean",
  datetime: "datetime",
  number: "number",
} as const
export type ConditionType = (typeof ConditionType)[keyof typeof ConditionType]

export const BroadcastFlowType = {
  flow: "flow",
  template: "template",
} as const
export type BroadcastFlowType =
  (typeof BroadcastFlowType)[keyof typeof BroadcastFlowType]

export const InboxStatus = {
  connected: "connected",
  disconnected: "disconnected",
} as const
export type InboxStatus = (typeof InboxStatus)[keyof typeof InboxStatus]

export const Condition = {
  tagApplied: 1,
  tagRemoved: 2,

  customFieldValueChanged: 10,
  dateTimeBasedTrigger: 11,
  conversationTransferredToHuman: 12,
  conversationTransferredToBot: 13,
  newContact: 14,
  contactUnsubscribedFormBroadcast: 15,
  archived: 16,
  followUp: 17,
  conversationAssigned: 18,
  conversationUnassigned: 19,

  incomingCall: 20,
  missedAudioCall: 21,
  callEnded: 22,

  ticketCreated: 30,
  ticketMovedToStage: 31,
  ticketValueChanged: 32,
  ticketStatusChanged: 33,
  ticketPriorityChanged: 34,

  subscribedToSequence: 40,
  unsubscribedFromSequence: 41,

  WhatsappShoppingCartSent: 50,
  userAskedAboutProduct: 51,
  cartAbandoned: 52,
  newOrder: 53,
  orderAccepted: 54,
  orderShipped: 55,
  orderConcluded: 56,
  orderCancelled: 57,
  categoryAddedToCart: 58,
  productAddedToCart: 59,
  productRemovedFromCart: 60,
  productOrdered: 61,

  contactReferredANewContact: 70,
  contactReferredExistingContact: 71,
} as const
export type Condition = (typeof Condition)[keyof typeof Condition]

export const TriggerAction = {
  startAnotherFlow: "A01",
  startExternalStep: "A02",
  addTag: "A03",
  removeTag: "A04",
  setCustomField: "A05",
  clearCustomField: "A06",
  transferConversationToHuman: "A07",
  runGoogleSheet: "A08",
  archiveConversation: "A09",
  unarchiveConversation: "A10",
  assignConversation: "A11",
  unassignConversation: "A12",
  disableBot: "A13",
  enableBot: "A14",
} as const
export type TriggerAction = (typeof TriggerAction)[keyof typeof TriggerAction]

export const DateTimeTriggerType = {
  atTheDayOf: "atTheDayOf",
  before: "before",
  after: "after",
} as const
export type DateTimeTriggerType =
  (typeof DateTimeTriggerType)[keyof typeof DateTimeTriggerType]

export const AssignerFilterType = {
  all: "all",
  unassigned: "unassigned",
} as const
export type AssignerFilterType =
  (typeof AssignerFilterType)[keyof typeof AssignerFilterType]

export const ConversationStatus = {
  noAdminReply: "noAdminReply",
  unread: "unread",
  followUp: "followUp",
  archived: "archived",
  blocked: "blocked",
} as const
export type ConversationStatus =
  (typeof ConversationStatus)[keyof typeof ConversationStatus]

export const ConversationType = {
  bot: "bot",
  human: "human",
  all: "all",
} as const
export type ConversationType =
  (typeof ConversationType)[keyof typeof ConversationType]

export const FolderType = {
  tag: "tag",
  flow: "flow",
  customField: "customField",
  automatedResponse: "automatedResponse",
  trigger: "trigger",
  webhook: "webhook",
  sequence: "sequence",
} as const
export type FolderType = (typeof FolderType)[keyof typeof FolderType]

export const CustomFieldType = {
  shortText: "shortText",
  number: "number",
  date: "date",
  datetime: "datetime",
  boolean: "boolean",
  longText: "longText",
} as const

export type CustomFieldType =
  (typeof CustomFieldType)[keyof typeof CustomFieldType]
