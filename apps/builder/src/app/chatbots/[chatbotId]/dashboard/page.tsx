import { BaseDashboard } from "@chatbotx.io/analytics-nextjs/components/base-dashboard"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
import { listInboxes } from "@/features/inboxes/queries"

export default async function Dashboard({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const { data: inboxes } = await listInboxes({
    chatbotId,
    includes: ["integration"],
  })

  return (
    <div className="flex flex-col gap-4">
      <InboxCardList chatbotId={chatbotId} inboxes={inboxes} />

      <BaseDashboard
        defaultSearchParams={{
          chatbotId: chatbotId.toString(),
          timezone,
        }}
      />
    </div>
  )
}
