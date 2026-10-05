import { commentAutomationService } from "@chatbotx.io/business"
import { bulkUpdateIdsRequest } from "@/features/common/schema"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  getTiktokCommentResource,
  listTiktokCommentResources,
  toTiktokResource,
} from "../lib/resource"
import {
  createTiktokCommentPublicRequest,
  deleteTiktokCommentPublicRequest,
  getTiktokCommentPublicRequest,
  listTiktokCommentsPublicRequest,
  listTiktokCommentsPublicResponse,
  tiktokCommentPublicResource,
  updateTiktokCommentPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const tiktokCommentsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/tiktok-comments",
      summary: "List TikTok comment automations",
      description:
        "Use this to find automation ids before inspecting one with `tiktokComments.get` or changing one with `tiktokComments.update`. Returns TikTok comment automations in this workspace, with their sent/delivered/failed/missed counters.",
      tags: ["TikTok Comments"],
    })
    .input(listTiktokCommentsPublicRequest)
    .output(listTiktokCommentsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listTiktokCommentResources({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/tiktok-comments/{id}",
      summary: "Get TikTok comment automation",
      description:
        "Use this to inspect one TikTok comment automation: its keywords, public and private replies, and counters. Use `tiktokComments.list` to find its id first.",
      tags: ["TikTok Comments"],
    })
    .input(getTiktokCommentPublicRequest)
    .output(tiktokCommentPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await getTiktokCommentResource({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/tiktok-comments",
      summary: "Create TikTok comment automation",
      description:
        "Adds an automation that replies to, or hides, comments on TikTok videos of the connected accounts. Use `tiktokComments.list` first to avoid duplicating an existing one.",
      successStatus: 201,
      tags: ["TikTok Comments"],
    })
    .input(createTiktokCommentPublicRequest)
    .output(tiktokCommentPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) =>
      toTiktokResource(
        await commentAutomationService.createTiktokAutomation({
          workspaceId: context.workspace.id,
          data: input,
        }),
      ),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/tiktok-comments/{id}",
      summary: "Update TikTok comment automation",
      description:
        "Use this to change a TikTok comment automation's replies, keywords or options, or to enable/disable it with `isActive`. Call `tiktokComments.get` to inspect current values first.",
      tags: ["TikTok Comments"],
    })
    .input(updateTiktokCommentPublicRequest)
    .output(tiktokCommentPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      const workspaceId = context.workspace.id
      await commentAutomationService.findTiktokOrFail({ workspaceId, id })
      return toTiktokResource(
        await commentAutomationService.updateTiktokAutomation({
          workspaceId,
          id,
          data,
        }),
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/tiktok-comments/{id}",
      summary: "Delete TikTok comment automation",
      description:
        "Permanently deletes a TikTok comment automation. Use `tiktokComments.list` to find its id first.",
      successStatus: 204,
      tags: ["TikTok Comments"],
    })
    .input(deleteTiktokCommentPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await commentAutomationService.findTiktokOrFail({
        workspaceId,
        id: input.id,
      })
      await commentAutomationService.deleteTiktokAutomation({
        workspaceId,
        id: input.id,
      })
    }),

  deleteMany: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/tiktok-comments/bulk-delete",
      summary: "Delete multiple TikTok comment automations",
      description:
        "Permanently deletes several TikTok comment automations in one call; ids of another channel or workspace are ignored. Use `tiktokComments.list` to find their ids first.",
      successStatus: 204,
      tags: ["TikTok Comments"],
    })
    .input(bulkUpdateIdsRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await commentAutomationService.deleteMany({
        workspaceId: context.workspace.id,
        ids: input.ids,
        types: ["tiktok"],
      })
    }),
}
