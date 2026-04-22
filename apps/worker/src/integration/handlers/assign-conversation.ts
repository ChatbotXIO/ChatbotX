import { db } from "@chatbotx.io/database/client"
import type { IntegrationJobAssignConversation } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"

export const assignConversation = async (
  props: IntegrationJobAssignConversation["data"],
) => {
  const { conversations } = props

  if (!conversations || conversations.length === 0) {
    return
  }

  try {
    const conversationIds = conversations.map((c) => c.id)
    await db.query.conversationModel.findMany({
      where: {
        id: {
          in: conversationIds,
        },
      },
    })
  } catch (error) {
    const normalizedError = normalizeError(error)
    logger.error(
      {
        error: normalizedError,
        conversationIds: conversations.map((c) => c.id),
      },
      "[worker] Failed to process conversation assignment",
    )
    throw error
  }
}
