"use server"

import { conversationService } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { UserModel } from "@chatbotx.io/database/types"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import {
  type AssignConversationSchema,
  assignConversationSchema,
} from "@/features/conversations/schema/action"
import { workspaceActionClient } from "@/lib/safe-action"

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
      const updatedData: {
        assignedUserId: string | null
        assignedInboxTeamId: string | null
      } = {
        assignedUserId: null,
        assignedInboxTeamId: null,
      }

      if (parsedInput.assignedId?.startsWith("u_")) {
        const userId = parsedInput.assignedId.slice(2)
        const workspaceMember = await db.query.workspaceMemberModel.findFirst({
          where: {
            workspaceId,
            userId,
          },
        })
        if (!workspaceMember) {
          returnValidationErrors(assignConversationSchema, {
            assignedId: {
              _errors: ["User is not valid"],
            },
          })
        }
        updatedData.assignedUserId = workspaceMember.userId
      } else if (parsedInput.assignedId?.startsWith("t_")) {
        const inboxteamId = parsedInput.assignedId.slice(2)
        const inboxTeam = await db.query.inboxTeamModel.findFirst({
          where: {
            workspaceId,
            id: inboxteamId,
          },
        })
        if (!inboxTeam) {
          returnValidationErrors(assignConversationSchema, {
            assignedId: {
              _errors: ["Inbox Team is not valid"],
            },
          })
        }
        updatedData.assignedInboxTeamId = inboxTeam.id
      }

      const conversations = await conversationService.findManyByContactIds({
        workspaceId,
        contactIds: parsedInput.contactIds,
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
        assignedBy: ctx.user.id,
        triggerContext,
      })
    },
  )
