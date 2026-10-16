import { decisionProfileFormSchema } from "@chatbotx.io/decision-config"
import { z } from "zod"

/**
 * Reserved DTO boundary for a future workspace-token API.  It deliberately
 * shares authoring semantics with the private form while keeping IDs and
 * response serialization separate from internal persistence models.
 */
export const publicDecisionProfileActionSchema = decisionProfileFormSchema

export const publicDecisionProfileUpdateActionSchema =
  publicDecisionProfileActionSchema.extend({
    id: z.string().regex(/^\d+$/),
  })
