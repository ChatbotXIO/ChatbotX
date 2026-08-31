import { botFieldService } from "@chatbotx.io/business"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listBotFieldsRequest, listBotFieldsResponse } from "../schema/query"

export const privateBotFieldsAPI = {
  privateListBotFieldsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/bot-fields",
      summary: "List bot fields",
      tags: ["Bot Fields"],
    })
    .input(listBotFieldsRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listBotFieldsResponse)
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input
      return await botFieldService.list({ ...rest, workspaceId })
    }),
}
