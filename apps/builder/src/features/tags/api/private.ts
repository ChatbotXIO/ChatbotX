import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listTags } from "../queries"
import { listTagsRequest, listTagsResponse } from "../schema/query"

const privateListWorkspaceTagsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/tags",
    summary: "List tags",
    tags: ["Tags"],
  })
  .input(listTagsRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(listTagsResponse)
  .handler(async ({ input }) => await listTags(input))

export const privateTagsAPI = {
  privateListWorkspaceTagsAPI,
}
