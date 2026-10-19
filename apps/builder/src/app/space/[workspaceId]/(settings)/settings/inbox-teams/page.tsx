import {
  responseSlaService,
  workingHoursService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ListInboxTeams } from "@/enterprise/features/inbox-teams/list-inbox-teams"
import { listInboxTeams } from "@/enterprise/features/inbox-teams/queries"
import {
  ResponseSlaCard,
  ResponseSlaCardFallback,
} from "@/features/response-sla/components/response-sla-card"
import { toResponseSlaResource } from "@/features/response-sla/lib/to-resource"
import {
  HolidaysCard,
  HolidaysCardFallback,
} from "@/features/working-hours/components/holidays-card"
import {
  ListWorkingHours,
  ListWorkingHoursFallback,
} from "@/features/working-hours/components/list-working-hours"
import {
  toHolidayResource,
  toWorkingHoursResource,
} from "@/features/working-hours/lib/to-resource"
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
      .then((rows) => rows.map((row) => toWorkingHoursResource(row))),
    workspaceMemberService.listByWorkspaceId({ workspaceId }).then((members) =>
      members.map((member) => ({
        value: member.user.id,
        label: member.user.name ?? member.user.email,
      })),
    ),
  ])

  const holidaysPromise = workingHoursService
    .listDateOverrides({ workspaceId, workingHoursId: null })
    .then((rows) => rows.map(toHolidayResource))

  const responseSlaPromise = responseSlaService
    .findPolicy({ workspaceId })
    .then((policy) => (policy ? toResponseSlaResource(policy) : null))

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
      <Suspense fallback={<HolidaysCardFallback />}>
        <HolidaysCard promise={holidaysPromise} workspaceId={workspaceId} />
      </Suspense>
      <Suspense fallback={<ResponseSlaCardFallback />}>
        <ResponseSlaCard
          promise={responseSlaPromise}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
