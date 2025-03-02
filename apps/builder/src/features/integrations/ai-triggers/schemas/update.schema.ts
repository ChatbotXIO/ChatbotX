import { createAITriggerRequest } from "@/features/integrations/ai-triggers/schemas/create.schema"
import type { z } from "zod"

export const updateAITriggerSchema = createAITriggerRequest
export type UpdateAITriggerSchema = z.infer<typeof updateAITriggerSchema>
