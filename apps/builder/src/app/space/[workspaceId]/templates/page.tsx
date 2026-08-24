import { templateService } from "@chatbotx.io/business"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { getIdFromParams } from "@chatbotx.io/utils"
import { PlusIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { TemplatesTable } from "@/features/templates/components/templates-table"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  const isSuperAdmin = Boolean(
    userAndWorkspace &&
      hasWorkspacePermission(
        userAndWorkspace.targetWorkspaceMember.permissions,
        "superAdmin",
      ),
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
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {t("templates.description")}
        </p>
        <div className="flex gap-2">
          <Button
            render={
              <Link href={`/space/${workspaceId}/templates/installs`}>
                {t("templates.installs.title")}
              </Link>
            }
            variant="outline"
          />
          {isSuperAdmin && (
            <Button
              render={
                <Link href={`/space/${workspaceId}/templates/create`}>
                  <PlusIcon />
                  {t("actions.create")}
                </Link>
              }
            />
          )}
        </div>
      </div>
      <TemplatesTable
        isSuperAdmin={isSuperAdmin}
        templates={templates}
        workspaceId={workspaceId}
      />
    </div>
  )
}
