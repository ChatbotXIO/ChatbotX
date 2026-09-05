import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listCustomFields } from "../queries"
import {
  listCustomFieldsRequest,
  listCustomFieldsResponse,
} from "../schema/query"

export const privateCustomFieldsAPI = {
  privateListCustomFieldsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/custom-fields",
      summary: "List custom fields",
      tags: ["Custom Fields"],
    })
    .input(listCustomFieldsRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listCustomFieldsResponse)
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input
      return await listCustomFields({ ...rest, workspaceId })
    }),
}
