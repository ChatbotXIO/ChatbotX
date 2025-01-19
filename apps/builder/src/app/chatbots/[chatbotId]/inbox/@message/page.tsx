import { getCurrentConversation } from "@/features/conversations/queries"
import { getConversationsSearchParamsCache } from "@/features/conversations/schemas/get-conversations-schema"
import MessageList from "@/features/messages/message-list"
import { getTeams } from "@/features/teams/queries"
import { getUsers } from "@/features/users/queries"
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
  const promises = Promise.all([
    conversationId
      ? getCurrentConversation({
          chatbotId: params.chatbotId,
          id: conversationId,
        })
      : Promise.resolve({ conversation: null }),
    getUsers({ chatbotId: params.chatbotId }),
    getTeams({ chatbotId: params.chatbotId }),
  ])

  return (
    <Suspense>
      {conversationId && (
        <MessageList
          chatbotId={params.chatbotId}
          conversationId={conversationId}
          promises={promises}
        />
      )}
    </Suspense>
  )
}
