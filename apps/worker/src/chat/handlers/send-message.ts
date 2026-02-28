import { findOrFail } from "@aha.chat/database/client"
import { contactModel } from "@aha.chat/database/schema"
import type {
  ContactModel,
  ConversationModel,
  IntegrationType,
} from "@aha.chat/database/types"
import type { SendFlowStepData } from "@aha.chat/sdk"
import type {
  ChatJobSendExternalMessage,
  ChatJobSendTyping,
} from "@aha.chat/worker-config"
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
  const intergationDetail = allIntegrations[inbox.inboxType as IntegrationType]
  if (!intergationDetail) {
    logger.debug(
      `Does not support this integration for inboxType: ${inbox.inboxType}`,
    )
    return
  }

  const contact = await findOrFail<ContactModel>(
    contactModel,
    { id: conversation.contactId },
    "Contact not found",
  )

  await intergationDetail.channels?.channel?.message?.sendMessage?.({
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
  const intergationDetail = allIntegrations[inbox.inboxType as IntegrationType]
  if (!intergationDetail) {
    logger.debug(
      `Does not support this integration for inboxType: ${inbox.inboxType}`,
    )
    return
  }

  await intergationDetail.channels?.channel?.conversation?.sendTyping?.({
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
}) {
  // Find integration auth
  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    conversation.inboxId,
  )

  // Find integration detail
  const intergationDetail = allIntegrations[inbox.inboxType as IntegrationType]
  if (!intergationDetail) {
    logger.error(
      `Unable to find integration detail for inboxType: ${inbox.inboxType}`,
    )
    return
  }

  await intergationDetail.runAction("sendFlowStep", {
    ctx: {
      chatbot: inbox.chatbot,
      auth,
    },
    conversation,
    flowId,
    flowVersionId,
    step,
  })
}
