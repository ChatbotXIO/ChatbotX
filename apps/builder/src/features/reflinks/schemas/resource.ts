import { createSelectSchema, reflinkModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const reflinkResource = createSelectSchema(reflinkModel, {
  id: z.string(),
  flowId: z.string(),
  customFieldId: z.string().nullable(),
  workspaceId: z.string(),
})
export type ReflinkResource = z.infer<typeof reflinkResource>
