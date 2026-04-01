import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ListInboxTeams } from "@/enterprise/features/inbox-teams/list-inbox-teams"
import { listInboxTeams } from "@/enterprise/features/inbox-teams/queries"
import { listChatbotMembers } from "@/features/chatbot-members/queries"
import { getChatbotMembersSearchParamsCache } from "@/features/chatbot-members/schema/query"

export default async function InboxTeamsPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const promises = Promise.all([
    listInboxTeams({ chatbotId }),
    listChatbotMembers({
      chatbotId,
      ...getChatbotMembersSearchParamsCache.parse({}),
    }),
  ])

  return (
    <Suspense>
      <ListInboxTeams chatbotId={chatbotId} promises={promises} />
    </Suspense>
  )
}
