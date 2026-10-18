import { decisionProfileFormSchema } from "@chatbotx.io/decision-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const publicDecisionProfileFields = {
  connectionId: decisionProfileFormSchema.shape.connectionId.describe(
    "Enabled AI Router connection id from `decisionConnections.list`.",
  ),
  decision: decisionProfileFormSchema.shape.decision.describe(
    "Decision type and its authoring instructions, options, levels, or criteria.",
  ),
  description: decisionProfileFormSchema.shape.description.describe(
    "Optional explanation of the profile's purpose.",
  ),
  globalRouterConfig:
    decisionProfileFormSchema.shape.globalRouterConfig.describe(
      "Fallback, routes, and metadata mappings used when Global Router is enabled.",
    ),
  globalRouterEnabled:
    decisionProfileFormSchema.shape.globalRouterEnabled.describe(
      "Whether this enabled profile is the workspace's Global Router.",
    ),
  model: decisionProfileFormSchema.shape.model.describe(
    "Connection model id used to evaluate this profile.",
  ),
  name: decisionProfileFormSchema.shape.name.describe(
    "Human-readable profile name.",
  ),
  status: decisionProfileFormSchema.shape.status.describe(
    "Whether the profile can be used by flows and Global Router.",
  ),
  thresholdConfig: decisionProfileFormSchema.shape.thresholdConfig.describe(
    "Optional confidence, probability, or score threshold matching the Decision type.",
  ),
}

export const publicDecisionProfileActionSchema =
  decisionProfileFormSchema.safeExtend(publicDecisionProfileFields)

export const publicDecisionProfileUpdateActionSchema =
  publicDecisionProfileActionSchema.extend({
    id: zodBigintAsString().describe(
      "AI Router profile id. Get it from `decisionProfiles.list`.",
    ),
  })

export const publicDecisionProfileStatusSchema = z
  .object({ enabled: z.boolean().describe("Whether the profile is usable.") })
  .strict()

export const deletePublicDecisionProfilesSchema = z
  .object({
    ids: z
      .array(
        zodBigintAsString().describe(
          "AI Router profile id. Get it from `decisionProfiles.list`.",
        ),
      )
      .min(1)
      .describe(
        "AI Router profile ids from `decisionProfiles.list` to delete.",
      ),
  })
  .strict()
