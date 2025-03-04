import { z } from "zod"

export const createAIAgentRequest = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type CreateAIAgentRequest = z.infer<typeof createAIAgentRequest>
