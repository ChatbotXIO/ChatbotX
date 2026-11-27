import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { PostAnalyticsView } from "@/features/post-analytics/components/analytics-view"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

/**
 * The Posts section of the Analytics dashboard; needs `analytics` only. The
 * dashboard layout renders the shared Channel / Inbox / section row above it,
 * and the view reads that selection from the URL.
 */
export default async function PostsAnalyticsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireWorkspacePermission(workspaceId, "analytics")

  return <PostAnalyticsView scopeFilters="shared" workspaceId={workspaceId} />
}
