import { Suspense } from "react"
import { ListInboxTeams } from "@/enterprise/features/inbox-teams/list-inbox-teams"
import { getInboxTeams } from "@/enterprise/features/inbox-teams/queries"
import { getAllChatbotMembers } from "@/features/users/queries"

export default async function InboxTeamsPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const promises = Promise.all([
    getInboxTeams({ chatbotId: params.chatbotId }),
    getAllChatbotMembers({ chatbotId: params.chatbotId }),
  ])

  return (
    <Suspense>
      <ListInboxTeams chatbotId={params.chatbotId} promises={promises} />
    </Suspense>
  )
}
