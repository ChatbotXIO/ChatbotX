"use server"

import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const cloneBroadcastAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, broadcastId],
    } = props

    // The copied contact filter is pruned of email/phone conditions the actor
    // may not view, mirroring resend/create.
    const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
    const canViewEmailAndPhone = userAndWorkspace
      ? canViewContactEmailAndPhone(
          userAndWorkspace.targetWorkspaceMember.permissions,
        )
      : false

    const clone = await broadcastService.cloneBroadcast({
      workspaceId,
      broadcastId,
      canViewEmailAndPhone,
    })

    await auditService.record({
      workspaceId,
      action: "create",
      detail: `cloned a broadcast (#${clone.id})`,
    })

    return clone
  })
