import { BaseDashboard } from "@chatbotx.io/analytics-nextjs/components/base-dashboard"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
import { listInboxes } from "@/features/inboxes/queries"

export default async function Dashboard({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
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
          chatbotId,
          timezone,
        }}
      />
    </div>
  )
}
