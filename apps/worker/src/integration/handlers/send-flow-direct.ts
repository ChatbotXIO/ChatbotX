import { db } from "@chatbotx.io/database/client"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import { IntegrationJobAction } from "@chatbotx.io/worker-config"
import { runFlowNode } from "./flow"

export interface SendFlowDirectParams {
  contactId: string
  flowId: string
  metadata?: MetadataPayload
  workspaceId: string
}

export async function sendFlowDirect(
  params: SendFlowDirectParams,
): Promise<Date> {
  const { flowId, workspaceId, contactId, metadata } = params

  const conversation = await db.query.conversationModel.findFirst({
    where: {
      contactId,
      workspaceId,
    },
  })

  if (!conversation) {
    throw new Error(`Conversation not found for contact ${contactId}`)
  }

  await runFlowNode({
    type: IntegrationJobAction.sendFlow,
    data: {
      flowId,
      conversationId: conversation.id,
      metadata,
    },
  })

  return new Date()
}
