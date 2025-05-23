import { prisma } from "@ahachat.ai/database"
import type { ChatJobSendMessage } from "@ahachat.ai/worker-config"
import { getLogger, logger } from "../../lib/log"
import { allIntegrations } from "../../shared/integrations"
import { getIntegrationAuth } from "./integration.query"
import type { ConversationEntity, SendFlowStepData } from "@ahachat.ai/sdk"

export async function sendMessageToExternal(data: ChatJobSendMessage) {
  const { conversation, message } = data.data

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

  await intergationDetail.runAction("sendMessage", {
    ctx: {
      chatbot: inbox.chatbot,
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      auth: integrationAuth as any,
      logger: getLogger(inbox.inboxType),
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
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      auth: integrationAuth as any,
      logger: getLogger(inbox.inboxType),
    },
    conversation,
    flowVersionId,
    step,
  })
}
