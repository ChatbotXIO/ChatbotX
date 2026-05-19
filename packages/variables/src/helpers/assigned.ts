import {
  conversationService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"

const getAssignedAdmin = async (workspaceId: string) => {
  const members = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })
  return members.find((m) => m.role === "admin") ?? null
}

export const getAssignedAdminName = async (
  workspaceId: string,
): Promise<string | null> =>
  (await getAssignedAdmin(workspaceId))?.user.name ?? null

export const getAssignedAdminEmail = async (
  workspaceId: string,
): Promise<string | null> =>
  (await getAssignedAdmin(workspaceId))?.user.email ?? null

export const getAssignedAdminId = async (
  workspaceId: string,
): Promise<string | null> =>
  (await getAssignedAdmin(workspaceId))?.user.id ?? null

export const getAssignedMemberName = async (
  contactId: string,
  workspaceId: string,
): Promise<string | null> => {
  const conversation = await conversationService.findBy({
    where: { contactId },
  })
  if (!conversation?.assignedUserId) {
    return null
  }
  const members = await workspaceMemberService.listByWorkspaceId({
    workspaceId,
  })
  return (
    members.find((m) => m.userId === conversation.assignedUserId)?.user.name ??
    null
  )
}

export const getAssignedTeamName = async (
  contactId: string,
): Promise<string | null> => {
  const conversation = await conversationService.findBy({
    where: { contactId },
  })
  if (!conversation?.assignedInboxTeamId) {
    return null
  }
  const team = await db.query.inboxTeamModel.findFirst({
    where: { id: conversation.assignedInboxTeamId },
  })
  return team?.name ?? null
}
