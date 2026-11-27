import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import type { ConversationModel } from "@chatbotx.io/database/types"
import { inboxTeamService } from "../enterprise/inbox-team/service"
import { notFoundException } from "../errors"
import { hasContactsAccess } from "../workspace-member/permissions"

export type ConversationMemberScope = {
  chatScope: "all" | "assigned" | "none"
  /** Inbox teams the member belongs to; only populated for `assigned`. */
  teamIds: string[]
  userId: string
}

type ConversationAssignment = Pick<
  ConversationModel,
  "assignedUserId" | "assignedInboxTeamId"
>

const resolve = async (input: {
  workspaceId: string
  userId: string
  permissions: WorkspaceMemberPermissions
}): Promise<ConversationMemberScope> => {
  const { workspaceId, userId, permissions } = input
  if (!hasContactsAccess(permissions)) {
    return { chatScope: "none", teamIds: [], userId }
  }
  if (permissions.superAdmin === true || !permissions.onlyAssignedContacts) {
    return { chatScope: "all", teamIds: [], userId }
  }
  const teamIds = await inboxTeamService.listTeamIdsByUserId({
    workspaceId,
    userId,
  })
  return { chatScope: "assigned", teamIds, userId }
}

const allows = (
  scope: ConversationMemberScope | undefined,
  conversation: ConversationAssignment,
): boolean => {
  if (!scope || scope.chatScope === "all") {
    return true
  }
  if (scope.chatScope === "none") {
    return false
  }
  return (
    conversation.assignedUserId === scope.userId ||
    (conversation.assignedInboxTeamId !== null &&
      scope.teamIds.includes(conversation.assignedInboxTeamId))
  )
}

const where = (
  scope: ConversationMemberScope | undefined,
): Record<string, unknown> | undefined => {
  if (!scope || scope.chatScope === "all") {
    return
  }
  if (scope.chatScope === "none") {
    throw notFoundException("Conversation not found")
  }
  return {
    OR: [
      { assignedUserId: scope.userId },
      ...(scope.teamIds.length > 0
        ? [{ assignedInboxTeamId: { in: scope.teamIds } }]
        : []),
    ],
  }
}

export const conversationMemberScope = { allows, resolve, where }
