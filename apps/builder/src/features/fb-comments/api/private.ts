import {
  listCommentAutomationContactsRequest,
  listCommentAutomationContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { commentAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { listCommentAutomationContacts } from "@/features/shared/comment-automation/lib/list-automation-contacts"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listFacebookPostsForAutomation } from "../lib/facebook-posts"
import {
  createFbCommentRequest,
  listFbCommentsRequest,
  listFbCommentsResponse,
  updateFbCommentRequest,
} from "../schema/action"
import { facebookPostSchema, fbCommentResource } from "../schema/resource"

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
    .handler(async ({ input }) => await commentAutomationService.list(input)),

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
      return await commentAutomationService.createMessenger({
        workspaceId,
        data: rest,
      })
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
      return await commentAutomationService.updateMessenger(
        { workspaceId, id },
        rest,
      )
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
      await commentAutomationService.deleteMessenger({
        workspaceId: input.workspaceId,
        id: input.id,
      })
    }),

  /**
   * Backs the drill-down dialog behind every Sent/Delivered/Seen/Clicked/Failed
   * column. Deliberately ONE procedure for both the Facebook and the Instagram
   * list pages: `CommentAutomation` is a single table discriminated by its
   * `type` column, and `commentAutomationAnalyticsService` already scopes the
   * automation to the workspace, so a second copy under `ig-comments` would
   * only be a second thing to keep in sync.
   */
  privateListCommentAutomationContactsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/comment-automations/{automationId}/contacts",
      summary: "List comment automation contacts by event type",
      tags: ["FB Comments"],
    })
    .input(listCommentAutomationContactsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listCommentAutomationContactsResponse)
    .handler(
      async ({ input }) =>
        await listCommentAutomationContacts({
          ...input,
          // The caller already knows the count — it is the number rendered on
          // the column it clicked.
          total: input.total ?? 0,
        }),
    ),

  facebookPostsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/fb-comments/facebook-posts",
      summary: "List Facebook posts for FB Comment Automation",
      tags: ["FB Comments"],
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        published: z.array(facebookPostSchema),
        ads: z.array(facebookPostSchema),
        reels: z.array(facebookPostSchema),
        pages: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    )
    .handler(
      async ({ input }) =>
        await listFacebookPostsForAutomation(input.workspaceId),
    ),
}
