import AnalysisFilterForm from "@/features/analysis/filter-form"
import { AnalysisStoreProvider } from "@/features/analysis/provider/analysis-store-context"
import NewContacts from "@/features/contacts/components/new-contact"
import TotalContacts from "@/features/contacts/components/total-contacts"
import { InboxCardList } from "@/features/inboxes/components/inbox-card-list"
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
  })

  return (
    <div className="flex flex-col gap-4">
      <InboxCardList chatbotId={chatbotId} inboxes={inboxes} />

      <AnalysisStoreProvider chatbotId={chatbotId}>
        <AnalysisFilterForm />
        <InboxStatsList />

        <div className="grid grid-cols-2 gap-4">
          <TotalContacts />
          <NewContacts />
        </div>
      </AnalysisStoreProvider>
    </div>
  )
}
