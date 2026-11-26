import { z } from "zod"

// The content-type and live-status vocabulary is shared with the channel SDK,
// which cannot depend on this package, so it lives in `@chatbotx.io/utils`.
export {
  type ChannelPostContentType,
  type ChannelPostLiveStatus,
  channelPostContentTypes,
  channelPostLiveStatuses,
} from "@chatbotx.io/utils/channel-post"

/**
 * How the management list is ordered. Every value has a matching index on
 * `ChannelPost` (see the schema), so each order is served without a Sort node.
 */
export const channelPostManagementSorts = z.enum([
  "newest",
  "mostComments",
  "fewestComments",
  "mostPhones",
  "fewestPhones",
  "mostEngagement",
  "leastEngagement",
  "mostShares",
  "fewestShares",
])
export type ChannelPostManagementSort = z.infer<
  typeof channelPostManagementSorts
>

/**
 * Where a channel's post sync stands. `idle` waits for `nextSyncAt`, `queued`
 * has a job on its way, `running` is claimed by one worker, `failed` waits for
 * a person (a re-authorisation or a manual refresh).
 */
export const channelPostSyncStatuses = z.enum([
  "idle",
  "queued",
  "running",
  "failed",
])
export type ChannelPostSyncStatus = z.infer<typeof channelPostSyncStatuses>

/**
 * `lastErrorCategory` of a sync that stopped because its inbox has no
 * integration (not connected). The row is `idle` with no next time, not
 * `failed`: nothing retries it until a new sync request.
 */
export const CHANNEL_POST_SYNC_NOT_CONNECTED = "notConnected"
