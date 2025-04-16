import { z } from "zod"

export const createAIAgentRequest = z.object({
  name: z.string().trim().min(1).max(255),
})
export type CreateAIAgentRequest = z.infer<typeof createAIAgentRequest>
