import type { IntegrationType } from "@aha.chat/database/types"
import { db } from "@chatbotx.io/database/client"
import { emit, MessageEventType } from "@chatbotx.io/event-bus"
import { uploader } from "@chatbotx.io/filesystem"
import { type AuthValue, SdkException } from "@chatbotx.io/sdk"
import type {
  IntegrationJobMessageStatus,
  IntegrationJobMetadata,
} from "@chatbotx.io/worker-config"
import { allIntegrations, getDBIntegration } from "../../lib/integrations"
import { logger } from "../../lib/logger"
import { runFlowPostback } from "./flow"

export const handleMessageStatus = async (
  job: IntegrationJobMessageStatus["data"],
) => {
  const { integrationType, integrationIdentifier, payload } = job
  console.log({ payload })

  const dbIntegration = await getDBIntegration(
    integrationType as IntegrationType,
    integrationIdentifier,
  )
  const { chatbot, auth, inbox } = dbIntegration
  const ctx = {
    chatbot,
    auth: auth as AuthValue,
    uploader,
    inbox,
  }

  if (!ctx.chatbot?.id) {
    throw new Error("Unable to handle message status")
  }

  if (!ctx.inbox?.id) {
    throw new Error("Unable to handle message status")
  }

  const parsedMessage = await allIntegrations[
    integrationType
  ]?.channels?.channel?.message?.handleMessageStatus?.({
    ctx,
    data: job,
  })

  if (!parsedMessage) {
    throw new SdkException("Unable to parse received message")
  }

  const { conversation } = parsedMessage

  const eventStatus = String(payload.status).toLowerCase()

  try {
    const chatConversation = await db.query.conversationModel.findFirst({
      where: {
        sourceId: conversation.sourceId,
        chatbotId: ctx.chatbot.id,
        inboxId: ctx.inbox.id,
      },
      with: {
        contact: true,
      },
    })

    if (!chatConversation) {
      throw new SdkException("Unable to find conversation")
    }

    const message = await db.query.messageModel.findFirst({
      where: {
        sourceId: payload.messageId,
        conversationId: chatConversation.id,
        chatbotId: ctx.chatbot.id,
      },
    })

    const eventLog = {
      chatbotId: inbox.chatbotId,
      contactId: chatConversation.contact.id,
      conversationId: chatConversation.id,
      channel: inbox.channel,
      messageId: message?.id,
      occurredAt: new Date(),
      metadata: {},
    }

    if (message?.contentAttributes?.metadata) {
      eventLog.metadata = message.contentAttributes
        .metadata as IntegrationJobMetadata
    }

    if (eventStatus === "delivered") {
      emit(MessageEventType.DELIVERED, eventLog)
    }

    if (eventStatus === "read") {
      emit(MessageEventType.SEEN, eventLog)
    }

    console.log({ eventLog, payload })

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

    if (!contentAttributes || contentAttributes.type !== "whatsapp_template") {
      return
    }

    const buttons = contentAttributes.payload?.buttons
    if (!(buttons && Array.isArray(buttons))) {
      return
    }

    const buttonLabel = eventStatus === "delivered" ? "Delivered" : "Failed"
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
