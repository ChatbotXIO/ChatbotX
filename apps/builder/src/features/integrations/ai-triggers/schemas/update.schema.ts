import { createAITriggerRequest } from "@/features/integrations/ai-triggers/schemas/create.schema"
import type { z } from "zod"

export const updateAITriggerRequest = createAITriggerRequest
export type UpdateAITriggerRequest = z.infer<typeof updateAITriggerRequest>
