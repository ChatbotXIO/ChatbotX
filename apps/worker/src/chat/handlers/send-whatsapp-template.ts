import { db, eq } from "@chatbotx.io/database/client"
import { messageModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import {
  extractTemplateParams,
  MessageEventType,
  type SendWaTemplateMessageStepSchema,
  stepTypes,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import {
  broadcastToWorkspaceParty,
  RealtimeEventType,
} from "@chatbotx.io/partysocket-config"
import { type MessageTemplateEntity, parseSdkError } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { contactVariableService } from "@chatbotx.io/variables"
import type {
  BotResponseTrackingContext,
  ChatJobSendWhatsappTemplateMessage,
} from "@chatbotx.io/worker-config"
import {
  replaceWhatsappTemplateVariables,
  validateWhatsappTemplate,
} from "../../integration/handlers/wa-template-handler"
import { logger } from "../../lib/logger"
import { convertButtonsToTemplate } from "./send-flow-step"
import { sendFlowStepToExternal } from "./send-message"

export interface ProcessWhatsappTemplateParams {
  broadcastId?: string
  contactInbox: ContactInboxModel
  conversation: ConversationModel
  flow?: {
    id: string
    versionId?: string
    buttons: SendWaTemplateMessageStepSchema["buttons"]
  }
  metadata?: MetadataPayload
  step?: SendWaTemplateMessageStepSchema
  template: SendWaTemplateMessageStepSchema["template"]
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
    contactInbox,
    template,
    broadcastId,
    flow,
    step,
    trackingContext,
    metadata,
  } = params

  const isValid = await validateWhatsappTemplate(template, contactInbox.inboxId)

  if (!isValid) {
    logger.error(
      { templateId: template.id, inboxId: contactInbox.inboxId },
      "Template validation failed - not approved or not found",
    )
    throw new Error(`Template validation failed: ${template.id}`)
  }

  const variables = await contactVariableService.getAll(conversation.id)
  const replacedParams = await replaceWhatsappTemplateVariables({
    params: template.params,
    variables,
  })

  const contentAttributes = {
    type: "whatsapp_template",
    template: {
      name: template.name,
      language: template.language,
      id: template.id,
      params: replacedParams,
    },
    stepId: step?.id,
    nodeId: step?.nodeId,
    ...(broadcastId && { broadcastId }),
    ...(flow && { flowId: flow.id }),
    ...(flow && { flowVersionId: flow.versionId }),
    ...(trackingContext && { trackingContext }),
    payload: {} as MessageTemplateEntity["payload"],
    metadata,
  }

  if (flow?.buttons && flow.buttons.length > 0) {
    contentAttributes.payload = {
      templateType: "button",
      buttons: convertButtonsToTemplate({
        flowId: flow.id,
        flowVersionId: flow.versionId,
        buttons: flow.buttons,
      }),
    }
  }

  const messageData: typeof messageModel.$inferInsert = {
    id: createId(),
    contactInboxId: contactInbox.id,
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    messageType: "outgoing",
    contentType: "text",
    senderType: "bot",
    sourceId: null,
    text: `Template: ${template.name}`,
    contentAttributes,
  }

  const newMessage = await db
    .insert(messageModel)
    .values(messageData)
    .returning()
    .then((result) => result[0])

  broadcastToWorkspaceParty(conversation.workspaceId, {
    eventType: RealtimeEventType.messageCreated,
    data: newMessage,
  })

  const eventLogData = {
    context: {
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      channel: contactInbox.channel,
      contactInboxId: contactInbox.id,
    },
    action: {
      flowId: flow?.id || "",
      flowVersionId: flow?.versionId || "",
    },
    stepId: step?.id || "",
    nodeId: step?.nodeId || "",
    metadata,
  }

  try {
    const result = await sendFlowStepToExternal({
      conversation,
      contactInbox,
      flowId: flow?.id || "",
      flowVersionId: flow?.versionId || "",
      step: {
        id: step?.id ?? createId(),
        nodeId: step?.nodeId ?? createId(),
        stepType: stepTypes.enum.sendWaTemplateMessage,
        buttons: [],
        template,
      },
      metadata,
      messageId: newMessage.id,
    })

    await emit(MessageEventType["message:sent"], {
      ...eventLogData,
      action: { messageId: "", flowId: flow?.id || "" },
      occurredAt: new Date(),
    })

    const providerMessageId = result?.messageIds?.[0]

    if (providerMessageId) {
      await db
        .update(messageModel)
        .set({ sourceId: providerMessageId })
        .where(eq(messageModel.id, newMessage.id))
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
        templateId: template.id,
      },
      "Failed to send WhatsApp template to provider",
    )
    await emit(MessageEventType["message:failed"], {
      ...eventLogData,
      action: {
        messageId: "",
        flowId: flow?.id || "",
      },
      errorData: await parseSdkError(error),
      occurredAt: new Date(),
    })

    throw error
  }
}

export async function sendWhatsappTemplateMessage(
  data: ChatJobSendWhatsappTemplateMessage["data"],
) {
  const {
    conversation,
    templateId,
    broadcastId,
    templateData,
    contactInbox,
    metadata,
  } = data

  try {
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
      contactInbox,
      template: {
        id: template.id,
        name: template.name,
        language: template.language,
        params: templateParams,
      },
      broadcastId,
      metadata,
    })

    return result
  } catch (error) {
    console.error(error)
    logger.error(
      {
        error,
        conversationId: conversation.id,
        templateId,
        broadcastId,
      },
      "Error sending WhatsApp template message for broadcast",
    )
    throw error
  }
}
