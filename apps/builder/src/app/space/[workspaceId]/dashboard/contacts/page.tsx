import { ContactsDashboard } from "@chatbotx.io/analytics-nextjs/components/contacts-dashboard"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { AnalyticsFilterStoreSync } from "@/features/analytics/components/analytics-channel-filter"
import { loadSharedFilters } from "@/features/analytics/lib/shared-filter-params"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

type PageProps = {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}

export default async function ContactsAnalyticsPage({
  params,
  searchParams,
}: PageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (
    !(
      userAndWorkspace &&
      hasWorkspacePermission(
        userAndWorkspace.targetWorkspaceMember.permissions,
        "analytics",
      )
    )
  ) {
    return notFound()
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { targetWorkspace } = userAndWorkspace
  const initialFilters = await loadSharedFilters(searchParams)

  return (
    <ContactsDashboard
      channelFilter={<AnalyticsFilterStoreSync />}
      defaultSearchParams={{ workspaceId, timezone }}
      initialFilters={initialFilters}
      workspaceCreatedAt={targetWorkspace.createdAt}
    />
  )
}
