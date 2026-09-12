import { fbCommentAutomationService } from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listFacebookPostsForAutomation } from "../lib/facebook-posts"
import {
  createFbCommentPublicRequest,
  deleteFbCommentPublicRequest,
  fbCommentPublicResource,
  getFbCommentPublicRequest,
  listFacebookPostsPublicResponse,
  listFbCommentsPublicRequest,
  listFbCommentsPublicResponse,
  updateFbCommentPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const fbCommentsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/fb-comments",
      summary: "List FB comment automations",
      tags: ["FB Comments"],
    })
    .input(listFbCommentsPublicRequest)
    .output(listFbCommentsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await fbCommentAutomationService.list({
          ...input,
          workspaceId: context.workspace.id,
          includeAllFolders: true,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/fb-comments/{id}",
      summary: "Get a specific FB comment automation",
      tags: ["FB Comments"],
    })
    .input(getFbCommentPublicRequest)
    .output(fbCommentPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await fbCommentAutomationService.findMessengerOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/fb-comments",
      summary: "Create an FB comment automation",
      successStatus: 201,
      tags: ["FB Comments"],
    })
    .input(createFbCommentPublicRequest)
    .output(fbCommentPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await fbCommentAutomationService.createMessenger({
          workspaceId: context.workspace.id,
          data: input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/fb-comments/{id}",
      summary: "Update an FB comment automation",
      tags: ["FB Comments"],
    })
    .input(updateFbCommentPublicRequest)
    .output(fbCommentPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await fbCommentAutomationService.updateMessenger(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/fb-comments/{id}",
      summary: "Delete an FB comment automation",
      successStatus: 204,
      tags: ["FB Comments"],
    })
    .input(deleteFbCommentPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await fbCommentAutomationService.deleteMessenger({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),

  listPosts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/fb-comments/facebook-posts",
      summary: "List Facebook posts eligible for FB comment automation",
      tags: ["FB Comments"],
    })
    .output(listFacebookPostsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) =>
        await listFacebookPostsForAutomation(context.workspace.id),
    ),
}
