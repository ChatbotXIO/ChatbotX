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

export const welcomeMessageFlowResource = z.object({
  integrationMessengerId: z
    .string()
    .describe(
      "Messenger channel id, as used by `messengerChannels.getSettings`.",
    ),
  pageId: z.string().describe("Facebook Page id."),
  welcomeMessageFlowId: z
    .string()
    .describe(
      "Meta welcome message flow id. Use it as `partner_app_welcome_message_flow_id` in a Click-to-Messenger ad creative, or pick it under Partner app in Ads Manager.",
    ),
})
export type WelcomeMessageFlowResource = z.infer<
  typeof welcomeMessageFlowResource
>
