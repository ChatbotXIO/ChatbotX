import { postAnalyticsOperations } from "@/features/post-analytics/lib/operations"
import {
  socialPostMetricsRequest,
  socialPostMetricsResponse,
} from "@/features/post-analytics/schema"
import {
  possibleErrorsOnChangingSocialPost,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  SOCIAL_POST_PREVIEW_TOKEN_PATH,
  SOCIAL_POST_RECURRENCE_PAUSE_TOKEN_PATH,
  SOCIAL_POST_UNSCHEDULE_TOKEN_PATH,
  SOCIAL_POST_VALIDATE_TOKEN_PATH,
} from "../lib/api-paths"
import { socialPostOperations } from "../lib/social-post-operations"
import {
  countSocialPostsRequest,
  countSocialPostsResponse,
  createSocialPostRequest,
  deleteSocialPostQueryRequest,
  deleteSocialPostResponse,
  listSocialPostContentTypesResponse,
  listSocialPostOccurrencesRequest,
  listSocialPostOccurrencesResponse,
  listSocialPostsRequest,
  listSocialPostsResponse,
  previewSocialPostRequest,
  previewSocialPostResponse,
  rescheduleSocialPostRequest,
  resolveSocialPostTargetRequest,
  setSocialPostOccurrencesSkippedRequest,
  setSocialPostRecurrenceRequest,
  socialPostIdRequest,
  socialPostRecurrenceResource,
  socialPostResource,
  socialPostTargetIdRequest,
  unscheduleSocialPostRequest,
  updateSocialPostRequest,
  validateSocialPostRequest,
  validateSocialPostResponse,
} from "../schema"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("posts")
const tags = ["Posts"]
/** A token has no member: the post records only that the API made it. */
const apiAuthor = { createdById: null, createdVia: "api" } as const

/**
 * Posts composed in ChatbotX for the connected social accounts. Static paths
 * (`validate`, `preview`, `content-types`) are registered before `/{id}`.
 */
export const socialPostsPublicRouter = {
  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts",
      summary: "Create post",
      description:
        'Creates a draft to publish on one or more destinations (`publishDestinations.list`): Facebook Pages, Instagram and Threads publish with their connected inbox, TikTok with its publishing login. Name each target with exactly one of `destinationId` or `inboxId` (the destination of the inbox is created when missing). Give the shared `text`, `linkUrl` and `media` (a Media Library file id or a public URL to import), and per destination an optional `contentType`, `text`, `media` override and `options`. `publish: "draft"` (default) saves a draft; `publish: "now"` saves and publishes every destination at once, refusing the whole post (422 `socialPostContentInvalid`, every issue listed) when any destination cannot publish it as composed. To schedule, give `scheduledAt` (ISO 8601 with an offset, at least 2 minutes ahead, within one year; optional `timezone`, default the workspace\'s), or `queue: "next" | "top"` / `publish: "queue"` to take a posting time from each destination\'s queue (set it with `publishDestinations.updatePostingSlots`), or a `scheduledAt` per target; the post becomes `scheduled` and each destination publishes at its time (late by up to 6 hours: published late; later: `failed` with `missedSchedule`). The post and all its children are written in one transaction. Send `idempotencyKey` to make the call safe to repeat: the same key and request return the post already made, a different request answers 409 `socialPostKeyConflict`. Check content against each network with `socialPosts.validate` first. Not allowed in a workspace whose plan has expired. Example: `{"text":"Sale starts today","targets":[{"inboxId":"123"}],"idempotencyKey":"sale-2026-11-23"}`. Publishing consumes 1 message of the account\'s message quota per destination published (parts and first comment included); with `publish: "now"` answers 429 `postMessageQuotaExceeded` when none is left, creating nothing. Scheduling consumes none.',
      successStatus: 201,
      tags,
    })
    .input(createSocialPostRequest)
    .output(socialPostResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.create(context.workspace, apiAuthor, input),
    ),

  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/posts",
      summary: "List posts",
      description:
        "Lists composed posts, newest first by creation, with their destinations, files, topics, `scheduledAt` (the earliest destination time) and per destination `scheduledAt`, `queueSlotAt` and `timezone`. Filter by network (`providers`), destination (`destinationIds`) or inbox (`inboxIds`), state (`statuses`) or group (`bucket`, as counted by `socialPosts.counts`), topic, text, or time: `from` / `to` (UTC instants) keep posts with a destination scheduled or published in the range, as a calendar needs. Page with `nextCursor`.",
      tags,
    })
    .input(listSocialPostsRequest)
    .output(listSocialPostsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.list(context.workspace.id, input),
    ),

  counts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/posts/counts",
      summary: "Count posts by state",
      description:
        "Counts the workspace's posts per group in one call: `drafts`, `scheduled` (scheduled or being published), `published`, `needsAttention` (failed, partially published, or a destination that failed or needs review) and `all` (every post, cancelled ones included). A post is in exactly one group, so `socialPosts.list` with `bucket` set to a group returns the posts counted here. Narrow by network (`providers`), destination (`destinationIds`) or inbox (`inboxIds`).",
      tags,
    })
    .input(countSocialPostsRequest)
    .output(countSocialPostsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.counts(context.workspace.id, input),
    ),

  validate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: SOCIAL_POST_VALIDATE_TOKEN_PATH,
      summary: "Validate post",
      description:
        "Checks a post as composed against every destination's network rules without saving it: text length, file count, formats and sizes, links, settings, and whether each destination can publish (account connected, page still listed). Returns every issue at once as `[{targetIndex, destinationId, field, code, message}]` and `valid`. A file given by URL is checked only by its extension here; its real type and size are checked when it is imported.",
      tags,
    })
    .input(validateSocialPostRequest)
    .output(validateSocialPostResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.validate(context.workspace.id, input),
    ),

  preview: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: SOCIAL_POST_PREVIEW_TOKEN_PATH,
      summary: "Preview post",
      description:
        "Returns, for each destination, the normalised content that would be published: the effective text with its character count and the network's limit, the link, the number of files, the settings with defaults applied, and the same issues as `socialPosts.validate`. It does not render the post and writes nothing.",
      tags,
    })
    .input(previewSocialPostRequest)
    .output(previewSocialPostResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.preview(context.workspace.id, input),
    ),

  contentTypes: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/posts/content-types",
      summary: "List post content types",
      description:
        "Lists, per network, the content types it accepts (text, link, image, video, reel, carousel, story), the file limits of each (count, formats, size, duration), the text limit, whether a link is allowed, the per-type settings (`optionFields`) and the network's daily post limit. A limit the platform does not document is `null`.",
      tags,
    })
    .output(listSocialPostContentTypesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(() => socialPostOperations.contentTypes()),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/posts/{id}",
      summary: "Get post",
      description:
        "Returns one post with its destinations (each with its own content, files, schedule and result), shared files and topics. Get the id from `socialPosts.list`.",
      tags,
    })
    .input(socialPostIdRequest)
    .output(socialPostResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.get(context.workspace.id, input.id),
    ),

  getMetrics: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/posts/{id}/metrics",
      summary: "Get composed post metrics",
      description:
        "Metrics over time of a composed post, one entry per destination: `available: true` with the same `metrics` as `channelPostManagement.getMetrics` once the destination's published post is linked to its channel post, otherwise `available: false` with a `reason` (`notPublished`, `notLinked`: not matched to a post of an inbox yet, `networkNotSupported`: no post list for that network, `removed`). `from`/`to` are workspace-local days (default last 30, at most 366). Get the id from `socialPosts.list`.",
      tags,
    })
    .input(socialPostMetricsRequest)
    .output(socialPostMetricsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await postAnalyticsOperations.socialPostMetrics(
          context.workspace.id,
          input,
        ),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/posts/{id}",
      summary: "Update post",
      description:
        'Changes a draft or scheduled post. `targets`, when given, is the complete new set of destinations (one added to a scheduled post takes the time of its earliest waiting destination); `media` replaces the shared files; `topicIds` replaces the topics; `scheduledAt` / `queue` / `timezone` schedule it as in `socialPosts.create`. Anything omitted is kept. A post that is publishing or already published, or any of whose destinations is already publishing or done, answers 409 `socialPostNotEditable`. Not allowed in a workspace whose plan has expired. With `publish: "now"`, publishing consumes 1 message of the account\'s message quota per destination published; answers 429 `postMessageQuotaExceeded` when none is left.',
      tags,
    })
    .input(updateSocialPostRequest)
    .output(socialPostResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.update(context.workspace, input),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/posts/{id}",
      summary: "Delete post",
      description:
        "Deletes a draft with its destinations, files and topic links. A scheduled post is cancelled instead: its waiting destinations become `cancelled`, their queue times are freed, and the post stays as history. Any other post answers 409 `socialPostNotDeletable`. Allowed in a workspace whose plan has expired. With the query parameter `removeFromChannels=true` it instead asks every published destination to be taken down from its network (Facebook, Threads and Instagram connected through Facebook Login, which needs the `instagram_manage_contents` permission so an existing connection reconnects once; Instagram Login and TikTok answer `unsupported`): the response lists `queued` / `removed` / `unsupported` / `notPublished` per destination, a worker does the removal, and `removedAt` (or the destination's error fields) tell the result. Repeating it is safe. A post with nothing published answers 409 `socialPostNotRemovable`; a workspace whose plan has expired is refused (402).",
      inputStructure: "detailed",
      successStatus: 200,
      tags,
    })
    .input(deleteSocialPostQueryRequest)
    .output(deleteSocialPostResponse)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.delete(context.workspace, {
          id: input.params.id,
          removeFromChannels: input.query.removeFromChannels,
        }),
    ),

  duplicate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/{id}/duplicate",
      summary: "Duplicate post",
      description:
        "Creates a new draft with the same text, link, destinations (content type, settings, text overrides), files and topics. Schedules and results are not copied. Not allowed in a workspace whose plan has expired.",
      successStatus: 201,
      tags,
    })
    .input(socialPostIdRequest)
    .output(socialPostResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.duplicate(
          context.workspace,
          apiAuthor,
          input.id,
        ),
    ),

  publish: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/{id}/publish",
      summary: "Publish post now",
      description:
        "Publishes a draft or scheduled post on every destination now. Each destination becomes `pending` and a worker publishes it within seconds: poll `socialPosts.get` until each `targets[].status` is `published` (with `externalPostId` and `permalink`), `failed` (with `errorCategory`/`errorCode`/`errorMessage`), or `needsReview`. Instagram and Threads pass through `processing` while the network prepares the files. The post is refused whole (422 `socialPostContentInvalid`) when any destination cannot publish it as composed (check with `socialPosts.validate`). A post already publishing or published answers 409 `socialPostNotPublishable`. A request that fails before the network is reached is retried automatically (up to 5 attempts); so is a direct Facebook publish (text, link, photo, multi-photo, photo story, or a feed video that never returned its id) whose result is unknown (timeout, lost response, crashed worker), because it leaves nothing on the network to check: the page may then receive the post twice. A publish that created an upload or container on the network (Instagram, Threads, TikTok, Facebook video or reel) whose final call may have created the post is never repeated automatically and waits in `needsReview`. Publishing is paced: two posts on one destination start at least 5 to 15 minutes apart (Instagram 10, TikTok 15), a destination over its daily limit waits (the target stays `pending`, never fails), a network rate limit is retried after 1 h, 2 h and 4 h without spending an attempt and then fails with `errorCode` `publishRateLimitExhausted`, and a destination the network keeps limiting is paused (`pausedUntil` / `pauseReason` on `publishDestinations.list`); its due posts wait and publish after the pause. Not allowed in a workspace whose plan has expired. Publishing consumes 1 message of the account's message quota per destination published (parts and first comment included); answers 429 `postMessageQuotaExceeded` when none is left. A scheduled post that reaches its time with no message left fails that destination with `postMessageQuotaExceeded`; retry it after a top-up.",
      tags,
    })
    .input(socialPostIdRequest)
    .output(socialPostResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.publish(context.workspace, input.id),
    ),

  reschedule: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/{id}/reschedule",
      summary: "Reschedule post",
      description:
        'Moves the waiting destinations of a post (one with `targetId`, else all of them). Give exactly one of: `scheduledAt` (ISO 8601 with an offset, at least 2 minutes ahead, within one year; optional `timezone`), `queue` (`"next"` takes the destination\'s next free posting time, `"top"` the first one and pushes the queued posts one time later; needs the destination\'s posting schedule), `timezone` alone (keeps the wall-clock time in the new zone) or `unschedule: true` (back to a draft). All or nothing: a destination that is publishing, was already tried, or is due within a minute refuses the call with 409 `socialPostTargetNotReschedulable`. A post that is not waiting answers the same. The content must still pass `socialPosts.validate` (422 `socialPostContentInvalid`). `unschedule: true` is refused in a workspace whose plan has expired like every other change here: use `socialPosts.unschedule`, which stays allowed.',
      tags,
    })
    .input(rescheduleSocialPostRequest)
    .output(socialPostResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.reschedule(context.workspace, input),
    ),

  unschedule: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: SOCIAL_POST_UNSCHEDULE_TOKEN_PATH,
      summary: "Unschedule post",
      description:
        "Takes the waiting destinations of a post (one with `targetId`, else all of them) out of the schedule and queue: the post goes back to a draft. All or nothing, with the same 409 `socialPostTargetNotReschedulable` refusals as `socialPosts.reschedule`. Repeating the call on a post that is already a draft returns it unchanged. Allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(unscheduleSocialPostRequest)
    .output(socialPostResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.unschedule(context.workspace, input),
    ),

  retryTarget: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/{id}/targets/{targetId}/retry",
      summary: "Retry post target",
      description:
        "Publishes one destination again: for a `failed` target, or a `needsReview` one when you accept the risk of a second post on the network. The attempt count restarts. When the destination's first post is already published and a follow-up part failed or needs review, only that part is retried (the first post is never posted again; `partId` is optional and must name that part, else 409 `socialPostPartNotResumable`). Any other state answers 409 `socialPostTargetNotRetryable`. Not allowed in a workspace whose plan has expired. Publishing again consumes 1 message of the account's message quota when the destination is published; answers 429 `postMessageQuotaExceeded` when none is left.",
      tags,
    })
    .input(socialPostTargetIdRequest)
    .output(socialPostResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.retryTarget(context.workspace, input),
    ),

  removeTarget: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/{id}/targets/{targetId}/remove",
      summary: "Remove post target from its network",
      description:
        "Takes one published destination down from its network and leaves the other destinations of the post published; call it once per destination to remove several (`socialPosts.delete` with `removeFromChannels=true` removes every destination at once). Same rules and answer as that call, narrowed to the one destination: `removal.targets` has one entry, `queued` (a worker removes it; `removedAt` or the destination's error fields tell the result), `removed` (already gone), `unsupported` (the network or login offers no delete, so it stays published) or `notPublished` (answers 409 `socialPostNotRemovable`, nothing is on the network). A `targetId` that is not a destination of the post answers 404. Repeating it is safe. A workspace whose plan has expired is refused (402).",
      successStatus: 200,
      tags,
    })
    .input(socialPostTargetIdRequest)
    .output(deleteSocialPostResponse)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.removeTarget(context.workspace, input),
    ),

  resolveTarget: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/{id}/targets/{targetId}/resolve",
      summary: "Resolve post target waiting for review",
      description:
        'Settles a `needsReview` target (the request was sent but the result was not confirmed). `outcome: "published"`: you saw the post on the network, mark it published. `outcome: "retry"`: it is not there, publish again. For a destination whose first post is published, both act on its first part that is not published; `published` for a destination whose first post is itself unconfirmed and that has parts answers 409 `socialPostHeadUnconfirmed`. Any other state answers 409 `socialPostTargetNotReviewable`. Not allowed in a workspace whose plan has expired. `outcome: "retry"` consumes 1 message once the destination is published and answers 429 `postMessageQuotaExceeded` when none is left; `published` consumes 1 message too (the destination is on the network).',
      tags,
    })
    .input(resolveSocialPostTargetRequest)
    .output(socialPostResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.resolveTarget(context.workspace, input),
    ),

  setRecurrence: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/posts/{id}/recurrence",
      summary: "Set post repeat rule",
      description:
        "Makes a draft post repeat. The post becomes the series' template: it stays a draft and is never published itself; at each run of the rule (`frequency` daily, weekly with `weekdays`, or monthly with `monthDay`, every `interval`, at `timeOfDay` in `timezone`, from `startsOn`, until `end`) a copy with the same text, link, destinations, files and topics is made and scheduled for that time, and published like any scheduled post. Runs before now are not made up, and a run more than about 6 hours late (the system was not running) is recorded as `missed` instead. Replacing the rule of a running series starts a new count. Changes to the template apply only to copies not made yet; editing or cancelling one copy affects only that copy. List the history with `socialPosts.listOccurrences`. Only a draft that is not itself a copy can repeat (409 `socialPostNotRecurrable`); the content must still be publishable on every destination. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(setSocialPostRecurrenceRequest)
    .output(socialPostRecurrenceResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.setRecurrence(context.workspace, input),
    ),

  endRecurrence: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/posts/{id}/recurrence",
      summary: "End post repeat series",
      description:
        "Ends the series for good: no more copies are made. The copies already made, and the template, stay (the template is a draft you can delete or give a new rule with `socialPosts.setRecurrence`). Ending an ended series changes nothing. Allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(socialPostIdRequest)
    .output(socialPostRecurrenceResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.endRecurrence(context.workspace.id, input),
    ),

  pauseRecurrence: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: SOCIAL_POST_RECURRENCE_PAUSE_TOKEN_PATH,
      summary: "Pause post repeat series",
      description:
        "Stops making copies until `socialPosts.resumeRecurrence`. The runs that fall during the pause are not made up. Pausing a paused series changes nothing; an ended series answers 409 `socialPostRecurrenceEnded`. Allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(socialPostIdRequest)
    .output(socialPostRecurrenceResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.pauseRecurrence(context.workspace.id, input),
    ),

  resumeRecurrence: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/{id}/recurrence/resume",
      summary: "Resume post repeat series",
      description:
        "Starts a paused series again from its next run after now. Resuming a series that is not paused changes nothing; an ended series answers 409 `socialPostRecurrenceEnded`. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(socialPostIdRequest)
    .output(socialPostRecurrenceResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.resumeRecurrence(context.workspace, input),
    ),

  listOccurrences: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/posts/{id}/recurrence/occurrences",
      summary: "List post repeat runs",
      description:
        "Lists the runs of a repeating post's series, newest first, each with what happened to it: `created` (a copy was scheduled: `socialPostId` and its current `postStatus`; open it with `socialPosts.get`), `excluded` (a date skipped with `socialPosts.skipOccurrences`), `missed` (more than about 6 hours late, nothing made) or `skipped` (the template could not be published as it stood). Page with `nextCursor`. Upcoming runs are in `recurrence.upcoming` of `socialPosts.get`.",
      tags,
    })
    .input(listSocialPostOccurrencesRequest)
    .output(listSocialPostOccurrencesResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.listOccurrences(context.workspace.id, input),
    ),

  skipOccurrences: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/{id}/recurrence/occurrences/skip",
      summary: "Skip post repeat runs",
      description:
        "Skips the runs on local `dates` (`YYYY-MM-DD` in the rule's time zone, from `recurrence.upcoming[].date`), for a holiday for instance, without pausing the series: the series keeps running and each skipped run is recorded as `excluded`. All dates change together or none does: 422 when a date has no run, 409 `socialPostOccurrenceSettled` when a run on it already happened. Skipping a skipped date changes nothing. Undo with `socialPosts.restoreOccurrences`. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(setSocialPostOccurrencesSkippedRequest)
    .output(socialPostRecurrenceResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.skipOccurrences(context.workspace, input),
    ),

  restoreOccurrences: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/posts/{id}/recurrence/occurrences/restore",
      summary: "Restore skipped post repeat runs",
      description:
        "Undoes `socialPosts.skipOccurrences` for the local `dates`: those runs happen again. 409 `socialPostOccurrenceSettled` when a run on one of them was already settled (nothing is changed then). Restoring a date that is not skipped changes nothing. Not allowed in a workspace whose plan has expired.",
      tags,
    })
    .input(setSocialPostOccurrencesSkippedRequest)
    .output(socialPostRecurrenceResource)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await socialPostOperations.restoreOccurrences(context.workspace, input),
    ),
}
