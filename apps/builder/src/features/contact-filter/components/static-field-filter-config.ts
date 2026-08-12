import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import type { ConditionOption, FieldConfig } from "./contact-filter-config"
import type { CustomFieldValueInputConfig } from "./custom-field-filter-config"

type StaticFieldValueInputKind = CustomFieldValueInputConfig["kind"] | "field"

type StaticFieldRule = {
  enabledOperators: readonly OperatorType[]
  singleInput: StaticFieldValueInputKind
  intervalInput?: StaticFieldValueInputKind
}

const STATIC_FIELD_OPERATOR_ORDER = [
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.isEmpty,
  operatorTypes.enum.gt,
  operatorTypes.enum.lt,
  operatorTypes.enum.gte,
  operatorTypes.enum.lte,
  operatorTypes.enum.contains,
  operatorTypes.enum.notContains,
  operatorTypes.enum.startsWith,
  operatorTypes.enum.endsWith,
  operatorTypes.enum.isBetween,
  operatorTypes.enum.notBetween,
] as const satisfies readonly OperatorType[]

const BASE_OPERATORS = [
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  operatorTypes.enum.isEmpty,
] as const satisfies readonly OperatorType[]

const SET_OPERATORS = [
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
  ...BASE_OPERATORS,
] as const satisfies readonly OperatorType[]

const BOOLEAN_OPERATORS = [
  operatorTypes.enum.eq,
  operatorTypes.enum.isEmpty,
] as const satisfies readonly OperatorType[]

const NON_NULLABLE_BOOLEAN_OPERATORS = [
  operatorTypes.enum.eq,
] as const satisfies readonly OperatorType[]

const TEXT_FREE_OPERATORS = [
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.isEmpty,
  operatorTypes.enum.contains,
  operatorTypes.enum.notContains,
  operatorTypes.enum.startsWith,
  operatorTypes.enum.endsWith,
] as const satisfies readonly OperatorType[]

const RANGE_OPERATORS = [
  operatorTypes.enum.gt,
  operatorTypes.enum.lt,
  operatorTypes.enum.gte,
  operatorTypes.enum.lte,
  operatorTypes.enum.isBetween,
  operatorTypes.enum.notBetween,
] as const satisfies readonly OperatorType[]

const TEXT_SEARCH_OPERATORS = [
  operatorTypes.enum.contains,
  operatorTypes.enum.notContains,
  operatorTypes.enum.startsWith,
  operatorTypes.enum.endsWith,
] as const satisfies readonly OperatorType[]

const dropdownRule = {
  enabledOperators: BASE_OPERATORS,
  singleInput: "field",
} as const satisfies StaticFieldRule

const relationSetRule = {
  enabledOperators: SET_OPERATORS,
  singleInput: "field",
} as const satisfies StaticFieldRule

const PRESENCE_SET_OPERATORS = [
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
  operatorTypes.enum.isEmpty,
] as const satisfies readonly OperatorType[]

const presenceSetRule = {
  enabledOperators: PRESENCE_SET_OPERATORS,
  singleInput: "field",
} as const satisfies StaticFieldRule

const booleanRule = {
  enabledOperators: BOOLEAN_OPERATORS,
  singleInput: "boolean",
} as const satisfies StaticFieldRule

const nonNullableBooleanRule = {
  enabledOperators: NON_NULLABLE_BOOLEAN_OPERATORS,
  singleInput: "boolean",
} as const satisfies StaticFieldRule

const textFreeRule = {
  enabledOperators: TEXT_FREE_OPERATORS,
  singleInput: "text",
} as const satisfies StaticFieldRule

const numberRule = {
  enabledOperators: [
    ...BASE_OPERATORS,
    ...RANGE_OPERATORS,
    ...TEXT_SEARCH_OPERATORS,
  ],
  singleInput: "number",
  intervalInput: "numberInterval",
} as const satisfies StaticFieldRule

const dateRule = {
  enabledOperators: [...BASE_OPERATORS, ...RANGE_OPERATORS],
  singleInput: "datetime",
  intervalInput: "datetimeInterval",
} as const satisfies StaticFieldRule

const staticFieldRules: Record<string, StaticFieldRule> = {
  locale: dropdownRule,
  language: relationSetRule,
  country: dropdownRule,
  continent: dropdownRule,
  gender: dropdownRule,
  source: relationSetRule,
  currentChannel: relationSetRule,
  inbox: relationSetRule,
  hasOpportunity: dropdownRule,
  hasOpenOpportunity: dropdownRule,
  hasWonOpportunity: dropdownRule,
  hasLostOpportunity: dropdownRule,
  appliedJobs: dropdownRule,
  tags: relationSetRule,
  completedWhatsAppFlows: dropdownRule,
  messengerList: dropdownRule,
  subscribedToDripCampaign: relationSetRule,
  conversationAssigned: relationSetRule,
  entryPointsLinks: relationSetRule,
  sentMessage: dropdownRule,
  keywordsReceived: dropdownRule,
  executedFlow: dropdownRule,
  questionnaireStarted: dropdownRule,
  questionnaireInProgress: dropdownRule,
  questionnaireFinished: dropdownRule,
  votedOnPoll: dropdownRule,
  commentedOnPost: dropdownRule,
  reactedOnPost: dropdownRule,
  broadcastSent: relationSetRule,
  broadcastDelivered: relationSetRule,
  broadcastSeen: relationSetRule,
  broadcastClicked: relationSetRule,
  broadcastFailed: relationSetRule,
  emailSent: dropdownRule,
  emailDelivered: dropdownRule,
  emailOpened: dropdownRule,
  emailClicked: dropdownRule,
  boughtItems: dropdownRule,
  shoppingCartContainsItems: dropdownRule,
  currentDayOfWeek: dropdownRule,
  currentMonth: dropdownRule,

  subscribedToBroadcast: booleanRule,
  interactedInLast24h: booleanRule,
  conversationTransferredToHuman: booleanRule,
  followUp: booleanRule,
  archived: booleanRule,
  blocked: booleanRule,
  existingContact: booleanRule,
  isGuestUser: booleanRule,
  subjectToEuRules: booleanRule,
  instagramStoryReply: booleanRule,
  followsBusinessOnInstagram: booleanRule,
  businessFollowsUserOnInstagram: booleanRule,
  verifiedAccountOnInstagram: booleanRule,
  unreplied: booleanRule,
  unread: booleanRule,
  phoneWasVerified: booleanRule,
  optedInForSms: booleanRule,
  emailWasVerified: nonNullableBooleanRule,
  optedInForEmail: nonNullableBooleanRule,
  shoppingCartIsEmpty: booleanRule,
  lastSentMessageFailed: booleanRule,
  fromCtwaAd: booleanRule,

  fullName: textFreeRule,
  lastComment: textFreeRule,
  phone: textFreeRule,
  email: textFreeRule,
  hasContactInfo: presenceSetRule,
  ctwaConversion: presenceSetRule,
  lastUserInput: textFreeRule,

  contactCreatedAt: dateRule,
  lastSent: dateRule,
  lastDelivered: dateRule,
  lastSeen: dateRule,
  lastInteraction: dateRule,
  currentDate: dateRule,
  bought: dateRule,

  contactCreatedDateMinutesAgo: numberRule,
  timezone: dropdownRule,
  followerCountOnInstagram: numberRule,
  lastSeenMinutesAgo: numberRule,
  lastInteractionMinutesAgo: numberRule,
  consecutiveAiFailures: numberRule,
  lastTotalTaggedUsers: numberRule,
  lastTotalNewTaggedUsers: numberRule,
  currentDayOfMonth: numberRule,
  totalSpent: numberRule,
  numberOfOrders: numberRule,
  shoppingCartTotal: numberRule,
  shoppingCartSubtotal: numberRule,

  executedStep: {
    enabledOperators: BASE_OPERATORS,
    singleInput: "numberInterval",
  },
  currentTime: {
    enabledOperators: [
      ...BASE_OPERATORS,
      operatorTypes.enum.isBetween,
      operatorTypes.enum.notBetween,
    ],
    singleInput: "none",
    intervalInput: "none",
  },
  isWithinWorkingHours: {
    enabledOperators: BASE_OPERATORS,
    singleInput: "field",
  },
  lastUserInputType: {
    enabledOperators: [
      operatorTypes.enum.eq,
      operatorTypes.enum.ne,
      operatorTypes.enum.isNotEmpty,
      operatorTypes.enum.isEmpty,
    ],
    singleInput: "field",
  },
}

const fallbackRule = textFreeRule

const getStaticFieldRule = (config: FieldConfig): StaticFieldRule =>
  staticFieldRules[config.name] ?? fallbackRule

const isIntervalOperator = (operator?: string): operator is OperatorType =>
  operator === operatorTypes.enum.isBetween ||
  operator === operatorTypes.enum.notBetween

const isSetOperator = (operator?: string): operator is OperatorType =>
  operator === operatorTypes.enum.in || operator === operatorTypes.enum.notIn

const isValuelessOperator = (operator?: string): operator is OperatorType =>
  operator === operatorTypes.enum.isNotEmpty ||
  operator === operatorTypes.enum.isEmpty

const getDefaultValueForInputKind = (
  kind: StaticFieldValueInputKind,
): string | string[] => {
  switch (kind) {
    case "numberInterval":
      return ["0", "0"]
    case "datetimeInterval":
      return ["", ""]
    default:
      return ""
  }
}

export const getStaticFieldConditionOptions = (
  config: FieldConfig,
  conditionOptions: ConditionOption[],
): ConditionOption[] => {
  const rule = getStaticFieldRule(config)
  const enabledOperators = new Set(rule.enabledOperators)
  const optionByOperator = new Map(
    conditionOptions.map((option) => [option.value, option]),
  )

  return STATIC_FIELD_OPERATOR_ORDER.map((operator) => {
    const option = optionByOperator.get(operator)
    return {
      value: operator,
      label: option?.label ?? operator,
      disabled: !enabledOperators.has(operator),
    }
  })
}

export const getStaticFieldValueInputConfig = (
  config: FieldConfig | undefined,
  operator: string | undefined,
): CustomFieldValueInputConfig | undefined => {
  if (!config || config.customFieldId || config.topicId) {
    return
  }
  if (isValuelessOperator(operator)) {
    return { kind: "none", defaultValue: "" }
  }

  const rule = getStaticFieldRule(config)
  const kind =
    isIntervalOperator(operator) && rule.intervalInput
      ? rule.intervalInput
      : rule.singleInput

  if (kind === "field") {
    return
  }

  return {
    kind,
    defaultValue: getDefaultValueForInputKind(kind),
  }
}

export const getDefaultStaticFieldValue = (
  config: FieldConfig | undefined,
  operator: string | undefined,
): string | string[] => {
  if (isSetOperator(operator)) {
    return []
  }

  return getStaticFieldValueInputConfig(config, operator)?.defaultValue ?? ""
}

export const staticFieldOperatorRequiresArrayValue = (
  config: FieldConfig | undefined,
  operator: string | undefined,
): boolean => {
  const input = getStaticFieldValueInputConfig(config, operator)
  return (
    isSetOperator(operator) ||
    input?.kind === "numberInterval" ||
    input?.kind === "datetimeInterval"
  )
}
