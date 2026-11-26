import { inboxService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { isCloud } from "@/env"
import { AnalyticsChannelFilter } from "@/features/analytics/components/analytics-channel-filter"
import { resolveAnalyticsSections } from "@/features/analytics/lib/resolve-analytics-sections"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
import { listInboxes } from "@/features/inboxes/queries"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { getWorkspaceBlockStateForRender } from "@/lib/workspace-quota"

type DashboardLayoutProps = {
  children: ReactNode
  params: Promise<{ workspaceId: string }>
}

export default async function DashboardLayout({
  children,
  params,
}: DashboardLayoutProps) {
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
  enforcePasswordCurrent(userAndWorkspace.user)

  const cloud = isCloud()
  const { targetWorkspace } = userAndWorkspace
  const isSuperAdmin = hasWorkspacePermission(
    userAndWorkspace.targetWorkspaceMember.permissions,
    "superAdmin",
  )
  const [inboxesResult, { blocked, blockReason }, sections, filterInboxes] =
    await Promise.all([
      listInboxes({ workspaceId, includes: ["integration"] }),
      getWorkspaceBlockStateForRender(targetWorkspace.ownerId),
      resolveAnalyticsSections({
        workspaceId,
        permissions: { analytics: true, superAdmin: isSuperAdmin },
      }),
      inboxService.listAnalyticsFilterOptions(workspaceId),
    ])
  const inboxes = inboxesResult.data

  return (
    <div className="flex flex-col gap-4">
      {/* Inbox cards and the Channel / Inbox / section row are shared across
          all Analytics sections and stay above each section's own content. */}
      <InboxCardList
        allowAddNew={isSuperAdmin}
        blocked={cloud && blocked}
        inboxes={inboxes}
        reason={cloud ? blockReason : null}
        workspaceId={workspaceId}
      />
      <AnalyticsChannelFilter
        canAppendUnlisted={isSuperAdmin}
        options={filterInboxes}
        sections={sections}
      />
      {children}
    </div>
  )
}
