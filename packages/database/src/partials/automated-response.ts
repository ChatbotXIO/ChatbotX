import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { type FolderType, folderTypes } from "./folder"

export const automatedResponseTypes = z.enum(["inbound", "outbound"])
export type AutomatedResponseType = z.infer<typeof automatedResponseTypes>

// Contact (inbound) and Page (outbound) keyword rules never share a folder
// namespace — each direction gets its own FolderType even though both
// still resolve to the same AutomatedResponse table.
export const automatedResponseFolderTypeByType: Record<
  AutomatedResponseType,
  FolderType
> = {
  inbound: folderTypes.enum.automatedResponse,
  outbound: folderTypes.enum.outboundAutomatedResponse,
}

// Reverse of the map above — used to re-derive the expected `type` when a
// FolderType alone is known (e.g. moving AutomatedResponse rows between
// folders), so a move can never smuggle an inbound rule into an outbound
// folder or vice versa.
export const automatedResponseTypeByFolderType: Partial<
  Record<FolderType, AutomatedResponseType>
> = {
  [folderTypes.enum.automatedResponse]: "inbound",
  [folderTypes.enum.outboundAutomatedResponse]: "outbound",
}

export const replyTypes = z.enum(["text", "flow"])
export type ReplyType = z.infer<typeof replyTypes>

export const replyMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal(replyTypes.enum.text),
    text: z.string(),
  }),
  z.object({
    type: z.literal(replyTypes.enum.flow),
    flowId: zodBigintAsString(),
  }),
])

// ManyChat-style message conditions for Contact (inbound) keyword rules.
// Conditions are ANDed; the values inside one condition are ORed, except
// `notContains`, which requires the message to contain none of them.
export const keywordConditionOperators = z.enum([
  "is",
  "similarTo",
  "contains",
  "containsPhone",
  "containsEmail",
  "containsImage",
  "containsVideo",
  "containsLink",
  "containsWholeWord",
  "beginsWith",
  "endsWith",
  "isThumbsUp",
  "notContains",
  "matchesRegex",
])
export type KeywordConditionOperator = z.infer<typeof keywordConditionOperators>

// Operators that inspect the message itself and take no keyword values.
export const valuelessKeywordConditionOperators: readonly KeywordConditionOperator[] =
  [
    "containsPhone",
    "containsEmail",
    "containsImage",
    "containsVideo",
    "containsLink",
    "isThumbsUp",
  ]

export const isValuelessKeywordConditionOperator = (
  operator: KeywordConditionOperator,
): boolean => valuelessKeywordConditionOperators.includes(operator)

export const MAX_KEYWORD_CONDITIONS = 10
export const MAX_KEYWORD_CONDITION_VALUES = 50
export const MAX_KEYWORD_REGEX_LENGTH = 200

export type KeywordCondition = {
  operator: KeywordConditionOperator
  values: string[]
}

// Operators whose values are words that trigger the rule. `notContains`
// values exclude and `matchesRegex` values are patterns, so neither belongs
// in the flat `keywords` column.
const triggerKeywordConditionOperators: readonly KeywordConditionOperator[] = [
  "is",
  "similarTo",
  "contains",
  "containsWholeWord",
  "beginsWith",
  "endsWith",
]

// The flat `keywords` column mirrors the trigger words in `conditions` so
// keyword search, `findByInboundKeyword` and older API clients keep working.
export const flattenKeywordConditionValues = (
  conditions: readonly KeywordCondition[],
): string[] => [
  ...new Set(
    conditions
      .filter((condition) =>
        triggerKeywordConditionOperators.includes(condition.operator),
      )
      .flatMap((condition) => condition.values),
  ),
]
