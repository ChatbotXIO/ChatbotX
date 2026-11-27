import type { KeywordCondition } from "@chatbotx.io/database/partials"

/**
 * Contact (inbound) forms send `conditions`; Page (outbound) forms send exact
 * `keywords`. The service rejects a request carrying both, so only one is
 * forwarded.
 */
export const toKeywordRuleMatch = (input: {
  keywords?: Array<{ value: string }>
  conditions?: KeywordCondition[]
}): { keywords?: string[]; conditions?: KeywordCondition[] } =>
  input.conditions?.length
    ? { conditions: input.conditions }
    : { keywords: input.keywords?.map((keyword) => keyword.value) ?? [] }
