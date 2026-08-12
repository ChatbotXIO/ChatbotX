import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export async function assertWorkspaceSuperAdmin(
  workspaceId: string,
): Promise<void> {
  const t = await getTranslations()
  const currentUserAndTargetWorkspace =
    await getCurrentUserAndTargetWorkspace(workspaceId)

  if (
    !(
      currentUserAndTargetWorkspace &&
      hasWorkspacePermission(
        currentUserAndTargetWorkspace.targetWorkspaceMember.permissions,
        "superAdmin",
      )
    )
  ) {
    throw new ChatbotXException(t("errors.superAdminRequired"))
  }
}
