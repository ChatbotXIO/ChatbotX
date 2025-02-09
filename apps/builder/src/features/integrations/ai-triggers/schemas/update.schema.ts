import { createAiTriggerSchema } from "@/features/integrations/ai-triggers/schemas/create.schema"
import { z } from "zod"

export const updateAiTriggerSchema = createAiTriggerSchema

export type UpdateAiTriggerSchema = z.infer<typeof updateAiTriggerSchema>

export const updateAiTriggerBindSchema: [
  chatbotId: z.ZodString,
  triggerId: z.ZodString,
] = [z.string().cuid2(), z.string().cuid2()]

export type UpdateAiTriggerBindSchema = [chatbotId: string, triggerId: string]
