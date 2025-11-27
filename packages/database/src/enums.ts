export const BroadcastSubaction = {
  allContacts: "BS00",

  messengerList: "BSM01",
  messengerActiveContacts: "BSM02",
  messengerAccountUpdate: "BSM04",
  messengerConfirmedEventUpdate: "BSM05",
  messengerPostPurchaseUpdate: "BSM06",
} as const
export type BroadcastSubaction =
  (typeof BroadcastSubaction)[keyof typeof BroadcastSubaction]

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

export const BroadcastInboxType = {
  omnichannel: "omnichannel",
  whatsapp: "whatsapp",
  messenger: "messenger",
  webchat: "webchat",
  zalo: "zalo",
} as const
export type BroadcastInboxType =
  (typeof BroadcastInboxType)[keyof typeof BroadcastInboxType]

export const InboxStatus = {
  connected: "connected",
  disconnected: "disconnected",
} as const
export type InboxStatus = (typeof InboxStatus)[keyof typeof InboxStatus]
