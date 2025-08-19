import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
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
    <Card>
      <CardHeader>
        <CardTitle>Inbox Teams</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <ListInboxTeams chatbotId={params.chatbotId} promises={promises} />
        </Suspense>
      </CardContent>
    </Card>
  )
}
