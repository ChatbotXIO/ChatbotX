import { createSelectSchema, triggerModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const publicTriggerResource = createSelectSchema(triggerModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
}).extend({
  conditions: z.array(z.any()),
  actions: z.array(z.any()),
})
export type PublicTriggerResource = z.infer<typeof publicTriggerResource>

export const publicListTriggersResponse = z.object({
  data: z.array(publicTriggerResource),
})
export type PublicListTriggersResponse = z.infer<
  typeof publicListTriggersResponse
>
