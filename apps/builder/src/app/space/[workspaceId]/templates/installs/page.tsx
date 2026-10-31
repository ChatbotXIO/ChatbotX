import { canViewTemplateInstalls, templateService } from "@chatbotx.io/business"
import { templateInstallationStatuses } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { TemplateInstallsTable } from "@/features/templates/components/template-installs-table"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

// Snowflake ids are digit strings; anything else is a forged cursor.
const CURSOR_PATTERN = /^\d{1,20}$/

export default async function TemplateInstallsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ cursor?: string; status?: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (
    !(
      userAndWorkspace &&
      canViewTemplateInstalls(
        userAndWorkspace.targetWorkspaceMember.permissions,
      )
    )
  ) {
    return notFound()
  }

  const t = await getTranslations()
  const { cursor, status } = await searchParams
  const parsedStatus = templateInstallationStatuses.safeParse(status)
  const beforeId = cursor && CURSOR_PATTERN.test(cursor) ? cursor : undefined
  const [{ items, nextCursor }, inFlight] = await Promise.all([
    templateService.listInstallationsPage({
      workspaceId,
      beforeId,
      status: parsedStatus.success ? parsedStatus.data : undefined,
    }),
    // An install running under another filter or page must still keep the
    // list refreshing.
    templateService.listInstallationsPage({
      workspaceId,
      activeOnly: true,
      limit: 1,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("templates.title"),
            href: `/space/${workspaceId}/templates`,
          },
          { label: t("templates.installs.title"), href: "" },
        ]}
      />
      <TemplateInstallsTable
        hasActiveInstalls={inFlight.items.length > 0}
        installations={items}
        nextCursor={nextCursor}
        status={parsedStatus.success ? parsedStatus.data : null}
        workspaceId={workspaceId}
      />
    </div>
  )
}
