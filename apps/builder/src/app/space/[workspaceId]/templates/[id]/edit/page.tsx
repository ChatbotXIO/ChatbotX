import {
  listSelectableTemplateCategories,
  TEMPLATE_MANAGE_PERMISSION,
  templateService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { TemplateForm } from "@/features/templates/components/template-form"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }

  await requireWorkspacePermission(workspaceId, TEMPLATE_MANAGE_PERMISSION)

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  // The detail read leaves out the snapshot payload: it is megabytes the
  // editor never shows and must not be serialized into the client component.
  const template = await templateService
    .getDetailOrFail({ workspaceId, templateId: id })
    .catch(() => null)
  if (!(template && userAndWorkspace)) {
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
          { label: t("actions.edit"), href: "" },
        ]}
      />
      <TemplateForm
        selectableCategories={listSelectableTemplateCategories(
          userAndWorkspace.targetWorkspaceMember.permissions,
        )}
        template={template}
        workspaceId={workspaceId}
      />
    </div>
  )
}
