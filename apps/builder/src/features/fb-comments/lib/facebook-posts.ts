import { messengerIntegrationService } from "@chatbotx.io/business"
import {
  type FacebookPostListItem,
  listAdsPosts,
  listPublishedPosts,
  listReelsPosts,
} from "@chatbotx.io/integration-messenger/apis/post"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { filterIntegrationsByAccount } from "@/features/shared/comment-automation/lib/account-filter"
import { collectSettled } from "@/lib/collect-settled"

/** `inboxId` is the Page's inbox id — what an automation's `inboxId` stores. */
type FacebookAutomationPost = FacebookPostListItem & {
  pageId: string
  inboxId: string
}

export type FacebookPostsForAutomation = {
  published: FacebookAutomationPost[]
  ads: FacebookAutomationPost[]
  reels: FacebookAutomationPost[]
  pages: { id: string; name: string }[]
}

export async function listFacebookPostsForAutomation(
  workspaceId: string,
  inboxId?: string | null,
): Promise<FacebookPostsForAutomation> {
  const integrations = filterIntegrationsByAccount(
    await messengerIntegrationService.findByWorkspaceId(workspaceId),
    inboxId,
  )

  const pages = integrations.map((integration) => ({
    id: integration.pageId,
    name: integration.name,
  }))

  if (integrations.length === 0) {
    return { published: [], ads: [], reels: [], pages }
  }

  const fetchByType = (type: "published" | "ads" | "reels") =>
    collectSettled(
      integrations,
      async (integration) => {
        const auth = integration.auth as MessengerAuthValue
        const pageId = integration.pageId

        let posts: FacebookPostListItem[]
        if (type === "published") {
          posts = await listPublishedPosts({ auth, pageId })
        } else if (type === "ads") {
          posts = await listAdsPosts({ auth, pageId })
        } else {
          posts = await listReelsPosts({ auth, pageId })
        }
        return posts.map((post) => ({
          ...post,
          pageId,
          inboxId: integration.inboxId,
        }))
      },
      (integration) => ({ integrationId: integration.id }),
      `Failed to list Facebook ${type} posts for an integration`,
    )

  const [published, ads, reels] = await Promise.all([
    fetchByType("published"),
    fetchByType("ads"),
    fetchByType("reels"),
  ])

  return { published, ads, reels, pages }
}
