import { reflinkTypes } from "@chatbotx.io/database/partials"
import { createSelectSchema, reflinkModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const publicReflinkResource = createSelectSchema(reflinkModel, {
  id: z.string(),
  flowId: z.string(),
  customFieldId: z.string().nullable(),
  workspaceId: z.string(),
  type: reflinkTypes,
})
export type PublicReflinkResource = z.infer<typeof publicReflinkResource>
