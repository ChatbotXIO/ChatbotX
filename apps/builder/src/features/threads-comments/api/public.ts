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
  getThreadsCommentResource,
  listThreadsCommentResources,
  toThreadsResource,
} from "../lib/resource"
import { listThreadsPostsForWorkspace } from "../lib/threads-posts"
import {
  createThreadsCommentPublicRequest,
  deleteThreadsCommentPublicRequest,
  getThreadsCommentPublicRequest,
  listThreadsCommentsPublicRequest,
  listThreadsCommentsPublicResponse,
  threadsCommentPublicResource,
  updateThreadsCommentPublicRequest,
} from "../schema/public"
import { listThreadsPostsResponse } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const threadsCommentsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/threads-comments",
      summary: "List Threads comment automations",
      description:
        "Use this to find automation ids before inspecting one with `threadsComments.get` or changing one with `threadsComments.update`. Returns Threads comment automations in this workspace, with their sent/delivered/failed/missed counters.",
      tags: ["Threads Comments"],
    })
    .input(listThreadsCommentsPublicRequest)
    .output(listThreadsCommentsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listThreadsCommentResources({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/threads-comments/{id}",
      summary: "Get Threads comment automation",
      description:
        "Use this to inspect one Threads comment automation: its post filter, keywords, public reply and counters. Use `threadsComments.list` to find its id first.",
      tags: ["Threads Comments"],
    })
    .input(getThreadsCommentPublicRequest)
    .output(threadsCommentPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await getThreadsCommentResource({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/threads-comments",
      summary: "Create Threads comment automation",
      description:
        "Adds an automation that replies publicly to, or hides, comments on Threads posts. Use `threadsComments.listPosts` to find eligible post ids first.",
      successStatus: 201,
      tags: ["Threads Comments"],
    })
    .input(createThreadsCommentPublicRequest)
    .output(threadsCommentPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) =>
      toThreadsResource(
        await commentAutomationService.createThreadsAutomation({
          workspaceId: context.workspace.id,
          data: input,
        }),
      ),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/threads-comments/{id}",
      summary: "Update Threads comment automation",
      description:
        "Use this to change a Threads comment automation's reply, keywords or post filter, or to enable/disable it with `isActive`. Call `threadsComments.get` to inspect current values first.",
      tags: ["Threads Comments"],
    })
    .input(updateThreadsCommentPublicRequest)
    .output(threadsCommentPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      const workspaceId = context.workspace.id
      await commentAutomationService.findThreadsOrFail({ workspaceId, id })
      return toThreadsResource(
        await commentAutomationService.updateThreadsAutomation({
          workspaceId,
          id,
          data,
        }),
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/threads-comments/{id}",
      summary: "Delete Threads comment automation",
      description:
        "Permanently deletes a Threads comment automation. Use `threadsComments.list` to find its id first.",
      successStatus: 204,
      tags: ["Threads Comments"],
    })
    .input(deleteThreadsCommentPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await commentAutomationService.findThreadsOrFail({
        workspaceId,
        id: input.id,
      })
      await commentAutomationService.deleteThreadsAutomation({
        workspaceId,
        id: input.id,
      })
    }),

  listPosts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/threads-comments/threads-posts",
      summary: "List Threads posts for comment automation",
      description:
        "Returns recent posts from every connected Threads account. Use the post ids in `threadsComments.create` or `threadsComments.update` with `post.type: postIds`.",
      tags: ["Threads Comments"],
    })
    .output(listThreadsPostsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) =>
        await listThreadsPostsForWorkspace(context.workspace.id),
    ),

  deleteMany: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/threads-comments/bulk-delete",
      summary: "Delete multiple Threads comment automations",
      description:
        "Permanently deletes several Threads comment automations in one call; ids of another channel or workspace are ignored. Use `threadsComments.list` to find their ids first.",
      successStatus: 204,
      tags: ["Threads Comments"],
    })
    .input(bulkUpdateIdsRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await commentAutomationService.deleteMany({
        workspaceId: context.workspace.id,
        ids: input.ids,
        types: ["threads"],
      })
    }),
}
