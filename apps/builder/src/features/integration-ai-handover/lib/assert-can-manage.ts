import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"

/**
 * Who may change a Page's Meta Business AI settings: a super admin, never a
 * platform support session (the switch messages and hands over real customers).
 */
export async function assertCanManageAiHandover(ctx: {
  workspaceMemberPermissions: Parameters<typeof hasWorkspacePermission>[0]
  isSupportSession: boolean
}): Promise<void> {
  const t = await getTranslations()
  if (!hasWorkspacePermission(ctx.workspaceMemberPermissions, "superAdmin")) {
    throw new ChatbotXException(t("errors.superAdminRequired"))
  }
  if (ctx.isSupportSession) {
    throw new ChatbotXException(t("aiHandover.errors.supportSession"))
  }
}

/** Shows a known service error code translated; anything else propagates. */
export async function rethrowTranslated(
  error: unknown,
  copyKeys: Record<string, string>,
): Promise<never> {
  if (error instanceof ChatbotXException) {
    const copyKey = copyKeys[error.code]
    if (copyKey) {
      const t = await getTranslations()
      throw new ChatbotXException(t(copyKey), error.code, 422)
    }
  }
  throw error
}
