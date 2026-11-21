import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isWorkspaceAdminMember } from "@chatbotx.io/business/workspace-member/predicates"
import { workspaceMemberRoles } from "@chatbotx.io/database/partials"
import { getTranslations } from "next-intl/server"

type MemberLike = { role: string; permissions: unknown }

/** An admin (owner or `superAdmin`); a row with an unknown role is never one. */
export const canManageTranslation = (member: MemberLike): boolean =>
  isWorkspaceAdminMember({
    permissions: member.permissions,
    role: workspaceMemberRoles.safeParse(member.role).data ?? "agent",
  })

/**
 * Changing or testing the translation settings spends the workspace's AI key and
 * sends chat content to a provider, so it is for admins. A workspace API token
 * is already restricted by its `settings` scope (`context.member` is unset); a
 * member signed in through the mobile app must be an admin too.
 */
export async function assertCanManageTranslation(context: {
  member?: MemberLike
}): Promise<void> {
  if (context.member && !canManageTranslation(context.member)) {
    const t = await getTranslations()
    throw new ChatbotXException(
      t("errors.superAdminRequired"),
      "FORBIDDEN",
      403,
    )
  }
}
