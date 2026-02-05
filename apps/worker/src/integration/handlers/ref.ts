import { prisma } from "@aha.chat/database"
import {
  IntegrationJobAction,
  type IntegrationJobRunRef,
  integrationQueue,
} from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"

export async function runRef(data: IntegrationJobRunRef["data"]) {
  const { conversationId, ref } = data

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
  })

  if (!conversation) {
    logger.warn(`Conversation not found: ${conversationId}`)
    return
  }

  if (ref.startsWith("draft-")) {
    logger.debug(`Draft ref: ${ref}`)
    const flowId = ref.replace("draft-", "").trim()
    if (!flowId) {
      logger.warn(`Invalid draft ref: ${ref}`)
      return
    }

    const flowVersion = await prisma.flowVersion.findFirstOrThrow({
      where: { flowId, isDraft: true },
    })

    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        flowId: flowVersion.flowId,
        flowVersionId: flowVersion.id,
      },
    })
    return
  }

  logger.info(`Ref: ${ref}`)
}
