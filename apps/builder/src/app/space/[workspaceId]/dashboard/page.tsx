import { BaseDashboard } from "@chatbotx.io/analytics-nextjs/components/base-dashboard"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { isCloud } from "@/env"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
import { listInboxes } from "@/features/inboxes/queries"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { resolveWorkspaceBlockState } from "@/lib/workspace-quota"

export default async function Dashboard({
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

  return (
    <div className="flex flex-col gap-4">
      <InboxCardList
        allowAddNew={hasWorkspacePermission(
          userAndWorkspace.targetWorkspaceMember.permissions,
          "superAdmin",
        )}
        blocked={cloud && blocked}
        inboxes={inboxes}
        reason={cloud ? blockReason : null}
        workspaceId={workspaceId}
      />

      <BaseDashboard
        defaultSearchParams={{
          workspaceId,
          timezone,
        }}
        workspaceCreatedAt={targetWorkspace.createdAt}
      />
    </div>
  )
}
