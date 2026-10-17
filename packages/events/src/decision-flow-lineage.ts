import { z } from "zod"

export const decisionFlowOriginSchema = z
  .object({
    flowId: z.string().regex(/^\d+$/),
    profileId: z.string().regex(/^\d+$/),
  })
  .strict()
export type DecisionFlowOrigin = z.infer<typeof decisionFlowOriginSchema>
