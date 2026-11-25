import {
  channelPostService,
  channelPostSyncService,
  emitSocialPostChanged,
} from "@chatbotx.io/business"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import type { LowJobRefreshChannelPost } from "@chatbotx.io/worker-config"
import { logger } from "../lib/logger"
import { resolvePostIntegration } from "./resolve-post-integration"

/**
 * Sets the post's stored phone-comment count from its comments. A failure is
 * logged and does not stop the refresh.
 */
async function reconcilePhoneCount(
  data: LowJobRefreshChannelPost["data"],
): Promise<void> {
  try {
    const result = await channelPostSyncService.reconcilePhoneCount({
      id: data.channelPostId,
      workspaceId: data.workspaceId,
    })
    if (result.repaired) {
      logger.info(
        { channelPostId: data.channelPostId, count: result.count },
        "channel-post-sync: repaired the phone-comment count",
      )
    }
  } catch (err) {
    logger.warn(
      { err, channelPostId: data.channelPostId },
      "channel-post-sync: repairing the phone-comment count failed",
    )
  }
}

type PostRefreshTarget = NonNullable<
  Awaited<ReturnType<typeof channelPostSyncService.findPostRefreshTarget>>
>

/**
 * A post stored as live is asked whether its broadcast is still on, so a missed
 * end event still ends it. An answer of `live` or `ended` is recorded as a
 * re-read; one that cannot tell (or a failed read) leaves the status alone (the
 * scan that queued this job already moved the next re-read ahead). A failure
 * never stops the rest of the refresh.
 */
async function reconcileLiveState(
  data: LowJobRefreshChannelPost["data"],
  target: PostRefreshTarget,
  resolved: Awaited<ReturnType<typeof resolvePostIntegration>>,
): Promise<void> {
  if (
    target.liveStatus !== "live" ||
    !resolved.integration.hasChannelHandler("post", "getLiveState")
  ) {
    return
  }
  const { channel, ctx, integration, integrationId, sourceAccountId } = resolved
  try {
    const observedAt = new Date()
    const state = await integration.runChannelHandler("post", "getLiveState", {
      ctx,
      data: { postId: target.externalPostId },
    })
    if (state === "unknown") {
      // Leave the status alone: the scan already moved the next re-read ahead.
      return
    }
    await channelPostService.recordLiveObservation({
      channel,
      externalPostId: target.externalPostId,
      inboxId: target.inboxId,
      integrationId,
      observedAt,
      source: "reread",
      sourceAccountId,
      status: state,
      workspaceId: data.workspaceId,
    })
  } catch (err) {
    logger.warn(
      { err, channelPostId: data.channelPostId },
      "channel-post-sync: re-reading the live state failed",
    )
  }
}

/**
 * Re-reads one post from its channel: writes its current counts, or hides it
 * when the channel confirms it is gone (only an unambiguous "not found" does
 * that; any other failure leaves the post as it was) and repairs the post's
 * phone-comment count from its comments. Never throws: a refresh is a
 * convenience and runs once.
 */
export async function refreshChannelPost(
  data: LowJobRefreshChannelPost["data"],
): Promise<void> {
  try {
    const target = await channelPostSyncService.findPostRefreshTarget({
      id: data.channelPostId,
      workspaceId: data.workspaceId,
    })
    if (!target) {
      return
    }
    // First, and on its own: the repair reads only our own data, so it does not
    // depend on the channel answering.
    await reconcilePhoneCount(data)

    const resolved = await resolvePostIntegration({
      channel: target.channel,
      inboxId: target.inboxId,
      workspaceId: data.workspaceId,
    })
    const { channel, ctx, integration, integrationId, sourceAccountId } =
      resolved
    await reconcileLiveState(data, target, resolved)

    try {
      const observedAt = new Date()
      const item = await integration.runChannelHandler("post", "getPost", {
        ctx,
        data: { postId: target.externalPostId },
      })
      await channelPostSyncService.recordPage({
        channel,
        inboxId: target.inboxId,
        integrationId,
        items: [item],
        observedAt,
        sourceAccountId,
        thumbnailDeadline: Date.now() + 15_000,
        timezone: await channelPostSyncService.workspaceTimezone(
          data.workspaceId,
        ),
        workspaceId: data.workspaceId,
      })
      // A refresh that follows a publish from Posts: the open Posts pages
      // refetch, so the new counts and thumbnail show without a reload.
      if (data.publishedTarget) {
        await emitSocialPostChanged({
          socialPostId: data.publishedTarget.socialPostId,
          status: "published",
          targetId: data.publishedTarget.targetId,
          workspaceId: data.workspaceId,
        })
      }
    } catch (err) {
      if (
        err instanceof ChannelError &&
        err.category === ChannelErrorCategory.NOT_FOUND
      ) {
        await channelPostSyncService.markPostRemoved({
          id: data.channelPostId,
          workspaceId: data.workspaceId,
        })
        return
      }
      throw err
    }
  } catch (err) {
    logger.warn(
      { err, channelPostId: data.channelPostId },
      "channel-post-sync: refreshing a post failed",
    )
  }
}
