import {
  buildContext,
  channelPostService,
  tiktokIntegrationService,
} from "@chatbotx.io/business"
import type { ThreadsAuthValue } from "@chatbotx.io/integration-threads"
import {
  type TiktokAuthValue,
  tiktokCanListVideos,
} from "@chatbotx.io/integration-tiktok"
import { distributedStore } from "@chatbotx.io/redis"
import type { AuthValue, ChannelPostDetails } from "@chatbotx.io/sdk"
import { logger } from "../../../lib/logger"
import {
  allIntegrations,
  resolveIntegrationContextFromContactInbox,
} from "../../../services/integrations"
import type { CommentAutomationChannelType } from "./channel-type"

/**
 * How long a fetched caption is trusted. Bounds the Graph/TikTok calls a viral
 * post costs (one per post per window, whatever the comment rate) while still
 * noticing, within the window, an owner editing `#vip` into the caption.
 */
export const POST_CAPTION_CACHE_TTL_SECONDS = 10 * 60

/**
 * How long "could not read the caption" is remembered. Short on purpose: it
 * only stops a burst of comments on a broken post from each paying the
 * timeout, and must not hide a transient outage for long.
 */
export const POST_CAPTION_UNAVAILABLE_TTL_SECONDS = 60

export const POST_CAPTION_FETCH_TIMEOUT_MS = 10_000

/** `null` = the caption could not be read; `""` = the post has no caption. */
export type PostCaption = string | null

type CachedPostCaption = { caption: PostCaption }

/**
 * The inbox channel each comment channel's posts are tracked under — the two
 * Instagram connection kinds share the `instagram` inbox channel, and the
 * registry picks the right integration from the connection row.
 */
const INBOX_CHANNEL_BY_COMMENT_CHANNEL: Record<
  CommentAutomationChannelType,
  string
> = {
  messenger: "messenger",
  instagram: "instagram",
  instagramFacebook: "instagram",
  threads: "threads",
  tiktok: "tiktok",
}

export function postCaptionCacheKey(
  integrationId: string,
  postId: string,
): string {
  return `comment-automation:post-caption:${integrationId}:${postId}`
}

class PostCaptionUnavailableError extends Error {}

const withTimeout = async <Value>(
  promise: Promise<Value>,
  timeoutMs: number,
): Promise<Value> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Post caption fetch timed out")),
      timeoutMs,
    )
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}

type PostCaptionResolverParams = {
  channelType: CommentAutomationChannelType
  workspaceId: string
  postId: string
  integrationRow: {
    id: string
    auth: AuthValue
    inboxId: string
    [x: string]: unknown
  }
}

/**
 * Reads the caption straight from the channel. Throws when it cannot be read;
 * a post that exists but has no caption answers `""`.
 */
async function fetchPostCaption(
  params: PostCaptionResolverParams,
): Promise<string> {
  const { channelType, workspaceId, postId, integrationRow } = params

  if (channelType === "threads") {
    const threads = allIntegrations.threads
    if (!threads) {
      throw new PostCaptionUnavailableError(
        "Threads integration not registered",
      )
    }
    const details = await threads.runAction("getPostDetails", {
      ctx: await buildContext({
        workspaceId,
        integrationType: "threads",
        integration: {
          ...integrationRow,
          auth: integrationRow.auth as ThreadsAuthValue,
        },
      }),
      input: { postId },
    })
    return details.text ?? ""
  }

  if (channelType === "tiktok") {
    // A connection made before `video.list` was approved cannot read any
    // caption until its owner reconnects — a stable state, not a failure.
    if (!tiktokCanListVideos(integrationRow.auth as TiktokAuthValue)) {
      throw new PostCaptionUnavailableError(
        "TikTok connection lacks the video.list scope",
      )
    }
    const details = await tiktokIntegrationService.getPostDetails({
      workspaceId,
      inboxId: integrationRow.inboxId,
      postId,
    })
    if (details.degraded) {
      throw new PostCaptionUnavailableError("TikTok video details unavailable")
    }
    return details.text ?? ""
  }

  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId,
    contactInbox: {
      channel: INBOX_CHANNEL_BY_COMMENT_CHANNEL[channelType],
      inboxId: integrationRow.inboxId,
    },
  })
  const details: ChannelPostDetails = await integration.runChannelHandler(
    "contact",
    "getPostDetails",
    { ctx, data: { postId } },
  )
  return details.caption ?? ""
}

async function readCachedCaption(
  key: string,
): Promise<CachedPostCaption | null> {
  try {
    return (await distributedStore.get<CachedPostCaption>(key)) ?? null
  } catch (err) {
    logger.warn({ err, key }, "Post caption cache read failed")
    return null
  }
}

async function writeCachedCaption(
  key: string,
  caption: PostCaption,
): Promise<void> {
  const ttlSeconds =
    caption === null
      ? POST_CAPTION_UNAVAILABLE_TTL_SECONDS
      : POST_CAPTION_CACHE_TTL_SECONDS
  await distributedStore
    .put(key, { caption } satisfies CachedPostCaption, ttlSeconds)
    .catch((err: unknown) => {
      logger.warn({ err, key }, "Post caption cache write failed")
    })
}

/**
 * Resolves the caption once: Redis cache → the channel's API → the caption
 * saved on `ChannelPost` when the comment's first webhook tracked the post
 * (Facebook/Instagram only). Never throws — `null` means unreadable.
 */
async function resolvePostCaption(
  params: PostCaptionResolverParams,
): Promise<PostCaption> {
  const { channelType, workspaceId, postId, integrationRow } = params
  const key = postCaptionCacheKey(integrationRow.id, postId)

  const cached = await readCachedCaption(key)
  if (cached) {
    return cached.caption
  }

  let caption: PostCaption
  try {
    caption = await withTimeout(
      fetchPostCaption(params),
      POST_CAPTION_FETCH_TIMEOUT_MS,
    )
  } catch (err) {
    logger.warn(
      { err, workspaceId, postId, channelType },
      "Comment automation: could not read the post caption",
    )
    caption = await channelPostService
      .findStoredCaption({
        channel: INBOX_CHANNEL_BY_COMMENT_CHANNEL[channelType],
        externalPostId: postId,
        workspaceId,
      })
      .catch((lookupErr: unknown) => {
        logger.warn(
          { err: lookupErr, workspaceId, postId },
          "Comment automation: stored post caption lookup failed",
        )
        return null
      })
  }

  await writeCachedCaption(key, caption)
  return caption
}

/**
 * Returns a memoized resolver for the comment's post caption: at most one
 * lookup per incoming comment however many `hashtags` automations read it,
 * and none at all when no automation targets hashtags.
 */
export function createPostCaptionResolver(
  params: PostCaptionResolverParams,
): () => Promise<PostCaption> {
  let pending: Promise<PostCaption> | undefined
  return () => {
    pending ??= resolvePostCaption(params)
    return pending
  }
}
