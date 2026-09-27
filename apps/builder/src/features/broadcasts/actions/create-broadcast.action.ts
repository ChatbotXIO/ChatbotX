"use server"

import { broadcastService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBroadcastRequest } from "../schema/action"
import { withBroadcastPlanLimitOutcome } from "./broadcast-plan-limit-outcome"
import { withBroadcastValidationErrors } from "./broadcast-validation-error"

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

    return await withBroadcastValidationErrors(() =>
      withBroadcastPlanLimitOutcome(() =>
        broadcastService.create({
          ...parsedInput,
          workspaceId,
          canViewEmailAndPhone,
        }),
      ),
    )
  })
