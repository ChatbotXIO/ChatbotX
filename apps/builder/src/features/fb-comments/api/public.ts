import { commentAutomationService } from "@chatbotx.io/business"
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
      description:
        "Use this to find automation ids before inspecting one with `fbComments.get` or changing one with `fbComments.update`. Returns automations in this workspace.",
      tags: ["FB Comments"],
    })
    .input(listFbCommentsPublicRequest)
    .output(listFbCommentsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await commentAutomationService.list({
          ...input,
          workspaceId: context.workspace.id,
          includeAllFolders: true,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/fb-comments/{id}",
      summary: "Get FB comment automation",
      description:
        "Use this to inspect comment automation settings: public reply text and hide-comments condition. Returns one automation's trigger and reply settings. Use `fbComments.list` to find its id first.",
      tags: ["FB Comments"],
    })
    .input(getFbCommentPublicRequest)
    .output(fbCommentPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await commentAutomationService.findMessengerOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/fb-comments",
      summary: "Create FB comment automation",
      description:
        "Adds an automation that replies to or hides comments on a Facebook post. Use `fbComments.listPosts` to find an eligible post first.",
      successStatus: 201,
      tags: ["FB Comments"],
    })
    .input(createFbCommentPublicRequest)
    .output(fbCommentPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await commentAutomationService.createMessenger({
          workspaceId: context.workspace.id,
          data: input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/fb-comments/{id}",
      summary: "Update FB comment automation",
      description:
        "Use this to change comment automation's public reply text or hide-comments condition. Call `fbComments.get` to inspect current values first.",
      tags: ["FB Comments"],
    })
    .input(updateFbCommentPublicRequest)
    .output(fbCommentPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await commentAutomationService.updateMessenger(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/fb-comments/{id}",
      summary: "Delete FB comment automation",
      description:
        "Permanently deletes an automation. Use `fbComments.list` to find its id first.",
      successStatus: 204,
      tags: ["FB Comments"],
    })
    .input(deleteFbCommentPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await commentAutomationService.deleteMessenger({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),

  listPosts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/fb-comments/facebook-posts",
      summary: "List Facebook posts eligible for FB comment automation",
      description:
        "Use this to list posts to choose from before setting up comment automation. Returns posts from the workspace's connected Facebook pages that `fbComments.create` can target.",
      tags: ["FB Comments"],
    })
    .output(listFacebookPostsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) =>
        await listFacebookPostsForAutomation(context.workspace.id),
    ),
}
