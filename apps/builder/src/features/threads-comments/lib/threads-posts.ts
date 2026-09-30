import { integrationThreadsService } from "@chatbotx.io/business"
import {
  listThreadsPosts,
  type ThreadsAuthValue,
} from "@chatbotx.io/integration-threads"
import { collectSettled } from "@/lib/collect-settled"

export type ThreadsAutomationPost = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
  accountId: string
}

export type ThreadsAutomationAccount = {
  id: string
  name: string
}

/**
 * Recent posts from every Threads account connected to the workspace. One
 * account failing (e.g. an expired token) is logged and skipped so the
 * others still show up.
 */
export async function listThreadsPostsForWorkspace(workspaceId: string) {
  const { data: integrations } =
    await integrationThreadsService.listByWorkspaceId({ workspaceId })

  const accounts = integrations.map<ThreadsAutomationAccount>(
    (integration) => ({
      id: integration.threadsUserId,
      name: `@${integration.username}`,
    }),
  )

  const posts = await collectSettled(
    integrations,
    async (integration) => {
      const items = await listThreadsPosts({
        auth: integration.auth as ThreadsAuthValue,
      })
      return items.map<ThreadsAutomationPost>((item) => ({
        id: item.id,
        message: item.text,
        full_picture: item.media_url ?? item.thumbnail_url,
        created_time: item.timestamp,
        permalink_url: item.permalink,
        accountId: integration.threadsUserId,
      }))
    },
    (integration) => ({ integrationId: integration.id }),
    "Failed to list Threads posts for an integration",
  )

  return { posts, accounts }
}
