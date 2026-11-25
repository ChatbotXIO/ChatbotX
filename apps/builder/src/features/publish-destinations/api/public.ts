import { socialAccountOperations } from "@/features/social-accounts/lib/social-account-operations"
import { socialDestinationPublishingSettingsResource } from "@/features/social-accounts/schema"
import { postingScheduleOperations } from "@/features/social-posts/lib/posting-schedule-operations"
import {
  listFreeSlotsRequest,
  listFreeSlotsResponse,
  postingScheduleResource,
  updatePostingScheduleRequest,
  updatePostingScheduleResponse,
} from "@/features/social-posts/schema"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnChangingSocialPost,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnReadingSocialAccount,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { publishDestinationOperations } from "../lib/operations"
import {
  listPublishDestinationsRequest,
  listPublishDestinationsResponse,
  publishDestinationIdRequest,
  publishDestinationResource,
} from "../schema"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("posts")
const tags = ["Post destinations"]
const BASE = "/v1/posts/destinations"

/**
 * Where a post can be published: a connected Facebook Page, Instagram or
 * Threads inbox (published with the inbox's own token) or a TikTok login. The
 * list is registered before `/{id}` so the static path wins.
 */
export const publishDestinationsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: BASE,
      summary: "List post destinations",
      description:
        "Lists the destinations a post can target, grouped by network (`facebook`, `instagram`, `threads`, `tiktok`): every connected inbox of those channels plus the TikTok publishing accounts, each with its `state` (`ready` can publish; otherwise the channel must be reconnected from the Posts page), the permissions still missing and the content types the network accepts. Pass a destination's `id` — or its `inboxId` — as a target of `socialPosts.create`. Tokens are never returned. Filter with `providers` and `states`; disconnected inboxes are listed only when `states` includes `inboxDisconnected`. Reading creates the destinations of inboxes that have none yet.",
      tags,
    })
    .input(listPublishDestinationsRequest)
    .output(listPublishDestinationsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await publishDestinationOperations.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: `${BASE}/{id}`,
      summary: "Get post destination",
      description:
        "Returns one destination with its state and missing permissions. Get the id from `publishDestinations.list`.",
      tags,
    })
    .input(publishDestinationIdRequest)
    .output(publishDestinationResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await publishDestinationOperations.get({
          id: input.id,
          workspaceId: context.workspace.id,
        }),
    ),

  getPostingSlots: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: `${BASE}/{id}/posting-schedule`,
      summary: "Get posting schedule",
      description:
        "Returns the destination's posting schedule (its queue): seven weekdays (`0` = Sunday … `6` = Saturday), each `enabled` with its local `times` (`HH:mm`), in `timezone`. `configured: false` means none is set yet (every day off, in the workspace's zone). Get ids from `publishDestinations.list`.",
      tags,
    })
    .input(publishDestinationIdRequest)
    .output(postingScheduleResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await postingScheduleOperations.get(context.workspace.id, input),
    ),

  updatePostingSlots: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: `${BASE}/{id}/posting-schedule`,
      spec: mcpSpec({ hitlPolicy: "confirm_diff" }),
      summary: "Set posting schedule",
      description:
        'Replaces the destination\'s posting schedule (and its time zone) and re-seats the posts waiting in its queue in the same step, all or nothing: a queued post keeps its time when that time is still a posting time (after a zone change: the same local time in the new zone), otherwise it takes the next free posting time, and one left with no posting time stops being queued but keeps its time (listed in `reflow.detached`). A post about to publish is not touched. Send all seven weekdays; at most 10 times a day. Not allowed in a workspace whose plan has expired. Example: `{"timezone":"Asia/Ho_Chi_Minh","slots":[{"weekday":0,"enabled":false,"times":[]},{"weekday":1,"enabled":true,"times":["09:00","18:30"]}, … ]}`.',
      tags,
    })
    .input(updatePostingScheduleRequest)
    .output(updatePostingScheduleResponse)
    .errors(possibleErrorsOnChangingSocialPost)
    .handler(
      async ({ context, input }) =>
        await postingScheduleOperations.update(context.workspace, input),
    ),

  listFreeSlots: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: `${BASE}/{id}/free-slots`,
      summary: "List free posting times",
      description:
        'Lists the next free posting times of the destination\'s queue, as `queue: "next"` would assign them: after `after` (default now, and at least 2 minutes ahead), skipping times a queued post holds, within one year. Empty when no schedule is set. It does not reserve anything.',
      tags,
    })
    .input(listFreeSlotsRequest)
    .output(listFreeSlotsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await postingScheduleOperations.freeSlots(context.workspace.id, input),
    ),

  getPublishingSettings: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: `${BASE}/{id}/publishing-settings`,
      summary: "Get destination publishing settings",
      description:
        "Reads, live from the platform, what a destination's account allows right now. TikTok only: the creator's nickname, the privacy levels it may choose from (`privacyLevelOptions`, the only valid values of `options.privacyLevel`; TikTok allows no default), which of comments, duets and stitches the creator disabled, the longest video, and `canPostNow`. TikTok requires this before a post is composed and again before it is published; `socialPosts.validate` rejects a privacy level outside this list. Other networks answer 422 `publishingSettingsNotSupported`. Limited by TikTok to 20 reads per minute per account.",
      tags,
    })
    .input(publishDestinationIdRequest)
    .output(socialDestinationPublishingSettingsResource)
    .errors(possibleErrorsOnReadingSocialAccount)
    .handler(
      async ({ context, input }) =>
        await socialAccountOperations.publishingSettings({
          destinationId: input.id,
          workspaceId: context.workspace.id,
        }),
    ),
}
