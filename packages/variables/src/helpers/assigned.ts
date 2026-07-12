import {
  conversationService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"

const resolveAssigneeMember = async (props: {
  contactId: string
  workspaceId: string
}) => {
  const conversation = await conversationService.findBy({
    where: { contactId: props.contactId, workspaceId: props.workspaceId },
  })
  if (!conversation?.assignedUserId) {
    return null
  }

  return (
    (await workspaceMemberService.findWithUserByWorkspaceIdAndUserId({
      workspaceId: props.workspaceId,
      userId: conversation.assignedUserId,
    })) ?? null
  )
}

export const resolveAssigneeName = async (
  contactId: string,
  workspaceId: string,
): Promise<string | null> =>
  (await resolveAssigneeMember({ contactId, workspaceId }))?.user.name ?? null

export const resolveAssigneeEmail = async (
  contactId: string,
  workspaceId: string,
): Promise<string | null> =>
  (await resolveAssigneeMember({ contactId, workspaceId }))?.user.email ?? null

export const resolveAssigneeId = async (
  contactId: string,
  workspaceId: string,
): Promise<string | null> =>
  (await resolveAssigneeMember({ contactId, workspaceId }))?.user.id ?? null

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
