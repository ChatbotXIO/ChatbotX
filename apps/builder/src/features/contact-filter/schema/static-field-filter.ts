import {
  CONTACT_ACTIVITY_FILTERS,
  isContactActivityFilterField,
  type OperatorType,
  operatorTypes,
  parseContactActivityReferences,
} from "@chatbotx.io/database/partials"
import { normalizeForMatch } from "@chatbotx.io/utils/normalize-for-match"
import { z } from "zod"
import { isChannelPostId } from "@/features/channel-posts/schema"
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

const IN_OPERATORS = [
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
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

// "Last Delivered" is a plain date plus the explicit "has a value" operator.
const DATE_PRESENCE_OPERATORS = [
  ...DATE_OPERATORS,
  operatorTypes.enum.isNotEmpty,
] as const satisfies readonly OperatorType[]

// Longest "Sent message" text a condition may compare against.
const MAX_SENT_MESSAGE_FILTER_LENGTH = 1000

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
  isWithinWorkingHours: IN_OPERATORS,
  contactCreatedDateMinutesAgo: NUMBER_OPERATORS,
  lastSeenMinutesAgo: NUMBER_OPERATORS,
  lastInteractionMinutesAgo: NUMBER_OPERATORS,
  consecutiveAiFailures: NUMBER_OPERATORS,
  followerCountOnInstagram: NUMBER_OPERATORS,
  commentedOnPost: BASE_OPERATORS,
  // Activity-backed fields: Is (any of) / Is Not (none of) / Has no value.
  executedFlow: SET_OPERATORS,
  executedStep: SET_OPERATORS,
  keywordsReceived: SET_OPERATORS,
  completedWhatsAppFlows: SET_OPERATORS,
  clickedAd: SET_OPERATORS,
  emailSent: SET_OPERATORS,
  emailDelivered: SET_OPERATORS,
  emailOpened: SET_OPERATORS,
  emailClicked: SET_OPERATORS,
  sentMessage: TEXT_FREE_OPERATORS,
  lastDelivered: DATE_PRESENCE_OPERATORS,
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
  fromGoogleAd: BOOLEAN_OPERATORS,
  followsBusinessOnInstagram: BOOLEAN_OPERATORS,
  businessFollowsUserOnInstagram: BOOLEAN_OPERATORS,
  verifiedAccountOnInstagram: BOOLEAN_OPERATORS,

  fullName: TEXT_FREE_OPERATORS,
  lastComment: TEXT_FREE_OPERATORS,
  email: TEXT_FREE_OPERATORS,
  phone: TEXT_FREE_OPERATORS,
  hasContactInfo: PRESENCE_SET_OPERATORS,
  ctwaConversion: PRESENCE_SET_OPERATORS,
  lastUserInput: TEXT_FREE_OPERATORS,
  timezone: BASE_OPERATORS,

  contactCreatedAt: DATE_OPERATORS,
  totalSpent: NUMBER_OPERATORS,
  numberOfOrders: NUMBER_OPERATORS,
  shoppingCartTotal: NUMBER_OPERATORS,
  shoppingCartSubtotal: NUMBER_OPERATORS,
  bought: DATE_OPERATORS,
  boughtItems: BASE_OPERATORS,
  shoppingCartContainsItems: BASE_OPERATORS,
  shoppingCartIsEmpty: NON_NULLABLE_BOOLEAN_OPERATORS,
  lastSent: DATE_OPERATORS,
  lastSeen: DATE_OPERATORS,
  lastInteraction: DATE_OPERATORS,
}

/**
 * The authoritative operator allow-list per field — the same map
 * `staticFieldFilter`'s `superRefine` validates against, so a caller can
 * never see an operator the schema itself would reject. Exposed for the
 * public API's filter-fields discovery endpoint
 * (`features/contacts/api/public/filter-fields.ts`).
 */
export const enabledOperatorsForStaticField = (
  field: string,
): readonly OperatorType[] =>
  STATIC_OPERATOR_RULES[field] ?? TEXT_FREE_OPERATORS

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
      field: z
        .literal(field)
        .describe(
          "Contact filter field key. Valid keys and their operators are listed by `contacts.listFilterFields`.",
        ),
      operator: operatorTypes.describe(
        "Comparison operator. Allowed operators depend on the field; see `contacts.listFilterFields` (`isEmpty`/`isNotEmpty` take no value; `isBetween`/`notBetween` take a two-item value).",
      ),
      value: z
        .union([
          sampleStringSchema,
          z.array(sampleStringSchema),
          z.tuple([sampleStringSchema, sampleStringSchema]),
        ])
        .optional()
        .describe(
          "Value to compare: a string, an array of ids/strings for `in`/`notIn`, or a two-item `[from, to]` array for `isBetween`/`notBetween`. Omit for `isEmpty`/`isNotEmpty`.",
        ),
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

      if (field === "commentedOnPost") {
        if (
          !Array.isArray(condition.value) ||
          condition.value.length === 0 ||
          condition.value.length > 100 ||
          new Set(condition.value).size !== condition.value.length ||
          !condition.value.every(isChannelPostId)
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Commented posts require one to 100 unique bigint ids",
            path: ["value"],
          })
        }
        return
      }

      if (isContactActivityFilterField(field)) {
        if (
          !parseContactActivityReferences(
            CONTACT_ACTIVITY_FILTERS[field],
            condition.value,
          )
        ) {
          ctx.addIssue({
            code: "custom",
            message: `Values must be ${CONTACT_ACTIVITY_FILTERS[field].valueFormat} ids${
              CONTACT_ACTIVITY_FILTERS[field].fixedValues.length > 0
                ? ` or ${CONTACT_ACTIVITY_FILTERS[field].fixedValues.join(", ")}`
                : ""
            } (one to 500)`,
            path: ["value"],
          })
        }
        return
      }

      if (field === "sentMessage") {
        if (
          typeof condition.value !== "string" ||
          normalizeForMatch(condition.value).trim() === "" ||
          condition.value.length > MAX_SENT_MESSAGE_FILTER_LENGTH
        ) {
          ctx.addIssue({
            code: "custom",
            message: `Sent message requires text of at most ${MAX_SENT_MESSAGE_FILTER_LENGTH} characters`,
            path: ["value"],
          })
        }
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
