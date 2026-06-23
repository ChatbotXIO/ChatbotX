import {
  buildContext,
  findInstagramIntegrationByInboxId,
  findMessengerIntegrationByInboxId,
} from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { withCache } from "@chatbotx.io/redis"
import { integrations } from "@/integration"
import type { PostDetails } from "../schema/query"

const POST_DETAILS_CACHE_TTL = 60 * 60 * 24

function getPostDetailsCacheKey(inboxId: string, postId: string): string {
  return `post-details:${inboxId}:${postId}`
}

export function getPostDetailsQuery(
  inboxId: string,
  postId: string,
  channel: ChannelType,
): Promise<PostDetails> {
  return withCache(
    getPostDetailsCacheKey(inboxId, postId),
    async (): Promise<PostDetails> => {
      if (channel === "instagram") {
        const integration = await findInstagramIntegrationByInboxId(inboxId)
        const ctx = await buildContext({
          workspaceId: integration.workspaceId,
          integrationType: "instagram",
          integration: {
            ...integration,
            auth: integration.auth as InstagramAuthValue,
          },
        })
        const raw = await integrations.instagram.runAction("getPostDetails", {
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

      const integration = await findMessengerIntegrationByInboxId(inboxId)
      const ctx = await buildContext({
        workspaceId: integration.workspaceId,
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
    { ttl: POST_DETAILS_CACHE_TTL },
  )
}
