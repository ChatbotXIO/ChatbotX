import { messageService } from "@chatbotx.io/business"
import type { ContactVariableContext } from "../schema"

export const getQueuedMessages = async (
  context: ContactVariableContext,
): Promise<string | null> => {
  const { contact, contactInbox } = context
  if (!contactInbox) {
    return null
  }

  const sinceTime =
    contactInbox.lastOutboundMessageAt ??
    contactInbox.firstInteractionAt ??
    contactInbox.createdAt
  const messages = await messageService.listIncomingTextsByContactInbox({
    contactInboxId: contactInbox.id,
    limit: 50,
    sinceTime,
    workspaceId: contact.workspaceId,
  })

  if (messages.length === 0) {
    return null
  }

  return [...messages].reverse().join("\n")
}
