import { createAITriggerSchema } from "@/features/integrations/ai-triggers/schemas/create.schema"
import { z } from "zod"

export const updateAITriggerSchema = createAITriggerSchema

export type UpdateAITriggerSchema = z.infer<typeof updateAITriggerSchema>

export const updateAITriggerBindSchema: [
  chatbotId: z.ZodString,
  triggerId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAITriggerBindSchema = [chatbotId: string, triggerId: string]
