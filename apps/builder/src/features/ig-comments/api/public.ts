import { fbCommentAutomationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { createIgComment } from "../actions/create-ig-comment.action"
import { deleteIgComment } from "../actions/delete-ig-comment.action"
import { updateIgComment } from "../actions/update-ig-comment.action"
import {
  createIgCommentPublicRequest,
  igCommentPublicResource,
  listIgCommentsPublicRequest,
  listIgCommentsPublicResponse,
  updateIgCommentPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const igCommentsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ig-comments",
      summary: "List Instagram comment automations",
      tags: ["IG Comments"],
    })
    .input(listIgCommentsPublicRequest)
    .output(listIgCommentsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await fbCommentAutomationService.listIgComments({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ig-comments",
      summary: "Create an Instagram comment automation",
      tags: ["IG Comments"],
    })
    .input(createIgCommentPublicRequest)
    .output(igCommentPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await createIgComment(context.workspace.id, input),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/ig-comments/{id}",
      summary: "Update an Instagram comment automation",
      tags: ["IG Comments"],
    })
    .input(updateIgCommentPublicRequest)
    .output(igCommentPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await updateIgComment(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ig-comments/{id}",
      summary: "Delete an Instagram comment automation",
      successStatus: 204,
      tags: ["IG Comments"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await deleteIgComment({ workspaceId: context.workspace.id, id: input.id })
    }),
}
