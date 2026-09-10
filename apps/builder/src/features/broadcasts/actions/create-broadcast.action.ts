"use server"

import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { createBroadcastRequest } from "../schema/action"
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

    // The service owns every rule (channel/subaction, page and integration
    // ownership, template-to-page pairing, name). A rejected payload comes
    // back as a field-level form error rather than a toast.
    const broadcast = await withBroadcastValidationErrors(() =>
      broadcastService.create({
        workspaceId,
        canViewEmailAndPhone,
        data: parsedInput,
      }),
    )

    await auditService.record({
      workspaceId,
      action: "create",
      detail: `created a new broadcast (#${broadcast.id})`,
    })

    // A draft is never launched — it only leaves `draft` through
    // `scheduleBroadcastAction`, which records its own `launch` entry.
    if (parsedInput.schedulesType === "now" && !parsedInput.saveAsDraft) {
      await auditService.record({
        workspaceId,
        action: "launch",
        detail: `launched a broadcast (#${broadcast.id})`,
      })
    }

    return broadcast
  })
