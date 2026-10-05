"use server"

import { integrationWhatsappService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { syncWhatsappFlows } from "../lib/whatsapp-flow-operations"

export const syncWhatsappFlowsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const integrationWhatsapp =
      await integrationWhatsappService.findByIdForWorkspace({ workspaceId, id })
    if (!integrationWhatsapp) {
      throw new Error("Whatsapp integration not found")
    }

    await syncWhatsappFlows({ workspaceId, integrationWhatsapp })
  })
