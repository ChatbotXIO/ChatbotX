"use server"

import { broadcastService } from "@chatbotx.io/business"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
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
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "validation" &&
        "field" in error
      ) {
        const field = error.field as string
        return returnValidationErrors(createBroadcastRequest, {
          _errors: ["Validation Exception"],
          [field]: {
            _errors: [error.message],
          },
        })
      }

      throw error
    }
  })
