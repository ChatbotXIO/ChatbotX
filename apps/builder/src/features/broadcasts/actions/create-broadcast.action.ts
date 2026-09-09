"use server"

import { broadcastService } from "@chatbotx.io/business"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBroadcastRequest } from "../schema/action"

export const createBroadcastAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createBroadcastRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
    const canViewEmailAndPhone = userAndWorkspace
      ? canViewContactEmailAndPhone(
          userAndWorkspace.targetWorkspaceMember.permissions,
        )
      : false

    try {
      return await broadcastService.create({
        ...parsedInput,
        workspaceId,
        canViewEmailAndPhone,
      })
    } catch (error) {
      if (isValidationException(error) && error.field) {
        return returnValidationErrors(createBroadcastRequest, {
          _errors: ["Validation Exception"],
          [error.field]: {
            _errors: [error.message],
          },
        })
      }

      throw error
    }
  })
