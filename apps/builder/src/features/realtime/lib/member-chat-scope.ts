import { hasContactsAccess, inboxTeamService } from "@chatbotx.io/business"
import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { getAssignedContactsUserId } from "@/features/contacts/permissions"

export type MemberChatScope = {
  chatScope: "all" | "assigned" | "none"
  /** Inbox teams the member belongs to; only populated for `assigned`. */
  teamIds: string[]
}

/**
 * Which conversations a workspace member may see: everything (`all`), only
 * those assigned to them or to one of their inbox teams (`assigned`), or
 * nothing (`none`, no contacts/inbox access). The one definition shared by the
 * realtime connect-token mint and the mobile `/v1` conversation scoping, so
 * the live feed and the REST reads can never disagree.
 */
export const resolveMemberChatScope = async (input: {
  workspaceId: string
  userId: string
  permissions: WorkspaceMemberPermissions
}): Promise<MemberChatScope> => {
  const { workspaceId, userId, permissions } = input
  if (!hasContactsAccess(permissions)) {
    return { chatScope: "none", teamIds: [] }
  }
  if (!getAssignedContactsUserId({ permissions, userId })) {
    return { chatScope: "all", teamIds: [] }
  }
  const teamIds = await inboxTeamService.listTeamIdsByUserId({
    workspaceId,
    userId,
  })
  return { chatScope: "assigned", teamIds }
}
