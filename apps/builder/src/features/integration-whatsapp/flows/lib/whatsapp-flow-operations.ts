import {
  buildContext,
  integrationWhatsappService,
  whatsappFlowService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { ModelNotfoundException } from "@chatbotx.io/database/errors"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { integrations } from "@/integration"

// The WhatsApp Flows operations behind both the builder and the public API.

const FLOW_NOT_FOUND = "WhatsApp Flow not found"

const buildWhatsappContext = (
  workspaceId: string,
  integrationWhatsapp: IntegrationWhatsappModel,
) =>
  buildContext({
    workspaceId,
    integrationType: "whatsapp",
    integration: {
      ...integrationWhatsapp,
      auth: integrationWhatsapp.auth as WhatsappAuthValue,
    },
  })

/** Pulls the number's WhatsApp Flows from Meta into the local table. */
export async function syncWhatsappFlows(props: {
  workspaceId: string
  integrationWhatsapp: IntegrationWhatsappModel
}): Promise<void> {
  const ctx = await buildWhatsappContext(
    props.workspaceId,
    props.integrationWhatsapp,
  )
  const res = await integrations.whatsapp.runAction("listFlows", {
    ctx,
    params: { limit: 100 },
  })
  await whatsappFlowService.syncFromMeta({
    integrationWhatsappId: props.integrationWhatsapp.id,
    flows: res.data,
  })
}

/**
 * The screens (and the fields each one outputs) of a Flow, read from Meta. The
 * Flow must belong to a WhatsApp number of the workspace.
 */
export async function getWhatsappFlowScreens(props: {
  workspaceId: string
  flowId: string
}) {
  // A missing Flow and a Flow of another workspace must read identically.
  const flow = await whatsappFlowService
    .findByIdUnscoped(props.flowId)
    .catch((error: unknown) => {
      throw error instanceof ModelNotfoundException
        ? notFoundException(FLOW_NOT_FOUND)
        : error
    })
  const integrationWhatsapp =
    await integrationWhatsappService.findByIdForWorkspace({
      id: flow.integrationWhatsappId,
      workspaceId: props.workspaceId,
    })
  if (!integrationWhatsapp) {
    // A Flow of another workspace reads as missing.
    throw notFoundException(FLOW_NOT_FOUND)
  }
  const ctx = await buildWhatsappContext(props.workspaceId, integrationWhatsapp)
  return await integrations.whatsapp.runAction("getFlowAssets", {
    ctx,
    params: { flowSourceId: flow.sourceId },
  })
}
