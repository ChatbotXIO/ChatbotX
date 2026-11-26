import { PostAnalyticsView } from "@/features/post-analytics/components/analytics-view"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function PostAnalyticsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(props.params, "broadcast")

  return <PostAnalyticsView workspaceId={workspaceId} />
}
