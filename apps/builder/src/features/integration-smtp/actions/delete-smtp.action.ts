"use server"

import { integrationSmtpService, workspaceService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteSmtpAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const [integration, workspace] = await Promise.all([
      integrationSmtpService.findByIdForWorkspace({ id, workspaceId }),
      workspaceService.findById({ id: workspaceId }),
    ])

    await integrationSmtpService.disconnect({
      workspaceId,
      id: integration.id,
      inboxId: integration.inboxId,
      ownerId: workspace.ownerId,
    })

    await auditService.record({
      workspaceId,
      action: "disconnect",
      detail: `disconnected the SMTP channel (#${integration.id})`,
    })
  })
