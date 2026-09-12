import { fbCommentAutomationService } from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { createFbComment } from "../actions/create-fb-comment.action"
import { deleteFbComment } from "../actions/delete-fb-comment.action"
import { updateFbComment } from "../actions/update-fb-comment.action"
import {
  createFbCommentPublicRequest,
  deleteFbCommentPublicRequest,
  fbCommentPublicResource,
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
        await createFbComment(context.workspace.id, input),
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
      return await updateFbComment(
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
      await deleteFbComment({ workspaceId: context.workspace.id, id: input.id })
    }),
}
