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
