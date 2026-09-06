import { contactInboxService, conversationService } from "@chatbotx.io/business"
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

  const conversation = await conversationService.findBy({
    where: { contactId, workspaceId },
  })

  if (!conversation) {
    throw new Error(`Conversation not found for contact ${contactId}`)
  }

  const allContactInboxes = await contactInboxService.listByContactId({
    workspaceId,
    contactId,
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
