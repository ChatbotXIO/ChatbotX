import { Suspense } from "react"
import { ListInboxTeams } from "@/features/inbox-teams/list-inbox-teams"
import { getInboxTeams } from "@/features/inbox-teams/queries"
import { getUsers } from "@/features/users/queries"

export default async function InboxTeamsPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params

  const promises = Promise.all([
    getInboxTeams({ chatbotId: params.chatbotId }),
    getUsers({ chatbotId: params.chatbotId }),
  ])

  return (
    <Suspense>
      <ListInboxTeams chatbotId={params.chatbotId} promises={promises} />
    </Suspense>
  )
}
