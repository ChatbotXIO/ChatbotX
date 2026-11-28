import { tagService } from "@chatbotx.io/business"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listTags } from "../queries"
import {
  listTagOptionsRequest,
  listTagOptionsResponse,
  listTagsRequest,
  listTagsResponse,
} from "../schema/query"

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

const privateListWorkspaceTagOptionsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/tag-options",
    summary: "List tags as picker options (id, name, color; no contact counts)",
    tags: ["Tags"],
  })
  .input(listTagOptionsRequest)
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(listTagOptionsResponse)
  .handler(async ({ input }) => await tagService.listOptions(input))

export const privateTagsAPI = {
  privateListWorkspaceTagOptionsAPI,
  privateListWorkspaceTagsAPI,
}
