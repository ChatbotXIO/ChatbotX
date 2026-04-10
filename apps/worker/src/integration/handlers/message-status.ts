import { and, db, eq } from "@chatbotx.io/database/client"
import { contactInboxModel } from "@chatbotx.io/database/schema"
import type { IntegrationType } from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import { uploader } from "@chatbotx.io/filesystem"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import { MessageEventType } from "@chatbotx.io/flow-config"
import { type AuthValue, SdkException } from "@chatbotx.io/sdk"
import type { IntegrationJobMessageStatus } from "@chatbotx.io/worker-config"
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
        workspaceId: ctx.chatbot.id,
      },
      with: {
        contact: true,
      },
    })

    if (!chatConversation) {
      throw new SdkException("Unable to find conversation")
    }

    const contactInbox = await db
      .select({ id: contactInboxModel.id })
      .from(contactInboxModel)
      .where(
        and(
          eq(contactInboxModel.contactId, chatConversation.contact.id),
          eq(contactInboxModel.inboxId, ctx.inbox.id),
        ),
      )
      .then((rows) => rows[0])

    const message = await db.query.messageModel.findFirst({
      where: {
        sourceId: payload.messageId,
        conversationId: chatConversation.id,
        workspaceId: ctx.chatbot.id,
      },
    })

    const eventLog = {
      workspaceId: inbox.workspaceId,
      contactId: chatConversation.contact.id,
      conversationId: chatConversation.id,
      channel: inbox.channel,
      contactInboxId: contactInbox?.id ?? "",
      messageId: message?.id,
      occurredAt: new Date(),
      metadata: {},
    }

    if (message?.contentAttributes?.metadata) {
      eventLog.metadata = message.contentAttributes.metadata as MetadataPayload
    }

    if (eventStatus === "delivered") {
      emit(MessageEventType["message:delivered"], eventLog)
    }

    if (eventStatus === "read") {
      emit(MessageEventType["message:seen"], eventLog)
    }

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
      inboxId: ctx.inbox.id,
    })
  } catch (error) {
    logger.error(
      error,
      `Error handling message status for messageId: ${payload.messageId}`,
    )
    throw error
  }
}
