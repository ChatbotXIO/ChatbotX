import { findOrFail } from "@chatbotx.io/database/client"
import {
  conversationModel,
  flowModel,
  flowVersionModel,
} from "@chatbotx.io/database/schema"
import {
  IntegrationJobAction,
  type IntegrationJobRunRef,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

export async function runRef(data: IntegrationJobRunRef["data"]) {
  const { conversationId, ref } = data

  const conversation = await findOrFail({
    table: conversationModel,
    where: { id: conversationId },
    message: "Conversation not found",
  })

  if (ref.startsWith("draft-")) {
    logger.debug(`Draft ref: ${ref}`)
    const flowId = ref.replace("draft-", "").trim()
    if (!flowId) {
      logger.warn(`Invalid draft ref: ${ref}`)
      return
    }

    const flowVersion = await findOrFail({
      table: flowVersionModel,
      where: { flowId, isDraft: true },
      message: "Flow version not found",
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

  if (ref.startsWith("flow-")) {
    logger.debug(`Start flow ref: ${ref}`)
    const flowId = ref.replace("flow-", "").trim()
    if (!flowId) {
      logger.warn(`Invalid flow ref: ${ref}`)
      return
    }

    const flow = await findOrFail({
      table: flowModel,
      where: { id: flowId, workspaceId: conversation.workspaceId },
      message: "Flow not found",
    })

    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        flowId: flow.id,
      },
    })
    return
  }
}
