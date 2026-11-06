import {
  canViewTemplateInstalls,
  TEMPLATE_MANAGE_PERMISSION,
} from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { AppTab } from "@/components/app-tab"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"

type TemplatesTab = "mine" | "installed"

/** Each tab shows only for a member allowed to open it, so a tab never leads to a not-found page. */
export async function TemplatesTabs({
  workspaceId,
  active,
  permissions,
}: {
  workspaceId: string
  active: TemplatesTab
  permissions: Parameters<typeof canViewTemplateInstalls>[0]
}) {
  const t = await getTranslations("templates.tabs")
  const tabs = [
    hasWorkspacePermission(permissions, TEMPLATE_MANAGE_PERMISSION) && {
      label: t("mine"),
      href: `/space/${workspaceId}/templates`,
      isActive: active === "mine",
    },
    canViewTemplateInstalls(permissions) && {
      label: t("installed"),
      href: `/space/${workspaceId}/templates/installs`,
      isActive: active === "installed",
    },
  ].filter((tab) => tab !== false)

  return <AppTab tabs={tabs} />
}
