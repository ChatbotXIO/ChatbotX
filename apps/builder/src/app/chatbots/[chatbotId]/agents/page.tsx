import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ChatbotMembersTable } from "@/features/chatbot-members/chatbot-members-table"
import { listChatbotMembers } from "@/features/chatbot-members/queries"
import { getChatbotMembersSearchParamsCache } from "@/features/chatbot-members/schema/query"

export default async function AgentsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = getChatbotMembersSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listChatbotMembers({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <Suspense>
      <ChatbotMembersTable promises={promises} />
    </Suspense>
  )
}
