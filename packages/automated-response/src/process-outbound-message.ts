import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { dispatchAutomatedResponseReply } from "./dispatch-reply"
import { automatedResponseService } from "./utils"

export const replyByOutboundAutomatedResponse = async (props: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  message: { id: string; text: string }
}): Promise<boolean> => {
  const { conversation, contactInbox, message } = props
  if (!message.text) {
    return false
  }

  const allAutomatedResponses = await automatedResponseService.getAll(
    conversation.workspaceId,
  )
  const outboundAutomatedResponses = allAutomatedResponses.filter(
    (automatedResponse) => automatedResponse.type === "outbound",
  )

  return dispatchAutomatedResponseReply({
    conversation,
    contactInbox,
    messageId: message.id,
    text: message.text,
    rules: outboundAutomatedResponses,
    triggerType: "agent_message_out",
  })
}
