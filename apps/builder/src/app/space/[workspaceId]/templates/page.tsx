import {
  TEMPLATE_MANAGE_PERMISSION,
  templateService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CreateTemplateDialog } from "@/features/templates/components/create-template-dialog"
import { TemplatesTable } from "@/features/templates/components/templates-table"
import { TemplatesTabs } from "@/features/templates/components/templates-tabs"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const member = await requireWorkspacePermission(
    workspaceId,
    TEMPLATE_MANAGE_PERMISSION,
  )

  const t = await getTranslations()
  const templates = await templateService.list(workspaceId)

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("templates.title"), href: "" },
        ]}
      />
      <TemplatesTabs
        active="mine"
        permissions={member.targetWorkspaceMember.permissions}
        workspaceId={workspaceId}
      />
      <div className="flex justify-end">
        <CreateTemplateDialog workspaceId={workspaceId} />
      </div>
      <TemplatesTable templates={templates} workspaceId={workspaceId} />
    </div>
  )
}
