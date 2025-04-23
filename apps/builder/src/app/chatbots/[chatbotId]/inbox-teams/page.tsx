import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ListInboxTeams } from "@/features/inbox-teams/list-inbox-teams"
import { getInboxTeams } from "@/features/inbox-teams/queries"
import { getUsers } from "@/features/users/queries"
import type { SearchParams } from "nuqs"
import { Suspense } from "react"
export default async function InboxTeamsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
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
