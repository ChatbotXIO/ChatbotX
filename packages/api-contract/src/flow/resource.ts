import { createSelectSchema, flowModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

const flowResource = createSelectSchema(flowModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
  currentVersionId: z.string().nullable(),
  draftVersionId: z.string().nullable(),
})

export const publicFlowResource = flowResource.pick({ id: true, name: true })
export type PublicFlowResource = z.infer<typeof publicFlowResource>

export const publicListFlowsResponse = z.object({
  data: z.array(publicFlowResource),
})
export type PublicListFlowsResponse = z.infer<typeof publicListFlowsResponse>
