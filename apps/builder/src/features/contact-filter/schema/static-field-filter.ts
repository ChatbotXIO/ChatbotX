import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { sampleStringSchema } from "./shared"

const VALUELESS_OPERATORS = [
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.isEmpty,
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

const PRESENCE_SET_OPERATORS = [
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
  operatorTypes.enum.isEmpty,
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

const NUMBER_OPERATORS = [
  ...BASE_OPERATORS,
  ...RANGE_OPERATORS,
  operatorTypes.enum.contains,
  operatorTypes.enum.notContains,
  operatorTypes.enum.startsWith,
  operatorTypes.enum.endsWith,
] as const satisfies readonly OperatorType[]

const DATE_OPERATORS = [
  ...BASE_OPERATORS,
  ...RANGE_OPERATORS,
] as const satisfies readonly OperatorType[]

const STATIC_OPERATOR_RULES: Record<string, readonly OperatorType[]> = {
  locale: BASE_OPERATORS,
  language: SET_OPERATORS,
  country: BASE_OPERATORS,
  continent: BASE_OPERATORS,
  gender: BASE_OPERATORS,
  source: SET_OPERATORS,
  currentChannel: SET_OPERATORS,
  inbox: SET_OPERATORS,
  tags: SET_OPERATORS,
  broadcastSent: SET_OPERATORS,
  broadcastDelivered: SET_OPERATORS,
  broadcastSeen: SET_OPERATORS,
  broadcastClicked: SET_OPERATORS,
  broadcastFailed: SET_OPERATORS,
  subscribedToDripCampaign: SET_OPERATORS,
  entryPointsLinks: SET_OPERATORS,
  conversationAssigned: SET_OPERATORS,
  contactCreatedDateMinutesAgo: NUMBER_OPERATORS,
  lastSeenMinutesAgo: NUMBER_OPERATORS,
  lastInteractionMinutesAgo: NUMBER_OPERATORS,
  consecutiveAiFailures: NUMBER_OPERATORS,
  lastUserInputType: [
    operatorTypes.enum.eq,
    operatorTypes.enum.ne,
    operatorTypes.enum.isNotEmpty,
    operatorTypes.enum.isEmpty,
  ],

  subscribedToBroadcast: BOOLEAN_OPERATORS,
  interactedInLast24h: BOOLEAN_OPERATORS,
  conversationTransferredToHuman: BOOLEAN_OPERATORS,
  followUp: BOOLEAN_OPERATORS,
  archived: BOOLEAN_OPERATORS,
  blocked: BOOLEAN_OPERATORS,
  existingContact: BOOLEAN_OPERATORS,
  unreplied: BOOLEAN_OPERATORS,
  unread: BOOLEAN_OPERATORS,
  emailWasVerified: NON_NULLABLE_BOOLEAN_OPERATORS,
  optedInForEmail: NON_NULLABLE_BOOLEAN_OPERATORS,
  fromCtwaAd: BOOLEAN_OPERATORS,

  fullName: TEXT_FREE_OPERATORS,
  lastComment: TEXT_FREE_OPERATORS,
  email: TEXT_FREE_OPERATORS,
  phone: TEXT_FREE_OPERATORS,
  hasContactInfo: PRESENCE_SET_OPERATORS,
  ctwaConversion: PRESENCE_SET_OPERATORS,
  lastUserInput: TEXT_FREE_OPERATORS,
  timezone: BASE_OPERATORS,

  contactCreatedAt: DATE_OPERATORS,
  lastSent: DATE_OPERATORS,
  lastSeen: DATE_OPERATORS,
  lastInteraction: DATE_OPERATORS,
}

const isValuelessOperator = (operator: OperatorType): boolean =>
  (VALUELESS_OPERATORS as readonly OperatorType[]).includes(operator)

const isIntervalOperator = (operator: OperatorType): boolean =>
  operator === operatorTypes.enum.isBetween ||
  operator === operatorTypes.enum.notBetween

const hasValue = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.length > 0 &&
      value.every((item) => typeof item === "string" && item)
    : typeof value === "string" && value.length > 0

export const staticFieldFilter = <T extends string>(field: T) =>
  z
    .object({
      field: z.literal(field),
      operator: operatorTypes,
      value: z
        .union([
          sampleStringSchema,
          z.array(sampleStringSchema),
          z.tuple([sampleStringSchema, sampleStringSchema]),
        ])
        .optional(),
    })
    .superRefine((condition, ctx) => {
      const enabledOperators =
        STATIC_OPERATOR_RULES[field] ?? TEXT_FREE_OPERATORS
      if (!enabledOperators.includes(condition.operator)) {
        ctx.addIssue({
          code: "custom",
          message: "Operator is not supported for this field",
          path: ["operator"],
        })
        return
      }

      if (isValuelessOperator(condition.operator)) {
        return
      }

      if (isIntervalOperator(condition.operator)) {
        if (!(Array.isArray(condition.value) && condition.value.length === 2)) {
          ctx.addIssue({
            code: "custom",
            message: "Interval operators require two values",
            path: ["value"],
          })
        }
        return
      }

      if (!hasValue(condition.value)) {
        ctx.addIssue({
          code: "custom",
          message: "Operator requires a value",
          path: ["value"],
        })
      }
    })
