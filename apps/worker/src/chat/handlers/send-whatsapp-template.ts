import { db, eq } from "@chatbotx.io/database/client"
import { messageModel } from "@chatbotx.io/database/schema"
import type { ConversationModel } from "@chatbotx.io/database/types"
import {
  extractTemplateParams,
  stepTypes,
  type TemplateComponent,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import {
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import { createId } from "@chatbotx.io/utils"
import type {
  BotResponseTrackingContext,
  ChatJobSendWhatsappTemplateMessage,
} from "@chatbotx.io/worker-config"
import {
  replaceWhatsappTemplateVariables,
  validateWhatsappTemplate,
} from "../../integration/handlers/wa-template-handler"
import { logger } from "../../lib/logger"
import { sendFlowStepToExternal } from "./send-message"

export interface ProcessWhatsappTemplateParams {
  broadcastId?: string
  conversation: ConversationModel
  flowId?: string
  flowVersionId?: string
  templateId: string
  templateLanguage: string
  templateName: string
  templateParams?: WaTemplateParams
  trackingContext?: BotResponseTrackingContext
}

export interface ProcessWhatsappTemplateResult {
  message: typeof messageModel.$inferSelect
  messageId: string
  providerMessageId?: string
}

export async function processWhatsappTemplate(
  params: ProcessWhatsappTemplateParams,
): Promise<ProcessWhatsappTemplateResult> {
  const {
    conversation,
    templateId,
    templateName,
    templateLanguage,
    templateParams = { header: [], body: [], button: [] },
    broadcastId,
    flowId,
    flowVersionId,
    trackingContext,
  } = params

  const isValid = await validateWhatsappTemplate(
    {
      id: templateId,
      name: templateName,
      languageCode: templateLanguage,
      params: templateParams,
    },
    conversation.inboxId,
  )

  if (!isValid) {
    logger.error(
      { templateId, inboxId: conversation.inboxId },
      "Template validation failed - not approved or not found",
    )
    throw new Error(`Template validation failed: ${templateId}`)
  }

  const replacedParams = await replaceWhatsappTemplateVariables(
    templateParams,
    conversation.id,
  )

  const messageData: typeof messageModel.$inferInsert = {
    id: createId(),
    inboxId: conversation.inboxId,
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    messageType: "outgoing",
    contentType: "text",
    senderType: "bot",
    sourceId: null,
    content: `Template: ${templateName}`,
    contentAttributes: {
      type: "whatsapp_template",
      templateName,
      templateLanguage,
      templateId,
      params: replacedParams,
      ...(broadcastId && { broadcastId }),
      ...(flowId && { flowId }),
      ...(flowVersionId && { flowVersionId }),
      ...(trackingContext && { trackingContext }),
    },
  }

  const newMessage = await db
    .insert(messageModel)
    .values(messageData)
    .returning()
    .then((result) => result[0])

  logger.info(
    {
      messageId: newMessage.id,
      conversationId: conversation.id,
      templateId,
      broadcastId,
    },
    "WhatsApp template message created in DB",
  )

  broadcastToWorkspaceParty(conversation.workspaceId, {
    eventType: RealtimeEventType.messageCreated,
    data: newMessage,
  })

  try {
    const result = await sendFlowStepToExternal({
      conversation,
      flowId: flowId || "",
      flowVersionId,
      step: {
        id: createId(),
        stepType: stepTypes.enum.sendWaTemplateMessage,
        buttons: [],
        template: {
          id: templateId,
          name: templateName,
          languageCode: templateLanguage,
          params: replacedParams,
        },
      },
    })

    const providerMessageId = result?.messageIds?.[0]

    if (providerMessageId) {
      await db
        .update(messageModel)
        .set({ sourceId: providerMessageId })
        .where(eq(messageModel.id, newMessage.id))

      logger.info(
        {
          messageId: newMessage.id,
          providerMessageId,
          templateId,
        },
        "WhatsApp template sent successfully",
      )
    }

    return {
      messageId: newMessage.id,
      providerMessageId,
      message: { ...newMessage, sourceId: providerMessageId || null },
    }
  } catch (error) {
    logger.error(
      {
        error,
        messageId: newMessage.id,
        conversationId: conversation.id,
        templateId,
      },
      "Failed to send WhatsApp template to provider",
    )
    throw error
  }
}

export async function sendWhatsappTemplateMessage(
  data: ChatJobSendWhatsappTemplateMessage["data"],
) {
  const { conversationId, templateId, broadcastId, templateData } = data

  try {
    const conversation = await db.query.conversationModel.findFirst({
      where: { id: conversationId },
    })

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`)
    }

    const template = await db.query.whatsappMessageTemplateModel.findFirst({
      where: { id: templateId },
    })

    if (!template) {
      throw new Error(`WhatsApp template not found: ${templateId}`)
    }

    // Use templateData from job if provided, otherwise extract from template components
    const templateParams =
      templateData ??
      extractTemplateParams((template.components as TemplateComponent[]) || [])

    const result = await processWhatsappTemplate({
      conversation,
      templateId: template.id,
      templateName: template.name,
      templateLanguage: template.language,
      templateParams,
      broadcastId,
    })

    return result
  } catch (error) {
    console.error(error)
    logger.error(
      {
        error,
        conversationId,
        templateId,
        broadcastId,
      },
      "Error sending WhatsApp template message for broadcast",
    )
    throw error
  }
}
