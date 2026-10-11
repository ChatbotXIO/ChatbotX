import {
  contactInboxService,
  integrationWhatsappService,
  messageService,
  resolveSentWhatsappFlow,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import { getWhatsappFlowResponse } from "@chatbotx.io/sdk"
import { buildWhatsappContext } from "@/features/integration-whatsapp/flows/lib/whatsapp-flow-operations"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import type { WhatsappFlowResponse } from "../schema/flow-response"
import {
  buildWhatsappFlowResponseFields,
  type FlowResponseLabel,
} from "./build-whatsapp-flow-response-fields"

const FLOW_RESPONSE_NOT_FOUND = "WhatsApp Flow response not found"

const readFlowToken = (
  flowToken: string | null | undefined,
  flowResponse: Record<string, unknown>,
): string | null =>
  flowToken ??
  (typeof flowResponse.flow_token === "string" ? flowResponse.flow_token : null)

const findIntegrationWhatsapp = async (props: {
  workspaceId: string
  inboxId: string
  integrationWhatsappId?: string | null
}): Promise<IntegrationWhatsappModel | null | undefined> =>
  props.integrationWhatsappId
    ? await integrationWhatsappService.findByIdForWorkspace({
        id: props.integrationWhatsappId,
        workspaceId: props.workspaceId,
      })
    : await integrationWhatsappService.findByInboxIdForWorkspace({
        inboxId: props.inboxId,
        workspaceId: props.workspaceId,
      })

/**
 * The labels of the Flow a response answers. Every miss — a token from
 * outside ChatbotX, a deleted Flow or number, Meta unreachable — returns no
 * labels, so the response still shows with humanized keys.
 */
const loadFlowResponseLabels = async (props: {
  workspaceId: string
  contactInboxId: string
  flowToken: string | null
}): Promise<FlowResponseLabel[]> => {
  try {
    const contactInbox = await contactInboxService.findBy({
      where: { id: props.contactInboxId },
    })
    if (!contactInbox) {
      return []
    }
    const sentFlow = await resolveSentWhatsappFlow({
      workspaceId: props.workspaceId,
      inboxId: contactInbox.inboxId,
      flowToken: props.flowToken,
    })
    if (!sentFlow) {
      return []
    }
    const integrationWhatsapp = await findIntegrationWhatsapp({
      workspaceId: props.workspaceId,
      inboxId: contactInbox.inboxId,
      integrationWhatsappId: sentFlow.integrationWhatsappId,
    })
    if (!integrationWhatsapp) {
      return []
    }
    const ctx = await buildWhatsappContext(
      props.workspaceId,
      integrationWhatsapp,
    )
    return await integrations.whatsapp.runAction("getFlowResponseFields", {
      ctx,
      params: { flowSourceId: sentFlow.flowSourceId },
    })
  } catch (err) {
    logger.warn(
      { err, workspaceId: props.workspaceId },
      "Could not label a WhatsApp Flow response",
    )
    return []
  }
}

/**
 * A WhatsApp Flow response message's answers, labelled as the Flow asks
 * them. Shared by the inbox's "View response" dialog and the public API.
 */
export async function getWhatsappFlowResponseView(props: {
  workspaceId: string
  conversationId: string
  messageId: string
  createdAt: Date
}): Promise<WhatsappFlowResponse> {
  const message = await messageService.findByIdWithUrls({
    workspaceId: props.workspaceId,
    id: props.messageId,
    createdAt: props.createdAt,
  })
  // `findByIdWithUrls` scopes by workspace only: a message of another
  // conversation must read as missing under this conversation's path.
  if (message.conversationId !== props.conversationId) {
    throw notFoundException("Message not found")
  }
  const entity = getWhatsappFlowResponse(message.contentAttributes)
  if (!entity) {
    throw notFoundException(FLOW_RESPONSE_NOT_FOUND)
  }

  const labels = await loadFlowResponseLabels({
    workspaceId: props.workspaceId,
    contactInboxId: message.contactInboxId,
    flowToken: readFlowToken(entity.flowToken, entity.flowResponse),
  })
  return buildWhatsappFlowResponseFields(entity.flowResponse, labels)
}
