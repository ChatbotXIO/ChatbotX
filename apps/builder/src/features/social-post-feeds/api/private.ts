import { z } from "zod"
import {
  workspaceAuthorizedMidddleware,
  workspacePermissionMiddleware,
} from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  POST_FEED_BULK_DELETE_POST_PATH,
  POST_FEED_PAUSE_POST_PATH,
} from "../lib/api-paths"
import { postFeedOperations } from "../lib/operations"
import {
  bulkDeletePostFeedsRequest,
  bulkDeletePostFeedsResponse,
  createPostFeedRequest,
  listPostFeedItemsRequest,
  listPostFeedItemsResponse,
  listPostFeedsRequest,
  listPostFeedsResponse,
  postFeedIdRequest,
  postFeedItemDraftContentResponse,
  postFeedItemIdRequest,
  postFeedResource,
  previewPostFeedRequest,
  previewPostFeedResponse,
  sendPostFeedTestResponse,
  updatePostFeedRequest,
} from "../schema"

const tags = ["Posts"]
const inWorkspace = { workspaceId: z.string() }
const base = "/workspaces/{workspaceId}"

/**
 * The Posts page's session procedures for feeds: the public request shape plus
 * the workspace id, the same operations, behind the `broadcast` page
 * permission.
 */
export const postFeedsAPIs = {
  privateListPostFeedsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-feeds`,
      summary: "List post feeds",
      tags,
    })
    .input(listPostFeedsRequest.extend(inWorkspace))
    .output(listPostFeedsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input: { workspaceId, ...filters } }) =>
        await postFeedOperations.list(workspaceId, filters),
    ),

  privatePreviewPostFeedAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/post-feeds/preview`,
      summary: "Preview a post feed",
      tags,
    })
    .input(previewPostFeedRequest.extend(inWorkspace))
    .output(previewPostFeedResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.preview(context.workspace, input),
    ),

  privateCreatePostFeedAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/post-feeds`,
      summary: "Create post feed",
      tags,
    })
    .input(createPostFeedRequest.extend(inWorkspace))
    .output(postFeedResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...body } = input
      return await postFeedOperations.create(
        context.workspace,
        context.user.id,
        body,
      )
    }),

  privateUpdatePostFeedAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: `${base}/post-feeds/{id}`,
      summary: "Update post feed",
      tags,
    })
    .input(updatePostFeedRequest.extend(inWorkspace))
    .output(postFeedResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...body } = input
      return await postFeedOperations.update(context.workspace, body)
    }),

  privateBulkDeletePostFeedsAPI: authorizedAPI
    .route({
      method: "POST",
      path: POST_FEED_BULK_DELETE_POST_PATH,
      summary: "Delete post feeds in bulk",
      tags,
    })
    .input(bulkDeletePostFeedsRequest.extend(inWorkspace))
    .output(bulkDeletePostFeedsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postFeedOperations.bulkDelete(input.workspaceId, input.ids),
    ),

  privateDeletePostFeedAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: `${base}/post-feeds/{id}`,
      summary: "Delete post feed",
      successStatus: 204,
      tags,
    })
    .input(postFeedIdRequest.extend(inWorkspace))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => {
      await postFeedOperations.delete(input.workspaceId, input.id)
    }),

  privatePausePostFeedAPI: authorizedAPI
    .route({
      method: "POST",
      path: POST_FEED_PAUSE_POST_PATH,
      summary: "Pause post feed",
      tags,
    })
    .input(postFeedIdRequest.extend(inWorkspace))
    .output(postFeedResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await postFeedOperations.pause(input.workspaceId, input.id),
    ),

  privateResumePostFeedAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/post-feeds/{id}/resume`,
      summary: "Resume post feed",
      tags,
    })
    .input(postFeedIdRequest.extend(inWorkspace))
    .output(postFeedResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.resume(context.workspace, input.id),
    ),

  privateCheckPostFeedAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/post-feeds/{id}/check`,
      summary: "Check post feed now",
      tags,
    })
    .input(postFeedIdRequest.extend(inWorkspace))
    .output(postFeedResource)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.checkNow(context.workspace, input.id),
    ),

  privateListPostFeedItemsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-feeds/{id}/items`,
      summary: "List post feed items",
      tags,
    })
    .input(listPostFeedItemsRequest.extend(inWorkspace))
    .output(listPostFeedItemsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ input }) => {
      const { workspaceId, ...rest } = input
      return await postFeedOperations.listItems(workspaceId, rest)
    }),

  privateSendPostFeedTestAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/post-feeds/{id}/test`,
      summary: "Send test post from feed",
      tags,
    })
    .input(postFeedIdRequest.extend(inWorkspace))
    .output(sendPostFeedTestResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.sendTest(
          context.workspace,
          context.user.id,
          input.id,
        ),
    ),

  privatePostFeedItemDraftContentAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/post-feeds/{id}/items/{itemId}/draft-content`,
      summary: "Get feed item post content",
      tags,
    })
    .input(postFeedItemIdRequest.extend(inWorkspace))
    .output(postFeedItemDraftContentResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(async ({ context, input }) => {
      const { workspaceId: _workspaceId, ...rest } = input
      return await postFeedOperations.itemDraftContent(context.workspace, rest)
    }),
}
