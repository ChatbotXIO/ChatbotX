import InboxCardList from "@/features/inboxes/components/inbox-card-list"
import InboxStatsList from "@/features/inboxes/components/inbox-stats-list"
import { listInboxes } from "@/features/inboxes/queries"

export default async function Dashboard({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const { data: inboxes } = await listInboxes({
    chatbotId,
    includes: ["integration"],
    perPage: 1000,
  })

  return (
    <div className="flex flex-col gap-4">
      <InboxCardList chatbotId={chatbotId} inboxes={inboxes} />

      <InboxStatsList />
    </div>
  )
}
