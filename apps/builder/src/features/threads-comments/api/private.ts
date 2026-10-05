import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listThreadsPostsForWorkspace } from "../lib/threads-posts"
import { listThreadsPostsResponse } from "../schema/resource"

export const threadsCommentsPrivateAPI = {
  threadsPostsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/threads-comments/threads-posts",
      summary: "List Threads posts for Threads Comment Automation",
      tags: ["Threads Comments"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listThreadsPostsResponse)
    .handler(
      async ({ input }) =>
        await listThreadsPostsForWorkspace(input.workspaceId),
    ),
}
