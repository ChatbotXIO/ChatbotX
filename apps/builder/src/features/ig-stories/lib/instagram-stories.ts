import { instagramIntegrationService } from "@chatbotx.io/business"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import {
  type InstagramAuthValue,
  listInstagramStories as listInstagramLoginStoriesApi,
} from "@chatbotx.io/integration-instagram"
import {
  type InstagramAuthValue as InstagramFacebookAuthValue,
  listInstagramStories as listInstagramFacebookStoriesApi,
} from "@chatbotx.io/integration-instagram-facebook"
import { filterIntegrationsByAccount } from "@/features/shared/comment-automation/lib/account-filter"
import { collectSettled } from "@/lib/collect-settled"

export type InstagramAutomationStory = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
  accountId: string
  /** The account's inbox id — what an automation's `inboxId` scope stores. */
  inboxId: string
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
}

async function collectInstagramStories(
  integrations: IntegrationInstagramModel[],
  fetchStories: (
    integration: IntegrationInstagramModel,
  ) => Promise<InstagramMediaListItem[]>,
): Promise<{
  stories: InstagramAutomationStory[]
  pages: InstagramAutomationAccount[]
}> {
  const pages = integrations.map((integration) => ({
    id: integration.igId,
    name: integration.name,
  }))

  const stories = await collectSettled(
    integrations,
    async (integration) => {
      const media = await fetchStories(integration)
      return media.map<InstagramAutomationStory>((item) => ({
        id: item.id,
        message: item.caption,
        full_picture: item.media_url ?? item.thumbnail_url,
        created_time: item.timestamp,
        permalink_url: item.permalink,
        accountId: integration.igId,
        inboxId: integration.inboxId,
      }))
    },
    (integration) => ({ integrationId: integration.id }),
    "Failed to list Instagram stories for an integration",
  )

  return { stories, pages }
}

export async function listInstagramLoginStories(
  workspaceId: string,
  inboxId?: string | null,
) {
  const integrations = await instagramIntegrationService.findByWorkspaceId(
    workspaceId,
    "instagram",
  )
  return collectInstagramStories(
    filterIntegrationsByAccount(integrations, inboxId),
    (integration) =>
      listInstagramLoginStoriesApi({
        auth: integration.auth as InstagramAuthValue,
      }),
  )
}

export async function listInstagramFacebookStories(
  workspaceId: string,
  inboxId?: string | null,
) {
  const integrations = await instagramIntegrationService.findByWorkspaceId(
    workspaceId,
    "facebook",
  )
  return collectInstagramStories(
    filterIntegrationsByAccount(integrations, inboxId),
    (integration) =>
      listInstagramFacebookStoriesApi({
        auth: integration.auth as InstagramFacebookAuthValue,
      }),
  )
}
