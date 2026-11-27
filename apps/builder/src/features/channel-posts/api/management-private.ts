import { channelPostSyncService } from "@chatbotx.io/business"
import { z } from "zod"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { postTopicPrivateAPIs } from "@/features/post-topics/api/private"
import {
  workspaceAuthorizedMidddleware,
  workspacePermissionMiddleware,
} from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  CHANNEL_POST_COMMENT_EXPORTS_POST_PATH,
  CHANNEL_POST_MERGE_VIEW_POST_PATH,
} from "../lib/api-paths"
import { channelPostManagementOperations } from "../lib/management-operations"
import {
  channelPostCommentExportStatusResponse,
  channelPostManagementIdRequest,
  channelPostManagementItem,
  channelPostSyncInboxFilter,
  channelPostSyncStatusResponse,
  deleteChannelPostCommentRequest,
  deleteChannelPostCommentResponse,
  getChannelPostCommentExportRequest,
  likeChannelPostCommentRequest,
  likeChannelPostCommentResponse,
  listChannelPostAuthorsRequest,
  listChannelPostAuthorsResponse,
  listChannelPostCommentsRequest,
  listChannelPostCommentsResponse,
  listChannelPostManagementRequest,
  listChannelPostManagementResponse,
  mergeChannelPostCommentsRequest,
  refreshChannelPostMetricsRequest,
  refreshChannelPostMetricsResponse,
  refreshChannelPostResponse,
  startChannelPostCommentExportRequest,
  startChannelPostCommentExportResponse,
  startChannelPostSyncRequest,
  startChannelPostSyncResponse,
  updateChannelPostManagementRequest,
} from "../schema/management"

const tags = ["Posts"]
const inWorkspace = { workspaceId: z.string() }
const base = "/workspaces/{workspaceId}"

/**
 * A member sees phone numbers only with the `emailAndPhone` permission, read
 * from the membership the workspace gate already put in the context.
 */
const commentCaller = (
  workspaceId: string,
  workspaceMember: {
    permissions: Parameters<typeof canViewContactEmailAndPhone>[0]
  },
) => ({
  canViewEmailAndPhone: canViewContactEmailAndPhone(
    workspaceMember.permissions,
  ),
  workspaceId,
})

/**
 * The Posts page's session-authed procedures. Every one needs the member's
 * `broadcast` permission (the page's own gate), checked by
 * `workspacePermissionMiddleware`, so a member without it cannot call them
 * directly.
 *
 *  Each one parses the same request
 * shape as its public counterpart (`management-public.ts`) plus the workspace
 * id, and calls the same operation, so the page and the public API never
 * diverge.
 */
export const channelPostManagementAPIs = {
  privateListManagedChannelPostsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/channel-posts/management`,
      summary: "List managed channel posts",
      tags,
    })
    .input(listChannelPostManagementRequest.extend(inWorkspace))
    .output(listChannelPostManagementResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await channelPostManagementOperations.list(input.workspaceId, input),
    ),

  privateListChannelPostAuthorsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/channel-posts/management/authors`,
      summary: "List channel post authors",
      tags,
    })
    .input(listChannelPostAuthorsRequest.extend(inWorkspace))
    .output(listChannelPostAuthorsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await channelPostManagementOperations.listAuthors(
          input.workspaceId,
          input,
        ),
    ),

  privateUpdateManagedChannelPostAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: `${base}/channel-posts/management/{id}`,
      summary: "Update a managed channel post",
      tags,
    })
    .input(updateChannelPostManagementRequest.extend(inWorkspace))
    .output(channelPostManagementItem)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await channelPostManagementOperations.update(input.workspaceId, input),
    ),

  privateStartChannelPostSyncAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/channel-posts/sync`,
      summary: "Start syncing channel posts",
      tags,
    })
    .input(startChannelPostSyncRequest.extend(inWorkspace))
    .output(startChannelPostSyncResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await channelPostSyncService.request({
          inboxIds: input.inboxIds,
          workspaceId: input.workspaceId,
        }),
    ),

  privateGetChannelPostSyncStatusAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/channel-posts/sync/status`,
      summary: "Get channel post sync status",
      tags,
    })
    .input(channelPostSyncInboxFilter.extend(inWorkspace))
    .output(channelPostSyncStatusResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await channelPostSyncService.listStatus({
          inboxIds: input.inboxIds,
          workspaceId: input.workspaceId,
        }),
    ),

  privateRefreshManagedChannelPostAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/channel-posts/management/{id}/refresh`,
      summary: "Refresh one managed channel post",
      tags,
    })
    .input(channelPostManagementIdRequest.extend(inWorkspace))
    .output(refreshChannelPostResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await channelPostManagementOperations.refreshNow({
          id: input.id,
          workspaceId: input.workspaceId,
        }),
    ),

  privateRefreshChannelPostMetricsAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/channel-posts/management/refresh-metrics`,
      summary: "Refresh the counts of the posts a page shows",
      tags,
    })
    .input(refreshChannelPostMetricsRequest.extend(inWorkspace))
    .output(refreshChannelPostMetricsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await channelPostManagementOperations.refreshMetrics(
          input.workspaceId,
          input.ids,
        ),
    ),

  ...postTopicPrivateAPIs,

  privateListChannelPostCommentsAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${base}/channel-posts/management/{id}/comments`,
      summary: "List channel post comments",
      tags,
    })
    .input(listChannelPostCommentsRequest.extend(inWorkspace))
    .output(listChannelPostCommentsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.listComments(
          commentCaller(input.workspaceId, context.workspaceMember),
          input,
        ),
    ),

  privateMergeChannelPostCommentsAPI: authorizedAPI
    .route({
      method: "POST",
      path: CHANNEL_POST_MERGE_VIEW_POST_PATH,
      summary: "Merge channel post comments",
      tags,
    })
    .input(mergeChannelPostCommentsRequest.extend(inWorkspace))
    .output(listChannelPostCommentsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.mergeComments(
          commentCaller(input.workspaceId, context.workspaceMember),
          input,
        ),
    ),

  privateLikeChannelPostCommentAPI: authorizedAPI
    .route({
      method: "POST",
      path: `${base}/channel-posts/management/{id}/comments/{commentId}/like`,
      summary: "Like channel post comment",
      tags,
    })
    .input(likeChannelPostCommentRequest.extend(inWorkspace))
    .output(likeChannelPostCommentResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await channelPostManagementOperations.likeComment(
          input.workspaceId,
          input,
        ),
    ),

  privateDeleteChannelPostCommentAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: `${base}/channel-posts/management/{id}/comments/{commentId}`,
      summary: "Delete channel post comment",
      tags,
    })
    .input(deleteChannelPostCommentRequest.extend(inWorkspace))
    .output(deleteChannelPostCommentResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ input }) =>
        await channelPostManagementOperations.deleteComment(
          input.workspaceId,
          input,
        ),
    ),

  privateStartChannelPostCommentExportAPI: authorizedAPI
    .route({
      method: "POST",
      path: CHANNEL_POST_COMMENT_EXPORTS_POST_PATH,
      successStatus: 202,
      summary: "Start channel post comment export",
      tags,
    })
    .input(startChannelPostCommentExportRequest.extend(inWorkspace))
    .output(startChannelPostCommentExportResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.startCommentExport(
          {
            ...commentCaller(input.workspaceId, context.workspaceMember),
            ownerId: context.workspace.ownerId,
            userId: context.user.id,
          },
          input,
        ),
    ),

  privateGetChannelPostCommentExportAPI: authorizedAPI
    .route({
      method: "GET",
      path: `${CHANNEL_POST_COMMENT_EXPORTS_POST_PATH}/{fileId}`,
      summary: "Get channel post comment export",
      tags,
    })
    .input(getChannelPostCommentExportRequest.extend(inWorkspace))
    .output(channelPostCommentExportStatusResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .use(
      workspacePermissionMiddleware("broadcast"),
      (input) => input.workspaceId,
    )
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.getCommentExport(
          commentCaller(input.workspaceId, context.workspaceMember),
          input.fileId,
        ),
    ),
}
