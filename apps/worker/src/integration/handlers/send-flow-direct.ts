import { db } from "@chatbotx.io/database/client"
import { IntegrationJobAction } from "@chatbotx.io/worker-config"
import { runFlowNode } from "./flow"

export interface SendFlowDirectParams {
  chatbotId: bigint
  contactId: bigint
  flowId: bigint
}

export async function sendFlowDirect(
  params: SendFlowDirectParams,
): Promise<Date> {
  const { flowId, chatbotId, contactId } = params

  const conversation = await db.query.conversationModel.findFirst({
    where: {
      contactId,
      chatbotId,
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
    },
  })

  return new Date()
}
