"use server"

import {
  conversationService,
  inboxTeamService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { UserModel } from "@chatbotx.io/database/types"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import {
  type AssignConversationSchema,
  assignConversationSchema,
} from "@/features/conversations/schema/action"
import { workspaceActionClient } from "@/lib/safe-action"

export const assignConversation = async (props: {
  workspaceId: string
  contactIds: string[]
  assignedId: string | null | undefined
  assignedBy: string
}) => {
  const { workspaceId, contactIds, assignedId, assignedBy } = props

  const updatedData: {
    assignedUserId: string | null
    assignedInboxTeamId: string | null
  } = {
    assignedUserId: null,
    assignedInboxTeamId: null,
  }

  if (assignedId?.startsWith("u_")) {
    const userId = assignedId.slice(2)
    const workspaceMember =
      await workspaceMemberService.findByWorkspaceIdAndUserId({
        workspaceId,
        userId,
      })
    if (!workspaceMember) {
      throw new ChatbotXException("User is not valid", "invalidAssignee", 400)
    }
    updatedData.assignedUserId = workspaceMember.userId
  } else if (assignedId?.startsWith("t_")) {
    const inboxTeamId = assignedId.slice(2)
    const inboxTeam = await inboxTeamService.findByIdOrFail({
      workspaceId,
      inboxTeamId,
    })
    updatedData.assignedInboxTeamId = inboxTeam.id
  }

  const conversations = await conversationService.findManyByContactIds({
    workspaceId,
    contactIds,
  })
  if (conversations.length === 0) {
    return
  }

  const triggerContext = {
    triggerSource: "api",
    triggerHandler: "assignConversation",
    triggerType:
      updatedData.assignedUserId || updatedData.assignedInboxTeamId
        ? "conversation_assigned"
        : "conversation_unassigned",
  }

  await conversationService.updateAssignment({
    workspaceId,
    conversations,
    assignedUserId: updatedData.assignedUserId,
    assignedInboxTeamId: updatedData.assignedInboxTeamId,
    assignedBy,
    triggerContext,
  })
}

export const assignConversationAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(assignConversationSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: AssignConversationSchema
      ctx: { user: UserModel }
    }) => {
      await assignConversation({
        workspaceId,
        contactIds: parsedInput.contactIds,
        assignedId: parsedInput.assignedId,
        assignedBy: ctx.user.id,
      })
    },
  )
