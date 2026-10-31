import {
  canViewTemplateInstalls,
  templateInstallationRequestService,
  templateSyncRequestService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { TemplateInstallationDetail } from "@/features/templates/components/template-installation-detail"
import { nullOnNotFound } from "@/features/templates/lib/not-found-guard"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

// Snowflake ids are digit strings; anything else is a forged cursor.
const CURSOR_PATTERN = /^\d{1,20}$/

export default async function TemplateInstallationPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; id: string }>
  searchParams: Promise<{ cursor?: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const installationId = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && installationId)) {
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

  const { cursor } = await searchParams
  const detail = await nullOnNotFound(
    templateInstallationRequestService.getDetail({
      workspaceId,
      installationId,
    }),
    "template installation page: loading the installation failed",
  )
  if (!detail) {
    return notFound()
  }
  const [resources, history] = await Promise.all([
    templateInstallationRequestService.listResources({
      workspaceId,
      installationId,
      cursor: cursor && CURSOR_PATTERN.test(cursor) ? cursor : undefined,
    }),
    templateSyncRequestService.listHistory({ workspaceId, installationId }),
  ])

  const t = await getTranslations()
  const { uninstall } = detail

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("templates.title"),
            href: `/space/${workspaceId}/templates`,
          },
          {
            label: t("templates.installs.title"),
            href: `/space/${workspaceId}/templates/installs`,
          },
          { label: detail.templateName, href: "" },
        ]}
      />
      <TemplateInstallationDetail
        detail={detail}
        history={history}
        resources={resources}
        uninstall={uninstall}
        workspaceId={workspaceId}
      />
    </div>
  )
}
