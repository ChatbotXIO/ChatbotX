import {
  buildContext,
  whatsappMessageTemplateService,
} from "@chatbotx.io/business"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { integrations } from "@/integration"

/** Pulls the number's templates and their approval status from Meta into the local table. */
export async function syncWhatsappMessageTemplates(props: {
  workspaceId: string
  integrationWhatsapp: IntegrationWhatsappModel
}): Promise<void> {
  const { workspaceId, integrationWhatsapp } = props
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
}
