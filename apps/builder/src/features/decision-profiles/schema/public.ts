import { z } from "zod"

/**
 * Safe public projection. Never use DecisionConnectionModel here: it carries
 * credential-bearing fields that must not cross an API boundary.
 */
export const publicDecisionProfileSchema = z
  .object({
    connectionId: z.string(),
    description: z.string().nullable(),
    globalRouterEnabled: z.boolean(),
    id: z.string(),
    model: z.string(),
    name: z.string(),
    status: z.enum(["enabled", "disabled"]),
  })
  .strict()

export const publicDecisionProfileListSchema = z.array(
  publicDecisionProfileSchema,
)
