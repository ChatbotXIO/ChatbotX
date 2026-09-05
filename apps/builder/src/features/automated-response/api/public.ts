import { automatedResponseService } from "@chatbotx.io/business"
import {
  automatedResponseModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import z from "zod"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

const keywordResource = createSelectSchema(automatedResponseModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
  flowId: z.string().nullable(),
})

export const keywordsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/keywords",
      summary: "List keywords (automated responses)",
      tags: ["Keywords"],
    })
    .output(z.object({ data: z.array(keywordResource) }))
    .handler(async ({ context }) => {
      const { data } = await automatedResponseService.list({
        workspaceId: context.workspace.id,
        type: "inbound",
        page: 1,
        perPage: maxPerPage,
        sort: [{ id: "createdAt", desc: true }],
        keyword: null,
        folderId: null,
      })

      return { data }
    }),
}
