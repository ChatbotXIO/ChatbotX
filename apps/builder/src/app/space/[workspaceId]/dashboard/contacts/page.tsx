import { ContactsDashboard } from "@chatbotx.io/analytics-nextjs/components/contacts-dashboard"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { isCloud } from "@/env"
import { AnalyticsNav } from "@/features/analytics/components/analytics-nav"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
import { listInboxes } from "@/features/inboxes/queries"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { resolveWorkspaceBlockState } from "@/lib/workspace-quota"

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
  const cloud = isCloud()
  const { targetWorkspace } = userAndWorkspace

  const [inboxesResult, { blocked, blockReason }] = await Promise.all([
    listInboxes({ workspaceId, includes: ["integration"] }),
    resolveWorkspaceBlockState(targetWorkspace.ownerId),
  ])

  const inboxes = inboxesResult.data.filter((inbox) => inbox.channel !== "smtp")

  const isSuperAdmin = hasWorkspacePermission(
    userAndWorkspace.targetWorkspaceMember.permissions,
    "superAdmin",
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Inbox cards and the filter bar keep the full content width; the
          Analytics sub-nav renders one row lower, level with the stats. */}
      <InboxCardList
        allowAddNew={isSuperAdmin}
        blocked={cloud && blocked}
        inboxes={inboxes}
        reason={cloud ? blockReason : null}
        workspaceId={workspaceId}
      />

      <ContactsDashboard
        defaultSearchParams={{
          workspaceId,
          timezone,
        }}
        nav={<AnalyticsNav showAds={isSuperAdmin} />}
        workspaceCreatedAt={targetWorkspace.createdAt}
      />
    </div>
  )
}
