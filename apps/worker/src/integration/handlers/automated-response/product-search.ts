import { buildProductSearchReply } from "@chatbotx.io/business"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"

/**
 * "Search Products": when the store has it on and the contact's message names
 * products, the bot answers with them and the rest of the automation (global
 * router, AI agent, default reply) stays quiet. Keywords have already had
 * their turn. Best effort: a failed search falls through to the usual reply.
 */
export async function replyWithMatchingProducts(input: {
  conversation: Pick<ConversationModel, "id" | "workspaceId" | "contactId">
  contactInbox: Pick<ContactInboxModel, "id" | "channel">
  messageId: string
  text: string
}): Promise<boolean> {
  try {
    const step = await buildProductSearchReply({
      workspaceId: input.conversation.workspaceId,
      contactId: input.conversation.contactId,
      channel: input.contactInbox.channel,
      text: input.text,
    })
    if (!step) {
      return false
    }
    await chatQueue.add(
      ChatJobAction.sendFlowMessage,
      {
        type: ChatJobAction.sendFlowMessage,
        data: {
          conversationId: input.conversation.id,
          contactInboxId: input.contactInbox.id,
          // Not part of any flow, like the cart CHECK OUT reply.
          flowId: "",
          step,
        },
      },
      { jobId: `product-search-${input.messageId}` },
    )
    return true
  } catch (error) {
    logger.warn(
      {
        err: normalizeError(error),
        conversationId: input.conversation.id,
        messageId: input.messageId,
      },
      "Product search by message failed",
    )
    return false
  }
}
