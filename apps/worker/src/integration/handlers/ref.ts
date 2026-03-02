import { findOrFail } from "@aha.chat/database/client"
import { conversationModel, flowVersionModel } from "@aha.chat/database/schema"
import type {
  ConversationModel,
  FlowVersionModel,
} from "@aha.chat/database/types"
import {
  IntegrationJobAction,
  type IntegrationJobRunRef,
  integrationQueue,
} from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"

export async function runRef(data: IntegrationJobRunRef["data"]) {
  const { conversationId, ref } = data

  const conversation = await findOrFail<ConversationModel>(
    conversationModel,
    { id: conversationId },
    "Conversation not found",
  )

  if (ref.startsWith("draft-")) {
    logger.debug(`Draft ref: ${ref}`)
    const flowId = ref.replace("draft-", "").trim()
    if (!flowId) {
      logger.warn(`Invalid draft ref: ${ref}`)
      return
    }

    const flowVersion = await findOrFail<FlowVersionModel>(
      flowVersionModel,
      { flowId, isDraft: true },
      "Flow version not found",
    )

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
