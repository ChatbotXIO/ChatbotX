import { automatedResponseService } from "@chatbotx.io/business"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { publicKeywordResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const keywordsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/keywords",
      summary: "List keywords (automated responses)",
      tags: ["Keywords"],
    })
    .input(publicListRequest)
    .output(publicListResponse(publicKeywordResource))
    .handler(async ({ context, input }) => {
      const result = await automatedResponseService.list({
        workspaceId: context.workspace.id,
        type: "inbound",
        ...input,
        sort: [{ id: "createdAt", desc: true }],
        keyword: null,
        folderId: null,
      })

      return result
    }),
}
