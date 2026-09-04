import type { AutomatedResponseType } from "@chatbotx.io/database/partials"
import type { AutomatedResponseModel } from "@chatbotx.io/database/types"

export type KeywordMatchMode = "contains" | "exact"

// Mirrors the `Record<AutomatedResponseType, ...>` cascade convention used
// for `automatedResponseFolderTypeByType` — a future third type fails to
// compile here instead of silently falling back to "contains".
export const keywordMatchModeByAutomatedResponseType: Record<
  AutomatedResponseType,
  KeywordMatchMode
> = {
  inbound: "contains",
  outbound: "exact",
}

export const keywordMatchesText = (
  keywords: readonly string[],
  lowerCaseText: string,
  mode: KeywordMatchMode = "contains",
): boolean => {
  const trimmedText = lowerCaseText.trim()
  return keywords
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 0)
    .some((keyword) =>
      mode === "exact"
        ? trimmedText === keyword
        : lowerCaseText.includes(keyword),
    )
}

export const matchesAnyKeywordRule = (
  text: string,
  rules: Pick<AutomatedResponseModel, "keywords">[],
): boolean => {
  const lowerCaseText = text.toLowerCase()
  return rules.some((rule) => keywordMatchesText(rule.keywords, lowerCaseText))
}
