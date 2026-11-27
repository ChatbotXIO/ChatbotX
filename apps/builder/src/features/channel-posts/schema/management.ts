import {
  channelPostCommentExportKinds,
  channelPostExportKinds,
  MAX_BULK_UPDATE_POSTS,
  MAX_EXPORT_POST_ROWS,
  MAX_EXPORT_ROWS,
  MAX_MERGE_VIEW_POSTS,
  MAX_TOPICS_PER_POST,
  POST_COMMENT_SENDERS,
} from "@chatbotx.io/business"
import {
  channelPostContentTypes,
  channelPostLiveStatuses,
  channelPostManagementSorts,
  channelPostSyncStatuses,
  channelTypes,
  exportFailureReasons,
  fileStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import {
  CHANNEL_POST_METRICS_BATCH_MAX,
  channelPostRefreshOutcomes,
} from "@chatbotx.io/utils/channel-post"
import {
  isValidPostgresTimestampWithOffset,
  POSTGRES_TIMESTAMP_WITH_OFFSET,
} from "@chatbotx.io/utils/postgres-timestamp"
import { z } from "zod"
import { postTopicId, postTopicLabel } from "@/features/post-topics/schema"
import { channelPostId } from "./index"

/** A query-string boolean: only the literal `true` / `false` are accepted. */
const booleanQuery = z
  .enum(["true", "false"])
  .transform((value) => value === "true")

/**
 * OpenAPI query parsing keeps a single `?channels=messenger` as a string and
 * only builds an array for repeated or indexed keys, so wrap a lone value.
 */
const queryArray = <Item extends z.ZodType>(item: Item, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(item).max(max),
  )

const MAX_FILTER_VALUES = 200
const MAX_TOPIC_FILTER_VALUES = 20

export const channelPostManagementCursor = z.object({
  id: channelPostId,
  sort: channelPostManagementSorts,
  sortValue: z.string().min(1).max(64),
})

export const channelPostManagementItem = z.object({
  authorExternalId: z.string().nullable(),
  authorName: z.string().nullable(),
  caption: z.string().nullable(),
  channel: channelTypes,
  commentsCount: z.number().int(),
  contentType: channelPostContentTypes.nullable(),
  engagementCount: z.number().int(),
  externalPostId: z.string(),
  hideComments: z.boolean(),
  hidePhoneComments: z.boolean(),
  id: z.string(),
  inboxId: z.string(),
  inboxName: z.string(),
  liveStatus: channelPostLiveStatuses
    .nullable()
    .describe(
      "Live-stream status: live while the broadcast is on, ended once it is over (scheduled is never reported). Reported for Facebook Pages and for Instagram accounts connected through Facebook Login (an Instagram past live cannot be listed, only one seen while on the air becomes ended); null for a post that is not a live broadcast and for other channels.",
    ),
  mediaType: z.string().nullable(),
  metricsFetchedAt: z.date().nullable(),
  permalink: z.string().nullable(),
  phoneCommentsCount: z.number().int(),
  publishedAt: z.date().nullable(),
  reactionsCount: z.number().int(),
  sharesCount: z.number().int(),
  skipComments: z.boolean(),
  thumbnailUrl: z.string().nullable(),
  topics: z.array(postTopicLabel),
  viewsCount: z.number().int().nullable(),
})

/** The per-post comment switches, shared by the update bodies. */
const commentSettingFields = {
  hideComments: z
    .boolean()
    .optional()
    .describe(
      "Hide every new comment on the post. Comments already on the post are not changed.",
    ),
  hidePhoneComments: z
    .boolean()
    .optional()
    .describe(
      "Hide every new comment that carries a phone number. A phone number is detected loosely (a run of eight or more digits and separators), so a long date or a price written with dots can match. Comments already on the post are not changed.",
    ),
  skipComments: z
    .boolean()
    .optional()
    .describe(
      "Mark every new comment on the post as read. Automations still run.",
    ),
}

export const listChannelPostManagementRequest = z.object({
  authorIds: queryArray(z.string().min(1).max(256), MAX_FILTER_VALUES)
    .optional()
    .describe(
      "Only posts created by these authors. Pass `authorKey` values from `channelPostManagement.listAuthors` to match an author on one inbox only, or a bare `authorExternalId` to match that author on every inbox. Omit for all authors.",
    ),
  channels: queryArray(channelTypes, channelTypes.options.length)
    .optional()
    .describe("Only posts on these channels. Omit for all channels."),
  contentTypes: queryArray(channelPostContentTypes, MAX_FILTER_VALUES)
    .optional()
    .describe("Only posts of these content types. Omit for all."),
  cursor: channelPostManagementCursor
    .optional()
    .describe(
      "Keyset cursor from an earlier response. Use it only with the same `sort`.",
    ),
  hasComments: booleanQuery
    .optional()
    .describe(
      "`true` (default) lists only posts that have comments, plus posts recorded from a comment and not yet measured and posts published through this workspace; `false` lists every post.",
    ),
  hideComments: booleanQuery
    .optional()
    .describe("Only posts whose hide-all-comments switch is on or off."),
  hidePhoneComments: booleanQuery
    .optional()
    .describe("Only posts whose hide-phone-comments switch is on or off."),
  skipComments: booleanQuery
    .optional()
    .describe("Only posts whose skip-comments switch is on or off."),
  inboxIds: queryArray(zodBigintIdAsString(), MAX_FILTER_VALUES)
    .optional()
    .describe(
      "Only posts of these inboxes. Get ids from `inboxes.list`. Omit for all inboxes.",
    ),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30)
    .describe("Maximum number of posts to return (1-100, default 30)."),
  liveStatus: channelPostLiveStatuses
    .optional()
    .describe(
      "Only posts with this live-stream status (live = on the air now, ended = a past broadcast). Only Facebook Pages and Instagram through Facebook Login report it; other channels return no posts for it.",
    ),
  publishedFrom: z.coerce
    .date()
    .optional()
    .describe("Only posts published at or after this time."),
  publishedTo: z.coerce
    .date()
    .optional()
    .describe("Only posts published at or before this time."),
  search: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Text found in the caption or permalink, or an exact external post id.",
    ),
  sort: channelPostManagementSorts
    .default("newest")
    .describe("Order of the list (default `newest`)."),
  topicIds: queryArray(postTopicId, MAX_TOPIC_FILTER_VALUES)
    .optional()
    .describe(
      "Only posts that carry at least one of these topics. Get ids from `postTopics.list`.",
    ),
})

export const listChannelPostManagementResponse = z.object({
  items: z.array(channelPostManagementItem),
  nextCursor: channelPostManagementCursor.optional(),
})

export const channelPostManagementIdRequest = z.object({
  id: channelPostId.describe(
    "Post id. Get it from `channelPostManagement.list`.",
  ),
})

export const updateChannelPostManagementRequest =
  channelPostManagementIdRequest.extend({
    ...commentSettingFields,
    topicIds: z
      .array(postTopicId)
      .max(MAX_TOPICS_PER_POST)
      .optional()
      .describe(
        "Replaces the post's topics with exactly these (an empty list removes all). Get ids from `postTopics.list`. Omit to leave topics unchanged.",
      ),
  })

export const bulkUpdateChannelPostManagementRequest = z.object({
  ...commentSettingFields,
  addTopicIds: z
    .array(postTopicId)
    .max(MAX_TOPICS_PER_POST)
    .optional()
    .describe("Topics to add to every listed post."),
  ids: z
    .array(channelPostId)
    .min(1)
    .max(MAX_BULK_UPDATE_POSTS)
    .describe("Post ids to update (at most 100, no repeats)."),
  removeTopicIds: z
    .array(postTopicId)
    .max(MAX_TOPICS_PER_POST)
    .optional()
    .describe("Topics to remove from every listed post."),
})

export const channelPostSyncInboxFilter = z.object({
  inboxIds: queryArray(zodBigintIdAsString(), MAX_FILTER_VALUES)
    .optional()
    .describe(
      "Only these inboxes. Get ids from `inboxes.list`. Omit for every inbox on a channel with a post list.",
    ),
})

export const startChannelPostSyncRequest = z.object({
  inboxIds: z
    .array(zodBigintIdAsString())
    .max(MAX_FILTER_VALUES)
    .optional()
    .describe(
      "Inboxes to refresh. Get ids from `inboxes.list`. Omit for every inbox on a channel with a post list.",
    ),
})

export const startChannelPostSyncResponse = z.object({
  items: z.array(
    z.object({
      channel: channelTypes,
      inboxId: z.string(),
      inboxName: z.string(),
      requested: z
        .boolean()
        .describe(
          "`true` when this call started a sync. `false` when one was already queued or running, or the inbox was refreshed within the last minute.",
        ),
      status: channelPostSyncStatuses,
    }),
  ),
})

export const channelPostSyncStatusResponse = z.object({
  items: z.array(
    z.object({
      attempts: z.number().int(),
      backfillCompletedAt: z.date().nullable(),
      channel: channelTypes,
      inboxId: z.string(),
      inboxName: z.string(),
      lastError: z.string().nullable(),
      lastErrorCategory: z
        .string()
        .nullable()
        .describe(
          "`auth_failed` or `permission_denied` means the channel must be re-authorised. `notConnected` marks a row parked because its inbox cannot sync; such rows are not listed here (only connected inboxes with their integration are).",
        ),
      lastRequestedAt: z.date().nullable(),
      lastSyncedAt: z.date().nullable(),
      nextSyncAt: z.date().nullable(),
      status: channelPostSyncStatuses,
      syncedCount: z.number().int(),
    }),
  ),
})

export const refreshChannelPostResponse = z.object({
  outcome: channelPostRefreshOutcomes.describe(
    "`refreshed`: the counts were just read from the channel. `removed`: the channel confirmed the post is gone and it is now hidden. `channelUnavailable`: the channel could not be read (try again later). `rateLimited`: the channel asked to slow down. `cooldown`: the post was refreshed in the last minute, nothing was read.",
  ),
  post: channelPostManagementItem
    .nullable()
    .describe("The post as it is now; `null` when it was removed."),
  queued: z
    .literal(true)
    .describe(
      "Deprecated: always `true`, kept so clients written for the earlier background refresh (`{ queued: true }`) keep validating. Read `outcome` and `post` instead.",
    ),
})

export const refreshChannelPostMetricsRequest = z.object({
  ids: z
    .array(channelPostId)
    .min(1)
    .max(CHANNEL_POST_METRICS_BATCH_MAX)
    .describe(
      "Post ids whose counts to refresh (at most 50). Get them from `channelPostManagement.list`.",
    ),
})

export const refreshChannelPostMetricsResponse = z.object({
  fresh: z
    .number()
    .int()
    .describe("Posts whose counts were read less than 5 minutes ago."),
  queued: z
    .number()
    .int()
    .describe(
      "Posts handed to a background read of their channel (one read per inbox). Their new counts show on the next list read.",
    ),
  skipped: z
    .number()
    .int()
    .describe(
      "Posts that cannot be read now: unknown, removed, on a channel that is not connected, or on a channel without a batch read (Threads, TikTok).",
    ),
})

export const bulkUpdateChannelPostManagementResponse = z.object({
  updatedCount: z.number().int(),
})

export const listChannelPostAuthorsRequest = z.object({
  channels: queryArray(channelTypes, channelTypes.options.length)
    .optional()
    .describe("Only authors of posts on these channels. Omit for all."),
  inboxIds: queryArray(zodBigintIdAsString(), MAX_FILTER_VALUES)
    .optional()
    .describe(
      "Only authors of posts in these inboxes. Get ids from `inboxes.list`. Omit for all.",
    ),
})

export const listChannelPostAuthorsResponse = z.object({
  items: z.array(
    z.object({
      authorExternalId: z
        .string()
        .describe(
          "The channel's id of the author; pass it as `authorIds` to match the author on every inbox.",
        ),
      authorKey: z
        .string()
        .describe(
          "Unique per author per inbox (`<inboxId>:<authorExternalId>`); pass it as `authorIds` to match the author on this inbox only.",
        ),
      authorName: z.string().nullable(),
      channel: z.string().describe("The channel of the inbox."),
      inboxId: z.string().describe("The inbox (page or account) of the posts."),
      inboxName: z.string().describe("The name of that inbox."),
      postsCount: z.number().int(),
    }),
  ),
})

const MAX_COMMENT_SEARCH_LENGTH = 200

/** Where a comment page stopped; pass it back unchanged to get the next page. */
export const channelPostCommentCursor = z.object({
  createdAt: z
    .string()
    .regex(POSTGRES_TIMESTAMP_WITH_OFFSET)
    .refine(isValidPostgresTimestampWithOffset, {
      message: "Must be a valid PostgreSQL timestamp with offset",
    }),
  id: zodBigintIdAsString(),
  shardId: z.string().min(1).max(64).optional(),
})

const commentPageFields = {
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30)
    .describe("Maximum number of comments to return (1-100, default 30)."),
  search: z
    .string()
    .trim()
    .min(1)
    .max(MAX_COMMENT_SEARCH_LENGTH)
    .optional()
    .describe(
      "Only comments whose text contains this, ignoring case. A caller who may not view phone numbers searches the text with numbers masked, so a number cannot be found by its digits.",
    ),
}

const channelPostCommentAuthor = z.object({
  avatar: z
    .string()
    .nullable()
    .describe(
      "The commenter's picture as an absolute URL (a signed, expiring media link when the picture is fetched on view); null when none.",
    ),
  id: z.string().describe("The commenter's contact id."),
  name: z.string().nullable(),
  phoneNumber: z
    .string()
    .nullable()
    .describe(
      "Null when the contact has none or the caller may not view phone numbers.",
    ),
  tags: z.array(z.object({ id: z.string(), name: z.string() })),
})

const channelPostCommentPage = z.object({
  avatar: z
    .string()
    .nullable()
    .describe(
      "The page's picture as an absolute URL (a signed, expiring media link when it is fetched on view); null when there is none (a TikTok account, or a page not bound for publishing).",
    ),
  name: z.string().describe("The name of the page or account."),
})

export const channelPostComment = z.object({
  author: channelPostCommentAuthor
    .nullable()
    .describe(
      "The contact whose thread the comment sits in, also for a reply the page sent. Null only if the contact was deleted after commenting.",
    ),
  commentId: z
    .string()
    .nullable()
    .describe("The channel's own id of the comment."),
  createdAt: z.date(),
  hidden: z.boolean().describe("Whether the comment is hidden on the channel."),
  id: z
    .string()
    .describe("The comment's id; pass it as `commentId` to like or delete."),
  liked: z.boolean(),
  parentCommentId: z
    .string()
    .nullable()
    .describe(
      "The `id` of the comment this one replies to (the parent's own id in this list), if it is a reply.",
    ),
  page: channelPostCommentPage
    .nullable()
    .describe(
      "The page that wrote the comment; null unless `sender` is `page`.",
    ),
  postId: z.string().describe("The post the comment belongs to."),
  sender: z
    .enum(POST_COMMENT_SENDERS)
    .describe(
      "Who wrote the comment: `contact` (the customer, see `author`) or `page` (a reply the page or its bot or agent sent).",
    ),
  text: z
    .string()
    .nullable()
    .describe(
      "Comment text. A phone number in it is masked when the caller may not view phone numbers.",
    ),
})

export const listChannelPostCommentsResponse = z.object({
  items: z.array(channelPostComment),
  nextCursor: channelPostCommentCursor.optional(),
})

export const listChannelPostCommentsRequest = channelPostManagementIdRequest
  .extend({
    ...commentPageFields,
    cursor: channelPostCommentCursor
      .optional()
      .describe("Cursor from an earlier response, to get the next page."),
    hasPhone: booleanQuery
      .optional()
      .describe(
        "`true` lists only comments that carry a phone number. Needs permission to view phone numbers.",
      ),
  })
  .describe("Comments of one post, newest first.")

export const mergeChannelPostCommentsRequest = z.object({
  ...commentPageFields,
  cursor: channelPostCommentCursor
    .optional()
    .describe("Cursor from an earlier response, to get the next page."),
  hasPhone: z
    .boolean()
    .optional()
    .describe(
      "`true` lists only comments that carry a phone number. Needs permission to view phone numbers.",
    ),
  postIds: z
    .array(channelPostId)
    .min(1)
    .max(MAX_MERGE_VIEW_POSTS)
    .describe(
      `Posts whose comments are merged into one newest-first list (1-${MAX_MERGE_VIEW_POSTS}, no repeats).`,
    ),
})

const channelPostCommentRef = channelPostManagementIdRequest.extend({
  commentId: zodBigintIdAsString().describe(
    "Comment id from `channelPostManagement.listComments`.",
  ),
})

export const likeChannelPostCommentRequest = channelPostCommentRef.extend({
  createdAt: z.coerce
    .date()
    .describe("The comment's `createdAt`, as returned by the list."),
  liked: z.boolean().describe("`true` to like, `false` to remove the like."),
})

export const likeChannelPostCommentResponse = z.object({
  liked: z.boolean(),
})

export const deleteChannelPostCommentRequest = channelPostCommentRef.extend({
  createdAt: z.coerce
    .date()
    .describe("The comment's `createdAt`, as returned by the list."),
})

export const deleteChannelPostCommentResponse = z.object({
  deletedMessageIds: z.array(z.string()),
})

/** The list filters a posts-list export (`kind: rows`) is selected by: the list request without paging. */
export const exportChannelPostRowsFilters =
  listChannelPostManagementRequest.omit({ cursor: true, limit: true })

/** The list filters that carry several values (repeated query keys in the export route). */
export const EXPORT_ROWS_ARRAY_KEYS = [
  "authorIds",
  "channels",
  "contentTypes",
  "inboxIds",
  "topicIds",
] as const

export const exportChannelPostCommentsRequest = z.object({
  filters: exportChannelPostRowsFilters
    .optional()
    .describe(
      `Only for \`kind: rows\`: the same filters and \`sort\` as \`channelPostManagement.list\` (without paging); the file takes the first ${MAX_EXPORT_POST_ROWS} matching posts of that order. Omit for every post that has comments. Not allowed with the other kinds.`,
    ),
  kind: z
    .enum(channelPostExportKinds)
    .describe(
      "`comments` writes every comment of the posts; `phones` writes one row per customer who left a phone number and needs permission to view phone numbers; `emails` writes one row per distinct email (the contact's, else the first address written in a comment) and needs the same permission; `rows` writes the post list itself, one row per post, for `filters`.",
    ),
  postIds: z
    .array(channelPostId)
    .min(1)
    .max(MAX_MERGE_VIEW_POSTS)
    .optional()
    .describe(
      `Required for \`comments\`, \`phones\` and \`emails\`: the posts to export (1-${MAX_MERGE_VIEW_POSTS}, no repeats). Get ids from \`channelPostManagement.list\`. Not allowed for \`rows\`.`,
    ),
  search: z
    .string()
    .trim()
    .min(1)
    .max(MAX_COMMENT_SEARCH_LENGTH)
    .optional()
    .describe(
      "Only comments whose text contains this, ignoring case. A caller who may not view phone numbers searches the text with numbers masked, so a number cannot be found by its digits.",
    ),
})

export const exportChannelPostCommentsResponse = z.object({
  csv: z
    .string()
    .describe(
      "The file content, UTF-8 CSV with a header row. Cells that start with a formula character are prefixed with a quote.",
    ),
  fileName: z.string(),
  rowCount: z.number().int().describe("Data rows in `csv`, header excluded."),
  truncated: z
    .boolean()
    .describe(
      `\`true\` when the file stops early: the posts have more than ${MAX_EXPORT_ROWS} comments (or the list more than ${MAX_EXPORT_POST_ROWS} posts for \`rows\`), or the export ran out of its time budget.`,
    ),
})

export const startChannelPostCommentExportRequest = z.object({
  kind: z
    .enum(channelPostCommentExportKinds)
    .describe(
      "`comments` writes every comment of the posts; `phones` writes one row per customer who left a phone number; `emails` writes one row per distinct email. The channel has no saved phone or email of a customer, so `phones` and `emails` hold only what customers typed in comments (the first value of each comment). `phones` and `emails` need permission to view phone numbers and emails.",
    ),
  postIds: z
    .array(channelPostId)
    .min(1)
    .max(MAX_MERGE_VIEW_POSTS)
    .describe(
      `The posts to read, 1-${MAX_MERGE_VIEW_POSTS}, no repeats. Get ids from \`channelPostManagement.list\`. Every post must be on a channel that can be read for its comments.`,
    ),
})

export const startChannelPostCommentExportResponse = z.object({
  fileId: z
    .string()
    .describe(
      "The export's id. Pass it to `channelPostManagement.getCommentExport`. When the same posts and kind are already being read, this is the running export's id.",
    ),
  status: fileStatuses.describe(
    "`pending` while the export runs (a start that joins a running export reports its current state).",
  ),
})

export const getChannelPostCommentExportRequest = z.object({
  fileId: zodBigintIdAsString().describe(
    "Export id returned by `channelPostManagement.startCommentExport`.",
  ),
})

export const channelPostCommentExportStatusResponse = z.object({
  downloadUrl: z
    .string()
    .nullable()
    .describe(
      "A signed link to the CSV, valid for 5 minutes, only once `status` is `uploaded`. Call again for a fresh link.",
    ),
  expectedRows: z
    .number()
    .int()
    .nullable()
    .describe(
      "A rough estimate from the posts' stored comment counts, never exact; `null` when unknown.",
    ),
  expiresAt: z
    .date()
    .describe("When the file is deleted (exports are kept for 7 days)."),
  failureReason: exportFailureReasons
    .nullable()
    .describe(
      "Why a `failed` export failed: `channelDisconnected` (reconnect the channel), `postNotFound` (a post was removed meanwhile), `notSupported`, `rateLimited` (try again later) or `failed`.",
    ),
  fileId: z.string(),
  fileName: z.string(),
  kind: z.enum(channelPostCommentExportKinds),
  rowCount: z
    .number()
    .int()
    .describe("Rows read so far; final once the export has settled."),
  status: fileStatuses.describe(
    "`pending` while reading, `uploaded` when the file is ready, `failed` otherwise.",
  ),
  truncated: z
    .boolean()
    .describe(
      "`true` when the export stopped at a safety limit (rows, time, pages or distinct values): the file is complete only up to that point.",
    ),
})

export type ChannelPostCommentExportStatus = z.infer<
  typeof channelPostCommentExportStatusResponse
>
