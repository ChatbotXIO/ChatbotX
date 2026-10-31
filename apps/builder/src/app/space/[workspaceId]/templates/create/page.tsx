import {
  listSelectableTemplateCategories,
  TEMPLATE_MANAGE_PERMISSION,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { TemplateForm } from "@/features/templates/components/template-form"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function CreateTemplatePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  await requireWorkspacePermission(workspaceId, TEMPLATE_MANAGE_PERMISSION)
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return notFound()
  }

  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("templates.title"),
            href: `/space/${workspaceId}/templates`,
          },
          { label: t("actions.create"), href: "" },
        ]}
      />
      <TemplateForm
        selectableCategories={listSelectableTemplateCategories(
          userAndWorkspace.targetWorkspaceMember.permissions,
        )}
        workspaceId={workspaceId}
      />
    </div>
  )
}
