import { contactInboxService, conversationService } from "@chatbotx.io/business"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import { runFlowNode } from "./flow"

export interface SendFlowDirectParams {
  contactId: string
  flowExecutionKey?: string
  flowId: string
  metadata?: MetadataPayload
  workspaceId: string
}

export async function sendFlowDirect(
  params: SendFlowDirectParams,
): Promise<Date> {
  const { flowExecutionKey, flowId, workspaceId, contactId, metadata } = params

  const allContactInboxes = await contactInboxService.listByContactId({
    workspaceId,
    contactId,
  })

  await Promise.all(
    allContactInboxes.map(async (contactInbox) => {
      const conversation =
        await conversationService.resolveOutreachConversation({
          workspaceId,
          contactInbox,
          seed: flowExecutionKey
            ? `${flowExecutionKey}:${flowId}:${contactInbox.id}`
            : undefined,
        })
      await runFlowNode(
        {
          flowId,
          metadata,
          conversationId: conversation,
          contactInboxId: contactInbox,
        },
        { flowExecutionKey },
      )
    }),
  )

  return new Date()
}
