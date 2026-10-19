import {
  workingHoursService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ListInboxTeams } from "@/enterprise/features/inbox-teams/list-inbox-teams"
import { listInboxTeams } from "@/enterprise/features/inbox-teams/queries"
import {
  ListWorkingHours,
  ListWorkingHoursFallback,
} from "@/features/working-hours/components/list-working-hours"
import { toWorkingHoursResource } from "@/features/working-hours/lib/to-resource"
import { listWorkspaceMembers } from "@/features/workspace-members/queries"
import { getWorkspaceMembersSearchParamsCache } from "@/features/workspace-members/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function InboxTeamsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  await assertCurrentUserCanAccessChatbot(workspaceId)

  const promises = Promise.all([
    listInboxTeams({ workspaceId }),
    listWorkspaceMembers({
      workspaceId,
      ...getWorkspaceMembersSearchParamsCache.parse({}),
    }),
  ])

  const workingHoursPromises = Promise.all([
    workingHoursService
      .listByWorkspace({ workspaceId })
      .then((rows) => rows.map(toWorkingHoursResource)),
    workspaceMemberService.listByWorkspaceId({ workspaceId }).then((members) =>
      members.map((member) => ({
        value: member.user.id,
        label: member.user.name ?? member.user.email,
      })),
    ),
  ])

  return (
    <div className="flex flex-col gap-6">
      <Suspense>
        <ListInboxTeams promises={promises} workspaceId={workspaceId} />
      </Suspense>
      <Suspense fallback={<ListWorkingHoursFallback />}>
        <ListWorkingHours
          promises={workingHoursPromises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
