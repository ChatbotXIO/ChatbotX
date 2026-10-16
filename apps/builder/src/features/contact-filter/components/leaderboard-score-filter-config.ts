import type { OperatorType } from "@chatbotx.io/database/partials"
import { LEADERBOARD_SCORE_OPERATORS } from "../schema/leaderboard-score-filter"
import type { ConditionOption, FieldConfig } from "./contact-filter-config"
import type { CustomFieldValueInputConfig } from "./custom-field-filter-config"

export const getLeaderboardScoreConditionOptions = (
  conditionOptions: ConditionOption[],
): ConditionOption[] => {
  const optionByOperator = new Map(
    conditionOptions.map((option) => [option.value, option]),
  )
  return LEADERBOARD_SCORE_OPERATORS.map((operator: OperatorType) => ({
    value: operator,
    label: optionByOperator.get(operator)?.label ?? operator,
  }))
}

/** A leaderboard score is always compared against a number. */
export const getLeaderboardScoreValueInputConfig = (
  config: FieldConfig | undefined,
): CustomFieldValueInputConfig | undefined =>
  config?.leaderboardId ? { kind: "number", defaultValue: "" } : undefined
