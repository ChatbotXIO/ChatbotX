import {
  listSelectableTemplateCategories,
  TEMPLATE_MANAGE_PERMISSION,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { TemplateForm } from "@/features/templates/components/template-form"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function CreateTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ name?: string }>
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
  // The name typed in the "Create" dialog; anything unusable starts blank.
  const initialName = z
    .string()
    .trim()
    .max(255)
    .catch("")
    .parse((await searchParams).name ?? "")

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
        initialName={initialName}
        selectableCategories={listSelectableTemplateCategories(
          member.targetWorkspaceMember.permissions,
        )}
        workspaceId={workspaceId}
      />
    </div>
  )
}
