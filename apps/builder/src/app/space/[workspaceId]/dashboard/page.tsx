import { BaseDashboard } from "@chatbotx.io/analytics-nextjs/components/base-dashboard"
import { db } from "@chatbotx.io/database/client"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
import { listInboxes } from "@/features/inboxes/queries"

export default async function Dashboard({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const [inboxesResult, workspace] = await Promise.all([
    listInboxes({ workspaceId, includes: ["integration"] }),
    db.query.workspaceModel.findFirst({
      where: { id: workspaceId },
      columns: { createdAt: true },
    }),
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
