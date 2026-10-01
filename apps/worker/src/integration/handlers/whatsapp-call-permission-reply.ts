import { whatsappCallPermissionService } from "@chatbotx.io/business"
import type { MessageModel } from "@chatbotx.io/database/types"
import { getWhatsappCallPermissionReply } from "@chatbotx.io/sdk"

/**
 * Records a contact's answer to a WhatsApp call-permission request. It is
 * account state, not automation, so it is recorded for an owner delivery and
 * for a standby (listen-only) delivery alike; the caller runs no automation
 * for the message afterwards. Returns `true` when the message was such a reply.
 */
export async function recordWhatsappCallPermissionReply(props: {
  workspaceId: string
  message: Pick<
    MessageModel,
    "senderType" | "contentAttributes" | "contactInboxId" | "createdAt"
  >
}): Promise<boolean> {
  const { workspaceId, message } = props
  const reply = getWhatsappCallPermissionReply(message.contentAttributes)
  if (message.senderType !== "contact" || !reply) {
    return false
  }
  await whatsappCallPermissionService.recordReply({
    workspaceId,
    contactInboxId: message.contactInboxId,
    response: reply.response,
    isPermanent: reply.isPermanent === true,
    expirationTimestamp: reply.expirationTimestamp,
    respondedAt: message.createdAt,
  })
  return true
}
