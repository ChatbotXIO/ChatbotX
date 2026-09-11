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
} from "@/features/common/schema"
import {
  type AssignConversationSchema,
  assignConversationSchema,
} from "@/features/conversations/schema/action"
import { workspaceActionClient } from "@/lib/safe-action"

async function resolveAssignmentTarget(
  workspaceId: string,
  assignedId: string | null | undefined,
): Promise<{
  assignedUserId: string | null
  assignedInboxTeamId: string | null
}> {
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
  } else if (assignedId != null) {
    // Schema validation should already reject this shape, but guard here too
    // so a caller can never silently unassign via an unrecognized prefix.
    throw new ChatbotXException(
      "assignedId must start with 'u_' or 't_'",
      "invalidAssignee",
      400,
    )
  }

  return updatedData
}

export const assignConversation = async (props: {
  workspaceId: string
  contactIds: string[]
  assignedId: string | null | undefined
  // Optional: a workspace-token caller has no user (see
  // docs/developer/workspace-api-tokens.md); the session path always passes
  // `ctx.user.id` below.
  assignedBy?: string
}) => {
  const { workspaceId, contactIds, assignedId, assignedBy } = props

  const updatedData = await resolveAssignmentTarget(workspaceId, assignedId)

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

// Single-conversation, path-addressed variant for the public API — assigns
// exactly the conversation given, not every conversation belonging to its
// contact (a contact can have a DM plus N comment-thread conversations, all
// sharing one `contactId`; see `assignConversation` above).
export const assignSingleConversation = async (props: {
  workspaceId: string
  conversation: { id: string; contactId: string }
  assignedId: string | null | undefined
  assignedBy?: string
}) => {
  const { workspaceId, conversation, assignedId, assignedBy } = props

  const updatedData = await resolveAssignmentTarget(workspaceId, assignedId)

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
    conversations: [conversation],
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
