import { instagramIntegrationService } from "@chatbotx.io/business"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import {
  type InstagramAuthValue,
  listInstagramMedia as listInstagramLoginMediaApi,
} from "@chatbotx.io/integration-instagram"
import {
  type InstagramAuthValue as InstagramFacebookAuthValue,
  listInstagramMedia as listInstagramFacebookMediaApi,
} from "@chatbotx.io/integration-instagram-facebook"
import { collectSettled } from "@/lib/collect-settled"

export type InstagramAutomationMedia = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
  media_product_type?: string
  accountId: string
}

export type InstagramAutomationAccount = {
  id: string
  name: string
}

type InstagramMediaListItem = {
  id: string
  caption?: string
  media_url?: string
  thumbnail_url?: string
  timestamp: string
  permalink?: string
  media_product_type?: string
}

async function collectInstagramMedia(
  integrations: IntegrationInstagramModel[],
  fetchMedia: (
    integration: IntegrationInstagramModel,
  ) => Promise<InstagramMediaListItem[]>,
): Promise<{
  posts: InstagramAutomationMedia[]
  pages: InstagramAutomationAccount[]
}> {
  const pages = integrations.map((integration) => ({
    id: integration.igId,
    name: integration.name,
  }))

  const posts = await collectSettled(
    integrations,
    async (integration) => {
      const media = await fetchMedia(integration)
      return media.map<InstagramAutomationMedia>((item) => ({
        id: item.id,
        message: item.caption,
        full_picture: item.media_url ?? item.thumbnail_url,
        created_time: item.timestamp,
        permalink_url: item.permalink,
        media_product_type: item.media_product_type,
        accountId: integration.igId,
      }))
    },
    (integration) => ({ integrationId: integration.id }),
    "Failed to list Instagram media for an integration",
  )

  return { posts, pages }
}

export async function listInstagramLoginMedia(workspaceId: string) {
  const integrations = await instagramIntegrationService.findByWorkspaceId(
    workspaceId,
    "instagram",
  )
  return collectInstagramMedia(integrations, (integration) =>
    listInstagramLoginMediaApi({
      auth: integration.auth as InstagramAuthValue,
    }),
  )
}

export async function listInstagramFacebookMedia(workspaceId: string) {
  const integrations = await instagramIntegrationService.findByWorkspaceId(
    workspaceId,
    "facebook",
  )
  return collectInstagramMedia(integrations, (integration) =>
    listInstagramFacebookMediaApi({
      auth: integration.auth as InstagramFacebookAuthValue,
    }),
  )
}
