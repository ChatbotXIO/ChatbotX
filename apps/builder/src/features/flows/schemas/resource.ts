import { createSelectSchema, flowModel } from "@chatbotx.io/database/schema"
import z from "zod"
import { flowVersionResource } from "@/features/flow-versions/schema/resource"

export const flowResource = createSelectSchema(flowModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
  currentVersionId: z.string().nullable(),
  draftVersionId: z.string().nullable(),
})
export type FlowResource = z.infer<typeof flowResource>

export const flowWithVersionsResource = flowResource.and(
  z.object({
    flowVersions: z.array(flowVersionResource),
  }),
)
export type FlowWithVersionsResource = z.infer<typeof flowWithVersionsResource>
