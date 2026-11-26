import {
  channelPostService,
  channelPostSyncService,
  emitSocialPostChanged,
} from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedStore } from "@chatbotx.io/redis"
import {
  ChannelError,
  ChannelErrorCategory,
  isRateLimited,
} from "@chatbotx.io/sdk"
import {
  isPostManagementChannel,
  type PostManagementChannel,
} from "@chatbotx.io/utils/channel"
import type { ChannelPostRefreshOutcome } from "@chatbotx.io/utils/channel-post"
import { resolveIntegrationContextFromContactInbox } from "./registry"

const logger = getChildLogger("channel-post-refresh")

/**
 * The integration row column holding the account's id on its channel: the id
 * the channel's comment events report as the account, stored on `ChannelPost`
 * as `sourceAccountId`.
 */
const SOURCE_ACCOUNT_COLUMN: Record<PostManagementChannel, string> = {
  instagram: "igId",
  messenger: "pageId",
  threads: "threadsUserId",
  tiktok: "openId",
}

const readSourceAccountId = (
  channel: PostManagementChannel,
  integrationRow: Record<string, unknown>,
): string => {
  const value = integrationRow[SOURCE_ACCOUNT_COLUMN[channel]]
  if (typeof value !== "string" || value === "") {
    throw new ChannelError(
      `The ${channel} integration has no account id`,
      ChannelErrorCategory.AUTH_FAILED,
      { code: "integration_account_missing" },
    )
  }
  return value
}

/**
 * The integration, its call context and the ids a `ChannelPost` row records
 * for an inbox whose channel has a post list. A missing integration surfaces
 * as the registry's authorisation error.
 */
export async function resolvePostIntegration(input: {
  channel: string
  inboxId: string
  workspaceId: string
}) {
  if (!isPostManagementChannel(input.channel)) {
    throw new ChannelError(
      `Channel ${input.channel} has no post list`,
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  }
  const { integration, integrationRow, ctx } =
    await resolveIntegrationContextFromContactInbox({
      contactInbox: { channel: input.channel, inboxId: input.inboxId },
      workspaceId: input.workspaceId,
    })
  return {
    channel: input.channel,
    ctx,
    integration,
    integrationId: integrationRow.id,
    sourceAccountId: readSourceAccountId(input.channel, integrationRow),
  }
}

/** What a read of the channel can come to; `cooldown` is decided before it. */
type ChannelReadOutcome = Exclude<ChannelPostRefreshOutcome, "cooldown">

/** How long one inline refresh waits for the channel before it gives up. */
export const CHANNEL_POST_REFRESH_TIMEOUT_MS = 15_000

/**
 * Sets the post's stored phone-comment count from its comments. A failure is
 * logged and does not stop the refresh.
 */
async function reconcilePhoneCount(input: {
  channelPostId: string
  workspaceId: string
}): Promise<void> {
  try {
    const result = await channelPostSyncService.reconcilePhoneCount({
      id: input.channelPostId,
      workspaceId: input.workspaceId,
    })
    if (result.repaired) {
      logger.info(
        { channelPostId: input.channelPostId, count: result.count },
        "channel-post-sync: repaired the phone-comment count",
      )
    }
  } catch (err) {
    logger.warn(
      { err, channelPostId: input.channelPostId },
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
 * re-read; one that cannot tell (or a failed read) leaves the status alone. A
 * failure never stops the rest of the refresh.
 */
async function reconcileLiveState(
  input: { channelPostId: string; workspaceId: string },
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
      workspaceId: input.workspaceId,
    })
  } catch (err) {
    logger.warn(
      { err, channelPostId: input.channelPostId },
      "channel-post-sync: re-reading the live state failed",
    )
  }
}

/** What went wrong with a channel read, as the outcome a caller can show. */
const failureOutcome = (err: unknown): ChannelReadOutcome =>
  err instanceof ChannelError && isRateLimited(err)
    ? "rateLimited"
    : "channelUnavailable"

/**
 * Re-reads one post from its channel: writes its current counts through the
 * fenced `recordPage`, or hides it when the channel confirms it is gone (only
 * an unambiguous "not found" does that; any other failure leaves the post as
 * it was) and repairs the post's phone-comment count from its comments. The
 * ONE implementation behind the background job and the refresh button. Never
 * throws: a refresh is a convenience and runs once.
 */
export async function runChannelPostRefresh(input: {
  channelPostId: string
  /** Set when the refresh follows a publish from Posts: the composed post is told once the counts are read. */
  publishedTarget?: { socialPostId: string; targetId: string }
  workspaceId: string
}): Promise<ChannelReadOutcome> {
  try {
    const target = await channelPostSyncService.findPostRefreshTarget({
      id: input.channelPostId,
      workspaceId: input.workspaceId,
    })
    if (!target) {
      return "channelUnavailable"
    }
    // First, and on its own: the repair reads only our own data, so it does not
    // depend on the channel answering.
    await reconcilePhoneCount(input)

    const resolved = await resolvePostIntegration({
      channel: target.channel,
      inboxId: target.inboxId,
      workspaceId: input.workspaceId,
    })
    const { channel, ctx, integration, integrationId, sourceAccountId } =
      resolved
    await reconcileLiveState(input, target, resolved)

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
          input.workspaceId,
        ),
        workspaceId: input.workspaceId,
      })
      if (input.publishedTarget) {
        await emitSocialPostChanged({
          socialPostId: input.publishedTarget.socialPostId,
          status: "published",
          targetId: input.publishedTarget.targetId,
          workspaceId: input.workspaceId,
        })
      }
      return "refreshed"
    } catch (err) {
      if (
        err instanceof ChannelError &&
        err.category === ChannelErrorCategory.NOT_FOUND
      ) {
        await channelPostSyncService.markPostRemoved({
          id: input.channelPostId,
          workspaceId: input.workspaceId,
        })
        return "removed"
      }
      throw err
    }
  } catch (err) {
    logger.warn(
      { err, channelPostId: input.channelPostId },
      "channel-post-sync: refreshing a post failed",
    )
    return failureOutcome(err)
  }
}

/** Resolves to `fallback` when `work` is still running after `ms`; the work itself is not cancelled (its write is fenced). */
async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** One refresh per post per this many seconds (the button's rest). */
const CHANNEL_POST_REFRESH_COOLDOWN_SECONDS = 60

/** `true` when a refresh of this post already ran inside the cooldown (the call takes the slot otherwise). */
export async function isChannelPostRefreshCoolingDown(input: {
  channelPostId: string
  workspaceId: string
}): Promise<boolean> {
  const runs = await distributedStore.incrWithWindow(
    `channel-post-refresh-cooldown:${input.workspaceId}:${input.channelPostId}`,
    CHANNEL_POST_REFRESH_COOLDOWN_SECONDS,
  )
  return runs > 1
}

/**
 * The refresh button: reads the post from its channel inside the request,
 * bounded by {@link CHANNEL_POST_REFRESH_TIMEOUT_MS}. `cooldown` when the post
 * was refreshed in the last minute (nothing is read then).
 */
export async function refreshChannelPostNow(input: {
  channelPostId: string
  workspaceId: string
}): Promise<ChannelPostRefreshOutcome> {
  if (await isChannelPostRefreshCoolingDown(input)) {
    return "cooldown"
  }
  return await withTimeout<ChannelReadOutcome>(
    runChannelPostRefresh(input),
    CHANNEL_POST_REFRESH_TIMEOUT_MS,
    "channelUnavailable",
  )
}
