import { db } from "@chatbotx.io/database/client"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
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

  const allContactInboxes = await db.query.contactInboxModel.findMany({
    where: {
      contactId,
    },
  })

  await Promise.all(
    allContactInboxes.map(async (contactInbox) => {
      await runFlowNode({
        flowId,
        metadata,
        conversationId: conversation,
        contactInboxId: contactInbox,
      })
    }),
  )

  return new Date()
}
