import type { DecisionProfileModel } from "@chatbotx.io/database/types"

export type DecisionProfileListItem = DecisionProfileModel & {
  connectionName: string | null
}
