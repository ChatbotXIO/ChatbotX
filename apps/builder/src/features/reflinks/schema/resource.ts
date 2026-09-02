import { reflinkTypes } from "@chatbotx.io/database/partials"
import { createSelectSchema, reflinkModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const reflinkResource = createSelectSchema(reflinkModel, {
  id: z.string(),
  flowId: z.string(),
  customFieldId: z.string().nullable(),
  workspaceId: z.string(),
  type: reflinkTypes,
})
export type ReflinkResource = z.infer<typeof reflinkResource>

export const reflinkResponse = reflinkResource.optional()
export type ReflinkResponse = z.infer<typeof reflinkResponse>
