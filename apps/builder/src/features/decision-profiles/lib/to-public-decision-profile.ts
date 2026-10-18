import type { DecisionProfileModel } from "@chatbotx.io/database/types"
import { globalRouterConfigSchema } from "@chatbotx.io/decision-config"
import { decisionProfileStoredContractSchema } from "../schema/form"
import { publicDecisionProfileSchema } from "../schema/public"

/**
 * Reconstructs the public authoring DTO from the compact provider contract
 * persisted by DecisionProfileService. Keep this server-only mapping separate
 * from the UI's form defaults so public callers never receive raw contracts.
 */
export const toPublicDecisionProfile = (profile: DecisionProfileModel) => {
  const question = decisionProfileStoredContractSchema.parse(profile.contract)
    .questions[0]

  const common = {
    connectionId: profile.connectionId,
    description: profile.description,
    globalRouterConfig:
      profile.globalRouterConfig === null
        ? null
        : globalRouterConfigSchema.parse(profile.globalRouterConfig),
    globalRouterEnabled: profile.globalRouterEnabled,
    id: profile.id,
    model: profile.model,
    name: profile.name,
    status: profile.status,
    thresholdConfig: profile.thresholdConfig ?? null,
  }

  if (question.type === "choice") {
    return publicDecisionProfileSchema.parse({
      ...common,
      decision: {
        instructions: question.instructions,
        options: question.options.map(({ description, value }) => ({
          description,
          value,
        })),
        type: "choice",
      },
    })
  }

  if (question.type === "score") {
    return publicDecisionProfileSchema.parse({
      ...common,
      decision: {
        instructions: question.instructions,
        levels: question.levels.map(({ description }) => ({ description })),
        type: "score",
      },
    })
  }

  return publicDecisionProfileSchema.parse({
    ...common,
    decision: {
      falseCriteria: question.falseCriteria,
      instructions: question.instructions,
      trueCriteria: question.trueCriteria,
      type: "noul",
    },
  })
}
