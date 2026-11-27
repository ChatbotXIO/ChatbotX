import {
  channelPostMetricsRefreshService,
  channelPostSyncService,
  emitSocialPostChanged,
} from "@chatbotx.io/business"
import type { ChannelPostListItem } from "@chatbotx.io/sdk"
import type { LowJobRefreshChannelPostMetrics } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import { resolvePostIntegration } from "./resolve-post-integration"

/**
 * The realtime event the open Posts pages already refetch on. It names no
 * composed post: the page only needs to know the list changed.
 */
const METRICS_REFRESHED_STATUS = "metricsRefreshed"

/**
 * A metrics read as the item the fenced write takes: only the counts are set,
 * every other field is `null`, which the upsert reads as "keep the stored one".
 */
const toListItem = (item: {
  commentsCount: number | null
  externalPostId: string
  reactionsCount: number | null
  sharesCount: number | null
  viewsCount: number | null
}): ChannelPostListItem => ({
  authorExternalId: null,
  authorName: null,
  caption: null,
  commentsCount: item.commentsCount,
  contentType: null,
  externalPostId: item.externalPostId,
  liveStatus: null,
  mediaType: null,
  permalink: null,
  publishedAt: null,
  reactionsCount: item.reactionsCount,
  sharesCount: item.sharesCount,
  thumbnailUrl: null,
  viewsCount: item.viewsCount,
})

/**
 * Reads the counts of several posts of one inbox in one channel call and
 * writes them through the same fenced path as the sync and the single-post
 * refresh (`recordPage`: observation-time guard, known mask, engagement and
 * the daily snapshot). A post the channel did not answer for keeps its counts
 * and is never marked removed. Never throws and never retries: any failure
 * (auth, rate limit, network) is logged and the next view of the page asks
 * again.
 */
export async function refreshChannelPostMetrics(
  data: LowJobRefreshChannelPostMetrics["data"],
): Promise<void> {
  try {
    const targets = await channelPostMetricsRefreshService.findRefreshTargets({
      channelPostIds: data.channelPostIds,
      inboxId: data.inboxId,
      workspaceId: data.workspaceId,
    })
    const first = targets[0]
    if (!first) {
      return
    }
    const resolved = await resolvePostIntegration({
      channel: first.channel,
      inboxId: data.inboxId,
      workspaceId: data.workspaceId,
    })
    const { channel, ctx, integration, integrationId, sourceAccountId } =
      resolved
    if (!integration.hasChannelHandler("post", "getPostsMetrics")) {
      return
    }
    // Taken before the read, like every other writer, so a slow read is never
    // mistaken for a newer observation.
    const observedAt = new Date()
    const items = await integration.runChannelHandler(
      "post",
      "getPostsMetrics",
      {
        ctx,
        data: { postIds: targets.map((target) => target.externalPostId) },
      },
    )
    if (items.length === 0) {
      return
    }
    await channelPostSyncService.recordPage({
      channel,
      inboxId: data.inboxId,
      integrationId,
      items: items.map(toListItem),
      mode: "metricsOnly",
      observedAt,
      sourceAccountId,
      thumbnailDeadline: Date.now(),
      timezone: await channelPostSyncService.workspaceTimezone(
        data.workspaceId,
      ),
      workspaceId: data.workspaceId,
    })
    await emitSocialPostChanged({
      socialPostId: "",
      status: METRICS_REFRESHED_STATUS,
      workspaceId: data.workspaceId,
    })
  } catch (err) {
    logger.warn(
      { err, inboxId: data.inboxId, workspaceId: data.workspaceId },
      "channel-post-sync: refreshing post counts failed",
    )
  }
}
