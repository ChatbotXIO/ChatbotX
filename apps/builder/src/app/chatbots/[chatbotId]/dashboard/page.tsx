import InboxCardList from "@/features/inboxes/components/inbox-card-list"
import InboxStatsList from "@/features/inboxes/components/inbox-stats-list"
import { listInboxes } from "@/features/inboxes/queries"

export default async function Dashboard({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params

  const inboxesPromise = Promise.all([
    listInboxes({
      chatbotId,
      includes: ["intergration"],
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <InboxCardList chatbotId={chatbotId} inboxesPromise={inboxesPromise} />

      <div />

      <InboxStatsList />
    </div>
  )
}
