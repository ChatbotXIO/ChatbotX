import { getConversationsSearchParamsCache } from "@/features/conversations/schemas/get-conversations-schema"
import MessageList from "@/features/messages/message-list"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function MessagesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const { conversationId } =
    getConversationsSearchParamsCache.parse(searchParams)

  return (
    <Suspense>
      {conversationId && (
        <MessageList
          chatbotId={params.chatbotId}
          conversationId={conversationId}
        />
      )}
    </Suspense>
  )
}
