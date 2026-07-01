import { findMessengerIntegrationsByWorkspaceId } from "@chatbotx.io/business"
import {
  type FacebookPostListItem,
  listAdsPosts,
  listPublishedPosts,
  listReelsPosts,
} from "@chatbotx.io/integration-messenger/apis/post"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { createFbComment } from "../actions/create-fb-comment.action"
import { deleteFbComment } from "../actions/delete-fb-comment.action"
import { updateFbComment } from "../actions/update-fb-comment.action"
import { listFbComments } from "../queries"
import {
  createFbCommentRequest,
  listFbCommentsRequest,
  listFbCommentsResponse,
  updateFbCommentRequest,
} from "../schema/action"
import { fbCommentResource } from "../schema/resource"

export const fbCommentsPrivateAPI = {
  listFbCommentsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-comments",
      summary: "List FB Comment Automations",
      tags: ["FB Comments"],
    })
    .input(listFbCommentsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listFbCommentsResponse)
    .handler(async ({ input }) => await listFbComments(input)),

  createFbCommentAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/fb-comments",
      summary: "Create FB Comment Automation",
      tags: ["FB Comments"],
    })
    .input(createFbCommentRequest.and(withWorkspaceIdSchema))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(fbCommentResource)
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input
      return await createFbComment(workspaceId, rest)
    }),

  updateFbCommentAPI: authorizedAPI
    .route({
      method: "PUT",
      path: "/workspaces/{workspaceId}/fb-comments/{id}",
      summary: "Update FB Comment Automation",
      tags: ["FB Comments"],
    })
    .input(
      updateFbCommentRequest
        .and(withWorkspaceIdSchema)
        .and(z.object({ id: zodBigintAsString() })),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(fbCommentResource)
    .handler(async ({ input }) => {
      const { workspaceId, id, ...rest } = input
      return await updateFbComment({ workspaceId, id }, rest)
    }),

  deleteFbCommentAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/fb-comments/{id}",
      summary: "Delete FB Comment Automation",
      tags: ["FB Comments"],
    })
    .input(withWorkspaceIdSchema.and(z.object({ id: zodBigintAsString() })))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.void())
    .handler(async ({ input }) => {
      await deleteFbComment({ workspaceId: input.workspaceId, id: input.id })
    }),

  facebookPostsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-comments/facebook-posts",
      summary: "List Facebook posts for FB Comment Automation",
      tags: ["FB Comments"],
    })
    .input(
      withWorkspaceIdSchema.and(
        z.object({ type: z.enum(["published", "ads", "reels"]) }),
      ),
    )
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
          }),
        ),
      }),
    )
    .handler(async ({ input }) => {
      const integrations = await findMessengerIntegrationsByWorkspaceId(
        input.workspaceId,
      )

      if (integrations.length === 0) {
        return { posts: [] }
      }

      const results = await Promise.allSettled(
        integrations.map(async (integration) => {
          const auth = integration.auth as MessengerAuthValue
          const pageId = integration.pageId

          let posts: FacebookPostListItem[]
          if (input.type === "published") {
            posts = await listPublishedPosts({ auth, pageId })
          } else if (input.type === "ads") {
            posts = await listAdsPosts({ auth, pageId })
          } else {
            posts = await listReelsPosts({ auth, pageId })
          }
          return posts
        }),
      )

      const posts = results
        .filter(
          (r): r is PromiseFulfilledResult<FacebookPostListItem[]> =>
            r.status === "fulfilled",
        )
        .flatMap((r) => r.value)

      return { posts }
    }),
}
