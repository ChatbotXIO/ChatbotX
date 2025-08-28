import type { z } from "zod"
import { createAITriggerRequest } from "@/features/ai-triggers/schemas/create.schema"

export const updateAITriggerRequest = createAITriggerRequest
export type UpdateAITriggerRequest = z.infer<typeof updateAITriggerRequest>
