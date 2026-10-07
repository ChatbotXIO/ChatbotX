import {
  integrationWhatsappService,
  whatsappFlowService,
} from "@chatbotx.io/business"
import {
  notFoundException,
  validationException,
} from "@chatbotx.io/business/errors"
import {
  miniAppPublicationService,
  miniAppService,
} from "@chatbotx.io/business/mini-app"
import { buildWhatsappContext } from "@/features/integration-whatsapp/flows/lib/whatsapp-flow-operations"
import { integrations } from "@/integration"

/**
 * Publishes a Mini App as a WhatsApp Flow on one of the workspace's numbers,
 * then mirrors the Flow into `WhatsappFlow` so the "Send WhatsApp Flow" step
 * can pick it right away. Shared by the builder action and the public API.
 */
export async function publishMiniAppToWhatsapp(props: {
  workspaceId: string
  miniAppId: string
  integrationWhatsappId: string
}) {
  const miniApp = await miniAppService.findOrFail({
    workspaceId: props.workspaceId,
    id: props.miniAppId,
  })
  const validation = miniAppService.validate(miniApp.definition)
  if (!validation.valid) {
    throw validationException(
      "definition",
      "Fix the Mini App errors before publishing",
      {
        errors: validation.issues.filter((issue) => issue.severity === "error")
          .length,
      },
    )
  }

  const integrationWhatsapp =
    await integrationWhatsappService.findByIdForWorkspace({
      id: props.integrationWhatsappId,
      workspaceId: props.workspaceId,
    })
  if (!integrationWhatsapp) {
    throw notFoundException("WhatsApp number not found")
  }

  const existing = await miniAppPublicationService.findForIntegration({
    miniAppId: miniApp.id,
    integrationWhatsappId: integrationWhatsapp.id,
  })
  const ctx = await buildWhatsappContext(props.workspaceId, integrationWhatsapp)
  const result = await integrations.whatsapp.runAction("publishFlowJson", {
    ctx,
    params: {
      name: miniApp.name,
      flowJson: JSON.stringify(miniApp.flowJson),
      existingFlowId: existing?.sourceId,
    },
  })

  const whatsappFlow = await whatsappFlowService.upsertFromMeta({
    integrationWhatsappId: integrationWhatsapp.id,
    flow: result.flow,
  })
  return await miniAppPublicationService.record({
    miniAppId: miniApp.id,
    integrationWhatsappId: integrationWhatsapp.id,
    whatsappFlowId: whatsappFlow.id,
    sourceId: result.flow.id,
    status: result.flow.status,
    validationErrors: result.flow.validation_errors ?? [],
    published: result.published,
  })
}
