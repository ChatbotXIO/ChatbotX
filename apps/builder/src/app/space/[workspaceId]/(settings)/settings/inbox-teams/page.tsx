import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ListInboxTeams } from "@/enterprise/features/inbox-teams/list-inbox-teams"
import { listInboxTeams } from "@/enterprise/features/inbox-teams/queries"
import { listWorkspaceMembers } from "@/features/workspace-members/queries"
import { getWorkspaceMembersSearchParamsCache } from "@/features/workspace-members/schema/query"

export default async function InboxTeamsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([
    listInboxTeams({ workspaceId }),
    listWorkspaceMembers({
      workspaceId,
      ...getWorkspaceMembersSearchParamsCache.parse({}),
    }),
  ])

  return (
    <Suspense>
      <ListInboxTeams promises={promises} workspaceId={workspaceId} />
    </Suspense>
  )
}
