import { z } from "zod"

export const decisionConnectionActionSchema = z
  .object({
    credential: z.string().trim().max(2048).optional(),
    defaultModel: z.string().trim().min(1).max(256).nullable().optional(),
    endpoint: z.string().trim().max(2048).nullable().optional(),
    modelCatalog: z.array(z.string().trim().min(1).max(256)).min(1).max(100),
    name: z.string().trim().min(1).max(160),
    providerKind: z.enum([
      "typesafe",
      "systemOneCompatible",
      "openrouterDecision",
    ]),
  })
  .strict()
export type DecisionConnectionAction = z.infer<
  typeof decisionConnectionActionSchema
>

export const decisionConnectionToggleSchema = z
  .object({ enabled: z.boolean(), id: z.string().regex(/^\d+$/) })
  .strict()
