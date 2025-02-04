import ConversationList from "@/features/conversations/conversation-list"
import { listConversations } from "@/features/conversations/queries"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function ListConversationsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params

  const promises = listConversations({
    chatbotId: params.chatbotId,
  })

  return (
    <Suspense>
      <ConversationList chatbotId={params.chatbotId} promises={promises} />
    </Suspense>
  )
}
