import { createSelectSchema, triggerModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const triggerResource = createSelectSchema(triggerModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
}).extend({
  conditions: z.array(z.any()),
  actions: z.array(z.any()),
})
export type TriggerResource = z.infer<typeof triggerResource>
