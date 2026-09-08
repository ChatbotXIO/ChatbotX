import {
  aiTriggerModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const aiTriggerResource = createSelectSchema(aiTriggerModel, {
  id: z.string(),
  workspaceId: z.string(),
  flowId: z.string().nullable(),
})
export type AITriggerResource = z.infer<typeof aiTriggerResource>
