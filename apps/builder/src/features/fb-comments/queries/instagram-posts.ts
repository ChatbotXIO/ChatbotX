import { findInstagramIntegrationsByWorkspaceId } from "@chatbotx.io/business"
import {
  type InstagramAuthValue,
  listInstagramMedia,
} from "@chatbotx.io/integration-instagram"

export type InstagramAutomationMedia = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
  media_product_type?: string
}

export async function listInstagramAutomationMedia(workspaceId: string) {
  const integrations = await findInstagramIntegrationsByWorkspaceId(workspaceId)

  const results = await Promise.allSettled(
    integrations.map(async (integration) => {
      const media = await listInstagramMedia({
        auth: integration.auth as InstagramAuthValue,
      })

      return media.map<InstagramAutomationMedia>((item) => ({
        id: item.id,
        message: item.caption,
        full_picture: item.media_url ?? item.thumbnail_url,
        created_time: item.timestamp,
        permalink_url: item.permalink,
        media_product_type: item.media_product_type,
      }))
    }),
  )

  return {
    posts: results
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<InstagramAutomationMedia[]> =>
          result.status === "fulfilled",
      )
      .flatMap((result) => result.value),
  }
}
