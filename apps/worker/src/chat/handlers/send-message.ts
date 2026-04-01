import { findOrFail } from "@chatbotx.io/database/client"
import { contactModel } from "@chatbotx.io/database/schema"
import type {
  ConversationModel,
  IntegrationType,
} from "@chatbotx.io/database/types"
import type { SendFlowStepData } from "@chatbotx.io/sdk"
import type {
  ChatJobSendExternalMessage,
  ChatJobSendTyping,
} from "@chatbotx.io/worker-config"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"
import { allIntegrations } from "../../lib/integrations"
import { logger } from "../../lib/logger"

export async function sendMessageToExternal(
  data: ChatJobSendExternalMessage["data"],
) {
  const { conversation, message } = data

  // Find integration auth
  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    conversation.inboxId,
  )

  // Find integration detail
  const integrationDetail = allIntegrations[inbox.channel as IntegrationType]
  if (!integrationDetail) {
    logger.debug(
      `Does not support this integration for channel: ${inbox.channel}`,
    )
    return
  }

  const contact = await findOrFail(
    contactModel,
    { id: conversation.contactId },
    "Contact not found",
  )

  await integrationDetail.channels?.channel?.message?.sendMessage?.({
    ctx: {
      chatbot: inbox.chatbot,
      auth,
    },
    data: {
      contact,
      conversation,
      message,
    },
  })
}

export async function sendTypingToExternal(data: ChatJobSendTyping["data"]) {
  const { conversation, typing } = data

  // Find integration auth
  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    conversation.inboxId,
  )

  // Find integration detail
  const integrationDetail = allIntegrations[inbox.channel as IntegrationType]
  if (!integrationDetail) {
    logger.debug(
      `Does not support this integration for channel: ${inbox.channel}`,
    )
    return
  }

  await integrationDetail.channels?.channel?.conversation?.sendTyping?.({
    ctx: {
      chatbot: inbox.chatbot,
      auth,
    },
    data: { conversation, typing },
  })
}

export async function sendFlowStepToExternal({
  conversation,
  flowId,
  flowVersionId,
  step,
}: {
  conversation: ConversationModel
  flowId: string
  flowVersionId?: string
  step: SendFlowStepData
}): Promise<{ messageIds?: string[] }> {
  // Find integration auth
  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    conversation.inboxId,
  )

  // Find integration detail
  const intergationDetail = allIntegrations[inbox.channel as IntegrationType]
  if (!intergationDetail) {
    logger.error(
      `Unable to find integration detail for channel: ${inbox.channel}`,
    )
    return {}
  }

  const result = await intergationDetail.runAction("sendFlowStep", {
    ctx: {
      chatbot: inbox.chatbot,
      auth,
    },
    data: {
      conversation,
      flowId,
      flowVersionId,
      step,
    },
  })

  return result || {}
}
