import { ContactsDashboard } from "@chatbotx.io/analytics-nextjs/components/contacts-dashboard"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { AnalyticsNav } from "@/features/analytics/components/analytics-nav"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function ContactsAnalyticsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
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
  const isSuperAdmin = hasWorkspacePermission(
    userAndWorkspace.targetWorkspaceMember.permissions,
    "superAdmin",
  )

  return (
    <ContactsDashboard
      defaultSearchParams={{ workspaceId, timezone }}
      nav={<AnalyticsNav showAds={isSuperAdmin} />}
      workspaceCreatedAt={targetWorkspace.createdAt}
    />
  )
}
