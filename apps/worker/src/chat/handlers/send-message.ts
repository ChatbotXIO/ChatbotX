import { prisma } from "@aha.chat/database"
import { CHAT_WIDGET_SOURCE_PREFIX } from "@aha.chat/database/types"
import type { ConversationEntity, SendFlowStepData } from "@aha.chat/sdk"
import type { ChatJobSendMessage } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"
import { allIntegrations } from "../../shared/integrations"
import { getIntegrationAuth } from "./integration.query"

export async function sendMessageToExternal(data: ChatJobSendMessage) {
  const { conversation, message } = data.data
  if (conversation.sourceId?.startsWith(CHAT_WIDGET_SOURCE_PREFIX)) {
    return
  }

  // Find integration auth
  const inbox = await prisma.inbox.findFirstOrThrow({
    where: { id: conversation.inboxId },
    include: {
      integrationWhatsapp: true,
      chatbot: true,
    },
  })
  const integrationAuth = await getIntegrationAuth(inbox)
  if (!integrationAuth) {
    logger.error("Unable to find integration auth:", inbox.inboxType)
    return
  }

  // Find integration detail
  const intergationDetail = allIntegrations[inbox.inboxType]
  if (!intergationDetail) {
    logger.info("Does not support this integration:", inbox.inboxType)
    return
  }

  await intergationDetail.actions.sendMessage({
    ctx: {
      chatbot: inbox.chatbot,
      // biome-ignore lint/suspicious/noExplicitAny: wip
      auth: integrationAuth as any,
    },
    conversation,
    message,
  })
}

export async function sendFlowStepToExternal({
  conversation,
  flowVersionId,
  step,
}: {
  conversation: ConversationEntity
  flowVersionId: string
  step: SendFlowStepData
}) {
  // Find integration auth
  const inbox = await prisma.inbox.findFirstOrThrow({
    where: { id: conversation.inboxId },
    include: {
      integrationWhatsapp: true,
      chatbot: true,
    },
  })
  const integrationAuth = await getIntegrationAuth(inbox)
  if (!integrationAuth) {
    logger.error("Unable to find integration auth:", inbox.inboxType)
    return
  }

  // Find integration detail
  const intergationDetail = allIntegrations[inbox.inboxType]
  if (!intergationDetail) {
    logger.error("Unable to find integration detail:", inbox.inboxType)
    return
  }

  await intergationDetail.runAction("sendFlowStep", {
    ctx: {
      chatbot: inbox.chatbot,
      // biome-ignore lint/suspicious/noExplicitAny: wip
      auth: integrationAuth as any,
    },
    conversation,
    flowVersionId,
    step,
  })
}
