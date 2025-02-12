import { z } from "zod"

export const createAIAgentSchema = z.object({
  name: z.string().min(1).max(255).trim(),
})
export type CreateAIAgentSchema = z.infer<typeof createAIAgentSchema>
