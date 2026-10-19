import { workingHoursService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { WorkingHoursScheduleForm } from "@/features/working-hours/components/working-hours-schedule-form"
import { workingHoursListHref } from "@/features/working-hours/lib/routes"
import { toWorkingHoursResource } from "@/features/working-hours/lib/to-resource"
import {
  assertCurrentUserCanAccessChatbot,
  getCurrentUserAndTargetWorkspace,
} from "@/lib/auth/utils"

export default async function WorkingHoursEditorPage(props: {
  params: Promise<{ workspaceId: string; workingHoursId: string }>
}) {
  const params = await props.params
  const workspaceId = getIdFromParams(params, "workspaceId")
  const workingHoursId = getIdFromParams(params, "workingHoursId")
  if (!(workspaceId && workingHoursId)) {
    return notFound()
  }

  await assertCurrentUserCanAccessChatbot(workspaceId)

  const [t, current, rows] = await Promise.all([
    getTranslations(),
    getCurrentUserAndTargetWorkspace(workspaceId),
    workingHoursService.listByWorkspace({ workspaceId }),
  ])
  // Workspace-scoped list: a foreign or unknown id is simply absent.
  const row = rows.find((candidate) => candidate.id === workingHoursId)
  if (!(row && current?.targetWorkspace)) {
    return notFound()
  }

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          {
            label: t("inboxTeams.title"),
            href: workingHoursListHref(workspaceId),
          },
          {
            label: t("workingHours.title"),
            href: workingHoursListHref(workspaceId),
          },
          { label: row.name, href: "" },
        ]}
      />
      <Suspense>
        <WorkingHoursScheduleForm
          timezone={current.targetWorkspace.timezone}
          workingHours={toWorkingHoursResource(row)}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
