"use server"

import {
  buildContext,
  integrationWhatsappService,
  whatsappMessageTemplateService,
} from "@chatbotx.io/business"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { integrations } from "@/integration"
import { workspaceActionClient } from "@/lib/safe-action"

export const syncMessageTemplateAction = workspaceActionClient
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

    const ctx = await buildContext({
      workspaceId,
      integrationType: "whatsapp",
      integration: {
        ...integrationWhatsapp,
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
      },
    })
    const res = await integrations.whatsapp.runAction("listMessageTemplates", {
      ctx,
    })

    await whatsappMessageTemplateService.syncFromMeta({
      integrationWhatsappId: integrationWhatsapp.id,
      templates: res.data,
    })
  })
