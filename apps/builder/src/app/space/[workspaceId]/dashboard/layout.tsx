import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { isCloud } from "@/env"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
import { listInboxes } from "@/features/inboxes/queries"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { resolveWorkspaceBlockState } from "@/lib/workspace-quota"

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
      {/* Inbox cards are shared across all Analytics sub-pages and stay
          full-width above each page's filter bar and content. */}
      <InboxCardList
        allowAddNew={isSuperAdmin}
        blocked={cloud && blocked}
        inboxes={inboxes}
        reason={cloud ? blockReason : null}
        workspaceId={workspaceId}
      />
      {children}
    </div>
  )
}
