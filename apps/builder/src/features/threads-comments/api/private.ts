import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listThreadsPostsForWorkspace } from "../lib/threads-posts"

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
    .output(
      z.object({
        posts: z.array(
          z.object({
            id: z.string(),
            message: z.string().optional(),
            full_picture: z.string().optional(),
            created_time: z.string(),
            permalink_url: z.string().optional(),
            accountId: z.string(),
          }),
        ),
        accounts: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    )
    .handler(
      async ({ input }) =>
        await listThreadsPostsForWorkspace(input.workspaceId),
    ),
}
