import {
  getEditableTemplateOrFail,
  listSelectableTemplateCategories,
  TEMPLATE_MANAGE_PERMISSION,
  templateService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { AppTab } from "@/components/app-tab"
import { TemplateForm } from "@/features/templates/components/template-form"
import { TemplateVersionsList } from "@/features/templates/components/template-versions-list"
import { nullOnNotFound } from "@/features/templates/lib/not-found-guard"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function EditTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }

  const member = await requireWorkspacePermission(
    workspaceId,
    TEMPLATE_MANAGE_PERMISSION,
  )

  // The detail read leaves out the snapshot payload: it is megabytes the
  // editor never shows and must not be serialized into the client component.
  const template = await nullOnNotFound(
    getEditableTemplateOrFail({ workspaceId, templateId: id }),
    "template edit page: loading the template failed",
  )
  if (!template) {
    return notFound()
  }

  const t = await getTranslations()
  const { tab } = await searchParams
  const showVersions = tab === "versions"
  const editHref = `/space/${workspaceId}/templates/${id}/edit`

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
      <AppTab
        tabs={[
          {
            label: t("templates.versions.detailsTab"),
            href: editHref,
            isActive: !showVersions,
          },
          {
            label: t("templates.versions.tab"),
            href: `${editHref}?tab=versions`,
            isActive: showVersions,
          },
        ]}
      />
      {showVersions ? (
        <TemplateVersionsList
          currentVersion={template.version}
          versions={
            await templateService.listVersions({
              workspaceId,
              templateId: id,
            })
          }
        />
      ) : (
        <TemplateForm
          selectableCategories={listSelectableTemplateCategories(
            member.targetWorkspaceMember.permissions,
          )}
          template={template}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
