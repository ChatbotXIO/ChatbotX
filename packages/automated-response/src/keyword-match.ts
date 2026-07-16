import type { AutomatedResponseModel } from "@chatbotx.io/database/types"

export const keywordMatchesText = (
  keywords: readonly string[],
  lowerCaseText: string,
): boolean =>
  keywords
    .map((keyword) => keyword.toLowerCase())
    .some((keyword) => lowerCaseText.includes(keyword))

export const matchesAnyKeywordRule = (
  text: string,
  rules: Pick<AutomatedResponseModel, "keywords">[],
): boolean => {
  const lowerCaseText = text.toLowerCase()
  return rules.some((rule) => keywordMatchesText(rule.keywords, lowerCaseText))
}
