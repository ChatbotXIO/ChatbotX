import { currencyOffset, toMinorUnits } from "./currency"

/**
 * Major units as typed by the user -> the integer Meta expects, plus the
 * offset used. Both are persisted so the conversion behind any historical row
 * remains auditable (Meta's offset is 1 for eleven currencies, 100 otherwise).
 */
export function buildCampaignBudget(input: {
  budgetType: "daily" | "lifetime"
  budgetMajorUnits: number
  currency: string
}): {
  budgetType: "daily" | "lifetime"
  budgetMinorUnits: number
  currencyOffset: number
} {
  return {
    budgetType: input.budgetType,
    budgetMinorUnits: toMinorUnits(input.budgetMajorUnits, input.currency),
    currencyOffset: currencyOffset(input.currency),
  }
}
