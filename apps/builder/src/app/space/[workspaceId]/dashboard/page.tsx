import { BaseDashboard } from "@chatbotx.io/analytics-nextjs/components/base-dashboard"
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

  const { data: inboxes } = await listInboxes({
    workspaceId,
    includes: ["integration"],
  })

  return (
    <div className="flex flex-col gap-4">
      <InboxCardList inboxes={inboxes} workspaceId={workspaceId} />

      <BaseDashboard
        defaultSearchParams={{
          workspaceId,
          timezone,
        }}
      />
    </div>
  )
}
