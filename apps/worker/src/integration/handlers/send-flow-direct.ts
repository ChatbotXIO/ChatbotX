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

  // Non-SMTP channels share the contact's one conversation (as before email
  // threading). Only SMTP contacts open an email thread, so a contact with
  // nothing but SMTP inboxes needs no pre-existing conversation.
  const hasNonSmtpInbox = allContactInboxes.some(
    (contactInbox) => contactInbox.channel !== "smtp",
  )
  const found = hasNonSmtpInbox
    ? await conversationService.findBy({ where: { contactId, workspaceId } })
    : null
  if (hasNonSmtpInbox && !found) {
    throw new Error(`Conversation not found for contact ${contactId}`)
  }
  const sharedConversation = found ?? undefined

  await Promise.all(
    allContactInboxes.map(async (contactInbox) => {
      const conversation =
        contactInbox.channel === "smtp"
          ? await conversationService.resolveOutreachConversation({
              workspaceId,
              contactInbox,
              seed: flowExecutionKey
                ? `${flowExecutionKey}:${flowId}:${contactInbox.id}`
                : undefined,
            })
          : (sharedConversation as NonNullable<typeof sharedConversation>)
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
