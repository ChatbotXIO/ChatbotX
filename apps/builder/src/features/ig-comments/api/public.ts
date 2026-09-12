import { fbCommentAutomationService } from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  listInstagramFacebookMedia,
  listInstagramLoginMedia,
} from "../lib/instagram-media"
import {
  createIgCommentPublicRequest,
  deleteIgCommentPublicRequest,
  getIgCommentPublicRequest,
  igCommentPublicResource,
  listIgCommentsPublicRequest,
  listIgCommentsPublicResponse,
  listInstagramMediaPublicRequest,
  listInstagramMediaPublicResponse,
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
          includeAllFolders: true,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ig-comments/{id}",
      summary: "Get a specific Instagram comment automation",
      tags: ["IG Comments"],
    })
    .input(getIgCommentPublicRequest)
    .output(igCommentPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await fbCommentAutomationService.findInstagramOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ig-comments",
      summary: "Create an Instagram comment automation",
      successStatus: 201,
      tags: ["IG Comments"],
    })
    .input(createIgCommentPublicRequest)
    .output(igCommentPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { type, ...data } = input
      return await fbCommentAutomationService.createInstagram({
        workspaceId: context.workspace.id,
        type,
        data,
      })
    }),

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
      const { id, type: _type, ...data } = input
      return await fbCommentAutomationService.updateInstagram(
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
    .input(deleteIgCommentPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await fbCommentAutomationService.deleteInstagram({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),

  listMedia: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ig-comments/instagram-media",
      summary: "List Instagram media eligible for IG comment automation",
      tags: ["IG Comments"],
    })
    .input(listInstagramMediaPublicRequest)
    .output(listInstagramMediaPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) =>
      input.variant === "instagram"
        ? await listInstagramLoginMedia(context.workspace.id)
        : await listInstagramFacebookMedia(context.workspace.id),
    ),
}
