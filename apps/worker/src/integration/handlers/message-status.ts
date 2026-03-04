import { db, eq } from "@aha.chat/database/client"
import { messageModel } from "@aha.chat/database/schema"
import type { IntegrationJobMessageStatus } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"
import { runFlowPostback } from "./flow"

export const handleMessageStatus = async (job: IntegrationJobMessageStatus) => {
  const { payload } = job.data

  try {
    const message = await db
      .select()
      .from(messageModel)
      .where(eq(messageModel.sourceId, payload.messageId))
      .limit(1)
      .then((rows) => rows[0])

    if (!message) {
      return
    }

    const contentAttributes = message.contentAttributes as {
      type?: string
      payload?: {
        buttons?: Array<{
          id: string
          label: string
          postback?: string
        }>
      }
      [key: string]: unknown
    }

    if (
      !contentAttributes ||
      (contentAttributes.type !== "template" &&
        contentAttributes.type !== "whatsapp_template")
    ) {
      return
    }

    const buttons = contentAttributes.payload?.buttons
    if (!(buttons && Array.isArray(buttons))) {
      return
    }

    const buttonLabel =
      String(payload.status).toLowerCase() === "delivered"
        ? "Delivered"
        : "Failed"

    const button = buttons.find((b) => b.label === buttonLabel)
    if (!button?.postback) {
      return
    }

    await runFlowPostback({
      conversationId: message.conversationId,
      action: button.postback,
      ref: null,
    })
  } catch (error) {
    logger.error(
      error,
      `Error handling message status for messageId: ${payload.messageId}`,
    )
    throw error
  }
}
