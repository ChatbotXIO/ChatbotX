import {
  possibleErrorsOnChangingPostFeed,
  possibleErrorsOnCreatingPostFeed,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingPostFeed,
  possibleErrorsOnPreviewingPostFeed,
  possibleErrorsOnReadingPostFeedItem,
  possibleErrorsOnTestingPostFeed,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  POST_FEED_BULK_DELETE_TOKEN_PATH,
  POST_FEED_PAUSE_TOKEN_PATH,
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

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("posts")
const tags = ["Posts"]

/** RSS/Atom feeds that turn new items into drafts or queued posts. */
export const postFeedsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-feeds",
      summary: "List post feeds",
      description:
        "Lists the workspace's RSS/Atom feeds (at most 20) with their status, last check and last error code. Narrow the list with `search` (name or address), `status`, `mode` and `destinationIds`. A feed with `primed: false` has not been checked yet: its first check only records the items the feed already has, no post is made from them.",
      tags,
    })
    .input(listPostFeedsRequest)
    .output(listPostFeedsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.list(context.workspace.id, input),
    ),

  preview: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/post-feeds/preview",
      summary: "Preview post feed",
      description:
        'Fetches a feed address and returns its first 5 items as they would be read, without storing anything: title, link, summary, author, categories and every raw field (`fields`, keys readable in a template as `raw["key"]`). Give a draft `textTemplate` (and optionally `templatesByProvider`, `postAs`, `mediaMode`, `mediaField`, `fetchArticleImage`, `filters`, `destinationIds`) to get, per item, `render`: the rendered text with its characters per network and problems (per network: `text`, and `providerTexts` for the networks that have their own template), the pictures it could use, the destinations left out and whether the filters drop it, or `templateProblem` with `line` and `column`. Advisory: nothing is downloaded and the worker checks every post again at creation. Use it to iterate before `postFeeds.create`. Limited to 10 per hour per workspace (429 `feedPreviewRateLimited`). An address that is not a feed answers 422 `feedNotParseable` (with `data.suggestedUrl` when an HTML page advertises one) or `feedUnreachable`. The address must be a public http(s) feed of at most 2 MB. Not allowed in a workspace whose plan has expired.',
      tags,
    })
    .input(previewPostFeedRequest)
    .output(previewPostFeedResponse)
    .errors(possibleErrorsOnPreviewingPostFeed)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.preview(context.workspace, input),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/post-feeds",
      summary: "Create post feed",
      description:
        "Registers a feed. It is checked every `intervalMinutes` (at least 15); the first check only records the items the feed already has. New items become drafts (`mode: draft`, default) or are queued on each destination's posting schedule (`mode: queue`, no review). A workspace can have at most 20 feeds, a feed creates at most 10 posts per day. 409 `feedUrlTaken` when the address is already registered. The address is fetched and parsed first: 422 `feedNotParseable` (not an RSS or Atom feed; `data.suggestedUrl` names the feed an HTML page advertises, when it does) or 422 `feedUnreachable`, and nothing is stored. A feed whose checks fail 5 times in a row gets `status: error` and is not checked until `postFeeds.resume`. Not allowed in a workspace whose plan has expired.",
      successStatus: 201,
      tags,
    })
    .input(createPostFeedRequest)
    .output(postFeedResource)
    .errors(possibleErrorsOnCreatingPostFeed)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.create(context.workspace, null, input),
    ),

  bulkDelete: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: POST_FEED_BULK_DELETE_TOKEN_PATH,
      summary: "Delete post feeds in bulk",
      description:
        "Deletes up to 100 feeds and their item history in one call. Posts already made from them stay. Ids that are not feeds of this workspace come back in `notFoundIds`; the rest are in `deletedIds`. Get the ids from `postFeeds.list`.",
      tags,
    })
    .input(bulkDeletePostFeedsRequest)
    .output(bulkDeletePostFeedsResponse)
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.bulkDelete(context.workspace.id, input.ids),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-feeds/{id}",
      summary: "Get post feed",
      description: "Returns one feed. Get the id from `postFeeds.list`.",
      tags,
    })
    .input(postFeedIdRequest)
    .output(postFeedResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.get(context.workspace.id, input.id),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/post-feeds/{id}",
      summary: "Update post feed",
      description:
        "Changes a feed's address, label, destinations, interval, mode, text template or limits. Posts already made are not changed. A changed address is fetched and parsed first (422 `feedNotParseable` / `feedUnreachable`, nothing stored). Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(updatePostFeedRequest)
    .output(postFeedResource)
    .errors(possibleErrorsOnMutatingPostFeed)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.update(context.workspace, input),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/post-feeds/{id}",
      summary: "Delete post feed",
      description:
        "Deletes a feed and its item history. Posts already made from it stay. Get the id from `postFeeds.list`.",
      successStatus: 204,
      tags,
    })
    .input(postFeedIdRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await postFeedOperations.delete(context.workspace.id, input.id)
    }),

  pause: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: POST_FEED_PAUSE_TOKEN_PATH,
      summary: "Pause post feed",
      description:
        "Stops checking a feed; nothing is lost, items published meanwhile are picked up after `postFeeds.resume` (within 7 days).",
      tags,
    })
    .input(postFeedIdRequest)
    .output(postFeedResource)
    .errors(possibleErrorsOnChangingPostFeed)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.pause(context.workspace.id, input.id),
    ),

  resume: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/post-feeds/{id}/resume",
      summary: "Resume post feed",
      description:
        "Resumes a paused feed, or one the system parked in status `error` after 5 failed checks in a row; it is checked within a minute. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(postFeedIdRequest)
    .output(postFeedResource)
    .errors(possibleErrorsOnChangingPostFeed)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.resume(context.workspace, input.id),
    ),

  check: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/post-feeds/{id}/check",
      summary: "Check post feed now",
      description:
        "Asks the worker to check an active feed right away; the result shows in `postFeeds.listItems` and the feed's `lastCheckedAt` within moments. At most once every 5 minutes per feed (409 `feedCheckCooldown`); 409 `feedCheckInProgress` when a check of the feed is already waiting or running (the cool-down is not used); 409 `feedNotActive` for a paused feed. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(postFeedIdRequest)
    .output(postFeedResource)
    .errors(possibleErrorsOnChangingPostFeed)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.checkNow(context.workspace, input.id),
    ),

  listItems: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-feeds/{id}/items",
      summary: "List post feed items",
      description:
        "Lists the items a feed has been checked for, newest first, each with what happened to it (`outcome`) and, when a post was made, its `socialPostId` (open it with `socialPosts.get`). Page with `nextCursor`.",
      tags,
    })
    .input(listPostFeedItemsRequest)
    .output(listPostFeedItemsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.listItems(context.workspace.id, input),
    ),

  test: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/post-feeds/{id}/test",
      summary: "Send test post from feed",
      description:
        "Builds a post from the feed's newest item exactly as the feed would (text template or AI writing, signature, destinations) and saves it as a DRAFT. It is never published or queued and the item ledger is not touched, so the item still becomes its normal post at the next check. Returns the draft's `socialPostId`. Limited to 10 per hour per workspace (429 `feedTestRateLimited`); 422 `feedHasNoItems` for an empty feed, `feedNotParseable` / `feedUnreachable` when the feed cannot be read now. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(postFeedIdRequest)
    .output(sendPostFeedTestResponse)
    .errors(possibleErrorsOnTestingPostFeed)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.sendTest(context.workspace, null, input.id),
    ),

  itemDraftContent: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/post-feeds/{id}/items/{itemId}/draft-content",
      summary: "Get feed item post content",
      description:
        "Returns what a post made by hand from one feed item would start with: the feed's text template applied to the item (no AI, nothing is spent), its link and its picture. Create the post with `socialPosts.create` (`text`, `linkUrl`, and the picture as a `media` file with `url`). The item is read again from the feed; one that has left the feed keeps only its stored title and link. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(postFeedItemIdRequest)
    .output(postFeedItemDraftContentResponse)
    .errors(possibleErrorsOnReadingPostFeedItem)
    .handler(
      async ({ context, input }) =>
        await postFeedOperations.itemDraftContent(context.workspace, input),
    ),
}
