import {
  buildContext,
  instagramIntegrationService,
  integrationThreadsService,
  messengerIntegrationService,
  tiktokIntegrationService,
  tiktokPostDetailsCacheTag,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import type { ThreadsAuthValue } from "@chatbotx.io/integration-threads"
import { withCache } from "@chatbotx.io/redis"
import { integrations } from "@/integration"
import { type PostDetails, supportsPostDetails } from "../schema/query"

const POST_DETAILS_CACHE_TTL = 60 * 60 * 24

/**
 * TTL for a result the channel could not fully resolve *this time*.
 *
 * Short on purpose: a transient TikTok failure otherwise pins a caption-less,
 * thumbnail-less post card for a full day. A connection that simply lacks
 * `video.list` is NOT degraded — it will answer identically until its owner
 * re-authorizes, and that re-authorization drops these entries by tag.
 */
const DEGRADED_POST_DETAILS_CACHE_TTL = 60 * 5

/** What goes into the cache; `degraded` is a TTL hint, not part of the API. */
type CachedPostDetails = PostDetails & { degraded?: boolean }

// The workspace is part of the key, not just part of the lookup: without it a
// single cross-workspace read — from a caller predating the scoped lookups
// below, or from a future one that forgets them — would stay served to everyone
// for a full day after the hole itself was closed.
function getPostDetailsCacheKey(
  workspaceId: string,
  inboxId: string,
  postId: string,
): string {
  return `post-details:${workspaceId}:${inboxId}:${postId}`
}

// `async` so an unsupported channel rejects rather than throwing
// synchronously — callers treat this as a promise-returning query.
//
// Every branch resolves its integration by `inboxId` AND `workspaceId`. The
// caller's membership of `workspaceId` is all the API handler checks, so an
// unscoped lookup here would let a member of one workspace read another's post
// by passing its inbox id.
export async function getPostDetailsQuery(props: {
  workspaceId: string
  inboxId: string
  postId: string
  channel: ChannelType
}): Promise<PostDetails> {
  const { workspaceId, inboxId, postId, channel } = props

  if (!supportsPostDetails(channel)) {
    throw new ChatbotXException(
      `Post details are not available for the ${channel} channel`,
    )
  }

  const { degraded, ...postDetails } = await withCache<CachedPostDetails>(
    getPostDetailsCacheKey(workspaceId, inboxId, postId),
    async (): Promise<CachedPostDetails> => {
      if (channel === "instagram") {
        const integration =
          await instagramIntegrationService.findByInboxIdForWorkspace({
            inboxId,
            workspaceId,
          })
        const ctx = await buildContext({
          workspaceId,
          integrationType: "instagram",
          integration: {
            ...integration,
            auth: integration.auth as InstagramAuthValue,
          },
        })
        const raw =
          integration.type === "facebook"
            ? await integrations.instagramFacebook.runAction("getPostDetails", {
                ctx,
                input: { postId },
              })
            : await integrations.instagram.runAction("getPostDetails", {
                ctx,
                input: { postId },
              })
        return {
          text: raw.caption,
          picture: raw.thumbnail_url ?? raw.media_url,
          from: { id: integration.igId, name: integration.name },
          createdAt: raw.timestamp,
          link: raw.permalink,
        }
      }

      if (channel === "threads") {
        const integration =
          await integrationThreadsService.findByInboxIdForWorkspace({
            inboxId,
            workspaceId,
          })
        const ctx = await buildContext({
          workspaceId,
          integrationType: "threads",
          integration: {
            ...integration,
            auth: integration.auth as ThreadsAuthValue,
          },
        })
        const raw = await integrations.threads.runAction("getPostDetails", {
          ctx,
          input: { postId },
        })
        return {
          text: raw.text,
          picture: raw.media_url ?? raw.thumbnail_url,
          from: raw.username
            ? { id: raw.owner?.id ?? raw.username, name: raw.username }
            : undefined,
          createdAt: raw.timestamp ?? new Date().toISOString(),
          link: raw.permalink,
        }
      }

      if (channel === "tiktok") {
        return await tiktokIntegrationService.getPostDetails({
          workspaceId,
          inboxId,
          postId,
        })
      }

      const integration =
        await messengerIntegrationService.findByInboxIdForWorkspace({
          inboxId,
          workspaceId,
        })
      const ctx = await buildContext({
        workspaceId,
        integrationType: "messenger",
        integration: {
          ...integration,
          auth: integration.auth as MessengerAuthValue,
        },
      })
      const raw = await integrations.messenger.runAction("getPostDetails", {
        ctx,
        input: { postId },
      })
      return {
        text: raw.message,
        picture: raw.full_picture,
        from: raw.from,
        createdAt: raw.created_time,
      }
    },
    {
      ttl: POST_DETAILS_CACHE_TTL,
      ttlFor: (result) =>
        result.degraded ? DEGRADED_POST_DETAILS_CACHE_TTL : undefined,
      // Lets `tiktokIntegrationService.connect` drop every post card for this
      // inbox when its owner re-authorizes and the connection finally carries
      // `video.list`. TikTok only: a tag costs an extra SADD and EXPIRE per
      // cache write, and on the other channels nothing would ever invalidate it.
      tags: channel === "tiktok" ? [tiktokPostDetailsCacheTag(inboxId)] : [],
    },
  )

  // `degraded` exists to pick the TTL above; the client has no use for it.
  return postDetails
}
