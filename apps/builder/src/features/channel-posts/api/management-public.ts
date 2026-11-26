import {
  channelPostManagementService,
  channelPostSyncService,
} from "@chatbotx.io/business"
import { TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE } from "@/features/contacts/token-caller-permissions"
import { postAnalyticsOperations } from "@/features/post-analytics/lib/operations"
import {
  postMetricsRequest,
  postMetricsResponse,
} from "@/features/post-analytics/schema"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnChangingPostComment,
  possibleErrorsOnExportingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  CHANNEL_POST_EXPORT_TOKEN_PATH,
  CHANNEL_POST_MERGE_VIEW_TOKEN_PATH,
} from "../lib/api-paths"
import { channelPostManagementOperations } from "../lib/management-operations"
import {
  bulkUpdateChannelPostManagementRequest,
  bulkUpdateChannelPostManagementResponse,
  channelPostManagementIdRequest,
  channelPostManagementItem,
  channelPostSyncInboxFilter,
  channelPostSyncStatusResponse,
  deleteChannelPostCommentRequest,
  deleteChannelPostCommentResponse,
  exportChannelPostCommentsRequest,
  exportChannelPostCommentsResponse,
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
  startChannelPostSyncRequest,
  startChannelPostSyncResponse,
  updateChannelPostManagementRequest,
} from "../schema/management"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("posts")
const tags = ["Posts"]

/** A POST that only reads (its ids come in the body): no confirmation step for an agent. */
const readOnlyPost = mcpSpec({ hitlPolicy: "none", readOnlyHint: true })

/** The comment export reads only, but consumes a message of the quota: not read-only for an agent. */
const chargedExportPost = mcpSpec({ hitlPolicy: "none", readOnlyHint: false })

export const channelPostManagementPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channel-posts/management",
      summary: "List managed channel posts",
      description:
        "Lists posts on the workspace's channels with their counts, topics and settings, filtered by channel, inbox, content type, live status, topic, date range and text, in the chosen `sort` order. By default only posts that have comments, or that were published through this workspace, are listed (`hasComments`). Page with `nextCursor` and the same `sort`.",
      tags,
    })
    .input(listChannelPostManagementRequest)
    .output(listChannelPostManagementResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.list(context.workspace.id, input),
    ),

  listAuthors: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channel-posts/management/authors",
      summary: "List channel post authors",
      description:
        "Lists up to 100 authors of the workspace's posts with how many posts each has, most posts first, optionally narrowed by `channels` and `inboxIds`. Posts with no known author are left out. Pass an author's `authorExternalId` as `authorIds` to `channelPostManagement.list`.",
      tags,
    })
    .input(listChannelPostAuthorsRequest)
    .output(listChannelPostAuthorsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.listAuthors(
          context.workspace.id,
          input,
        ),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channel-posts/management/{id}",
      summary: "Get managed channel post",
      description:
        "Returns one post with its counts, topics and settings. Get the id from `channelPostManagement.list`.",
      tags,
    })
    .input(channelPostManagementIdRequest)
    .output(channelPostManagementItem)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementService.get({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  getMetrics: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channel-posts/management/{id}/metrics",
      summary: "Get managed post metrics",
      description:
        "Daily snapshots of one post's comments, reactions, shares, engagement and views over a range of workspace-local days (default last 30, at most 366): per day the cumulative `total` (null when the platform never reported that count) and the signed `gain` of the day, plus per-metric `available`, `gained` and latest `total`. A point with `isBaseline: true` is the first time we saw the post; its gain excludes the total the post had before. Days without a change have no point. Get the id from `channelPostManagement.list`.",
      tags,
    })
    .input(postMetricsRequest)
    .output(postMetricsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await postAnalyticsOperations.postMetrics(context.workspace.id, input),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/channel-posts/management/{id}",
      summary: "Update managed channel post",
      description:
        "Changes a post's topics (`topicIds` replaces them; at most 20) and its comment switches `hideComments`, `hidePhoneComments` and `skipComments`. A switch applies to comments that arrive after it is turned on; it never changes comments already stored. Omitted fields stay as they are.",
      tags,
    })
    .input(updateChannelPostManagementRequest)
    .output(channelPostManagementItem)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.update(
          context.workspace.id,
          input,
        ),
    ),

  bulkUpdate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/channel-posts/management/bulk-update",
      summary: "Update many managed channel posts",
      description:
        "Adds and/or removes topics and sets the comment switches `hideComments`, `hidePhoneComments` and `skipComments` on up to 100 posts at once, all or nothing: an unknown post or topic id fails the whole request. At least one change is required. A post can carry at most 20 topics.",
      tags,
    })
    .input(bulkUpdateChannelPostManagementRequest)
    .output(bulkUpdateChannelPostManagementResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.bulkUpdate(
          context.workspace.id,
          input,
        ),
    ),

  startSync: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/channel-posts/sync",
      summary: "Start syncing channel posts",
      description:
        "Starts reading the posts of the given inboxes (all eligible inboxes when omitted) from their channels in the background; the first run loads the history, later runs update counts. An inbox that is already queued or running, or was refreshed within the last minute, is left alone and reported with `requested: false`. Follow progress with `channelPostManagement.syncStatus`. Posts are also refreshed every six hours once an inbox has been synced.",
      tags,
    })
    .input(startChannelPostSyncRequest)
    .output(startChannelPostSyncResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostSyncService.request({
          inboxIds: input.inboxIds,
          workspaceId: context.workspace.id,
        }),
    ),

  syncStatus: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channel-posts/sync/status",
      summary: "Get channel post sync status",
      description:
        "Lists, per inbox, where the post sync stands: `status`, when it last finished, the next run, the last error and whether the channel must be re-authorised. An inbox with no row has never been synced: start it with `channelPostManagement.startSync`.",
      tags,
    })
    .input(channelPostSyncInboxFilter)
    .output(channelPostSyncStatusResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostSyncService.listStatus({
          inboxIds: input.inboxIds,
          workspaceId: context.workspace.id,
        }),
    ),

  refresh: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/channel-posts/management/{id}/refresh",
      summary: "Refresh one managed channel post",
      description:
        "Re-reads one post from its channel right away (up to 15 seconds) and returns `outcome` with the post as it is now: `refreshed` (counts updated), `removed` (the channel confirmed the post no longer exists, so it is hidden; `post` is null), `channelUnavailable`, `rateLimited` (try again later) or `cooldown` (the post was refreshed in the last minute; nothing was read). Get the id from `channelPostManagement.list`. `queued: true` is deprecated (always true, kept for clients of the earlier background refresh): use `outcome` and `post`.",
      tags,
    })
    .input(channelPostManagementIdRequest)
    .output(refreshChannelPostResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.refreshNow({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  refreshMetrics: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/channel-posts/management/refresh-metrics",
      summary: "Refresh counts of many channel posts",
      description:
        "Asks for fresh comment, reaction and share counts of up to 50 posts in the background, one channel read per inbox (Facebook and Instagram). Posts read in the last 5 minutes (`fresh`), unknown or removed ones, posts on a channel that is not connected and posts on Threads or TikTok (`skipped`) are left out; the rest are `queued`. Read the new counts with `channelPostManagement.list` a few seconds later. Get ids from `channelPostManagement.list`.",
      tags,
    })
    .input(refreshChannelPostMetricsRequest)
    .output(refreshChannelPostMetricsResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.refreshMetrics(
          context.workspace.id,
          input.ids,
        ),
    ),

  listComments: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/channel-posts/management/{id}/comments",
      summary: "List channel post comments",
      description:
        "Lists the comments customers left on one post, newest first, with the commenter's name, avatar, tags and phone number. Filter with `search` (text) and `hasPhone` (comments that carry a phone number). Page with `nextCursor`. Get the post id from `channelPostManagement.list`.",
      tags,
    })
    .input(listChannelPostCommentsRequest)
    .output(listChannelPostCommentsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.listComments(
          {
            canViewEmailAndPhone: TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE,
            workspaceId: context.workspace.id,
          },
          input,
        ),
    ),

  mergeComments: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: CHANNEL_POST_MERGE_VIEW_TOKEN_PATH,
      spec: readOnlyPost,
      summary: "Merge channel post comments",
      description:
        "Reads the comments of up to 20 posts as one newest-first list; each comment carries its `postId`. Takes the same `search`, `hasPhone` and `cursor` as `channelPostManagement.listComments`. Read-only: nothing is stored.",
      tags,
    })
    .input(mergeChannelPostCommentsRequest)
    .output(listChannelPostCommentsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.mergeComments(
          {
            canViewEmailAndPhone: TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE,
            workspaceId: context.workspace.id,
          },
          input,
        ),
    ),

  likeComment: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/channel-posts/management/{id}/comments/{commentId}/like",
      summary: "Like channel post comment",
      description:
        "Likes (`liked: true`) or removes the like of one comment on the channel, in the background. Send the comment's `createdAt` from the list. Answers 409 `commentActionUnsupported` on a channel that cannot like comments (Instagram, Threads).",
      tags,
    })
    .input(likeChannelPostCommentRequest)
    .output(likeChannelPostCommentResponse)
    .errors(possibleErrorsOnChangingPostComment)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.likeComment(
          context.workspace.id,
          input,
        ),
    ),

  deleteComment: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/channel-posts/management/{id}/comments/{commentId}",
      summary: "Delete channel post comment",
      description:
        "Removes one comment from the inbox now and from the channel in the background. Send the comment's `createdAt` from the list. Answers 409 `commentActionUnsupported` on a channel that cannot delete comments (Threads). Cannot be undone.",
      tags,
    })
    .input(deleteChannelPostCommentRequest)
    .output(deleteChannelPostCommentResponse)
    .errors(possibleErrorsOnChangingPostComment)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.deleteComment(
          context.workspace.id,
          input,
        ),
    ),

  exportComments: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: CHANNEL_POST_EXPORT_TOKEN_PATH,
      spec: chargedExportPost,
      summary: "Export channel post comments",
      description:
        "Builds a CSV and returns it in the response (`csv`, `fileName`, `rowCount`). `kind: rows` writes the post list itself, one row per post (publishedAt, channel, page, type, text excerpt, comments, reactions, shares, phones, topics, author, link, externalPostId), for the same `filters` and `sort` as `channelPostManagement.list` (no `postIds`; first 5000 posts). `kind: comments` and `phones` take the comments of up to 20 posts (`postIds`): `kind: comments` has one row per comment (createdAt, post, customer, phone, text, hidden); `kind: phones` has one row per customer who left a phone number (customer, phone, firstCommentAt, post). Stops at 20000 comments (5000 posts for `rows`), or when its time budget runs out, and then sets `truncated`. Optional `search` narrows the comments. Cells that start with a formula character are prefixed with a quote. A completed download consumes 1 message of the account's message quota; answers 429 `postMessageQuotaExceeded` (and builds nothing) when none is left. Not allowed in a workspace whose plan has expired (403 `trialExpired` or `macLimitReached`).",
      tags,
    })
    .input(exportChannelPostCommentsRequest)
    .output(exportChannelPostCommentsResponse)
    .errors(possibleErrorsOnExportingResource)
    .handler(
      async ({ context, input }) =>
        await channelPostManagementOperations.exportComments(
          {
            canViewEmailAndPhone: TOKEN_CALLER_CAN_VIEW_EMAIL_AND_PHONE,
            workspaceId: context.workspace.id,
          },
          input,
        ),
    ),
}
