import { findConversation } from "@/features/conversations/queries"
import { getConversationsSearchParamsCache } from "@/features/conversations/schemas/get-conversations-schema"
import MessageList from "@/features/messages/message-list"
import { getTeams } from "@/features/teams/queries"
import { getUsers } from "@/features/users/queries"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function ListMessagesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const { conversationId } =
    getConversationsSearchParamsCache.parse(searchParams)
  const promises = conversationId
    ? Promise.all([
        findConversation({
          id: conversationId,
          chatbotId: params.chatbotId,
        }),
        getUsers({ chatbotId: params.chatbotId }),
        getTeams({ chatbotId: params.chatbotId }),
      ])
    : Promise.resolve([])

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
