import { BaseDashboard } from "@chatbotx.io/analytics-nextjs/components/base-dashboard"
import { workspaceService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
import { listInboxes } from "@/features/inboxes/queries"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function Dashboard({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireWorkspacePermission(workspaceId, "analytics")

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const [inboxesResult, workspace] = await Promise.all([
    listInboxes({ workspaceId, includes: ["integration"] }),
    workspaceService.find({ where: { id: workspaceId } }),
  ])

  const inboxes = inboxesResult.data.filter((inbox) => inbox.channel !== "smtp")

  return (
    <div className="flex flex-col gap-4">
      <InboxCardList inboxes={inboxes} workspaceId={workspaceId} />

      <BaseDashboard
        defaultSearchParams={{
          workspaceId,
          timezone,
        }}
        workspaceCreatedAt={workspace?.createdAt}
      />
    </div>
  )
}
