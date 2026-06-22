import { buildContext } from "@chatbotx.io/business"
import { findOrFail } from "@chatbotx.io/database/client"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import { getPostDetails } from "@chatbotx.io/integration-messenger/apis/post"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { withCache } from "@chatbotx.io/redis"

const POST_DETAILS_CACHE_TTL = 60 * 60 * 24

function getPostDetailsCacheKey(inboxId: string, postId: string): string {
  return `messenger:post-details:${inboxId}:${postId}`
}

export function getPostDetailsQuery(inboxId: string, postId: string) {
  return withCache(
    getPostDetailsCacheKey(inboxId, postId),
    async () => {
      const integration = await findOrFail({
        table: integrationMessengerModel,
        where: { inboxId },
      })
      const ctx = await buildContext({
        workspaceId: integration.workspaceId,
        integrationType: "messenger",
        integration: {
          ...integration,
          auth: integration.auth as MessengerAuthValue,
        },
      })
      return getPostDetails({ ctx, input: { postId } })
    },
    { ttl: POST_DETAILS_CACHE_TTL },
  )
}
