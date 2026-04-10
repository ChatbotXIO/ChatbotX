import { db } from "@chatbotx.io/database/client"
import type { IntegrationType as DbIntegrationType } from "@chatbotx.io/database/partials"
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

  const dbIntegration = await getDBIntegration(
    integrationType as DbIntegrationType,
    integrationIdentifier,
  )
  const { workspace, auth, inbox } = dbIntegration
  const ctx = {
    workspace,
    auth: auth as AuthValue,
    uploader,
    inbox,
  }

  if (!ctx.workspace?.id) {
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
    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: {
        sourceId: conversation.sourceId,
        inboxId: ctx.inbox.id,
      },
      with: {
        conversation: true,
        contact: true,
      },
    })

    if (!contactInbox?.conversation) {
      throw new SdkException("Unable to find conversation")
    }

    const message = await db.query.messageModel.findFirst({
      where: {
        sourceId: payload.messageId,
        conversationId: contactInbox?.conversation.id,
        workspaceId: ctx.workspace.id,
      },
    })

    const eventLog = {
      workspaceId: inbox.workspaceId,
      contactId: contactInbox.contact.id,
      conversationId: contactInbox.conversation.id,
      channel: inbox.channel,
      contactInboxId: contactInbox.id,
      messageId: message?.id,
      occurredAt: new Date(),
      metadata: {
        type: "updateStatus",
      } as MetadataPayload,
    }

    if (message?.contentAttributes?.metadata) {
      eventLog.metadata = message.contentAttributes.metadata as MetadataPayload
    }

    if (eventStatus === "delivered") {
      await emit(MessageEventType["message:delivered"], eventLog)
    }

    if (eventStatus === "read") {
      await emit(MessageEventType["message:seen"], eventLog)
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
